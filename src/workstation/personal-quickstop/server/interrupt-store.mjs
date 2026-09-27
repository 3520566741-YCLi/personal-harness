// dsh-personal-quickstop — 中断投影存储（V1.2-I 阶段 I-A）
//
// 职责边界（照需求原文 SOURCE OF TRUTH，不新造真源）：
//   Session truth  → 官方 Harness Session（本文件**不**存会话表）
//   Task truth     → 既有 Task Board 账本（本文件只记「哪个被快速停止」的投影）
//   Interrupt / unread / UI state → **我们的投影元数据**（需求原文允许），落在本文件
//
// 两条不许漂移的语义：
//   ① **只增不删**：append-only JSONL，每行一个事件。read-to-clear 只是**再追加一条 read 事件**，
//      绝不重写文件、绝不删除中断历史（I12 原文：「清除紫色提示 ≠ 删除 interrupt history」）。
//   ② **interrupted 是停止原因的投影，不是 wire 状态**：官方 `JobStatus` 只有
//      running|stopping|completed|killed|failed（`dsh-tool-cordis/lib/index.js:6225`），
//      所以 `user_quick_stop` 只活在这里；真失败（`failed`）**永不被洗白**成 interrupted（I9 + H5）。
//   ③ 坏行 / 未知 kind / 孤儿 read 一律**如实计数**并上报，不静默吞掉（未知 ≠ 0）。

import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 事件 schema 版本（升版本时旧日志必须仍可解析）。 */
export const INTERRUPT_SCHEMA_VERSION = 1

/** 唯一认可的停止原因：用户主动快速停止（I9：不是 error / failed / cancelled / completed）。 */
export const STOP_REASON_QUICK_STOP = 'user_quick_stop'

/** 合法事件种类。 */
export const INTERRUPT_KINDS = Object.freeze(['interrupt', 'read'])

/**
 * 合法源词表（**唯一 owner**：`/read` 的校验、客户端的形状判定、`summarizeInterrupts` 的分桶都由它推导）。
 *
 * 四类：
 *  - `session`    — 需求 I6「source Session」
 *  - `task`       — 需求 I6「source Task」（任务看板）
 *  - `subagent`   — 需求 I2 的停止对象之一：`orchestrator.mjs` 的 `STOPPABLE_KINDS` 含 `subagent`，
 *                   且它记录中断时写的是 `source: source.kind` ⇒ **真源里本来就会出现这个值**。
 *                   漏登记它有两个已实测的后果：① `/read` 拒收 ⇒ 子代理的中断**永远清不掉未读**；
 *                   ② 客户端 `isSource()` 不认 ⇒ **单条**子代理记录就让整份投影退化成 `unknown`
 *                   （紫点全灭、徽章变未知）——即"数据在，却被判成不知道"。
 *  - `background` — H5「background execution」
 *
 * 与 `stop-plan.mjs:45 DISCOVERY_SOURCES`（sessions/subagents/tasks/jobs）**不是**同一张表的两个副本：
 * 那张表描述**发现面**的四个来源，本表描述**已落盘记录**的源。子代理在两张表里都在，故意如此。
 */
export const INTERRUPT_SOURCES = Object.freeze(['session', 'task', 'subagent', 'background'])

/** 源 → 计数桶。桶名与 `stop-plan.mjs` 的 active 分类同词（sessions/subagents/tasks/backgrounds）。 */
const BUCKET_OF_SOURCE = Object.freeze({
  session: 'sessions',
  subagent: 'subagents',
  task: 'tasks',
  background: 'backgrounds',
})

/**
 * I6 要求的最小 checkpoint 字段（缺一即 `checkpointIncomplete=true`，不伪装齐全）。
 * `stoppedAt` / `stopReason` / `source*` 在事件顶层，不重复要求。
 */
export const CHECKPOINT_REQUIRED_FIELDS = Object.freeze([
  'originalGoal',
  'currentPhase',
  'completedWork',
  'currentWork',
  'nextAction',
  'relevantFiles',
  'gitState',
  'testsStatus',
  'unresolvedIssues',
])

/** 默认落盘位置（与 `personal-project-mirror.v1.jsonl` / `personal-memory-curator.v1.jsonl` 同款约定）。 */
export function defaultInterruptPath(home = homedir()) {
  return join(home, '.dsh', 'personal-interrupts.v1.jsonl')
}

/** 可用环境变量覆盖（套件用；真机默认走 `~/.dsh`）。 */
export const INTERRUPT_PATH = process.env.DSH_PERSONAL_INTERRUPTS || defaultInterruptPath()

/**
 * 解析 JSONL 日志。**不**丢弃任何异常信息：截断/非对象行计入 `corruptLines`，
 * 未知 kind 计入 `unknownKinds`（未知 ≠ 0，也不冒充合法事件）。
 * @param {string} text
 */
export function parseInterruptLog(text) {
  const events = []
  const corruptLines = []
  const unknownKinds = []
  const lines = String(text ?? '').split('\n')
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
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      corruptLines.push({ line: i + 1, text: raw.slice(0, 120) })
      continue
    }
    if (!INTERRUPT_KINDS.includes(parsed.kind)) {
      unknownKinds.push({ line: i + 1, kind: String(parsed.kind) })
      continue
    }
    events.push(parsed)
  }
  return { events, corruptLines, unknownKinds }
}

/**
 * 事件 → 当前记录（每个 `source:sourceId` **最新一条生效**）。
 * read 事件只翻 `unread`，保留 `interrupted` 与 checkpoint；没有对应中断的 read 计入 `orphanReads`。
 * @param {Array<object>} events
 */
export function projectInterrupts(events) {
  const byKey = new Map()
  const orphanReads = []
  for (const event of events ?? []) {
    if (event === null || typeof event !== 'object') continue
    const key = `${event.source}:${event.sourceId}`
    if (event.kind === 'read') {
      const current = byKey.get(key)
      if (current === undefined) {
        orphanReads.push({ source: event.source, sourceId: event.sourceId, at: event.at ?? null })
        continue
      }
      byKey.set(key, { ...current, unread: false, readAt: event.at ?? null })
      continue
    }
    byKey.set(key, {
      source: event.source,
      sourceId: event.sourceId,
      sourceSessionId: event.sourceSessionId ?? (event.source === 'session' ? event.sourceId : null),
      sourceTaskId: event.sourceTaskId ?? (event.source === 'task' ? event.sourceId : null),
      parentSessionId: event.parentSessionId ?? null,
      stopReason: event.stopReason ?? STOP_REASON_QUICK_STOP,
      stoppedAt: event.at ?? null,
      forced: event.forced === true,
      flowId: event.flowId ?? null,
      checkpointIncomplete: event.checkpointIncomplete === true,
      checkpoint: event.checkpoint ?? null,
      interrupted: true,
      unread: true,
      readAt: null,
    })
  }
  return { records: [...byKey.values()], orphanReads }
}

/**
 * 两组计数：`interrupted`（历史，含已读）与 `unread`（I10 紫点 / I11 徽章用）。
 *
 * ── 为什么有 `subagents` 与 `other` 两个桶 ────────────────────────────────────
 * 旧实现把"既不是 task 也不是 background"的一律并进 `sessions`。子代理的中断因此在
 * `/state` 里被报成"2 个会话"（实测：1 会话 + 1 子代理 + 1 后台 ⇒ `sessions:2`）——
 * 消费者拿这个数去说"你有 2 个会话被中断"，是**假话**。
 * `other` 同理：将来冒出一个本层不认识的源时，它既不能算进任何已知桶，也**不能**被
 * 悄悄记成会话；`total` 恒等于各桶之和，未知源只影响"归到哪一桶"，不影响总数。
 */
export function summarizeInterrupts(records) {
  const make = () => ({ total: 0, sessions: 0, subagents: 0, tasks: 0, backgrounds: 0, other: 0 })
  const interrupted = make()
  const unread = make()
  for (const record of records ?? []) {
    const bucket = BUCKET_OF_SOURCE[record.source] ?? 'other'
    interrupted.total += 1
    interrupted[bucket] += 1
    if (record.unread !== false) {
      unread.total += 1
      unread[bucket] += 1
    }
  }
  return { interrupted, unread }
}

/**
 * 执行态判定（I9 / H5：Interrupted ≠ Failed）。
 * 判据优先级刻意写成"真失败与既有终态优先"，这样 Quick Stop **不可能**把失败洗成"暂停"。
 * @param {{wireStatus?: string, stopReason?: string}} input
 * @returns {'running'|'stopping'|'failed'|'completed'|'interrupted'|'stopped'|'unknown'}
 */
export function classifyExecution(input = {}) {
  const status = typeof input.wireStatus === 'string' ? input.wireStatus : 'unknown'
  if (status === 'running') return 'running'
  if (status === 'stopping') return 'stopping'
  if (status === 'failed') return 'failed'
  if (status === 'completed') return 'completed'
  if (input.stopReason === STOP_REASON_QUICK_STOP) return 'interrupted'
  if (status === 'killed') return 'stopped'
  return 'unknown'
}

/** 校验 checkpoint 是否满足 I6 最小集合。 */
export function validateCheckpoint(checkpoint) {
  if (checkpoint === null || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    return { ok: false, missing: [...CHECKPOINT_REQUIRED_FIELDS] }
  }
  const missing = CHECKPOINT_REQUIRED_FIELDS.filter(
    (field) => checkpoint[field] === undefined || checkpoint[field] === null,
  )
  return { ok: missing.length === 0, missing }
}

/**
 * 构造中断事件。**拿不到交接就如实标 `checkpointIncomplete=true`**（I5/I8：不伪装全部正常）。
 * @param {object} input
 */
export function createInterruptEvent(input = {}) {
  const { source, sourceId, at, checkpoint = null, parentSessionId = null, flowId = null } = input
  if (typeof source !== 'string' || source === '') throw new TypeError('createInterruptEvent: source 必填')
  if (typeof sourceId !== 'string' || sourceId === '') throw new TypeError('createInterruptEvent: sourceId 必填')
  const validation = validateCheckpoint(checkpoint)
  return {
    v: INTERRUPT_SCHEMA_VERSION,
    kind: 'interrupt',
    at: typeof at === 'string' && at !== '' ? at : new Date().toISOString(),
    source,
    sourceId,
    sourceSessionId: input.sourceSessionId ?? (source === 'session' ? sourceId : null),
    sourceTaskId: input.sourceTaskId ?? (source === 'task' ? sourceId : null),
    parentSessionId,
    stopReason: typeof input.stopReason === 'string' && input.stopReason !== '' ? input.stopReason : STOP_REASON_QUICK_STOP,
    forced: input.forced === true,
    flowId,
    checkpointIncomplete: checkpoint === null || validation.ok === false,
    checkpoint: checkpoint ?? null,
  }
}

/**
 * 追加一条事件并**回读校验**（写完读不回来 ⇒ `ok:false`，不假装成功）。
 * 用 `appendFile` 而不是「读全文再重写」：既保证只增不删，也不会因为并发写丢行。
 *
 * 回读校验必须**并发安全**（2026-09-18 由套件 ⑫ 抓出的真缺陷）：
 * 原先只比对"文件的最后一行"——并发写入时别人的行会排在后面 ⇒ 自己明明写成功了却被报成失败，
 * 而 `markInterruptRead` 会把这个假阴性当成 `append-failed` 抛给 UI。
 * 现在改为：整文件按行查找**本条事件的精确字节**是否在册（append-only ⇒ 写成功就一定还在）。
 */
export async function appendInterruptEvent(path, event) {
  const target = path ?? INTERRUPT_PATH
  await mkdir(dirname(target), { recursive: true })
  const serialized = JSON.stringify(event)
  await appendFile(target, `${serialized}\n`, 'utf8')

  const text = await readFile(target, 'utf8')
  const lines = text.split('\n')
  const verified = lines.includes(serialized)
  return { ok: verified, verified, bytes: Buffer.byteLength(text), path: target }
}

/**
 * I12 read-to-clear：**追加**一条 read 事件。没有对应中断时拒绝（孤儿 read 无意义，且会污染投影）。
 */
export async function markInterruptRead(path, input = {}) {
  const target = path ?? INTERRUPT_PATH
  const state = await readInterruptState(target)
  const exists = state.records.some((r) => r.source === input.source && r.sourceId === input.sourceId)
  if (!exists) return { ok: false, reason: 'no-interrupt', event: null }
  const event = {
    v: INTERRUPT_SCHEMA_VERSION,
    kind: 'read',
    at: typeof input.at === 'string' && input.at !== '' ? input.at : new Date().toISOString(),
    source: input.source,
    sourceId: input.sourceId,
  }
  const written = await appendInterruptEvent(target, event)
  return { ok: written.ok === true, reason: written.ok === true ? null : 'append-failed', event, bytes: written.bytes }
}

/** 读取当前状态（文件不存在 = 空状态，不是错误；但 `exists:false` 必须如实告诉调用方）。 */
export async function readInterruptState(path) {
  const target = path ?? INTERRUPT_PATH
  let text = ''
  try {
    text = await readFile(target, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const parsed = parseInterruptLog(text)
  const projected = projectInterrupts(parsed.events)
  return {
    schemaVersion: INTERRUPT_SCHEMA_VERSION,
    path: target,
    exists: text.trim() !== '',
    records: projected.records,
    counts: summarizeInterrupts(projected.records),
    problems: {
      corruptLines: parsed.corruptLines,
      unknownKinds: parsed.unknownKinds,
      orphanReads: projected.orphanReads,
    },
  }
}
