// dsh-personal-workspace — E4 ＋新任务 / E4-FIX · task-board Host 客户端（同源 HTTP）。
//
// 数据面镜像 @linxin666/dsh-client-ui-task-board（安装运行时 0.3.16）client/host-api.ts +
// protocol.ts 的传输契约（v0.3.16 src 源码级实证，见 docs/E4_IMPLEMENTATION_PLAN.md §2 与
// docs/E4_INVESTIGATION_REPORT.md §2）：
//   GET  /api/task-board/state     → TaskBoardSnapshot（含完整 TaskRecord）
//   POST /api/task-board/action    → 信封 { requestId, action, initiator? } → TaskBoardSnapshot
//   SSE  /api/task-board/events    → TaskBoardEventPayload { revision, scheduler, power }
// action 面（E4-FIX 全量）：create / run / rerun / update / move / archive / restore /
//   delete / set-schedule / confirm-permission。P1 不使用 import。
// 任务行 = 官方 TaskRecord（含 executions[].sessionId / archivedAt / permissionConfirmedAt），
//   由 projection.ts 保守解析 —— Personal 不做第二数据源。
//
// 纪律：纯数据层，不触碰 DOM；fetch 失败/超时/非 2xx 一律抛 Error → UI 显示诚实错误 + fallback。
// SSE 仅用于「有变化」信号：revision 变化才重拉 state；事件本身不带任务列表（官方设计）。
import type { TaskPermission } from './projection'
import {
  isTaskPermission,
  parseTaskRecord,
  type ExecutionResult,
  type TaskRecord,
} from './projection'

export { isTaskPermission, TASK_PERMISSIONS, exceedsSessionDefault } from './projection'
export type { TaskPermission } from './projection'

export const TASK_BOARD_API_PREFIX = '/api/task-board'

export type TaskStatus = 'backlog' | 'todo' | 'running' | 'done' | 'failed'

export interface TaskBoardCreateInput {
  /** 任务标题（不可空；UI 由 prompt 截取）。 */
  title: string
  description: string
  /** 任务指令正文（Host runner 以 queue 模式发给执行会话）。 */
  prompt: string
  workspaceId?: string
  /** agent preset id（= personal agent id，registry 单一源；缺省=宿主默认）。 */
  mode?: string
  permission?: TaskPermission
  model?: string
  /** 定期规则（TASK-3：创建即携带官方 cron schedule；UI 侧用 schedule.ts 映射）。 */
  schedule?: { enabled: true; cron: string }
}

/** 官方快照（tasks 为完整 TaskRecord 的保守投影）。 */
export interface TaskBoardSnapshot {
  schemaVersion?: number
  revision: number
  tasks: TaskRecord[]
  sessionDefaultPermission?: TaskPermission
  scheduler?: { timeZone?: string; ledgerId?: string; error?: string }
  power?: { phase?: string; enabled?: boolean; runningSessions?: number; lastError?: string }
  error?: string
}

/** SSE 事件帧（官方：只带 revision/scheduler/power，不带任务列表）。 */
export interface TaskBoardEventPayload {
  revision?: number
  scheduler?: unknown
  power?: unknown
}

/** 向后兼容别名（E4 newtask.tsx 仍引用 TaskBoardTaskRow）。 */
export type TaskBoardTaskRow = TaskRecord

/** 向后兼容：snapshot.task 行（完整 TaskRecord 投影）。 */
export interface TaskBoardSnapshotCompat extends TaskBoardSnapshot {
  tasks: TaskRecord[]
}

export type TaskBoardAction =
  | { kind: 'create'; id: string; input: TaskBoardCreateInput }
  | { kind: 'run'; taskId: string }
  | { kind: 'rerun'; taskId: string }
  | { kind: 'update'; taskId: string; patch: { title?: string; description?: string; prompt?: string } }
  | { kind: 'move'; taskId: string; status: TaskStatus }
  | { kind: 'archive'; taskId: string }
  | { kind: 'restore'; taskId: string }
  | { kind: 'delete'; taskId: string }
  | { kind: 'set-schedule'; taskId: string; patch: { enabled?: boolean; cron?: string } }
  | { kind: 'confirm-permission'; taskId: string }

const REQUEST_TIMEOUT_MS = 15_000

function uuid(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  } catch {
    // fall through to timestamp id
  }
  return `personal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function parseScheduler(value: unknown): TaskBoardSnapshot['scheduler'] {
  const s = (value ?? {}) as Record<string, unknown>
  const out: NonNullable<TaskBoardSnapshot['scheduler']> = {}
  const tz = optString(s.timeZone)
  const ledgerId = optString(s.ledgerId)
  const err = optString(s.error)
  if (tz !== undefined) out.timeZone = tz
  if (ledgerId !== undefined) out.ledgerId = ledgerId
  if (err !== undefined) out.error = err
  return Object.keys(out).length === 0 ? undefined : out
}

function parsePower(value: unknown): TaskBoardSnapshot['power'] {
  const s = (value ?? {}) as Record<string, unknown>
  const out: NonNullable<TaskBoardSnapshot['power']> = {}
  if (typeof s.phase === 'string') out.phase = s.phase
  if (s.enabled === true || s.enabled === false) out.enabled = s.enabled
  const running = optNum(s.runningSessions)
  if (running !== undefined) out.runningSessions = running
  const err = optString(s.lastError)
  if (err !== undefined) out.lastError = err
  return Object.keys(out).length === 0 ? undefined : out
}

function parseSnapshot(value: unknown): TaskBoardSnapshot {
  const s = (value ?? {}) as Record<string, unknown>
  const tasks = Array.isArray(s.tasks)
    ? s.tasks.map(parseTaskRecord).filter((t): t is TaskRecord => t !== null)
    : []
  return {
    schemaVersion: typeof s.schemaVersion === 'number' ? s.schemaVersion : undefined,
    revision: typeof s.revision === 'number' ? s.revision : 0,
    tasks,
    sessionDefaultPermission: isTaskPermission(s.sessionDefaultPermission) ? s.sessionDefaultPermission : undefined,
    scheduler: parseScheduler(s.scheduler),
    power: parsePower(s.power),
    error: typeof s.error === 'string' ? s.error : undefined,
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let body: T & { error?: string }
  try {
    body = (await response.json()) as T & { error?: string }
  } catch {
    throw new Error(`任务板服务响应异常（HTTP ${response.status}）`)
  }
  if (!response.ok) throw new Error(body?.error ?? `任务板请求失败（HTTP ${response.status}）`)
  return body
}

/** task-board Host 同源 HTTP 客户端（state + 全量 action + SSE 订阅）。 */
export class TaskBoardClient {
  private readonly prefix: string
  private readonly initiator: () => string | undefined

  constructor(
    prefix = TASK_BOARD_API_PREFIX,
    initiator: () => string | undefined = () => undefined,
  ) {
    this.prefix = prefix
    this.initiator = initiator
  }

  async state(): Promise<TaskBoardSnapshot> {
    const response = await this.request(`${this.prefix}/state`, { cache: 'no-store' })
    return parseSnapshot(await readJson<unknown>(response))
  }

  /** create → 返回新快照（含新建任务行）。 */
  async create(input: TaskBoardCreateInput): Promise<TaskBoardSnapshot> {
    const action = { kind: 'create', id: uuid(), input }
    return this.action(action)
  }

  /** run → 请求宿主启动执行（高于会话默认权限的绑定会被宿主拒绝并返回错误体）。 */
  async run(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'run', taskId })
  }

  /** rerun → 宿主对已 settle 任务重新规划并执行。 */
  async rerun(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'rerun', taskId })
  }

  /** delete → 宿主拒绝 running/open execution（E4-FIX D4 的 Host 权威判据）。 */
  async delete(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'delete', taskId })
  }

  /** archive → 仅 settled（done/failed）可归档（官方 task-archive）。 */
  async archive(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'archive', taskId })
  }

  /** restore → 恢复已归档任务（官方支持）。 */
  async restore(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'restore', taskId })
  }

  /** move → 手动移列（官方仅 backlog/todo 目标合法）。 */
  async move(taskId: string, status: TaskStatus): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'move', taskId, status })
  }

  /** confirm-permission → 人工放行高于会话默认的权限绑定（宿主权威）。 */
  async confirmPermission(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'confirm-permission', taskId })
  }

  /** set-schedule → 启用/停用/改周期（官方权威：enable 即按本地时间算下次执行）。 */
  async setSchedule(taskId: string, patch: { enabled?: boolean; cron?: string }): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'set-schedule', taskId, patch })
  }

  /** 便捷：停用定期（保留 cron，官方 enabled=false）。 */
  async disableSchedule(taskId: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'set-schedule', taskId, patch: { enabled: false } })
  }

  /** 便捷：以指定 cron 启用定期。 */
  async enableSchedule(taskId: string, cron: string): Promise<TaskBoardSnapshot> {
    return this.action({ kind: 'set-schedule', taskId, patch: { enabled: true, cron } })
  }

  /** 任意 action（信封封装 + initiator 审计戳）。 */
  private async action(action: TaskBoardAction): Promise<TaskBoardSnapshot> {
    const initiator = this.initiator()
    const envelope = { requestId: uuid(), action, ...(initiator === undefined || initiator === '' ? {} : { initiator }) }
    const response = await this.request(`${this.prefix}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    })
    return parseSnapshot(await readJson<unknown>(response))
  }

  /**
   * 订阅 Host 事件（官方同款：SSE + visibilitychange）。SSE 帧不带任务列表，
   * 只作「有变化」信号 —— 调用方决定是否重拉 state()（revision 比对）。
   * 返回释放函数；EventSource 不可用时退化为仅 visibilitychange。
   */
  subscribe(listener: (event?: TaskBoardEventPayload) => void): () => void {
    let events: EventSource | null = null
    try {
      if (typeof EventSource !== 'undefined') {
        events = new EventSource(`${this.prefix}/events`)
        events.onmessage = (message: MessageEvent<string>): void => {
          try {
            const parsed = JSON.parse(message.data) as TaskBoardEventPayload
            if (parsed === null || typeof parsed !== 'object' || typeof parsed.revision !== 'number') {
              listener()
              return
            }
            listener({ revision: parsed.revision, scheduler: parsed.scheduler, power: parsed.power })
          } catch {
            listener()
          }
        }
      }
    } catch {
      events = null
    }
    const onVisible = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') listener()
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    return () => {
      try {
        events?.close()
      } catch {
        // ignore
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      const aborted = controller.signal.aborted
      if (aborted) throw new Error('任务板服务响应超时（15s）——可能宿主未运行，请刷新重试')
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`无法连接任务板服务：${message}`)
    } finally {
      globalThis.clearTimeout(timer)
    }
  }
}

export type { ExecutionResult }
