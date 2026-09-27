// V1.2-I · 中断投影的**只读客户端读取器**（I10 紫点 / I11 徽章计数 / I12 已读 / I13 续接数据面）
//
// ── 真源与角色 ───────────────────────────────────────────────────────────────
//   真源 = 宿主半 `dsh-personal-quickstop` 的中断投影（`~/.dsh/personal-interrupts.v1.jsonl`
//   经 `readInterruptState()` 投影后的 HTTP 只读面 `GET /api/personal/quickstop/state`）。
//   本模块**只读**：不写官方引擎、不写官方会话、不自建第二份真源。
//   唯一的写动作是 I12 的 read-to-clear（`POST /read`，宿主语义 = **追加**一条 read 事件，
//   **绝不删除中断历史**）。
//
// ── 为什么不能照抄绿点机制（`trackUnseenCompletions`）────────────────────────
//   绿点是**纯内存**观察器（`PersonalBrowser.tsx` 注释原文「纯内存、不落盘」），
//   而 G10 要求紫色点**跨重启仍在** ⇒ 必须走「宿主文件 + 一次 HTTP 读」。
//
// ── 未知 ≠ 0（本仓硬纪律，G9 的诚实前提）─────────────────────────────────────
//   读不到 / 超时 / 非 2xx / 坏 JSON / 形状不认识 ⇒ `known:false`。
//   **绝不**回落成"没有中断"——那会让紫点消失、让徽章变成 0，等于谎报。
//   「文件不存在 / 零记录」是**合法空**（known:true 且集合为空），与"读不到"是两件事。
//
// ── 路径常量单一 owner ──────────────────────────────────────────────────────
//   直接 import 宿主半的 `server/routes.mjs`（该文件**零依赖**，专为进浏览器产物而存在；
//   其文件头逐字记录了"import 宿主入口会让浏览器产物带上 node:fs 并立刻崩"的实测）。
//   两边各写一份字符串 = 两个真源，故不采用。

import { QUICKSTOP_READ_PATH, QUICKSTOP_STATE_PATH } from '../../../personal-quickstop/server/routes.mjs'

export const INTERRUPT_STATE_URL = QUICKSTOP_STATE_PATH
export const INTERRUPT_READ_URL = QUICKSTOP_READ_PATH

/** 单次读取超时（与 `convledger.ts` 的 `LEDGER_TIMEOUT_MS` 同口径）。 */
export const INTERRUPT_TIMEOUT_MS = 15_000
/** 已知态轮询间隔（与任务板账本同量级；紫点不需要秒级新鲜度）。 */
export const INTERRUPT_POLL_MS = 30_000
/** 未知态快重试（宿主半可能晚于侧栏注册 ⇒ 未知态先用有界快重试探一下）。 */
export const INTERRUPT_RETRY_MS = 2_000
export const INTERRUPT_RETRY_TRIES = 5

/**
 * 源词表（与宿主半 `interrupt-store.mjs` 的 `INTERRUPT_SOURCES` **逐字对齐**）。
 *
 * `subagent` 不能漏：`orchestrator.mjs` 记中断时写的是 `source: source.kind`，而
 * `STOPPABLE_KINDS` 含 `subagent` ⇒ 真源里会出现这个值。漏了它的后果是**最坏的那种**：
 * `recordOf()` 判形状不认识 → 整份投影退化成 `UNKNOWN_INTERRUPTS` ⇒ 一条子代理记录
 * 就能让**所有**紫点消失、徽章变未知（真数据在，却被判成"不知道"）。
 */
export type InterruptSource = 'session' | 'task' | 'subagent' | 'background'

/** 宿主投影里的一条中断记录（字段集对应 `interrupt-store.mjs` 的 `projectInterrupts`）。 */
export interface InterruptRecord {
  source: InterruptSource
  sourceId: string
  stoppedAt: string | null
  /** 用户还没重新查看（I10 紫点 / I11 徽章都看这个位）。 */
  unread: boolean
  interrupted: boolean
  checkpointIncomplete: boolean
  checkpoint: Record<string, unknown> | null
}

/**
 * 中断投影的客户端形态。
 * `known:false` 表示**本次没读到真源**（≠ 没有中断）；消费方必须能区分这两件事。
 */
export interface InterruptTruth {
  known: boolean
  unreadSessions: ReadonlySet<string>
  unreadTasks: number
  records: readonly InterruptRecord[]
}

/** 未知态：不是空集 —— 语义是"我不知道"，消费方不许据此隐藏任何东西。 */
export const UNKNOWN_INTERRUPTS: InterruptTruth = Object.freeze({
  known: false,
  unreadSessions: new Set<string>(),
  unreadTasks: 0,
  records: [] as readonly InterruptRecord[],
})

/**
 * 测试/诊断用节奏覆盖（真机不设置 ⇒ 走默认值）。
 * 只影响**节奏**，不影响口径；**不是**产品开关。
 * 读 `window` 优先（产物跑在宿主沙箱里，实测宿主设的键只在 `window` 上读得到）。
 */
function overrideNum(key: string, fallback: number): number {
  const g = globalThis as Record<string, unknown> & { window?: Record<string, unknown> }
  const w = g.window
  const fromWindow = w !== undefined && w !== null ? w[key] : undefined
  const v = typeof fromWindow === 'number' ? fromWindow : g[key]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
}
export function interruptTimeoutMs(): number {
  return overrideNum('__DPS_INTERRUPT_TIMEOUT_MS', INTERRUPT_TIMEOUT_MS)
}
export function interruptPollMs(): number {
  return overrideNum('__DPS_INTERRUPT_POLL_MS', INTERRUPT_POLL_MS)
}
export function interruptRetryDelayMs(): number {
  return overrideNum('__DPS_INTERRUPT_RETRY_MS', INTERRUPT_RETRY_MS)
}

/** 取 `fetch`（缺 fetch 的运行环境 → undefined ⇒ 判未知，而不是崩）。 */
function getFetch(): typeof fetch | undefined {
  const f = (globalThis as { fetch?: typeof fetch }).fetch
  return typeof f === 'function' ? f : undefined
}

/**
 * 同源 URL 解析。浏览器里 `'/api/...'` 本身就够；此处的 base 覆盖**只为测试/诊断**
 * 能把相对路径接到真监听端口上（请求仍走真 socket，不是假 fetch）。真机不设置 ⇒ 原样相对路径。
 */
function resolveUrl(path: string): string {
  const g = globalThis as Record<string, unknown> & { window?: Record<string, unknown> }
  const raw = (g.window?.['__DPS_INTERRUPT_BASE_URL'] ?? g['__DPS_INTERRUPT_BASE_URL']) as unknown
  const base = typeof raw === 'string' ? raw : ''
  return base === '' ? path : `${base.replace(/\/+$/, '')}${path}`
}

function isSource(value: unknown): value is InterruptSource {
  return value === 'session' || value === 'task' || value === 'subagent' || value === 'background'
}

/** 单条记录的归一化；形状不认识 ⇒ null（调用方据此整份判未知，而不是丢掉那一条）。 */
function recordOf(raw: unknown): InterruptRecord | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isSource(r.source) || typeof r.sourceId !== 'string' || r.sourceId === '') return null
  const checkpoint = r.checkpoint
  return {
    source: r.source,
    sourceId: r.sourceId,
    stoppedAt: typeof r.stoppedAt === 'string' && r.stoppedAt !== '' ? r.stoppedAt : null,
    unread: r.unread !== false,
    interrupted: r.interrupted !== false,
    checkpointIncomplete: r.checkpointIncomplete === true,
    checkpoint: checkpoint !== null && typeof checkpoint === 'object' ? (checkpoint as Record<string, unknown>) : null,
  }
}

/**
 * 宿主响应 → 客户端形态。**任何**不认识的形状都收敛成 `UNKNOWN_INTERRUPTS`：
 * 宁可说"不知道"，也不许说"没有中断"。
 */
export function interruptTruthOf(body: unknown): InterruptTruth {
  if (body === null || typeof body !== 'object') return UNKNOWN_INTERRUPTS
  const b = body as Record<string, unknown>
  if (b.ok !== true) return UNKNOWN_INTERRUPTS
  if (!Array.isArray(b.records)) return UNKNOWN_INTERRUPTS
  const counts = b.counts as Record<string, unknown> | undefined
  const unread = counts?.unread as Record<string, unknown> | undefined
  const unreadTasks = unread?.tasks
  if (typeof unreadTasks !== 'number' || !Number.isFinite(unreadTasks)) return UNKNOWN_INTERRUPTS

  const records: InterruptRecord[] = []
  const unreadSessions = new Set<string>()
  for (const raw of b.records) {
    const record = recordOf(raw)
    if (record === null) return UNKNOWN_INTERRUPTS // 单条不认识 ⇒ 整份不可信（不部分采信）
    records.push(record)
    // `unreadSessions` 的语义是"**可按键行的会话 id 集**"（消费方只做 `set.has(row.id)`）：
    // 子代理本身也是会话（宿主侧 `subagent` 的 id 就是 session id），有对应行就自然点亮，
    // 没有对应行就是一次无害的未命中。**不**把子代理中断另算一套计数 —— 计数归宿主
    // （`counts.unread.subagents`），客户端不自己数，避免第二套口径。
    if ((record.source === 'session' || record.source === 'subagent') && record.unread) {
      unreadSessions.add(record.sourceId)
    }
  }
  return { known: true, unreadSessions, unreadTasks, records }
}

/** I10 的输入口：未读的会话中断 id 集。 */
export function unreadSessionsOf(truth: InterruptTruth): ReadonlySet<string> {
  return truth.unreadSessions
}

/** 两次投影是否等价（known / 未读集 / 任务未读数 / 记录逐条）→ 订阅方可跳过无谓重渲染。 */
export function sameInterruptTruth(a: InterruptTruth, b: InterruptTruth): boolean {
  if (a === b) return true
  if (a.known !== b.known) return false
  if (a.unreadTasks !== b.unreadTasks) return false
  if (a.unreadSessions.size !== b.unreadSessions.size) return false
  for (const id of a.unreadSessions) if (!b.unreadSessions.has(id)) return false
  if (a.records.length !== b.records.length) return false
  for (let i = 0; i < a.records.length; i += 1) {
    const x = a.records[i]
    const y = b.records[i]
    if (
      x.source !== y.source ||
      x.sourceId !== y.sourceId ||
      x.stoppedAt !== y.stoppedAt ||
      x.unread !== y.unread ||
      x.interrupted !== y.interrupted ||
      x.checkpointIncomplete !== y.checkpointIncomplete ||
      JSON.stringify(x.checkpoint) !== JSON.stringify(y.checkpoint)
    ) {
      return false
    }
  }
  return true
}

/**
 * 读一次中断投影。返回**永远是** `InterruptTruth`（失败 ⇒ `UNKNOWN_INTERRUPTS`）：
 * 调用方无需 try/catch，也不会因一次网络抖动误判成"没有中断"。
 */
export async function readInterruptTruth(): Promise<InterruptTruth> {
  const f = getFetch()
  if (f === undefined) return UNKNOWN_INTERRUPTS
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  if (controller !== undefined) {
    timer = setTimeout(() => {
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }, interruptTimeoutMs())
  }
  try {
    const res = await f(resolveUrl(INTERRUPT_STATE_URL), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller?.signal,
    })
    if (!res.ok) return UNKNOWN_INTERRUPTS
    const body: unknown = await res.json()
    return interruptTruthOf(body)
  } catch {
    return UNKNOWN_INTERRUPTS
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * I12 read-to-clear：只清**未读位**（宿主侧追加 read 事件，历史一条不删）。
 * **绝不抛**给 UI：任何失败都收敛成 `{ok:false}`（调用方只提示，不阻断点击）。
 */
export async function markInterruptRead(
  source: InterruptSource,
  sourceId: string,
): Promise<{ ok: boolean; status: number | null }> {
  const f = getFetch()
  if (f === undefined) return { ok: false, status: null }
  try {
    const res = await f(resolveUrl(INTERRUPT_READ_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, sourceId }),
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: null }
  }
}

/**
 * 乐观清点：把某条中断的未读位翻掉（**只翻位，不删记录**；真源仍是宿主文件）。
 * 未知态一律恒等返回（不在未知上编造"已读"）。
 */
export function clearUnread(truth: InterruptTruth, source: InterruptSource, sourceId: string): InterruptTruth {
  if (!truth.known) return truth
  const target = truth.records.find((r) => r.source === source && r.sourceId === sourceId)
  if (target === undefined || !target.unread) return truth
  const records = truth.records.map((r) => (r === target ? { ...r, unread: false } : r))
  const unreadSessions = new Set(truth.unreadSessions)
  if (source === 'session') unreadSessions.delete(sourceId)
  return {
    known: true,
    unreadSessions,
    unreadTasks: source === 'task' ? Math.max(0, truth.unreadTasks - 1) : truth.unreadTasks,
    records,
  }
}

export interface InterruptReader {
  /** 立即读一次（任何异常都收敛为 UNKNOWN，绝不抛给 UI）。 */
  read: () => Promise<InterruptTruth>
  /** 起读取（幂等）；返回停止函数（幂等；停止后不再请求、不再回调）。 */
  start: (onChange: (truth: InterruptTruth) => void) => () => void
}

/**
 * 起一个中断投影读取器：立即读一次 + 未知态有界快重试 + 已知态慢轮询；
 * 状态**只在变化时**回调（`sameInterruptTruth`）。
 */
export function createInterruptReader(): InterruptReader {
  let stopped = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let last: InterruptTruth | undefined
  let retries = 0

  const emit = (next: InterruptTruth, onChange: (t: InterruptTruth) => void): void => {
    if (stopped) return
    if (last !== undefined && sameInterruptTruth(last, next)) return
    last = next
    onChange(next)
  }

  const scheduleRetry = (onChange: (t: InterruptTruth) => void): void => {
    if (stopped || retries >= INTERRUPT_RETRY_TRIES) return
    retries += 1
    retryTimer = setTimeout(() => {
      if (stopped) return
      void tick(onChange)
    }, interruptRetryDelayMs())
  }

  const tick = async (onChange: (t: InterruptTruth) => void): Promise<void> => {
    const next = await readInterruptTruth()
    if (stopped) return
    emit(next, onChange)
    if (!next.known) scheduleRetry(onChange)
    else retries = INTERRUPT_RETRY_TRIES // 读到真源 ⇒ 交接给慢轮询，不再快重试
  }

  const loop = (onChange: (t: InterruptTruth) => void): void => {
    if (stopped) return
    pollTimer = setTimeout(() => {
      void (async () => {
        await tick(onChange)
        loop(onChange)
      })()
    }, interruptPollMs())
  }

  return {
    async read(): Promise<InterruptTruth> {
      return await readInterruptTruth()
    },
    start(onChange: (truth: InterruptTruth) => void): () => void {
      void tick(onChange)
      loop(onChange)
      return () => {
        stopped = true
        if (pollTimer !== undefined) clearTimeout(pollTimer)
        if (retryTimer !== undefined) clearTimeout(retryTimer)
      }
    },
  }
}
