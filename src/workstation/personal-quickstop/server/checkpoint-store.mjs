// dsh-personal-quickstop — 交接（checkpoint）落盘 store（V1.2-I 阶段 I-C/I5）
//
// 为什么必须自建（真机侦查结论，不是我猜的）：
//   `docs/V1_2_I_D_HOST_PROBE.md` §Q6 —— `grep handoff|handover` 在官方全仓 **0 命中**；
//   `checkpoint` 的 5 处命中全是 flush/compaction 语义；`dsh-session-checkpoint-policy` 全文 78 行
//   **自身无状态**。官方只有 durability 屏障 `ctx.sessions.flush(session)`（把已写的刷进盘），
//   它**不**是一个"可写交接槽"。⇒ G5/G6 的「Save → Handoff → 落盘」这一步没有官方后端。
//
// 职责边界（**不**新增第二套真源）：
//   本文件只存"这次 Quick Stop 时我们读回来的那段交接内容"以及它的来源身份；
//   Session / Task / 工作区真源**仍是官方**（本文件不存会话表、不存任务表）。
//   续接（I13）只是**读回**这条记录，不据此重建任何官方状态。
//
// 四条不许漂移的语义：
//   ① **写完必回读**：`ok:true` 只能来自"盘上字节 == 写出的字节"（sha256 相等）+ 索引行回读在册。
//      `writeFile` 没抛异常**不算**写成功 —— 与 I-A 的 `appendInterruptEvent` 同一条纪律。
//   ② **缺字段不伪装**：I6 最小集合缺项时照写（历史要留痕），但
//      `checkpointIncomplete:true` + 逐项 `missingFields`。字段表的**唯一 owner** 是
//      `interrupt-store.mjs` 的 `CHECKPOINT_REQUIRED_FIELDS`（本模块只转发，不另抄一份）。
//   ③ **只增不删**：一次落盘 = 一个新文件 + 索引追加一行；同一源重复停止是**新增**历史，
//      绝不覆盖上一条（否则"上次的续接点"会被悄悄抹掉）。
//   ④ **未知 ≠ 0**：坏索引行 / 坏文件一律如实计数并上报（`corruptLines`），不静默跳过。
//
// 原子性：先写 `<final>.tmp-<rand>` 再 `rename`（同目录内 rename 是原子的）⇒ 读者永远看不到半截文件；
// 失败路径会尽力清掉自己的 tmp 残骸（`.tmp` 残骸存在本身就是"没写干净"的证据，套件会断言它不存在）。

import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { CHECKPOINT_REQUIRED_FIELDS, validateCheckpoint } from './interrupt-store.mjs'

/** 单条 checkpoint 文件的 schema 版本（升版本时旧的必须仍可读）。 */
export const CHECKPOINT_SCHEMA_VERSION = 1

/** 索引文件名（append-only JSONL，一行 = 一次落盘）。 */
export const CHECKPOINT_INDEX_FILENAME = 'index.v1.jsonl'

/** 字段表转发（**不**另抄一份；套件会断言它与 `interrupt-store` 的引用相等）。 */
export { CHECKPOINT_REQUIRED_FIELDS }

/** 默认落盘目录（与 `personal-interrupts.v1.jsonl` 等既有 `~/.dsh/personal-*` 同款约定）。 */
export function defaultCheckpointDir(home = homedir()) {
  return join(home, '.dsh', 'personal-checkpoints')
}

/** 可用环境变量覆盖（真机默认走 `~/.dsh`）。 */
export const CHECKPOINT_DIR = process.env.DSH_PERSONAL_CHECKPOINTS || defaultCheckpointDir()

/**
 * 把任意字符串消毒成**安全的单段文件名**（不含路径分隔符、不以点开头、非空、有长度上限）。
 *
 * 存在的理由不是"好看"，是路径逃逸：`sourceId` 来自宿主数据（会话 / 任务 id），
 * 我们不能假设它一定温顺。`../../x` 这类值一旦拼进路径就会写到目录外。
 * 消毒后**再**由 `assertInside` 兜底断言一次（两道，任一失效都不会越界）。
 */
export function sanitizeId(raw) {
  const text = typeof raw === 'string' ? raw : String(raw ?? '')
  const replaced = text.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_')
  const trimmed = replaced.slice(0, 64)
  return trimmed === '' ? 'unknown' : trimmed
}

/** 最终路径必须仍在 store 目录内（消毒失效时的最后一道闸门）。 */
function assertInside(dir, path) {
  if (!resolve(path).startsWith(resolve(dir) + sep)) {
    throw new Error(`checkpoint path escaped store dir: ${path}`)
  }
  return path
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const describeError = (error) => (error instanceof Error ? error.message : String(error))

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * 归一化源身份。接受三种写法，最终统一成 `{kind, id}`：
 *   · `{kind, id}`            —— 宿主 adapter 的形状
 *   · `{source:{kind,id}}`    —— 编排层透传的形状（`deps.persist({source, checkpoint})`）
 *   · `{source:'session', sourceId:'x'}` —— 事件层（`interrupt-store`）的形状
 * 取不到 kind/id 时返回 `null` ⇒ 调用方**拒绝写**（不落一条认不出归属的记录）。
 */
export function normalizeSource(input = {}) {
  const source = input.source
  let kind = null
  let id = null
  if (isObject(source)) {
    kind = typeof source.kind === 'string' ? source.kind : null
    id = typeof source.id === 'string' ? source.id : null
  } else if (typeof source === 'string' && source !== '') {
    kind = source
    id = typeof input.sourceId === 'string' && input.sourceId !== '' ? input.sourceId
      : (typeof input.id === 'string' && input.id !== '' ? input.id : null)
  }
  if (kind === null || kind === '' || id === null || id === '') return null
  return { kind, id }
}

const normalizeAt = (at) => (typeof at === 'string' && at !== '' ? at : new Date().toISOString())

const fail = (reason, extra = {}) => ({ ok: false, verified: false, indexVerified: false, path: null, reason, ...extra })

/**
 * 落盘一条交接记录。
 *
 * @param {string} dir store 目录（真机 = `~/.dsh/personal-checkpoints`）
 * @param {{source?: object|string, sourceId?: string, at?: string, flowId?: string|null,
 *          forced?: boolean, checkpoint?: object|null}} input
 * @returns {Promise<{ok:boolean, verified:boolean, indexVerified:boolean, path:string|null,
 *   indexPath?:string|null, sha256?:string|null, bytes?:number|null, incomplete?:boolean,
 *   missingFields?:string[], reason:string|null}>}
 */
export async function writeCheckpoint(dir, input = {}) {
  const target = dir ?? CHECKPOINT_DIR
  const source = normalizeSource(input)
  if (source === null) {
    return fail('missing-source', { detail: 'source.kind / source.id（或 source + sourceId）至少缺一个 ⇒ 拒绝落盘' })
  }
  const at = normalizeAt(input.at)
  const checkpoint = isObject(input.checkpoint) ? input.checkpoint : null
  const validation = validateCheckpoint(checkpoint)
  const incomplete = checkpoint === null || validation.ok === false
  const missingFields = validation.missing

  // 文件名 = `<kind>-<id>-<at 消毒>-<rand>.json`。rand 保证同一毫秒的并发写各成一件，互不覆盖。
  const stamp = at.replace(/[^0-9A-Za-z]/g, '').slice(0, 20)
  const rand = Math.random().toString(36).slice(2, 8)
  const filename = `${sanitizeId(source.kind)}-${sanitizeId(source.id)}-${stamp}-${rand}.json`
  const indexPath = join(target, CHECKPOINT_INDEX_FILENAME)
  const payload = {
    v: CHECKPOINT_SCHEMA_VERSION,
    kind: 'checkpoint',
    at,
    source: source.kind,
    sourceId: source.id,
    flowId: input.flowId ?? null,
    forced: input.forced === true,
    checkpointIncomplete: incomplete,
    missingFields,
    checkpoint,
    requiredFields: [...CHECKPOINT_REQUIRED_FIELDS],
  }
  const serialized = JSON.stringify(payload)

  let finalPath = null
  let tmpPath = null
  try {
    await mkdir(target, { recursive: true })
    finalPath = assertInside(target, join(target, filename))
    tmpPath = `${finalPath}.tmp-${rand}`
    await writeFile(tmpPath, serialized, 'utf8')
    await rename(tmpPath, finalPath)
    tmpPath = null

    // ① 回读校验：盘上字节必须与写出的字节**完全相同**。
    const readBack = await readFile(finalPath, 'utf8')
    const verified = readBack === serialized
    const digest = sha256(readBack)
    if (!verified) {
      return fail('readback-mismatch', {
        detail: '盘上字节与写出字节不一致 ⇒ 不算写成功（不返回"看起来成功的空结果"）',
        path: finalPath, sha256: digest, bytes: Buffer.byteLength(readBack), incomplete, missingFields,
      })
    }

    // ② 索引追加 + 回读在册。索引是续接查询的唯一入口 ⇒ 它不成立就不能算落盘成功。
    const indexEntry = {
      v: CHECKPOINT_SCHEMA_VERSION,
      at,
      source: source.kind,
      sourceId: source.id,
      flowId: payload.flowId,
      path: finalPath,
      sha256: digest,
      bytes: Buffer.byteLength(readBack),
      incomplete,
    }
    const indexLine = JSON.stringify(indexEntry)
    await appendFile(indexPath, `${indexLine}\n`, 'utf8')
    const indexText = await readFile(indexPath, 'utf8')
    // 判据是"整文件的**任意一行**等于本次这一行"，不是"最后一行等于它"：
    // 并发写时别人的行会排在我们后面（I-A 已实测过这个假阴性）。
    const indexVerified = indexText.split('\n').includes(indexLine)
    if (!indexVerified) {
      return fail('index-append-unverified', {
        detail: '文件已落但索引行读不回来 ⇒ 续接查询看不到它，故不算成功（文件路径如实给出）',
        path: finalPath, indexPath, sha256: digest, bytes: Buffer.byteLength(readBack), incomplete, missingFields,
      })
    }

    return {
      ok: true, verified: true, indexVerified: true, path: finalPath, indexPath,
      sha256: digest, bytes: Buffer.byteLength(readBack), incomplete, missingFields, reason: null,
    }
  } catch (error) {
    // 失败路径**尽力**清掉自己的 tmp 残骸；清不掉也不掩盖原始错误（原始错误更重要）。
    if (tmpPath !== null) {
      try { await rm(tmpPath, { force: true }) } catch { /* 清不掉就留着，由套件断言暴露 */ }
    }
    return fail(`write-failed:${describeError(error)}`, { target })
  }
}

/**
 * 读回一条交接记录。三种"读不到"必须**分得清**（UI 与续接条要给不同的提示）：
 *   · `not-found` 文件不存在（没落过 / 被删了）
 *   · `corrupt`   文件在但内容不是合法记录
 *   · `read-failed:*` 其它 IO 错误
 */
export async function readCheckpoint(path) {
  const target = path ?? null
  if (typeof target !== 'string' || target === '') return { ok: false, reason: 'not-found', path: null, checkpoint: null }
  let text
  try {
    text = await readFile(target, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, reason: 'not-found', path: target, checkpoint: null }
    return { ok: false, reason: `read-failed:${describeError(error)}`, path: target, checkpoint: null }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'corrupt', path: target, checkpoint: null, bytes: Buffer.byteLength(text) }
  }
  if (!isObject(parsed) || !Object.prototype.hasOwnProperty.call(parsed, 'checkpoint')) {
    return { ok: false, reason: 'corrupt', path: target, checkpoint: null, bytes: Buffer.byteLength(text) }
  }
  const validation = validateCheckpoint(parsed.checkpoint)
  return {
    ok: true,
    path: target,
    schemaVersion: parsed.v ?? null,
    checkpoint: isObject(parsed.checkpoint) ? parsed.checkpoint : null,
    // 读回时的 incomplete **以盘上标记为准**（不重算覆盖）：写时诚实、读时也要诚实。
    incomplete: parsed.checkpointIncomplete === true || validation.ok === false,
    missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : validation.missing,
    meta: {
      source: parsed.source ?? null,
      sourceId: parsed.sourceId ?? null,
      at: parsed.at ?? null,
      flowId: parsed.flowId ?? null,
      forced: parsed.forced === true,
      missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : validation.missing,
    },
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
  }
}

/**
 * 列出索引。**只增不删**：一行 = 一次落盘历史。
 * 坏行计入 `corruptLines`（未知 ≠ 0），好行一条不少地照给。
 */
export async function listCheckpoints(dir) {
  const target = dir ?? CHECKPOINT_DIR
  const indexPath = join(target, CHECKPOINT_INDEX_FILENAME)
  let text = ''
  try {
    text = await readFile(indexPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const entries = []
  const corruptLines = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    if (raw.trim() === '') continue
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      corruptLines.push({ line: i + 1, text: raw.slice(0, 120) })
      continue
    }
    if (!isObject(parsed)) {
      corruptLines.push({ line: i + 1, text: raw.slice(0, 120) })
      continue
    }
    entries.push({
      line: i + 1,
      at: parsed.at ?? null,
      source: parsed.source ?? null,
      sourceId: parsed.sourceId ?? null,
      flowId: parsed.flowId ?? null,
      path: typeof parsed.path === 'string' ? parsed.path : null,
      sha256: parsed.sha256 ?? null,
      bytes: typeof parsed.bytes === 'number' ? parsed.bytes : null,
      incomplete: parsed.incomplete === true,
    })
  }
  return { dir: target, indexPath, exists: text.trim() !== '', entries, corruptLines }
}

/**
 * 取某个源**最新**的一条续接点（I13 续接条的数据面）。
 * 排序键 = `(at, 索引行号)`：行号是**append 顺序**（持久事实），at 是内容里的时间戳。
 * 取不到就如实 `ok:false:none` —— 不退化成"随便给一条"，也不返回空对象冒充读过。
 */
export async function latestCheckpointFor(dir, key = {}) {
  const wanted = normalizeSource(key)
  if (wanted === null) return { ok: false, reason: 'none', path: null, checkpoint: null, phase: null }
  const listed = await listCheckpoints(dir)
  const mine = listed.entries
    .filter((entry) => entry.source === wanted.kind && entry.sourceId === wanted.id && entry.path !== null)
    .sort((a, b) => (String(a.at ?? '') < String(b.at ?? '') ? 1 : String(a.at ?? '') > String(b.at ?? '') ? -1 : b.line - a.line))
  if (mine.length === 0) {
    return { ok: false, reason: 'none', path: null, checkpoint: null, phase: null, corruptLines: listed.corruptLines }
  }
  const read = await readCheckpoint(mine[0].path)
  if (read.ok !== true) {
    // 索引指向的文件读不回来 ⇒ **不**谎称有续接点，把真原因带出去。
    return { ok: false, reason: `unreadable:${read.reason}`, path: mine[0].path, checkpoint: null, phase: null }
  }
  return {
    ok: true,
    reason: null,
    path: mine[0].path,
    at: read.meta.at,
    incomplete: read.incomplete,
    missingFields: read.missingFields,
    phase: read.checkpoint?.currentPhase ?? null,
    checkpoint: read.checkpoint,
  }
}

/**
 * 装配便捷出口（真机与套件用**同一份**实现）。
 * @param {{dir?: string}} [options]
 */
export function createCheckpointStore(options = {}) {
  const dir = options.dir ?? CHECKPOINT_DIR
  return {
    dir,
    write: (input) => writeCheckpoint(dir, input),
    read: (path) => readCheckpoint(path),
    list: () => listCheckpoints(dir),
    latest: (key) => latestCheckpointFor(dir, key),
  }
}

export default { writeCheckpoint, readCheckpoint, listCheckpoints, latestCheckpointFor, createCheckpointStore }
