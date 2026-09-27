// dsh-personal-workspace — host (server) half.
//
// WHY THIS FILE IS NO LONGER EMPTY（V1.2-A §1.3 归档）
//   Project Archive 必须把 PROJECT_ARCHIVE.md 落到**真实**目录
//   （<Workspace>/Personal Harness Archives/<Project Name>/）。浏览器层没有文件系统能力，
//   所以真实写盘只能发生在宿主半 —— 官方 Workspace 的 path 是真实绝对路径，归档就写在那里。
//
// 设计纪律（与 V1.2 预检审计结论一一对应）
//   ① 用 node:fs，不用 @deepseek-ai/* —— 官方插件作者文档与 dsh-thoughtdag 宿主半都这么写，
//      且**零依赖**（插件包不为自己没装的包声明依赖）。
//   ② 写盘 = 临时文件 + rename（原子）；写完**回读**（字节数 + md 小节标题 + evidence 可解析），
//      回读不过 → 删除刚写的文件并返回 ok:false。用户规则：生成失败**不得**封存项目。
//   ③ 只有 POST；Host 头白名单（照 dsh-thoughtdag:875/879-880 的做法 —— 自己注册的路由
//      不经过官方 /api 的鉴权 fence，所以必须自己收口）。
//   ④ 路径收口：workspaceRoot 必须是**已存在的绝对目录**（不创建假 Workspace）；
//      文件名服务端重新消毒（不信任客户端）；最终路径必须落在归档根之内。
//   ⑤ 不覆盖既有归档：同日重复归档自动加 -2/-3 后缀（历史归档永不销毁）。
//
// 服务依赖（V1.2-A 真机缺陷的根因与修复，2026-09-17）
//   宿主插件的服务依赖必须在**代码里**声明 `inject`（`dsh` 清单字段只承载客户端 inject）。
//   缺失 inject 时 loader 不等 webServer 就绪就调用 apply，`ctx.get('webServer')` 取不到 →
//   下面的静默 return → 路由从未挂载 → 真机上点「封存项目」**必然失败**（项目保持未封存）。
//   参照：dsh-community-market/lib/index.js:5、@deepseek-ai/dsh-web-app/lib/index.js:32。
//   教训：旧套件喂的是**伪造的 ctx**（自己提供 register 桩），还把 `apply({})` 不抛错算作通过，
//   于是把一次接线失败读成了绿色 —— 测试证明的是 mock，不是真机接线。
//
// 降级语义（修正版）：服务缺失**不再静默**，一律报错到宿主日志；
//   客户端仍会收到"宿主归档服务不可达"并据此**拒绝封存**（不会"以为写了其实没写"）。

import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { MIRROR_PATH, appendSnapshot, readSnapshot } from './mirror.js'
import { createProjectIdentityQuery, memoryInjectEnabled, registerProjectContext } from './context.js'
import { MEMORY_TREE_PATH, createMemoryTreeHandler } from './memory-tree.js'
// V1.2-E4 Memory Curator：**承载**（取数 + 落盘 + 官方 timer 调度）；引擎是纯层 memory-curator.mjs。
import {
  CURATOR_DISMISS_PATH,
  CURATOR_INTERVAL_MS,
  CURATOR_PATH,
  CURATOR_RUN_PATH,
  CURATOR_STATE_PATH,
  createCuratorHandlers,
  runCuration,
  scheduleCuration,
} from './memory-curator.js'
// V1.2-F1：ChatGPT 诚实启动器的**嵌入可行性探测**（只读、无凭据；证据由客户端如实翻译）。
import { EMBED_PROBE_PATH, createEmbedProbeHandler } from './chatgpt-embed-probe.js'

export const name = 'dsh-personal-workspace'

// 宿主侧服务依赖（DSH/cordis 契约，见文件头注释）：声明后 loader 会等 webServer 就绪再调用 apply。
//   V1.2-B 的注入**不**写进这里：它挂的是官方 `system-prompt/assemble` waterfall 事件
//   （`ctx.on`，见 server/context.js），不需要持有 systemPrompt 服务实例，
//   因而既不必阻塞本插件 apply，也不会因该服务暂缺而 park 整个插件
//   （webServer 与 systemPrompt 的时序互相独立）。
export const inject = ['webServer']

/** 路由前缀（与客户端 archive.ts 的 ARCHIVE_ROUTE 严格一致）。 */
const ARCHIVE_PREFIX = '/personal-workspace/archive'
const HEALTH_PATH = ARCHIVE_PREFIX + '/health'
/** V1.2-B：项目镜像路由（客户端把个人层项目投影推给宿主；装配时宿主只读镜像）。 */
const CONTEXT_PREFIX = '/personal-workspace/context'
const CONTEXT_STATE_PATH = CONTEXT_PREFIX + '/state'
const CONTEXT_HEALTH_PATH = CONTEXT_PREFIX + '/health'

// 最近一次 apply 的注入注册结果（只读诊断用；**只存事实，不藏推断**）。
//   为什么需要：D 的注入开关默认关 ⇒ 真机上「没有记忆段」既可能是**按设计关闭**，
//   也可能是**注册失败**，两者从外部看完全一样。没有这个字段，明天的真机验收只能靠猜，
//   而这正是本项目反复踩过的坑（B 阶段：把"注入段没注册"误报成"归档路由未挂载"）。
let injectDiag = null

/** 测试钩子（同 `resetMirrorCache` 先例）：把注册事实清回"本次进程尚未 apply"，
 *  好让套件能走**真路由**验证那条"未知 ≠ 关闭"的诚实地板。产品路径不调用它。 */
export function resetInjectDiag() {
  injectDiag = null
}
const MAX_BODY_BYTES = 4 * 1024 * 1024
const ARCHIVE_DIR_NAME = 'Personal Harness Archives'
const REQUIRED_HEADINGS = [
  '# Project Archive',
  '## Project',
  '## Period',
  '## Executive Summary',
  '## Original Goal',
  '## What Was Done',
  '## Key Decisions',
  '## Important Conversations',
  '## Tasks & Execution History',
  '## Deliverables',
  '## Files / Workspaces',
  '## Important Knowledge',
  '## Unresolved Issues',
  '## Lessons Learned',
  '## Suggested Next Steps',
  '## Source References',
]

const TRUSTED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function hostTrusted(req) {
  const raw = String(req.headers.host ?? '')
  const hostname = raw.replace(/:\d+$/, '').toLowerCase()
  return TRUSTED_HOSTS.has(hostname)
}

function sendJson(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejectPromise(new Error(`请求体超过上限（${MAX_BODY_BYTES} 字节）`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', (err) => rejectPromise(err))
  })
}

/** 服务端重新消毒文件名字段（不信任客户端）：只允许单段、去分隔符、拒空。 */
function safeFileName(raw, fallback) {
  const base = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '')
  if (base.includes('/') || base.includes('\\') || base.includes('..') || base.trim() === '') return fallback
  return base.slice(0, 160)
}

/** 目录段消毒（项目名 → 目录名）。 */
function safeSegment(raw) {
  const cleaned = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 80)
    .trim()
  return cleaned === '' ? 'untitled' : cleaned
}

/** 目标路径必须落在 root 之内（词法归一后比较，防 ../ 逃逸）。 */
function containedIn(root, target) {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep)
}

/** 不覆盖既有文件：存在则 -2 / -3 … */
async function pickFreePath(dir, fileName) {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  for (let i = 1; i <= 99; i += 1) {
    const candidate = join(dir, i === 1 ? fileName : `${stem}-${i}${ext}`)
    try {
      await stat(candidate)
    } catch {
      return candidate
    }
  }
  throw new Error('同名归档文件过多（已到 -99），请先整理归档目录')
}

async function writeAtomic(target, content) {
  const tmp = join(dirname(target), `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`)
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, target)
}

async function handleArchive(req, res) {
  if (!hostTrusted(req)) {
    sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 POST）' })
    return
  }

  let input
  try {
    const raw = await readBody(req)
    input = JSON.parse(raw)
  } catch (e) {
    sendJson(res, 400, { ok: false, message: `请求体无法解析：${e instanceof Error ? e.message : String(e)}` })
    return
  }

  const projectName = String(input?.projectName ?? '')
  const projectId = String(input?.projectId ?? '')
  const markdown = String(input?.markdown ?? '')
  const evidence = input?.evidence
  if (markdown.trim() === '' || projectName.trim() === '' || projectId.trim() === '') {
    sendJson(res, 400, { ok: false, message: '缺少 projectName / projectId / markdown' })
    return
  }

  // ── 归档根：真实已存在的工作区目录，或 Personal Harness 自管目录（不是假 Workspace）──
  const requestedRoot = input?.workspaceRoot
  // base = 归档根目录（md 与 evidence 落在这里的子目录）；同时作为越界校验的边界。
  let base
  let source
  if (typeof requestedRoot === 'string' && requestedRoot.trim() !== '') {
    if (!isAbsolute(requestedRoot)) {
      sendJson(res, 400, { ok: false, message: `workspaceRoot 必须是绝对路径：${requestedRoot}` })
      return
    }
    const ws = resolve(requestedRoot)
    try {
      const st = await stat(ws)
      if (!st.isDirectory()) throw new Error('not a directory')
    } catch (e) {
      // 不创建假 Workspace：工作区不存在就明确失败
      sendJson(res, 400, { ok: false, message: `工作区目录不存在或不可用：${ws}（${e instanceof Error ? e.message : String(e)}）` })
      return
    }
    base = join(ws, ARCHIVE_DIR_NAME)
    source = 'linked'
  } else {
    // 受管归档目录（用户 §1.3：Project 没有 Workspace 时用 Personal Harness 明确管理的目录）
    base = join(homedir(), ARCHIVE_DIR_NAME)
    source = 'managed'
  }

  const dir = join(base, safeSegment(projectName))
  const fileName = safeFileName(input?.fileName, `${safeSegment(projectName)}-archive.md`)
  const evidenceFileName = safeFileName(input?.evidenceFileName, `${safeSegment(projectName)}-archive.evidence.json`)

  const mdTarget = join(dir, fileName)
  const evTarget = join(dir, evidenceFileName)
  if (!containedIn(base, mdTarget) || !containedIn(base, evTarget)) {
    sendJson(res, 400, { ok: false, message: '目标路径越出归档根（拒绝写入）' })
    return
  }

  const missing = REQUIRED_HEADINGS.filter((h) => !markdown.includes(h))
  if (missing.length > 0) {
    sendJson(res, 400, { ok: false, message: `归档内容缺少必需小节：${missing.join(' / ')}` })
    return
  }

  let written = []
  try {
    await mkdir(dir, { recursive: true })
    const mdFinal = await pickFreePath(dir, fileName)
    const evFinal = await pickFreePath(dir, evidenceFileName)
    await writeAtomic(mdFinal, markdown)
    written.push(mdFinal)
    await writeAtomic(evFinal, JSON.stringify(evidence ?? {}, null, 2))
    written.push(evFinal)

    // ── 回读校验：不是"以为写了"，而是读回来核过 ──
    const mdBack = await readFile(mdFinal, 'utf8')
    const evBack = await readFile(evFinal, 'utf8')
    const mdBytes = Buffer.byteLength(mdBack, 'utf8')
    const evBytes = Buffer.byteLength(evBack, 'utf8')
    if (mdBytes !== Buffer.byteLength(markdown, 'utf8')) throw new Error(`归档回读字节数不一致（写入 ${Buffer.byteLength(markdown, 'utf8')} / 读回 ${mdBytes}）`)
    for (const h of REQUIRED_HEADINGS) {
      if (!mdBack.includes(h)) throw new Error(`归档回读缺少小节：${h}`)
    }
    JSON.parse(evBack) // evidence 必须仍是合法 JSON

    sendJson(res, 200, {
      ok: true,
      file: mdFinal,
      evidenceFile: evFinal,
      bytes: mdBytes,
      readBack: { markdownBytes: mdBytes, evidenceBytes: evBytes },
      headingsChecked: [...REQUIRED_HEADINGS],
      workspaceSource: source,
      message: `归档已写入并回读校验通过：${mdFinal}`,
    })
  } catch (e) {
    // 失败不留半成品：删掉本次写入的文件（历史归档不受影响）
    for (const f of written) {
      try {
        await unlink(f)
      } catch {
        // best-effort cleanup
      }
    }
    sendJson(res, 500, { ok: false, message: `归档写入/校验失败：${e instanceof Error ? e.message : String(e)}（已清理本次半成品，项目保持未封存）` })
  }
}

function handleHealth(_req, res) {
  sendJson(res, 200, {
    ok: true,
    service: 'dsh-personal-workspace/archive',
    archiveRootName: ARCHIVE_DIR_NAME,
    managedRoot: join(homedir(), ARCHIVE_DIR_NAME),
    requiredHeadings: REQUIRED_HEADINGS.length,
  })
}

// ---------------------------------------------------------------------------
// V1.2-B · 项目镜像（客户端 → 宿主单向投影；装配时宿主只读）
//
// 为什么是「客户端推」而不是「宿主拉」：项目真源在浏览器 localStorage，宿主没有读取它的
// 通路（也不该有）。推送只在**真实变更**时发生（registry commit），因此镜像的语义是
// 「用户最后一次确认过的个人层状态」，不是高频心跳。
//
// 收口与归档路由同一套纪律：Host 白名单（自己注册的路由不过官方 /api 鉴权 fence）、
// 只接受 POST、单条上限、失败如实报错（不假装写入成功）。
async function handleContextState(req, res) {
  if (!hostTrusted(req)) {
    sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 POST）' })
    return
  }
  let input
  try {
    const raw = await readBody(req)
    input = JSON.parse(raw)
  } catch (e) {
    sendJson(res, 400, { ok: false, message: `请求体无法解析：${e instanceof Error ? e.message : String(e)}` })
    return
  }
  const result = await appendSnapshot(input)
  if (!result.ok) {
    sendJson(res, 400, { ok: false, message: result.message })
    return
  }
  sendJson(res, 200, { ok: true, bytes: result.bytes, compacted: result.compacted === true, message: '项目镜像已更新（宿主侧装配改读此镜像）' })
}

/** 只读诊断面：让回归套件与真机探针能看见**宿主当前读到的镜像**，而不是猜。 */
async function handleContextHealth(req, res) {
  if (!hostTrusted(req)) {
    sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 GET）' })
    return
  }
  const read = await readSnapshot()
  sendJson(res, 200, {
    ok: true,
    service: 'dsh-personal-workspace/project-context',
    mirrorPath: MIRROR_PATH,
    present: read !== null,
    records: read === null ? 0 : read.records,
    projects: read === null ? 0 : read.snapshot.projects.length,
    relations: read === null ? 0 : Object.keys(read.snapshot.sessionProject).length,
    lifecycle: read === null ? 0 : Object.keys(read.snapshot.lifecycle).length,
    // 注入子系统的**只读**状态（B 段 + D 段共用同一监听器）。
    //   诚实边界：本路由**不发起任何网络请求** ⇒ 它不宣称记忆库"可达"，只报出它被要求连到哪。
    //   reachability 保持 'not-probed'，想看可达性请用探测脚本（真机探针），别把"没探"读成"探过了没问题"。
    inject: injectDiag === null
      ? { state: 'not-applied', note: '本次进程尚未执行 apply ⇒ 注册结果未知（不等于关闭）' }
      : {
          state: injectDiag.registered ? 'registered' : 'failed',
          reason: injectDiag.reason,
          memory: injectDiag.memory,
          reachability: 'not-probed',
        },
  })
}

export function apply(ctx) {
  // 服务缺失**不静默**：声明了 inject 之后这条路径不该再出现，出现即代表接线坏了，
  //   必须留在宿主日志里（旧实现在这里静默 return，把真机缺陷藏了一整个版本）。
  const fail = (why) => {
    // 措辞固定为「归档路由未挂载」：这条路径**只**用于路由真的没挂上的情况（HS1b 钉住该措辞）。
    //   局部降级（如注入段注册失败）走 report()，不得借用这句 —— 否则会把局部问题谎报成整体故障。
    report(`归档路由未挂载：${why}`, '真机上「封存项目」会失败（项目保持未封存）')
  }
  // 降级档：功能局部失效 —— 一律写进宿主日志，且措辞必须**准确到子系统**
  //   （V1.2-B 实测踩过：借用 fail() 的文案会把"注入段没注册"谎报成"归档路由未挂载"）。
  const report = (why, consequence) => {
    const msg = `[dsh-personal-workspace] ${why} —— ${consequence}`
    try {
      if (typeof ctx?.logger?.error === 'function') ctx.logger.error(msg)
      else console.error(msg)
    } catch {
      // logging is best-effort
    }
  }
  if (!ctx || typeof ctx.effect !== 'function') {
    fail('ctx.effect 不可用')
    return
  }
  let webServer
  try {
    webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : ctx.webServer
  } catch (e) {
    fail(`读取 webServer 服务抛错：${e instanceof Error ? e.message : String(e)}`)
    return
  }
  if (!webServer || typeof webServer.register !== 'function') {
    fail('webServer 服务不可用（检查 package/export 的 inject 声明）')
    return
  }
  ctx.effect(() => webServer.register({ kind: 'exact', path: HEALTH_PATH, handler: handleHealth }), 'personal-workspace: archive health')
  ctx.effect(() => webServer.register({ kind: 'prefix', path: ARCHIVE_PREFIX, handler: handleArchive }), 'personal-workspace: archive')
  ctx.effect(() => webServer.register({ kind: 'exact', path: CONTEXT_STATE_PATH, handler: handleContextState }), 'personal-workspace: project mirror write')
  ctx.effect(() => webServer.register({ kind: 'exact', path: CONTEXT_HEALTH_PATH, handler: handleContextHealth }), 'personal-workspace: project mirror diag')
  // V1.2-E2 记忆树取数（**只读** GET）。host 校验与 JSON 输出复用本文件的那一份实现
  //   （createMemoryTreeHandler 注入），不复制第二份"看起来一样"的信任判断。
  ctx.effect(
    () =>
      webServer.register({
        kind: 'exact',
        path: MEMORY_TREE_PATH,
        handler: createMemoryTreeHandler({ isTrustedHost: hostTrusted, sendJson }),
      }),
    'personal-workspace: memory tree (read-only)',
  )

  // V1.2-F1 ChatGPT 诚实启动器：**嵌入可行性探测**（只读 GET，零凭据；客户端据此如实说明能否嵌入）。
  ctx.effect(
    () =>
      webServer.register({
        kind: 'exact',
        path: EMBED_PROBE_PATH,
        handler: createEmbedProbeHandler({ isTrustedHost: hostTrusted, sendJson }),
      }),
    'personal-workspace: chatgpt embed probe (read-only)',
  )

  // ── V1.2-E4 Memory Curator（后台整理：去重/连边/importance；**只出建议**，绝不写 MemOS）──────
  //   裁定 V-13：不自动 merge、每轮上限 10、**自动调度**。
  //   调度用**官方** `ctx.timer`（@deepseek-ai/cordis-plugin-timer，其 interval 内部走 ctx.effect，
  //   随插件生命周期回收）—— 不自造定时器。它**不进 inject**（非必需服务），但取不到时
  //   必须**如实报出**（路由把 scheduler.enabled=false + 原因透给客户端），不静默退化成手动。
  let curatorScheduler = { enabled: false, intervalMs: null, reason: '尚未初始化' }
  const curator = createCuratorHandlers({
    isTrustedHost: hostTrusted,
    sendJson,
    readBody,
    statePath: CURATOR_STATE_PATH,
    schedulerStatus: () => ({ ...curatorScheduler, statePath: CURATOR_STATE_PATH }),
  })
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: CURATOR_PATH, handler: curator.handleState }),
    'personal-workspace: memory curator state (read-only)',
  )
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: CURATOR_RUN_PATH, handler: curator.handleRun }),
    'personal-workspace: memory curator run',
  )
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: CURATOR_DISMISS_PATH, handler: curator.handleDismiss }),
    'personal-workspace: memory curator dismiss',
  )

  let curatorTimer = null
  try {
    curatorTimer = typeof ctx.get === 'function' ? ctx.get('timer') : ctx.timer
  } catch (e) {
    report(`读取 timer 服务抛错：${e instanceof Error ? e.message : String(e)}`, '记忆整理将不会自动运行（路由仍可手动触发）')
  }
  curatorScheduler = scheduleCuration({
    timer: curatorTimer,
    intervalMs: CURATOR_INTERVAL_MS,
    onTick: async () => {
      const out = await runCuration({ statePath: CURATOR_STATE_PATH })
      if (out.ok !== true) report(`自动记忆整理未完成：${out.reason}`, '本轮不落盘（下次 tick 再试）')
    },
    onError: (e) => report(`自动记忆整理抛错：${e instanceof Error ? e.message : String(e)}`, '本轮被跳过，不影响会话与路由'),
  })
  if (curatorScheduler.enabled !== true) {
    report(`记忆整理未启用自动调度：${curatorScheduler.reason}`, '整理只能手动触发（路由会如实标注 disabled）')
  }

  try {
    ctx.logger?.info?.('[dsh-personal-workspace] archive route mounted at ' + ARCHIVE_PREFIX)
  } catch {
    // logger is best-effort
  }

  // V1.2-B §0：项目上下文注入段（官方 `system-prompt/assemble` awaited waterfall 接缝；ADR-020 更正）。
  //   V1.2-D 的**历史记忆段**挂在**同一个**监听器上（一监听器两生产者，ADR-020），段序
  //   `[项目上下文, 历史记忆]`。
  //   D 的两处口径**已于 2026-09-18 裁定**（真源 docs/V1_2_DECISIONS_VERDICTS.md）：
  //     ① 检索词 = **项目身份**（D-1 A）⇒ 此处按它配上 `querySource`（`createProjectIdentityQuery`）；
  //     ② 与 MemOS 自带逐轮召回 = **先搁置、两份并存**（D-2 C）⇒ 注入开关**仍默认关**，
  //        这是**裁定结果本身**（开关一开两份记忆会同时出现，分工尚未裁定，不替用户决定）；
  //        且注入文本已按 **V-8** 写明两份记忆的边界（`MEMORY_SCOPE_NOTE`，见 memory-context.ts）。
  //   ⇒ 打开 `DSH_PERSONAL_MEMORY_INJECT=1` 即生效，不必再改代码。
  //   与归档/镜像路由是**互相独立**的两个子系统：注入段注册失败**不得**影响路由挂载
  //   （上面 4 条路由已经在挂着了），所以这里既不能 return、也不能借用 fail() 的措辞
  //   —— 那会谎称「归档路由未挂载」，把一次局部降级报成整体故障。各报各的。
  const memoryEnabled = memoryInjectEnabled()
  const reg = registerProjectContext(ctx, { enabled: memoryEnabled, querySource: createProjectIdentityQuery() })
  // 只读诊断：把**注册事实**留下来（含 D 段开关与"开关开了但没生效"的原因）。
  //   注意这里**不**把 memoryOptions 里没有的东西补成"看起来正常"——查不到就如实为空。
  injectDiag = {
    registered: reg.registered === true,
    reason: reg.reason ?? null,
    memory: reg.memory ?? null,
  }
  if (reg.registered !== true) {
    report(
      `项目上下文注入段未注册：${reg.reason} —— 真机上会话不会自动带项目上下文`,
      '归档与镜像路由不受影响（仍已挂载）',
    )
  } else if (reg.memory?.enabled === true && reg.memory?.active !== true) {
    // 开关开了但没有生效 ⇒ 如实说"未生效"，而不是静默不注入让人以为它坏了。
    //   口径已裁定并接线完毕 ⇒ 走到这里只剩**接线本身出问题**（例如 querySource 被判为不可用），
    //   故措辞从"待裁定后配置"改为"接线异常"，否则会误导排查方向。
    report(
      `历史记忆注入已打开开关，但**未生效**：${reg.memory.reason} —— 本机不会注入历史记忆段`,
      '检索词口径（D-1 A 项目身份）已裁定并接线，此处应视为**接线异常**而非待办',
    )
  }
}

export default { name, inject, apply }
