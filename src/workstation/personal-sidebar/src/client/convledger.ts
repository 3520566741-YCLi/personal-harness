// V1.2-C · 后台执行会话分类的**真源读取器**（只读、无写、失败即「未知」）。
//
// ── 为什么走 HTTP 旁路读，而不是注入第三方服务 ──────────────────────────────
//   任务板能力来自第三方插件 `@linxin666/dsh-client-ui-task-board`（**不是**官方能力）。
//   它暴露同源只读端点 `GET /api/task-board/state`（`{ revision, tasks: [...] }`），
//   本仓库 personal-workspace 早已用同一条链路（`TaskBoardClient`）。
//   在这里我们**只读 state**，绝不碰它的 action（不建、不改、不跑、不删任务）。
//
// ── 为什么不用 session event 承载分类 ────────────────────────────────────────
//   PRE-FLIGHT 实证：`append()` 无法设置 `ignorable:true`，**未知事件类型会让整份日志在下次加载时被拒**
//   ⇒ 业务数据绝不可挂在 session event 上（冻结设计硬约束 #6）。故本模块只在内存里按需重算。
//
// ── 纪律 ────────────────────────────────────────────────────────────────────
//   · 只读：不写任务板、不写官方引擎、不落盘、不建第二份真源
//   · 未知 ≠ 空集：服务缺失 / 超时 / 非 2xx / 形状不认识 ⇒ `UNKNOWN_BACKGROUND`（什么都不隐藏）
//   · 不做启发式：绝不按标题 / 时间 / origin / agentPreset 猜"这像不像后台会话"

import { backgroundTruthOf, UNKNOWN_BACKGROUND, type BackgroundTruth } from './convbackground'

/** 与 personal-workspace 的 `TaskBoardClient` 同前缀（第三方任务板插件的同源只读端点）。 */
export const TASK_BOARD_STATE_URL = '/api/task-board/state'

/** 单次读取超时（与 personal-workspace 的 `REQUEST_TIMEOUT_MS` 同口径）。 */
export const LEDGER_TIMEOUT_MS = 15_000

/** 轮询间隔：与任务板调度器 tick 同量级即可（分类不需要秒级新鲜度）。 */
export const LEDGER_POLL_MS = 30_000

/**
 * 未知态重试。为什么需要：第三方任务板插件可能**晚于**侧栏注册（它也是客户端插件），
 * 首读失败若等到下一轮 30s 轮询才补，用户会先看到一段"没过滤"的乱列表。
 * 故未知态用**有界**快重试（与 `PersonalBrowser` 的 `PENDING_ATTACH_TRIES` 同思路：
 * 探测的是"服务/数据是否已就绪"，不是高频轮询数据）。
 */
export const LEDGER_RETRY_MS = 2_000
export const LEDGER_RETRY_TRIES = 5

/**
 * 测试/诊断用覆盖（真机不设置 ⇒ 走默认值）。
 * 只影响轮询/重试**节奏**，不影响分类口径；**不是**产品开关。
 *
 * 读 `globalThis.window` 优先：产物跑在 `window.__ModuleLoader__` 沙箱里，
 * `globalThis` 与宿主给它的那个对象**不是同一层**（实测：宿主设的键在 `globalThis[key]` 上读不到，
 * 但 `globalThis.window[key]` 读得到）——所以覆盖键要挂在 `window` 上。无 window 环境退回 `globalThis`。
 */
function overrideNum(key: string, fallback: number): number {
  const g = globalThis as Record<string, unknown> & { window?: Record<string, unknown> }
  const w = g.window
  const fromWindow = w !== undefined && w !== null ? w[key] : undefined
  const v = typeof fromWindow === 'number' ? fromWindow : g[key]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
}
export function ledgerPollMs(): number {
  return overrideNum('__DPS_LEDGER_POLL_MS', LEDGER_POLL_MS)
}
export function ledgerRetryDelayMs(): number {
  return overrideNum('__DPS_LEDGER_RETRY_MS', LEDGER_RETRY_MS)
}

export interface LedgerReader {
  /** 立即读一次并返回分类（任何异常都收敛为 UNKNOWN，绝不抛给 UI）。 */
  read: () => Promise<BackgroundTruth>
  /** 起轮询（幂等）；返回停止函数。 */
  start: (onChange: (truth: BackgroundTruth) => void) => () => void
}

/** 取 `fetch`（缺 fetch 运行环境 → undefined ⇒ 判未知，而不是崩）。 */
function getFetch(): typeof fetch | undefined {
  const f = (globalThis as { fetch?: typeof fetch }).fetch
  return typeof f === 'function' ? f : undefined
}

/**
 * 读一次任务板账本 → 分类。
 * 返回**永远是** `BackgroundTruth`（失败 → `UNKNOWN_BACKGROUND`）：
 * 调用方无需 try/catch，也不会因一次网络抖动而误判成"没有后台会话"。
 */
export async function readBackgroundTruth(): Promise<BackgroundTruth> {
  const f = getFetch()
  if (f === undefined) return UNKNOWN_BACKGROUND
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  if (controller !== undefined) {
    timer = setTimeout(() => {
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }, LEDGER_TIMEOUT_MS)
  }
  try {
    const res = await f(TASK_BOARD_STATE_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller?.signal,
    })
    if (!res.ok) return UNKNOWN_BACKGROUND
    const body: unknown = await res.json()
    return backgroundTruthOf(body)
  } catch {
    // 网络失败 / 超时 / JSON 坏 ⇒ 未知。**不**回落成空集（那会谎称"已过滤且无后台会话"）。
    return UNKNOWN_BACKGROUND
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** 两次分类是否等价（`bySession` 内容级比较）→ 订阅方可用于跳过无谓重渲染。 */
export function sameBackgroundTruth(a: BackgroundTruth, b: BackgroundTruth): boolean {
  if (a === b) return true
  if (a.known !== b.known) return false
  if (a.bySession.size !== b.bySession.size) return false
  for (const [sid, ref] of a.bySession) {
    const other = b.bySession.get(sid)
    if (other === undefined) return false
    if (other.taskId !== ref.taskId || other.executionId !== ref.executionId || other.taskTitle !== ref.taskTitle) {
      return false
    }
  }
  return true
}

/**
 * 起一个账本读取器：立即读一次 + 定时轮询；状态**只在变化时**回调。
 * 停止函数幂等；停止后不再有回调、不再发请求。
 */
export function createLedgerReader(): LedgerReader {
  let stopped = false
  let interval: ReturnType<typeof setInterval> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let last: BackgroundTruth | undefined
  let retries = 0

  const emit = (next: BackgroundTruth, onChange: (t: BackgroundTruth) => void): void => {
    if (stopped) return
    if (last !== undefined && sameBackgroundTruth(last, next)) return
    last = next
    onChange(next)
  }

  /** 未知态 → 派一个有界快重试；已知态 → 不计（数据已可信，慢轮询足够）。 */
  const scheduleRetry = (onChange: (t: BackgroundTruth) => void): void => {
    if (stopped || retries >= LEDGER_RETRY_TRIES) return
    retries += 1
    retryTimer = setTimeout(() => {
      if (stopped) return
      void tick(onChange)
    }, ledgerRetryDelayMs())
  }

  const tick = async (onChange: (t: BackgroundTruth) => void): Promise<void> => {
    const next = await readBackgroundTruth()
    if (stopped) return
    emit(next, onChange)
    if (!next.known) scheduleRetry(onChange)
    else retries = LEDGER_RETRY_TRIES // 已读到真源 → 停止快重试，交给慢轮询
  }

  return {
    async read(): Promise<BackgroundTruth> {
      return await readBackgroundTruth()
    },
    start(onChange: (truth: BackgroundTruth) => void): () => void {
      void tick(onChange)
      // 间隔每轮重算（`ledgerPollMs()` 每次读）→ 测试可在运行中调快节奏，真机恒为默认值。
      const loop = (): void => {
        if (stopped) return
        interval = setTimeout(() => {
          void (async () => {
            await tick(onChange)
            loop()
          })()
        }, ledgerPollMs())
      }
      loop()
      return () => {
        stopped = true
        if (interval !== undefined) clearTimeout(interval)
        if (retryTimer !== undefined) clearTimeout(retryTimer)
      }
    },
  }
}
