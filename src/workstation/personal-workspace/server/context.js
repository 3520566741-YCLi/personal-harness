// dsh-personal-workspace — 宿主半 · 项目上下文注入（V1.2-B Project-aware Context 的注册面）
//
// 接缝（第 0 步裁决 + 更正，见 docs/DECISIONS.md ADR-018 / **ADR-020**）：
//   用官方既有的 **`system-prompt/assemble` awaited waterfall**（`ctx.on` 挂监听、内部 `await next()`），
//   **不新建机制**、不改提示词装配链。
//   `context.agent.session` 给出**官方** session 对象（`id` + `header.cwd`）—— 会话定位的真源是它，
//   不是我们自己记的映射。
//   （原定 `systemPrompt.context({text})` 因该字段为**同步**求值、承载不了异步读盘而被更正，详见 ADR-020。）
//
// 定位顺序（前者优先，缺则回退；全缺 ⇒ 不注入）：
//   ① 镜像里的 `sessionProject[sessionId]`（用户在界面上显式把会话挂到项目 = 最强信号）；
//   ② 会话 `header.cwd` 落在某个项目的仓库/目录提示之内（cwd 是官方的、我们只做前缀匹配）。
//
// 降级纪律（与 ADR-017 ③「未知 ≠ 空集」同一纪律）：
//   镜像不存在 / 读坏 / 无归属 / 超预算 → 返回空串（不注册空段、不编内容、不抛错）。
//   装配路径上的任何异常都必须被吞掉：注入失败可以没有上下文，但**不能**毁掉整轮对话。

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import {
  INJECT_CONTEXT_NAME,
  estimateTokens,
  resolveProjectContext,
} from './project-context.mjs'
import { INJECT_CONTEXT_NAME as MEMORY_CONTEXT_NAME, resolveMemoryContext } from './memory-context.mjs'
import { collectMemoryInputs, createOwnerCache, resolveBaseUrl } from './memory-source.js'
import { readSnapshot } from './mirror.js'

/** 段名/预算常量对外可见（回归套件核准接线时引用常量，避免测试里写死字符串）。 */
export { INJECT_CONTEXT_NAME, MEMORY_CONTEXT_NAME }

/** 注入段在官方 context 排序里的位置：排在运行时上下文之前（贴着身份/人设区）。 */
export const CONTEXT_ORDER = -50

// ---------------------------------------------------------------------------
// V1.2-D 记忆注入开关 —— **默认关**。
//
//   为什么默认关（不是懒，是纪律）：D 的两处口径**已于 2026-09-18 裁定**
//   （真源 `docs/V1_2_DECISIONS_VERDICTS.md`）：① 检索词 = **项目身份**（D-1 A）；
//   ② 与 MemOS 自带逐轮召回 = **先搁置、两份并存**（D-2 C）。
//   D-2 选「搁置」⇒ 保持默认关是**裁定结果本身**，不是"还没做"：
//   开关一开就会与 MemOS 那份同时出现，而两者的分工尚未裁定 ⇒ 不替你决定。
//   口径已定后本文件的相应改动：① 产品侧按 D-1 配好 `querySource`（`createProjectIdentityQuery`，
//   在 entry `index.js` 里接线）；② 注入文本按 V-8 写明**两份记忆的边界**
//   （`MEMORY_SCOPE_NOTE` / `MEMORY_QUERY_NOTE`，见 memory-context.ts）。
//   ⇒ 打开 `DSH_PERSONAL_MEMORY_INJECT=1` 即生效（不必再改代码）。
const MEMORY_INJECT_ENV = 'DSH_PERSONAL_MEMORY_INJECT'

/** 注入开关是否打开（默认关；只有显式 `1` 才算打开）。 */
export function memoryInjectEnabled(env = process.env) {
  if (env === null || typeof env !== 'object') return false
  return env[MEMORY_INJECT_ENV] === '1'
}

/** 归档根候选（与 archive 路由的落点一致：优先项目所属工作区，其次 Personal 自管目录）。 */
const ARCHIVE_DIR_NAME = 'Personal Harness Archives'

/** 单次读盘上限（归档 md 正常几 KB～几十 KB；超过即不摘，如实降级）。 */
const MAX_ARCHIVE_BYTES = 512 * 1024

/**
 * 从镜像 + 官方 session 解析出「当前会话属于哪个项目」。
 * @param {object|null} snapshot 镜像快照（normalizeSnapshot 的产物）
 * @param {{sessionId?: string, cwd?: string}} where 会话定位事实（来自官方 session）
 * @returns {{project: object|null, via: string}}
 */
export function locateProject(snapshot, where) {
  if (snapshot === null) return { project: null, via: 'no-mirror' }
  const byId = new Map()
  for (const p of snapshot.projects) {
    const lc = snapshot.lifecycle[p.id] ?? {}
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      description: p.description,
      status: typeof lc.status === 'string' ? lc.status : 'active',
      starred: lc.starred === true,
      archiveFile: typeof lc.archiveFile === 'string' ? lc.archiveFile : undefined,
      keywords: keywordsOf(p),
    })
  }
  // ① 显式关系映射
  const sid = typeof where?.sessionId === 'string' ? where.sessionId : ''
  if (sid !== '') {
    const pid = snapshot.sessionProject[sid]
    if (typeof pid === 'string' && byId.has(pid)) return { project: byId.get(pid), via: 'sessionRelation' }
    if (typeof pid === 'string') return { project: null, via: 'relation-dangling' } // 关系指向已不存在的项目：如实报，不猜
  }
  // ② cwd 前缀匹配（只在唯一命中时才认；多个命中 = 不确定 → 不注入）
  const cwd = typeof where?.cwd === 'string' ? resolve(where.cwd) : ''
  if (cwd !== '') {
    const hits = []
    for (const p of byId.values()) {
      if (p.status === 'deleted') continue
      for (const kw of p.keywords) {
        if (kw === '' || kw.length < 3) continue
        const target = isAbsolute(kw) ? resolve(kw) : resolve(homedir(), kw)
        if (cwd === target || cwd.startsWith(target.endsWith(sep) ? target : target + sep)) {
          hits.push(p)
          break
        }
      }
    }
    if (hits.length === 1) return { project: hits[0], via: 'cwd' }
    if (hits.length > 1) return { project: null, via: 'cwd-ambiguous' }
  }
  return { project: null, via: 'no-match' }
}

/** 项目的目录线索（用户自建项目没有 repoHint，故同时从 name/description 里取绝对路径风格片段）。 */
function keywordsOf(p) {
  const out = []
  const push = (s) => {
    if (typeof s !== 'string') return
    const v = s.trim()
    if (v !== '' && !out.includes(v)) out.push(v)
  }
  push(p.repoHint)
  const blob = `${p.description ?? ''} ${p.name ?? ''}`
  for (const m of blob.matchAll(/(?:~|\/)[\w\u4e00-\u9fff./-]{2,}/g)) push(m[0])
  return out
}

/** 归档根候选：项目所属工作区（不可知，故取标准两处）→ 归档文件真实路径。 */
function archiveCandidates(file) {
  if (typeof file !== 'string' || file.trim() === '') return []
  const raw = file.trim()
  if (isAbsolute(raw)) return [raw]
  return [join(homedir(), raw), join(process.cwd(), raw)]
}

/** 读归档 md 全文；读不到返回 undefined（调用方如实降级，不造假内容）。 */
async function loadArchive(file) {
  if (file === undefined) return undefined
  const roots = archiveCandidates(file)
  for (const target of roots) {
    let text
    try {
      text = await readFile(target, 'utf8')
    } catch {
      continue
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_ARCHIVE_BYTES) continue
    // relPath 用于 sourceRef：尽量给「项目归档文件名」这种稳定可读的相对标识
    const rel = target.startsWith(homedir() + sep) ? target.slice(homedir().length + 1) : target
    return { relPath: rel, text }
  }
  return undefined
}

/**
 * 解析当前这一轮该注入什么（纯装配，异常一律吞掉并降级为空串）。
 * @param {object} context 官方装配 context（含 `agent.session`）
 * @returns {Promise<string>} 注入文本；空串 = 不注入
 */
export async function projectContextText(context) {
  try {
    const session = context?.agent?.session
    if (session === undefined || session === null) return ''
    const read = await readSnapshot()
    if (read === null) return ''
    const where = {
      sessionId: typeof session.id === 'string' ? session.id : '',
      cwd: typeof session.header?.cwd === 'string' ? session.header.cwd : '',
    }
    const { project } = locateProject(read.snapshot, where)
    if (project === null) return ''
    const archive = await loadArchive(project.archiveFile)
    const resolved = resolveProjectContext({ project, archive })
    return resolved.injectable ? resolved.text : ''
  } catch {
    // 注入是附加价值，不是对话的前置条件：任何失败都静默降级（并已在别处有诊断面）。
    return ''
  }
}

// ---------------------------------------------------------------------------
// V1.2-D ① 检索词口径 = **项目身份**（用户裁定 **D-1 = A**）
//
//   为什么是这个口径（裁定理由，不是我的偏好）：记忆库是**搜索**接口（`/memory/search?q=`），
//   不给 q 它不知道要找什么。项目身份（名称 + 描述 + 目录线索）**每步都一样** ⇒ 稳定、可缓存，
//   补的是"这个项目"这一个维度；而"本轮原话"那一路 MemOS 插件**已经在做**（故不由本层再抢一遍，
//   也避免 D-2 里"两份记忆"的重复度进一步变高）。
//
//   实现纪律：
//     - **纯函数** `buildProjectQuery`：输入项目记录 → 输出检索词，不读盘、不做 IO ⇒ 可独立测试。
//     - **工厂** `createProjectIdentityQuery`：把"会话 → 项目身份"的定位封在里面，只在定位成功时返回 q；
//       定位不到就返回空串 ⇒ 上层如实降级为 `empty-query`（**不猜**、不退回无关词）。
// ---------------------------------------------------------------------------

/** 检索词里保留的字段上限（防止超长描述把请求撑爆；超出即截断，不静默丢弃）。 */
const QUERY_FIELD_MAX = 120

/**
 * 由项目记录构造检索词（纯函数、零 IO）。
 *
 * @param {object|null} project 项目记录。两种形状都吃：
 *   ① `locateProject` 的**派生对象**（带 `keywords`）—— 产品接线走的就是这条；
 *   ② 镜像里的**原始记录**（`{name, description?, repoHint?}`，字段真源见 `src/client/mirror-push.ts`）。
 * @returns {string} 检索词；无可用字段 = 空串（上层据此降级，不编内容）
 */
export function buildProjectQuery(project) {
  if (project === null || typeof project !== 'object') return ''
  const clip = (v) => (typeof v === 'string' ? v.trim().slice(0, QUERY_FIELD_MAX) : '')
  const name = clip(project.name)
  const description = clip(project.description)
  // 目录线索的**唯一 owner 是 B 的 `keywordsOf`**（派生对象上的 `keywords`）—— 这里直接取用，
  //   不自己再算一遍：否则"上下文用的目录线索"与"检索词用的目录线索"会各有一套规则，
  //   将来改一处忘一处，就出现"上下文说是 A 项目、记忆却按别的线索搜"。
  //   `keywordsOf` 已同时收 `repoHint` 与名称/描述里形如绝对路径的片段（用户自建项目没有 repoHint）。
  //   只取**第一条**：检索词是给人看的一句短语，不是线索清单（线索越多越像关键词堆砌、越不精确）。
  //   原始记录形状（没有 keywords）时退回 `repoHint`，让纯函数可独立测试。
  const keywords = Array.isArray(project.keywords)
    ? project.keywords.filter((k) => typeof k === 'string' && k.trim() !== '')
    : []
  const clueSource = keywords.length > 0 ? keywords[0] : clip(project.repoHint)
  const pathHint = (() => {
    const p = clip(clueSource)
    if (p === '') return ''
    const parts = p.split(/[/\\]/).filter((s) => s !== '')
    return parts.length === 0 ? '' : parts[parts.length - 1]
  })()
  const seen = new Set()
  const words = []
  for (const w of [name, description, pathHint]) {
    if (w === '' || seen.has(w)) continue
    seen.add(w)
    words.push(w)
  }
  return words.join(' ')
}

/**
 * 造一个"项目身份"检索词生产者（D-1 A 的产品侧接线）。
 *
 * 定位顺序与 `projectContextText` **完全一致**（同一个 `locateProject`）—— 这是刻意的：
 * 两处若各有一套定位逻辑，就会出现"上下文说是 A 项目、记忆却按 B 项目搜"的静默错配。
 *
 * @returns {Function} 异步函数：入参 `{session, cwd}`，返回检索词（定位不到 = 空串）
 */
export function createProjectIdentityQuery() {
  return async (input) => {
    const session = input?.session
    if (session === undefined || session === null) return ''
    const read = await readSnapshot()
    if (read === null) return ''
    const where = {
      sessionId: typeof session.id === 'string' ? session.id : '',
      cwd: typeof input?.cwd === 'string' ? input.cwd : '',
    }
    const { project } = locateProject(read.snapshot, where)
    return buildProjectQuery(project)
  }
}

/**
 * 把多个生产者解析出的文本合进官方装配（纯函数）。
 *
 * **为什么是多生产者而不是多监听器**（ADR-020）：`system-prompt/assemble` 是 waterfall，
 * 每个监听器都要 `await next()` 拿内层结果再返回新装配 —— 挂两个监听器就是两个 owner 争同一个装配结果，
 * 顺序、去重、失败隔离都会变成隐患。故**一个监听器、多个生产者**：段名各自独立，合并只发生在这一个函数里。
 *
 * **为什么不用 `systemPrompt.context({ text })`**（ADR-018 更正，见 ADR-020）：
 *   官方 `assemble()` 里 `contexts[].text` 是**同步**求值（`typeof entry.text === "function" ? entry.text(context) : entry.text`，
 *   无 `await`）。我们的解析要读盘（镜像 + 归档），必然是异步 ⇒ 传进去的是 Promise，
 *   而渲染端 `interpolate()` 会做 `text.indexOf(...)` → `TypeError: text.indexOf is not a function`，
 *   且 `preStep` **每一步**都渲染 ⇒ 一旦装机，每一步都炸。
 *   故改用官方同一条装配链上的 **awaited waterfall**（监听器收到 `next` 且被 await）—— 未新建注入管道。
 *
 * 顺序：官方运行时上下文各段 order = 110/115/120（SANDBOX/APPROVAL/SUBAGENT），我们的 `CONTEXT_ORDER = -50`
 *   意为「最早」⇒ 在 waterfall 里**前置**插入即等价还原；`entries` 的数组顺序即段间顺序
 *   （`[项目上下文, 历史记忆]`，ADR-019 ④）。
 *
 * 语义：
 *   - 先把**本层拥有**的段名（`names`）从既有装配里摘掉 ⇒ 反复装配不叠加（幂等）；
 *   - 再把非空文本按 `entries` 顺序前置插入；
 *   - 空文本 = 不产出条目（不是"产出一个空段"）。
 *
 * @param {object} assembly 官方装配对象（`{sections, contexts, tools, variables}`）
 * @param {Array<{name: string, text: string}>} entries 生产者产出（顺序即注入顺序）
 * @param {string[]} names 本层拥有的段名（这些名字的旧条目一律先摘除）
 * @returns {object} 新的装配对象
 */
export function applyInjectedContexts(assembly, entries, names = [INJECT_CONTEXT_NAME, MEMORY_CONTEXT_NAME]) {
  const base = assembly !== null && typeof assembly === 'object' ? assembly : {}
  const owned = Array.isArray(names) ? names : []
  const contexts = Array.isArray(base.contexts) ? base.contexts.filter((c) => !owned.includes(c?.name)) : []
  const add = []
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e === null || typeof e !== 'object') continue
    if (typeof e.name !== 'string' || e.name === '') continue
    if (typeof e.text !== 'string' || e.text === '') continue
    add.push({ name: e.name, text: e.text })
  }
  return { ...base, contexts: [...add, ...contexts] }
}

/**
 * 单生产者兼容入口（B 的既有契约；回归套件仍按它核准）。
 * 等价于 `applyInjectedContexts(assembly, [{name: INJECT_CONTEXT_NAME, text}])`。
 *
 * @param {object} assembly 官方装配对象
 * @param {string} text 注入文本；空串 = 不产出条目（但**仍**摘除同名旧条目，保幂等）
 * @returns {object} 新的装配对象
 */
export function applyInjectedContext(assembly, text) {
  return applyInjectedContexts(
    assembly,
    typeof text === 'string' && text !== '' ? [{ name: INJECT_CONTEXT_NAME, text }] : [],
  )
}

/**
 * 生产者 ②：历史记忆（V1.2-D）。**取数失败一律降级为空串**，绝不外泄异常、绝不编内容。
 *
 * 三态如实回报（`reason`）：
 *   - `disabled`：开关关（当前默认）—— 本阶段只交付机械部分；
 *   - `query-source-undecided`：开关开了但**检索词来源未配置** ⇒ 拒绝注入并说明（不猜检索词）；
 *   - 其余来自投影层的判定（`no-hits` / `owner-unknown` / `over-budget` / `source-unavailable` …）。
 *
 * @param {object} context 官方装配 context（含 `agent.session`）
 * @param {object} options `{enabled, querySource, baseUrl, cache, fetchImpl, agentKind}`
 * @returns {Promise<{text: string, reason: string}>}
 */
export async function memoryContextText(context, options = {}) {
  try {
    if (options.enabled !== true) return { text: '', reason: 'disabled' }
    const session = context?.agent?.session
    if (session === undefined || session === null) return { text: '', reason: 'no-session' }
    const cwd = typeof session.header?.cwd === 'string' ? session.header.cwd : ''
    if (cwd === '') return { text: '', reason: 'no-cwd' }

    // 检索词由调用方给定 —— 本层**不猜**。
    //   口径已于 2026-09-18 裁定为「项目身份」（D-1 A），产品侧接线见 `createProjectIdentityQuery`；
    //   本层仍保持"没配就拒绝注入"的硬契约：`query-source-undecided` 不是错误，是**如实说明**。
    //   （保留这条路径是刻意的：将来若有第三个调用方不配 querySource，它会得到一条可诊断的原因，
    //     而不是一份用未知口径搜出来的历史记忆。）
    const querySource = options.querySource
    if (typeof querySource !== 'function') return { text: '', reason: 'query-source-undecided' }
    const query = await querySource({ session, cwd, context })
    if (typeof query !== 'string' || query.trim() === '') return { text: '', reason: 'empty-query' }

    const inputs = await collectMemoryInputs({
      cwd,
      query,
      sessionId: typeof session.id === 'string' ? session.id : undefined,
      baseUrl: typeof options.baseUrl === 'string' && options.baseUrl !== '' ? options.baseUrl : resolveBaseUrl(),
      cache: options.cache ?? null,
      ...(typeof options.fetchImpl === 'function' ? { fetchImpl: options.fetchImpl } : {}),
      ...(typeof options.agentKind === 'string' ? { agentKind: options.agentKind } : {}),
    })
    const resolved = resolveMemoryContext(inputs)
    return { text: resolved.injectable ? resolved.text : '', reason: resolved.reason }
  } catch {
    // 注入是附加价值：任何异常都降级为空串，绝不毁掉整轮对话
    return { text: '', reason: 'error' }
  }
}

/**
 * 注册注入（宿主半 entry 调用）：挂官方 `system-prompt/assemble` waterfall。
 *
 * **本函数是注入缝的唯一天主**（ADR-020）：段①项目上下文（B）+ 段②历史记忆（D）都在**这一个**监听器里产出。
 * D 的开关默认关（`memoryInjectEnabled()`），关闭时监听器行为与 B 期逐字一致。
 *
 * 契约：
 *   ① 必须调用 `next()` —— cordis waterfall 里不调用 `next()` 等于**否决**后续链路（会掐掉官方自己的装配）；
 *   ② 本监听内部任何异常都不得外泄 —— 它跑在每一步的装配路径上，抛错会毁掉整轮对话；
 *   ③ 卸载随插件 fiber 自动完成（cordis effect 语义），不需要自己管 disposer。
 *
 * @param {object} ctx cordis 上下文
 * @param {object} [memoryOptions] D 的记忆注入配置 `{enabled, querySource, baseUrl, fetchImpl, agentKind}`
 * @returns {{registered: boolean, reason?: string, memory: {enabled: boolean, active: boolean, reason: string}}}
 */
export function registerProjectContext(ctx, memoryOptions = {}) {
  const enabled = memoryOptions !== null && typeof memoryOptions === 'object' && memoryOptions.enabled === true
  const querySource = memoryOptions?.querySource
  const memory = {
    enabled,
    active: enabled && typeof querySource === 'function',
    reason: !enabled ? 'disabled' : typeof querySource === 'function' ? 'ok' : 'query-source-undecided',
  }
  if (ctx === null || typeof ctx !== 'object' || typeof ctx.on !== 'function') {
    return { registered: false, reason: 'ctx.on 不可用（宿主半上下文形态变化）', memory }
  }
  // 缓存按**注册实例**持有（进程内跨轮复用）；D 关闭时也建，省得开关翻转时行为分叉。
  const cache = createOwnerCache()
  try {
    ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      // 先让官方链路自己装配完（拿内部结果），再在结果上加我们的段。
      const inner = typeof next === 'function' ? await next() : assembly
      const entries = []

      // 生产者 ①：项目上下文（B）
      let projectText = ''
      try {
        projectText = await projectContextText(context)
      } catch {
        projectText = '' // 解析异常已在 projectContextText 内吞过一次；这里再兜一层，绝不外泄
      }
      if (projectText !== '') entries.push({ name: INJECT_CONTEXT_NAME, text: projectText })

      // 生产者 ②：历史记忆（D；开关默认关 ⇒ 关闭时这里不产生任何条目）
      if (enabled) {
        const m = await memoryContextText(context, { ...memoryOptions, enabled, cache })
        if (m.text !== '') entries.push({ name: MEMORY_CONTEXT_NAME, text: m.text })
      }

      return applyInjectedContexts(inner, entries)
    })
  } catch (e) {
    return { registered: false, reason: `注册注入监听抛错：${e instanceof Error ? e.message : String(e)}`, memory }
  }
  return { registered: true, memory }
}
