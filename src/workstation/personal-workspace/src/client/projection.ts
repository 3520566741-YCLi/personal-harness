// dsh-personal-workspace — E4-FIX · projection/reconcile 纯函数层（E4-FIX-1）。
//
// 目标（用户 D6/D9 纪律 + E4 调查结论）：
//   Personal 绝不建立第二套 Archive/任务状态。所有派生只做「投影」：
//     Task Host snapshot（账本/execution，官方权威）
//   × sessions.list（runtime: running/updatedAt，官方权威）
//   × workspaces.list.archivedSessionIds（registry 归档集，官方权威）
//   → 供 UI 渲染的 ProjectedTask（Task / Execution / Session / Attention 状态**拆开**）。
//
// 本文件 = 纯函数、React-free、无网络、无 DOM，便于单测与 smoke：
//   - parseTaskRecord   : 官方快照行 → 保守 TaskRecord（只取已知字段，绝不猜测）
//   - effectivePermission / requiresConfirmation : 镜像官方 handover.ts 判据
//   - projectTask       : 单任务投影（含 capability 门控，动态按钮判据）
//   - projectBoard      : 全板投影 + Active/Archived 分组
//   - isSessionArchived / sessionAttachOf : archived 集合判断
//   - attentionOf       : 真实 Needs-Attention 判据（D8，仅用官方可观测事实）
//
// 语义红线：
//   - Archived ≠ Delete / ≠ Done / ≠ Cancelled（六、状态拆开）
//   - Task Running + Session Archived = 官方合法组合，如实呈现
//   - 无 pause：UI 层绝不因本文件生成 pause（官方无此状态）

// ---------------------------------------------------------------------------
// 权限类型（官方 task-board permission 枚举；集中定义，taskboard.ts re-export）
export const TASK_PERMISSIONS = ['read-only', 'workspace-write', 'danger-full-access'] as const
export type TaskPermission = (typeof TASK_PERMISSIONS)[number]

export function isTaskPermission(value: unknown): value is TaskPermission {
  return typeof value === 'string' && (TASK_PERMISSIONS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// 领域类型 —— 与官方 task-board core/tasks.ts 对齐（只含我们用到的字段）
export type TaskStatus = 'backlog' | 'todo' | 'running' | 'done' | 'failed'

export const TASK_STATUSES: readonly TaskStatus[] = ['backlog', 'todo', 'running', 'done', 'failed']

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

export type ExecutionResult = 'succeeded' | 'failed' | 'cancelled'

export interface TaskExecution {
  /** Execution attempt id (uuid). */
  id: string
  /** The dsh session that ran this attempt; absent until creation resolves. */
  sessionId?: string
  /** When the run started (ms epoch). */
  startedAt: number
  /** When the run settled; absent while still running. */
  endedAt?: number
  /** Outcome once settled. */
  result?: ExecutionResult
  /** Human failure text when the run failed. */
  error?: string
}

/** 官方周期规则（E4-FIX-IA-2-TASK：宿主 cron schedule 字段的保守投影）。 */
export interface TaskSchedule {
  enabled: boolean
  /** 5 段 cron（内部编码；UI 永不展示，描述由 schedule.ts 生成）。 */
  cron: string
  /** 下次应执行时刻（宿主已按本地时间算好；ms epoch）。 */
  nextRunAt?: number
  /** 上次「到期被宿主处理」时刻（ms epoch；含被跳过的情况）。 */
  lastTriggeredAt?: number
}

/** 官方 TaskRecord 的保守投影（parseTaskRecord 产出）。 */
export interface TaskRecord {
  id: string
  title: string
  description: string
  prompt: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
  executions: TaskExecution[]
  workspaceId?: string
  mode?: string
  permission?: TaskPermission
  model?: string
  permissionConfirmedAt?: number
  archivedAt?: number
  /** 定期规则（enabled=false 表示曾设过但已停用/被归档解除）。 */
  schedule?: TaskSchedule
  /** Task-level error surfaced by the host snapshot (rare). */
  error?: string
}

/** 会话快照行（sessions.list 的 byId 行或 list 行：id/running/updatedAt…）。 */
export interface SessionSnapshotRow {
  id: string
  title?: string
  displayTitle?: string
  running?: boolean
  updatedAt?: number
}

/** 投影入参：一次 reconcile 的全部官方事实。 */
export interface ProjectionInput {
  /** Task Host 快照里的任务行（官方账本）。 */
  tasks: readonly TaskRecord[]
  /** 会话 runtime 行（sessions.list 快照行；undefined 字段=未知）。 */
  sessions: readonly SessionSnapshotRow[]
  /** 官方 registry 归档集（workspaces.list.archivedSessionIds）。 */
  archivedSessionIds: readonly string[]
  /** Host 会话默认权限（快照 sessionDefaultPermission）。 */
  sessionDefaultPermission?: TaskPermission
}

// ---------------------------------------------------------------------------
// 保守解析（防脏数据：只收已知字段与合法枚举，绝不抛错）
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function optNum(v: unknown): number | undefined {
  const n = num(v)
  return n !== undefined && n >= 0 ? n : undefined
}

function isExecutionResult(v: unknown): v is ExecutionResult {
  return v === 'succeeded' || v === 'failed' || v === 'cancelled'
}

function parseExecution(raw: unknown): TaskExecution | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const id = str(r.id)
  if (id === undefined) return null
  const startedAt = num(r.startedAt)
  if (startedAt === undefined) return null
  return {
    id,
    ...(str(r.sessionId) !== undefined ? { sessionId: str(r.sessionId)! } : {}),
    startedAt,
    ...(optNum(r.endedAt) !== undefined ? { endedAt: optNum(r.endedAt)! } : {}),
    ...(isExecutionResult(r.result) ? { result: r.result } : {}),
    ...(str(r.error) !== undefined ? { error: str(r.error)! } : {}),
  }
}

function parseSchedule(raw: unknown): TaskSchedule | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const cron = str(r.cron)
  if (cron === undefined) return undefined
  const nextRunAt = num(r.nextRunAt)
  const lastTriggeredAt = num(r.lastTriggeredAt)
  return {
    enabled: r.enabled === true,
    cron,
    ...(nextRunAt !== undefined ? { nextRunAt } : {}),
    ...(lastTriggeredAt !== undefined ? { lastTriggeredAt } : {}),
  }
}

/** 官方 TaskRecord（snapshot row）→ 保守投影。未知行返回 null。 */
export function parseTaskRecord(raw: unknown): TaskRecord | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const id = str(r.id)
  const title = str(r.title)
  if (id === undefined || title === undefined) return null
  const status = isTaskStatus(r.status) ? r.status : undefined
  const createdAt = num(r.createdAt)
  if (status === undefined || createdAt === undefined) return null
  const executions = Array.isArray(r.executions)
    ? r.executions.map(parseExecution).filter((e): e is TaskExecution => e !== null)
    : []
  const updatedAt = optNum(r.updatedAt) ?? createdAt
  const schedule = parseSchedule(r.schedule)
  return {
    id,
    title,
    description: str(r.description) ?? '',
    prompt: str(r.prompt) ?? title,
    status,
    createdAt,
    updatedAt,
    executions,
    ...(str(r.workspaceId) !== undefined ? { workspaceId: str(r.workspaceId)! } : {}),
    ...(str(r.mode) !== undefined ? { mode: str(r.mode)! } : {}),
    ...(isTaskPermission(r.permission) ? { permission: r.permission } : {}),
    ...(str(r.model) !== undefined ? { model: str(r.model)! } : {}),
    ...(num(r.permissionConfirmedAt) !== undefined ? { permissionConfirmedAt: num(r.permissionConfirmedAt)! } : {}),
    ...(optNum(r.archivedAt) !== undefined ? { archivedAt: optNum(r.archivedAt)! } : {}),
    ...(schedule !== undefined ? { schedule } : {}),
    ...(str(r.error) !== undefined ? { error: str(r.error)! } : {}),
  }
}

// ---------------------------------------------------------------------------
// 权限判据 —— 镜像官方 core/handover.ts（effectivePermission / exceedsSessionDefault）
const PERMISSION_RANK: Record<TaskPermission, number> = {
  'read-only': 0,
  'workspace-write': 1,
  'danger-full-access': 2,
}

/** 会话实际将运行在的权限档（handover 未入 P1：task.permission 即有效档）。 */
export function effectivePermission(task: Pick<TaskRecord, 'permission'>): TaskPermission | undefined {
  return task.permission
}

/** 是否高于会话默认（官方 exceedsSessionDefault 判据）。 */
export function exceedsSessionDefault(permission: TaskPermission | undefined, sessionDefault: TaskPermission | undefined): boolean {
  if (permission === undefined || sessionDefault === undefined) return false
  return (PERMISSION_RANK[permission] ?? -1) > (PERMISSION_RANK[sessionDefault] ?? -1)
}

/**
 * 确认门判据（镜像官方 requiresPermissionConfirmation）：有效权限高于会话默认
 * 且无人工确认戳 → 该任务处于「待确认权限」注意态（真源，非猜测）。
 */
export function requiresConfirmation(
  task: Pick<TaskRecord, 'permission' | 'permissionConfirmedAt'>,
  sessionDefault: TaskPermission | undefined,
): boolean {
  return exceedsSessionDefault(effectivePermission(task), sessionDefault) && task.permissionConfirmedAt === undefined
}

// ---------------------------------------------------------------------------
// 执行/会话视图
/** 最新一次执行（含仍在运行的）。 */
export function latestExecution(task: TaskRecord): TaskExecution | undefined {
  if (task.executions.length === 0) return undefined
  return task.executions[task.executions.length - 1]
}

/** 是否存在未结束的执行（= 正在运行 / Host 尚未 settle）。 */
export function hasOpenExecution(task: TaskRecord): boolean {
  return task.executions.some((e) => e.endedAt === undefined)
}

/** 归档集判断（官方 archivedSessionIds 为数组，Set 化供 O(1)）。 */
export function archivedSetOf(ids: readonly string[]): Set<string> {
  return new Set(ids ?? [])
}

export interface SessionAttach {
  sessionId: string
  /** 会话 runtime 是否 running（官方 sessions.list；未知=undefined）。 */
  running?: boolean
  /** 会话是否在官方归档集。 */
  archived: boolean
  /** 显示标题（displayTitle ?? title）。 */
  title?: string
  updatedAt?: number
}

/**
 * 任务→绑定会话投影：取最新执行携带的 sessionId，向 sessions 快照行 + 归档集
 * 投影出「会话状态」。无执行/无 sessionId → undefined（不猜测）。
 */
export function sessionAttachOf(
  task: TaskRecord,
  sessionRows: ReadonlyMap<string, SessionSnapshotRow>,
  archived: ReadonlySet<string>,
): SessionAttach | undefined {
  const execution = latestExecution(task)
  const sessionId = execution?.sessionId
  if (sessionId === undefined) return undefined
  const row = sessionRows.get(sessionId)
  return {
    sessionId,
    ...(row?.running !== undefined ? { running: row.running } : {}),
    archived: archived.has(sessionId),
    ...(row?.title !== undefined ? { title: row.title } : {}),
    ...(row?.updatedAt !== undefined ? { updatedAt: row.updatedAt } : {}),
  }
}

// ---------------------------------------------------------------------------
// Attention（D8：Needs Attention 真源判据，只用官方可观测事实）
export type AttentionKind =
  /** 高于会话默认权限的绑定尚未人工确认（官方确认门）。 */
  | 'confirm-permission'
  /** 最近一次执行已 settle 为 failed（官方 execution.result）。 */
  | 'failed'
  /** 执行失败但错误文本缺失的异常态。 */
  | 'unknown-failure'
  /** 官方快照 task.error（罕见宿主级错误）。 */
  | 'task-error'

export interface Attention {
  kind: AttentionKind
  /** 排序权重（越大越靠前）。 */
  weight: number
  /** 人类可读说明。 */
  label: string
  /** 点击后应进入的处理位。 */
  target: 'confirm-permission' | 'task-detail'
}

export function attentionOf(
  task: TaskRecord,
  sessionDefault: TaskPermission | undefined,
): Attention | null {
  // 0) 任务已归档 → 不产生 attention（IA2-10：归档 = 离开活跃流，在 Archived/History
  //    视图可见；恢复后再看。避免“已归档失败任务”在 主页③/Mini MMC 永续打扰）。
  if (task.archivedAt !== undefined) return null
  // 1) 确认门（最高优先：不确认则无法执行）
  if (requiresConfirmation(task, sessionDefault)) {
    return {
      kind: 'confirm-permission',
      weight: 40,
      label: '权限绑定待确认（高于会话默认）',
      target: 'confirm-permission',
    }
  }
  // 2) 宿主快照 task.error
  if (task.error !== undefined && task.error !== '') {
    return { kind: 'task-error', weight: 30, label: task.error, target: 'task-detail' }
  }
  // 3) 最近一次执行已失败（仅 settled-failed；running/cancelled/succeeded 均不算）
  const execution = latestExecution(task)
  if (execution !== undefined && execution.endedAt !== undefined && execution.result === 'failed') {
    const label = execution.error !== undefined && execution.error !== '' ? execution.error : '最近一次执行失败'
    return { kind: 'failed', weight: 20, label, target: 'task-detail' }
  }
  if (execution !== undefined && execution.endedAt !== undefined && execution.result === undefined) {
    return { kind: 'unknown-failure', weight: 10, label: '执行已结束但缺少结果', target: 'task-detail' }
  }
  return null
}

// ---------------------------------------------------------------------------
// 能力门控（Decision 2/4：按钮只按官方真实能力显示，绝不展示官方不存在的操作）
export interface TaskCapabilities {
  /** 打开官方会话（execution.sessionId 存在即真实可开）。 */
  openConversation: boolean
  /** 运行/重跑：任务可执行（非 archived、非 running/open、无确认门阻塞）。 */
  run: boolean
  rerun: boolean
  /** 停止运行中的执行（会话层 cancel；UI 还要做 capability probe，见 D3）。 */
  stop: boolean
  /** 删除：宿主仅拒绝 running/open；但 E4-FIX 的 D4 在 UI 上再收紧 running 保护。 */
  delete: boolean
  archive: boolean
  restore: boolean
  confirmPermission: boolean
  /** 手动移列（仅 backlog/todo ↔ backlog/todo，镜像官方 canMoveManually）。 */
  moveBacklog: boolean
  moveTodo: boolean
}

export function capabilitiesOf(
  task: TaskRecord,
  sessionDefault: TaskPermission | undefined,
): TaskCapabilities {
  const open = hasOpenExecution(task)
  const archived = task.archivedAt !== undefined
  const pendingConfirm = requiresConfirmation(task, sessionDefault)
  const attach = latestExecution(task)
  const running = task.status === 'running' || open
  const settledDone = task.status === 'done' || task.status === 'failed'
  return {
    openConversation: attach?.sessionId !== undefined && attach.sessionId !== '',
    // 官方 run/rerun 语义：archived→拒绝；running/open→拒绝；确认门→拒绝
    run: !archived && !running && !pendingConfirm && task.status !== 'running',
    rerun: !archived && !running && !pendingConfirm && settledDone,
    // stop 语义：有 open execution 且已绑定 session → 会话可被 cancel（真实能力）；
    // UI 层 D3 还要求 probe sessions/remote cancel 可达性后才启用按钮。
    stop: open && attach?.sessionId !== undefined,
    // delete：宿主拒绝 running/open（镜像）；D4 在 UI 上对 running 追加引导文案。
    delete: !archived && !running,
    archive: !archived && settledDone && !open,
    restore: archived,
    confirmPermission: pendingConfirm,
    moveBacklog: canMoveManually(task, 'backlog'),
    moveTodo: canMoveManually(task, 'todo'),
  }
}

/** 手动移列（镜像官方 MANUAL_STATUSES + canMoveManually）。 */
export function canMoveManually(task: TaskRecord, to: TaskStatus): boolean {
  if (task.archivedAt !== undefined) return false
  if (hasOpenExecution(task) || task.status === 'running') return false
  if (to !== 'backlog' && to !== 'todo') return false
  return task.status !== to
}

// ---------------------------------------------------------------------------
// 全板投影（E4-FIX-1 主入口）
export interface ProjectedTask {
  task: TaskRecord
  attach?: SessionAttach
  attention: Attention | null
  caps: TaskCapabilities
  /** task.archivedAt 已设 = 任务已归档（官方账本归档，与会话归档不同）。 */
  taskArchived: boolean
}

/**
 * E4-FIX-IA-2 FINAL · PHASE I：归档**真值**（未知 ≠ 「没有归档」）。
 *   官方归档集来自 workspaces.list.archivedSessionIds；该源可读时才 `known: true`。
 *   源不可读（探测中/能力不可用）→ `known:false` + 空集：UI 必须写明「归档状态未知」，
 *   **不得**把未标注的会话当成「未归档」而静默隐藏或错误标注。
 */
export interface ArchiveTruth {
  known: boolean
  ids: ReadonlySet<string>
}

export function archiveTruthOf(
  input: { archivedSessionIds?: unknown; workspacesSource?: unknown } | null | undefined,
): ArchiveTruth {
  if (input === null || input === undefined) return { known: false, ids: new Set() }
  const raw = input.archivedSessionIds
  if (!Array.isArray(raw) || input.workspacesSource === false) {
    return { known: false, ids: new Set() }
  }
  return { known: true, ids: new Set(raw.filter((x): x is string => typeof x === 'string')) }
}

/** 统一的诚实文案：源可读 → 空串（无需说明）；未知 → 一句明确的降级说明。 */
export function archiveNoteOf(truth: ArchiveTruth): string {
  return truth.known
    ? ''
    : '归档状态未知：官方 workspaces（归档来源）当前不可读 —— 本页不会把会话误判为「未归档」，也不隐藏任何行；恢复来源后自动生效。'
}

/** 把一次官方事实 reconcile 成 UI 可渲染的投影列表（保持官方顺序）。 */
export function projectBoard(input: ProjectionInput): ProjectedTask[] {
  const archived = archivedSetOf(input.archivedSessionIds)
  const sessionRows = new Map<string, SessionSnapshotRow>()
  for (const row of input.sessions ?? []) {
    if (row?.id) sessionRows.set(row.id, row)
  }
  const tasks = (input.tasks ?? []).map(parseTaskRecord).filter((t): t is TaskRecord => t !== null)
  return tasks.map((task) => {
    const attach = sessionAttachOf(task, sessionRows, archived)
    const attention = attentionOf(task, input.sessionDefaultPermission)
    return {
      task,
      ...(attach !== undefined ? { attach } : {}),
      attention,
      caps: capabilitiesOf(task, input.sessionDefaultPermission),
      taskArchived: task.archivedAt !== undefined,
    }
  })
}

/** 会话行归一化：sessions.list 快照可能以 byId 或 list 数组暴露 → 统一成行数组。 */
export function sessionRowsOf(snapshot: unknown): SessionSnapshotRow[] {
  const s = (snapshot ?? {}) as Record<string, unknown>
  const byId = s.byId
  if (byId !== null && typeof byId === 'object' && !Array.isArray(byId)) {
    return Object.values(byId as Record<string, unknown>).map((row) => sessionRowOf(row)).filter((r): r is SessionSnapshotRow => r !== null)
  }
  const raw = Array.isArray(s)
    ? s
    : Array.isArray(s.list)
      ? s.list
      : Array.isArray(s.sessions)
        ? s.sessions
        : []
  return (raw as unknown[]).map(sessionRowOf).filter((r): r is SessionSnapshotRow => r !== null)
}

function sessionRowOf(raw: unknown): SessionSnapshotRow | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : typeof r.sessionId === 'string' ? r.sessionId : undefined
  if (id === undefined || id === '') return null
  return {
    id,
    ...(typeof r.title === 'string' && r.title.length > 0 ? { title: r.title } : {}),
    ...(typeof r.displayTitle === 'string' && r.displayTitle.length > 0 ? { displayTitle: r.displayTitle } : {}),
    ...(typeof r.label === 'string' && r.label.length > 0 ? { title: r.label } : {}),
    ...(r.running === true || r.running === false ? { running: r.running } : {}),
    ...(typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? { updatedAt: r.updatedAt } : {}),
  }
}

/** 会话显示名（displayTitle 优先）。 */
export function sessionDisplayName(row: SessionSnapshotRow | SessionAttach | undefined): string {
  const t = row?.displayTitle ?? row?.title
  return t !== undefined && t !== '' ? t : '（未命名会话）'
}

// ---------------------------------------------------------------------------
// 分组助手（E4-FIX-5 的 UI 需求：不在卡上增加第六列，只做 Active/Archived 过滤）
export interface BoardGroups {
  /** 主看板任务（未归档；含 running 态）。 */
  active: ProjectedTask[]
  /** 官方任务归档（archivedAt）——History 过滤。 */
  archived: ProjectedTask[]
}

export function groupBoard(projected: readonly ProjectedTask[]): BoardGroups {
  const active: ProjectedTask[] = []
  const archived: ProjectedTask[] = []
  for (const p of projected) {
    if (p.taskArchived) archived.push(p)
    else active.push(p)
  }
  return { active, archived }
}
