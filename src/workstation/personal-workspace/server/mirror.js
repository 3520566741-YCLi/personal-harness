// dsh-personal-workspace — 宿主半 · 项目镜像（V1.2-B Project-aware Context 的取数通路）
//
// 为什么需要这个文件（问题与替代方案见 docs/DECISIONS.md ADR-018）：
//   项目是**个人层组织语义**，唯一真源在浏览器 localStorage（`dsh.personal.projects.v1`，
//   personal-registry 模块）。而注入必须发生在**宿主侧的提示词装配路径**上 —— 那条路径
//   拿不到 localStorage，也不该为了取数去反向调用客户端（客户端可能没开、可能在别的窗口）。
//   两边之间必须有一个**单向投影**：客户端在每次真实变更（commit）时把个人层投影推给宿主，
//   宿主存成镜像，装配时只读镜像。镜像**不含**任何官方数据（任务正文/会话正文/文件树），
//   只有项目元数据 + 关系映射 → 不构成第二真源。
//
// 纪律：
//   ① 只读镜像 = 纯文件读；装配路径上**绝不**抛错（读不到就返回 null，由上层如实降级）。
//   ② 写入只接受「服务端自己收口的」POST（Host 白名单 + 单条上限）；不信任客户端。
//   ③ 不改写历史：追加式 JSONL，每行一个完整快照，读"最后一行有效"。
//      理由：单行损坏（写一半断电）不该毁掉整份镜像 —— 上一行仍是可用的完整快照。
//      文件超过 MAX_BYTES 时整体重写为「仅最后一行」（compact），不做增量删除。
//   ④ 镜像不是真源：不存在 / 损坏 / 过期 → 一律返回 null，注入层如实说「未知」，不猜。

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * 镜像文件（Personal 自管目录；与归档根同级约定，均在 $HOME 下）。
 *
 * `DSH_PERSONAL_MIRROR_PATH` 让**回归套件与真机探针**能把镜像重定向到沙箱内临时文件 ——
 * 否则测试会读写用户真实镜像（不可接受）。真机不设该变量 → 走默认路径。
 */
export const MIRROR_PATH =
  typeof process.env.DSH_PERSONAL_MIRROR_PATH === 'string' && process.env.DSH_PERSONAL_MIRROR_PATH.trim() !== ''
    ? process.env.DSH_PERSONAL_MIRROR_PATH.trim()
    : join(homedir(), '.dsh', 'personal-project-mirror.v1.jsonl')

/** 单条快照上限（按**原始请求体**判定，超过即拒）。正常规模（几十项目 + 关系映射）远小于此。 */
export const MIRROR_MAX_RECORD_BYTES = 512 * 1024
/** 镜像文件体积上限（超过则在下次写入时 compact 成最后一行）。 */
export const MIRROR_MAX_FILE_BYTES = 2 * 1024 * 1024

/** 缓存：同 mtime+size 不重复读盘（装配每步都会取一次）。 */
let cache = null

/** 输入快照的形状（客户端 personal-registry 的投影；缺字段一律宽容处理）。
 *
 *  **产出形状**（= 宿主侧读取形状，消费方是 server/context.js 与诊断路由）：
 *  `{ projects: [{id,name,description?,repoHint?}], sessionProject: {sessionId: projectId}, lifecycle: {projectId: {...}} }`
 *  与**客户端请求形状**（`{projects, rels:{sessionProject}, lifecycle}`）不同是刻意的：
 *  请求形状属于客户端的存储投影，宿主侧只需要扁平的三样东西 —— 归一化在边界处发生，
 *  消费方不必再知道客户端的嵌套结构（否则每个消费点都要自己解一层）。 */
export function normalizeSnapshot(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const projects = Array.isArray(raw.projects) ? raw.projects : []
  const rels = raw !== null && typeof raw.rels === 'object' && raw.rels !== null ? raw.rels : {}
  const lifecycle = raw !== null && typeof raw.lifecycle === 'object' && raw.lifecycle !== null ? raw.lifecycle : {}
  const out = { projects: [], sessionProject: {}, lifecycle: {} }
  for (const p of projects) {
    if (p === null || typeof p !== 'object') continue
    const id = typeof p.id === 'string' ? p.id.trim() : ''
    const name = typeof p.name === 'string' ? p.name.trim() : ''
    if (id === '' || name === '') continue
    const rec = { id, name }
    if (typeof p.description === 'string' && p.description.trim() !== '') rec.description = p.description.trim().slice(0, 500)
    // `repoHint`（项目仓库目录线索）**必须保留** —— 曾经这里把字段裁成只剩 id/name/description，
    //   于是出现三方不一致：客户端投影在推它（mirror-push.ts）、宿主 `keywordsOf` 在读它、
    //   而归一化把它们之间悄悄掐断 ⇒ ① 只靠 repoHint 的项目**用 cwd 永远定位不到**（B 的兜底失效）；
    //   ② D-1 裁定的"项目身份 = 名称 + 描述 + **目录线索**"缺一角（检索词少一段）。
    //   是本项目"同一事实只能有一个 owner / 不许静默丢弃"的纪律问题，故在此补齐。
    //   仍按与其他字段同样的口径裁剪（trim + 截断），不额外放宽。
    if (typeof p.repoHint === 'string' && p.repoHint.trim() !== '') rec.repoHint = p.repoHint.trim().slice(0, 500)
    out.projects.push(rec)
    if (out.projects.length >= 500) break
  }
  // 关系映射：**两种输入形状都要能读**
  //   客户端请求形状 `{ rels: { sessionProject } }`、宿主读取形状 `{ sessionProject }`。
  //   归一化必须**幂等**（readSnapshot 会把已归一化的对象再喂回来一次）——
  //   只认 `rels` 会让读回时关系被清空（真机表现：会话永远定位不到项目）。
  const sp = rels.sessionProject ?? raw.sessionProject
  if (sp !== null && typeof sp === 'object') {
    for (const [sid, pid] of Object.entries(sp)) {
      if (typeof sid !== 'string' || typeof pid !== 'string') continue
      const sidT = sid.trim()
      const pidT = pid.trim()
      if (sidT === '' || pidT === '') continue
      out.sessionProject[sidT] = pidT
      if (Object.keys(out.sessionProject).length >= 5000) break
    }
  }
  for (const [pid, lc] of Object.entries(lifecycle)) {
    if (lc === null || typeof lc !== 'object') continue
    const entry = {}
    if (typeof lc.status === 'string') entry.status = lc.status
    if (lc.starred === true) entry.starred = true
    if (typeof lc.archiveFile === 'string' && lc.archiveFile.trim() !== '') entry.archiveFile = lc.archiveFile.trim()
    if (Object.keys(entry).length > 0) out.lifecycle[pid] = entry
    if (Object.keys(out.lifecycle).length >= 500) break
  }
  return out
}

/**
 * 追加一条快照（客户端每次 commit 调一次）。
 * @returns {{ok: boolean, bytes?: number, compacted?: boolean, message?: string}}
 */
export async function appendSnapshot(raw) {
  // 上限在**归一化之前**按原始请求体判定。
  //   理由：归一化会按设计裁剪字段（description 截 500 字等）——若先归一化再比上限，
  //   超大请求会被"裁剪后刚好通过"，等于**静默伪造**一份与用户数据不同的镜像。
  //   宁可拒（客户端如实知道没同步），也不写一份看起来成功、实际不全的快照。
  let rawBytes = 0
  try {
    rawBytes = Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8')
  } catch {
    return { ok: false, message: '请求体无法序列化（含循环引用？），拒绝写入镜像' }
  }
  if (rawBytes > MIRROR_MAX_RECORD_BYTES) {
    return { ok: false, message: `请求体超过单条上限（${rawBytes} > ${MIRROR_MAX_RECORD_BYTES} 字节），拒绝写入镜像（不截断伪造）` }
  }
  const snapshot = normalizeSnapshot(raw)
  if (snapshot === null) return { ok: false, message: '请求体不是对象，拒绝写入镜像' }
  const line = JSON.stringify({ ...snapshot, at: new Date().toISOString() })
  const bytes = Buffer.byteLength(line, 'utf8')
  if (bytes > MIRROR_MAX_RECORD_BYTES) {
    return { ok: false, message: `快照超过单条上限（${bytes} > ${MIRROR_MAX_RECORD_BYTES} 字节），拒绝写入镜像` }
  }
  try {
    await mkdir(dirname(MIRROR_PATH), { recursive: true })
    let compacted = false
    const size = await fileSize(MIRROR_PATH)
    if (size !== null && size > MIRROR_MAX_FILE_BYTES) {
      // 超限：整体重写为仅最后一行（保持"最后一行有效"语义不变）
      await writeFile(MIRROR_PATH, line + '\n', 'utf8')
      compacted = true
    } else {
      await appendFile(MIRROR_PATH, line + '\n', 'utf8')
    }
    cache = null
    return { ok: true, bytes, compacted }
  } catch (e) {
    return { ok: false, message: `镜像写入失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

async function fileSize(path) {
  try {
    const st = await stat(path)
    return st.size
  } catch {
    return null
  }
}

/**
 * 读镜像最后一条有效快照。**绝不抛错**（装配路径调用）。
 * @returns {{snapshot: object, records: number, mtimeMs: number}|null}
 */
export async function readSnapshot() {
  const st = await stat(MIRROR_PATH).catch(() => null)
  if (st === null || !st.isFile()) {
    cache = null
    return null
  }
  if (cache !== null && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.value
  let text
  try {
    text = await readFile(MIRROR_PATH, 'utf8')
  } catch {
    return null
  }
  const lines = text.split('\n')
  let picked = null
  let records = 0
  // 从尾部往前找第一条可解析的行（容忍写到一半的最后一行）
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (line === '') continue
    records += 1
    if (picked !== null) continue
    try {
      const parsed = JSON.parse(line)
      const snapshot = normalizeSnapshot(parsed)
      if (snapshot !== null) picked = snapshot
    } catch {
      // 该行损坏 → 继续往上看（这正是追加式 JSONL 的意义）
    }
  }
  if (picked === null) {
    cache = null
    return null
  }
  const value = { snapshot: picked, records, mtimeMs: st.mtimeMs }
  cache = { mtimeMs: st.mtimeMs, size: st.size, value }
  return value
}

/** 仅供回归套件：清掉读缓存（改盘后强制重读）。 */
export function resetMirrorCache() {
  cache = null
}
