// dsh-personal-workspace — Home = Personal Harness Mission Control
// (E4-FIX-6/7 六区 → E4-FIX-IA-2 · IA2-3 收口).
//
// IA2（用户收口指令 §3/§31/§39）语义：
//   ① Quick Start      —— Home 内置 **New Conversation 入口**（§1/§2：不再有独立「+ 新会话」）。
//                        输入一句话 + Project（不属于项目/已有/＋新建 inline，§4-5）+
//                        Agent / Permission —— E4-FIX-IA-2 FINAL · PHASE A 起为**真实生效**：
//                        Agent 读官方 agentPresets 清单、创建后经官方 agentPresets.select 绑定
//                        （仅空白会话；host 会以 agent-preset/locked 拒绝）；权限读官方 permissions
//                        投影、创建后经官方 /permission 命令应用并读回校验。通道缺失/被拒 →
//                        控件禁用 + 诚实原因，绝不假装。
//                        [开始] → 官方 sessions.create → 上述绑定 → 官方 sessions.open →
//                        composer setDraft 预填（probe，不可用则复制到剪贴板诚实提示）。
//                        需要 Harness 自动执行/调度/追踪的受管任务 → 侧栏「＋ 新任务」。
//   ② AI 正在做什么    —— 官方 task-board 真源 running 任务（宿主不可达 → 降级官方 sessions running + 角标）
//   ③ 需要你处理      —— **真源**（E4-FIX-7/D8）：attentionOf（confirm-permission / failed /
//                         task-error / unknown-failure），点击 → 任务板定位到处理位
//   ④ 最近完成        —— 官方 task host done（最近 settle；点击 → 任务板定位）
//   ⑤ 最近会话        —— 官方 sessions 非 running 最近（可继续；排除 archived）
//   行内 Project badge（§31）：任务/会话若已归项目 → 显示「项目名」chip（Project Center 在 IA2-5 起
//   提供点击进入；此前为静态上下文，不做假跳转）。
//
// 数据真源纪律（与 Task Board 同一 reconcile store；E3 红线保持）：真实数据 > 空态 > mock，
// 任一来源缺失即该区优雅空态 + 数据源角标，绝不伪造/猜测。
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { projectRegistry } from '../../../personal-registry/src/projects'
import type { TaskReconcile, TaskReconcileState } from './reconcile'
import { sessionRowsOf, type ProjectedTask, type SessionSnapshotRow } from './projection'
import type { TaskPermission } from './taskboard'
import { AgentSelect, PermissionSelect, ProjectSelect, WorkspaceSelect, useProjects } from './selectors'
import { useWorkspaceCatalog } from './workspace-catalog'
import { listAgentPresets, listPermissionPresets, type PresetOption } from './session-bindings'

// ---------------------------------------------------------------------------
// CSS —— 安静、留白、低信息密度；复用官方 --dsw-* token，自带降级 fallback。
export const CSS_HOME = String.raw`
.dhm-root{display:flex;flex-direction:column;gap:14px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.dhm-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dhm-sec{display:flex;flex-direction:column;gap:7px;}
.dhm-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dhm-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 45%,transparent);width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer;}
.dhm-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1)) 60%,transparent);}
.dhm-row.attn{border-color:rgba(240,180,60,.5);}
.dhm-row.err{border-color:rgba(235,90,90,.45);}
.dhm-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#37c871;}
.dhm-dot.idle{background:var(--dsw-alias-label-dimmed,#6a6a74);}
.dhm-dot.amber{background:#e8b64c;}
.dhm-dot.red{background:#e85a5a;}
.dhm-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dhm-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);white-space:nowrap;}
.dhm-act{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:2px 9px;cursor:pointer;flex:none;}
.dhm-act:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dhm-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);font:var(--dsw-font-xxs-12,12px);padding:2px 0;}
.dhm-badge{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:20px;padding:1px 8px;align-self:flex-start;}
.dhm-badge.warn{border-color:rgba(240,180,60,.4);color:#e0b96a;}
.dhm-in{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 50%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:7px 10px;width:100%;box-sizing:border-box;outline:none;}
.dhm-in:focus{border-color:rgba(120,150,255,.6);}
.dhm-in::placeholder{color:var(--dsw-alias-label-dimmed,#7c7c88);}
.dhm-line{display:flex;gap:8px;align-items:center;}
.dhm-go{border:1px solid rgba(120,150,255,.55);border-radius:8px;background:rgba(120,150,255,.14);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-strong-12,600 12px);padding:6px 16px;cursor:pointer;flex:none;}
.dhm-go:hover{background:rgba(120,150,255,.22);}
.dhm-chip{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:20px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);padding:2px 10px;cursor:pointer;}
.dhm-chip:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dhm-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dhm-proj{display:flex;flex-direction:column;gap:2px;min-width:0;}
.dhm-pname{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dhm-pname b{color:var(--dsw-alias-label-primary,#e8e8ec);white-space:nowrap;}
.dhm-pzh{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);white-space:nowrap;}
.dhm-pdesc{color:var(--dsw-alias-label-secondary,#c8c8d0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dhm-pchips{display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;}
.dhm-pchip{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:4px;padding:0 5px;}
.dhm-sec-title{margin-top:2px;}
.dhm-meta{display:flex;gap:5px;align-items:center;min-width:0;}
.dhm-tag{display:inline-flex;align-items:center;font:var(--dsw-font-xxxs-11,11px);border-radius:4px;padding:1px 5px;white-space:nowrap;flex:none;}
.dhm-tag.perm{background:rgba(240,180,60,.14);color:#e8b64c;border:1px solid rgba(240,180,60,.35);}
.dhm-tag.fail{background:rgba(235,90,90,.14);color:#ff8a8a;}
.dhm-tag.arch{color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));}
.dhm-tag.ok{background:rgba(55,200,113,.12);color:#37c871;}
.dhm-tag.run{background:rgba(120,150,255,.14);color:#8aa4ff;}
.dhm-tag.prj{background:rgba(150,120,255,.12);color:#b49bff;border:1px solid rgba(150,120,255,.3);}
.dhm-err{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`

// ---------------------------------------------------------------------------
// 会话实时源适配（官方 sessions 服务；与 hud/sidebar 同源，E2 真机已验）
export interface HomeSession {
  id: string
  title: string
  running: boolean
  updatedAt?: number
}

interface HomeFeedState {
  ready: boolean
  rows: HomeSession[]
}

const EMPTY_FEED: HomeFeedState = { ready: false, rows: [] }
let feed: HomeFeedState = EMPTY_FEED
const feedSubs = new Set<() => void>()
function notifyFeed(): void {
  feedSubs.forEach((f) => f())
}

// E4-FIX-IA-2 FINAL · PHASE A 真机缺口修复：官方 sessions.list 快照的真实形状是
//   { ids, byId, current, phase }（实证 @deepseek-ai/dsh-api-session-controller/lib/client.js:2577
//   `const { ids, current } = this.list.getSnapshot()`、:2568 `byId[...]`；官方
//   ui-conversation/lib/client.js:16010 亦读 `getSnapshot().current`）。
//   本文件早期自建解析器只认 array / `list` / `sessions` → 真机上永远解析出 0 行，
//   于是 Home 的「最近会话 / 需要你处理 / Running 降级」全是空。现统一改用
//   projection.ts 的 sessionRowsOf（byId 优先，recent/project-detail 早已用它）。
function rowOf(raw: SessionSnapshotRow): HomeSession | null {
  const id = String(raw.id ?? '')
  if (!id) return null
  const title =
    typeof raw.title === 'string' && raw.title.length > 0
      ? raw.title
      : typeof raw.displayTitle === 'string' && raw.displayTitle.length > 0
        ? raw.displayTitle
        : '（未命名会话）'
  return {
    id,
    title,
    running: raw.running === true,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
  }
}

/** 与 hud attachSessionFeed 同构：订阅 sessions.list 快照，返回释放函数。 */
function attachFeed(getSessions: () => unknown): () => void {
  let source: { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } | null = null
  try {
    const svc = getSessions() as {
      list?: { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void }
    }
    source = svc?.list ?? null
  } catch {
    source = null
  }
  if (!source || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') {
    feed = { ready: false, rows: [] }
    notifyFeed()
    return () => {
      // nothing attached
    }
  }
  const apply = (): void => {
    try {
      const snap = source!.getSnapshot!()
      const rows = sessionRowsOf(snap)
        .map((r) => rowOf(r))
        .filter((x): x is HomeSession => x !== null)
        .slice(0, 40)
      feed = { ready: true, rows }
      notifyFeed()
    } catch {
      // ignore transient parse failures
    }
  }
  apply()
  const off = source.subscribe(apply)
  return () => {
    try {
      off?.()
    } catch {
      // ignore
    }
  }
}

let openSessionFn: ((id: string) => void) | null = null

/** 上一次 Quick Start 回执（模块态 → 主区切走后回到主页仍可见，诚实不丢失）。 */
interface QuickReceipt {
  at: number
  message: string
  sessionId: string | null
  failed: boolean
}
let lastReceipt: QuickReceipt | null = null

/** IA2-3：Home Quick Start 创建会话的选项。 */
export interface NewConversationOpts {
  /** 选择的项目 id；null = 不属于任何项目。 */
  projectId: string | null
  /** 选择的官方工作区 id；null = 自动（当前/最近工作区）。 */
  workspaceId?: string | null
  /** Agent 预设 id（E4-FIX-IA-2 FINAL：经官方 agentPresets.select 真实绑定，失败如实回报）。 */
  agentId?: string | null
  /** 权限预设 id（经官方 /permission 命令应用 + 投影读回校验）。 */
  permission?: TaskPermission | null
}

/** IA2-3：创建会话的执行结果（诚实：失败给 message，成功给会话 id/文案）。 */
export interface NewConversationResult {
  ok: boolean
  /** 会话 id（成功时）。 */
  sessionId?: string
  /** 面向用户的中文提示/错误。 */
  message: string
  /**
   * 是否有**未生效**的绑定（Agent/权限被官方拒绝）。
   * true 时调用方**不得**立刻跳转会话 —— 否则失败原因会随主区切换被卸载，
   * 用户永远看不到（§2.1 要求任一项被拒都要如实报告）。
   */
  failed?: boolean
}

export type CreateConversationFn = (draft: string, opts: NewConversationOpts) => Promise<NewConversationResult>
let createConversationFn: CreateConversationFn | null = null

/**
 * index.tsx 在 apply 时调用：绑定会话服务（ctx.get('sessions')）与打开动作；
 * IA2-3: onCreateConversation 由 index 提供（官方 sessions.create+open → composer
 * setDraft 预填 / 剪贴板降级）。返回释放函数（页面生命周期内不再解绑亦可）。
 */
export function bindHomeServices(
  getSessions: () => unknown,
  openSession: (id: string) => void,
  onCreateConversation?: CreateConversationFn,
): () => void {
  openSessionFn = openSession
  createConversationFn = onCreateConversation ?? null
  return attachFeed(getSessions)
}

export function useHomeFeed(): HomeFeedState {
  return useSyncExternalStore(
    (f) => {
      feedSubs.add(f)
      return () => {
        feedSubs.delete(f)
      }
    },
    () => feed,
    () => EMPTY_FEED,
  )
}

// ---------------------------------------------------------------------------
// IA2-6：Project Detail「New Conversation」复用 Home Quick Start 的官方创建链路
// （bindHomeServices 第 3 参 = createConversation，index 注入；本模块持有）。
// 会话创建即归项目（opts.projectId），打开官方会话 + composer 预填 —— 与 Home「开始」
// 完全同构。未绑定/失败 → 明确 message（诚实降级），绝不假装。
export async function createConversationInProject(draft: string, projectId: string): Promise<NewConversationResult> {
  const fn = createConversationFn
  if (fn === null) {
    return { ok: false, message: '会话创建服务暂不可用（未绑定官方链路）——请到主页 Quick Start 开始。' }
  }
  try {
    return await fn(draft, { projectId, agentId: null, permission: null })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

// ---------------------------------------------------------------------------
// E4-FIX-6/7：同一 reconcile store（官方 task host 真源）绑定给 Home。
let homeReconcile: TaskReconcile | null = null
let openTaskBoardFn: ((taskId: string) => void) | null = null

const EMPTY_TASKS: TaskReconcileState = {
  ready: false,
  hostReachable: false,
  revision: 0,
  tasks: [],
  archivedSessionIds: [],
  sessionsSource: false,
  workspacesSource: false,
}

/** index.tsx 在 apply 时调用：绑定 reconcile（官方 task host + archived 集）与「任务板定位」动作。 */
export function bindHomeTaskSource(
  reconcile: TaskReconcile | null,
  openTaskBoard: ((taskId: string) => void) | null,
): () => void {
  homeReconcile = reconcile
  openTaskBoardFn = openTaskBoard
  return () => {
    homeReconcile = null
    openTaskBoardFn = null
  }
}

export function useHomeTaskState(): TaskReconcileState {
  return useSyncExternalStore(
    (f) => {
      const r = homeReconcile
      if (!r) return () => {}
      return r.subscribe(f)
    },
    () => homeReconcile?.getState() ?? EMPTY_TASKS,
    () => EMPTY_TASKS,
  )
}

// ---------------------------------------------------------------------------
// 小工具
const ago = (ts?: number): string => {
  if (!ts || !Number.isFinite(ts)) return ''
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return s + ' 秒前'
  const m = Math.round(s / 60)
  if (m < 60) return m + ' 分钟前'
  const h = Math.round(m / 60)
  if (h < 24) return h + ' 小时前'
  return Math.round(h / 24) + ' 天前'
}

// 派生：官方 task host running 任务（真源；含「会话已归档」的 running 合法组合）
function runningTasksOf(state: TaskReconcileState): ProjectedTask[] {
  if (!state.ready || !state.hostReachable) return []
  return state.tasks.filter((p) => p.task.status === 'running' || p.task.executions.some((e) => e.endedAt === undefined))
}

// 派生：attention 真源行（E4-FIX-7/D8），权重降序
function attentionRowsOf(state: TaskReconcileState): ProjectedTask[] {
  if (!state.ready || !state.hostReachable) return []
  return state.tasks
    .filter((p) => p.attention !== null)
    .sort((a, b) => (b.attention?.weight ?? 0) - (a.attention?.weight ?? 0))
    .slice(0, 10)
}

// 派生：最近完成（官方 task host done，最近 settle；排除已归档任务 —— IA2-10：归档 =
// 离开活跃流，在任务板 Archived/History 查看，避免点击落到 active 视图的空位）
function recentDoneOf(state: TaskReconcileState): ProjectedTask[] {
  if (!state.ready || !state.hostReachable) return []
  return state.tasks
    .filter((p) => p.task.status === 'done' && !p.taskArchived)
    .sort((a, b) => b.task.updatedAt - a.task.updatedAt)
    .slice(0, 5)
}

// ---------------------------------------------------------------------------
// Home 视图（Mission Control 六区；Personal 模式下为默认聚焦标签）
const QUICK_CHIPS = ['继续上次的事', '检查进度', '研究一个主题', '处理收尾']

function attentionTag(p: ProjectedTask): { dot: string; cls: string; text: string } | null {
  const a = p.attention
  if (a === null) return null
  switch (a.kind) {
    case 'confirm-permission':
      return { dot: 'amber', cls: 'perm', text: '确认权限' }
    case 'failed':
      return { dot: 'red', cls: 'fail', text: '执行失败' }
    case 'task-error':
      return { dot: 'red', cls: 'fail', text: '任务错误' }
    default:
      return { dot: 'red', cls: 'fail', text: '需处理' }
  }
}

function execSummary(p: ProjectedTask): string {
  const ex = p.task.executions[p.task.executions.length - 1]
  if (ex === undefined) return ''
  if (ex.endedAt === undefined) return '执行中'
  if (ex.result === 'succeeded') return '成功'
  if (ex.result === 'cancelled') return '已取消'
  if (ex.result === 'failed') return '失败'
  return '已结束'
}

export function HomeView(): ReactNode {
  const feed = useHomeFeed()
  const tasks = useHomeTaskState()
  const wsCat = useWorkspaceCatalog()
  const projects = useProjects()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [agentSel, setAgentSel] = useState<string | null>(null)
  const [permSel, setPermSel] = useState<TaskPermission | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<QuickReceipt | null>(lastReceipt)
  // E4-FIX-IA-2 FINAL · PHASE A：Agent / 权限 = 官方真实能力清单（读不到 → 诚实原因，控件禁用）
  const [agentOpts, setAgentOpts] = useState<PresetOption[] | null>(null)
  const [agentReason, setAgentReason] = useState<string | null>(null)
  const [permOpts, setPermOpts] = useState<PresetOption[] | null>(null)
  const [permReason, setPermReason] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const roster = await listAgentPresets()
      if (!alive) return
      if (roster.ok) {
        setAgentOpts(roster.items)
        setAgentReason(null)
      } else {
        setAgentOpts(null)
        setAgentReason(roster.reason)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    // 权限预设清单来自官方 permissions 会话投影（需要至少一个真实会话）；有会话变化时重读。
    const r = listPermissionPresets()
    if (r.ok) {
      setPermOpts(r.items)
      setPermReason(null)
    } else {
      setPermOpts(null)
      setPermReason(r.reason)
    }
  }, [feed.rows.length])

  const archivedSet = new Set(tasks.archivedSessionIds)
  const hostDown = tasks.ready && !tasks.hostReachable

  // ② AI 正在做什么（running）：官方 task host running 优先；宿主不可达 → 官方 sessions running 降级
  const runningTasks = runningTasksOf(tasks)
  const runningSessions = feed.rows.filter((r) => r.running)
  const recentSessions = feed.rows
    .filter((r) => !r.running && !archivedSet.has(r.id))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 5)
  const attention = attentionRowsOf(tasks)
  const recentDone = recentDoneOf(tasks)

  const openSess = (id: string): void => {
    try {
      openSessionFn?.(id)
    } catch {
      // opening is best-effort from the Home list
    }
  }

  const openBoardAt = (taskId: string): void => {
    try {
      openTaskBoardFn?.(taskId)
    } catch {
      // best-effort: Board tab may be unavailable
    }
  }

  // §31 行内项目 chip：任务/会话若已归项目 → 显示「项目名」（Project Center 在
  // IA2-5 起提供点击进入；此前为静态上下文标注，不做假跳转）。
  const projNameOf = (projectId: string | undefined): string | undefined =>
    projectId ? projects.find((p) => p.id === projectId)?.name : undefined
  const taskProjName = (taskId: string): string | undefined => projNameOf(projectRegistry.projectOfTask(taskId))
  const sessProjName = (sessionId: string): string | undefined => projNameOf(projectRegistry.projectOfSession(sessionId))

  // IA2-3：开始 = 创建一段新会话（官方 sessions.create+open → composer setDraft 预填 / 剪贴板降级）。
  const submit = async (): Promise<void> => {
    const t = text.trim()
    if (!t) {
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const fn = createConversationFn
      if (fn === null) {
        let copiedOk = false
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(t)
            copiedOk = true
          }
        } catch {
          copiedOk = false
        }
        setNotice(
          copiedOk
            ? '会话创建服务暂不可用：目标文本已复制，请在会话输入框 ⌘V 粘贴开始。'
            : '会话创建服务暂不可用，且未能自动复制：请手动选中目标文本复制。',
        )
        return
      }
      const res = await fn(t, { projectId, workspaceId, agentId: agentSel, permission: permSel })
      // 结果提示 = 官方回执（成功/失败都显示）：见 index.tsx createConversation 的 applied/failed。
      // E4-FIX-IA-2 FINAL：回执**持久化**在模块态 —— 成功时主区会切到新会话，Home 被卸载，
      // 若用户回到主页仍需看到刚才到底发生了什么（含「未指定工作区」这类诚实说明）。
      if (res.ok) {
        setText('')
        const r: QuickReceipt = {
          at: Date.now(),
          message: res.message && res.message.length > 0 ? res.message : '已创建并打开新会话。',
          sessionId: res.sessionId ?? null,
          failed: res.failed === true,
        }
        lastReceipt = r
        setReceipt(r)
        if (r.failed) setNotice(r.message)
      } else {
        const r: QuickReceipt = { at: Date.now(), message: res.message || '会话创建失败，请重试。', sessionId: null, failed: true }
        lastReceipt = r
        setReceipt(r)
        setNotice(r.message)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const fill = (chip: string): void => {
    setText(chip + ' …')
    inputRef.current?.focus()
  }

  const scrollToStart = (): void => {
    try {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      inputRef.current?.focus()
    } catch {
      // best-effort
    }
  }

  return (
    <div className="dhm-root" data-dsh-plugin="dsh-personal-workspace" data-e4fix-home="1">
      {/* ① Quick Start —— Home 内置 New Conversation（IA2-3；官方 sessions.create+open） */}
      <section className="dhm-sec" data-dps-home-quickstart="1">
        <div className="dhm-h">Quick Start</div>
        <div className="dhm-line">
          <input
            ref={inputRef}
            className="dhm-in"
            value={text}
            placeholder="用一句话告诉它你想做什么…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            aria-label="目标输入"
          />
          <button type="button" className="dhm-go" onClick={submit} disabled={busy}>
            {busy ? '创建中…' : '开始'}
          </button>
        </div>
        <div className="dhm-line" style={{ flexWrap: 'wrap' }}>
          <ProjectSelect value={projectId} onChange={setProjectId} />
          <WorkspaceSelect value={workspaceId} onChange={setWorkspaceId} items={wsCat.items} ready={wsCat.ready} probing={wsCat.probing} />
        </div>
        <div className="dhm-line" style={{ flexWrap: 'wrap' }}>
          <AgentSelect
            value={agentSel}
            onChange={setAgentSel}
            options={agentOpts ?? undefined}
            unavailableReason={agentReason ?? undefined}
          />
          <PermissionSelect
            value={permSel}
            onChange={setPermSel}
            options={permOpts ?? undefined}
            unavailableReason={permReason ?? undefined}
          />
          <span className="dhm-k" data-dhm-bind-state={agentReason === null && permReason === null ? 'ready' : 'limited'}>
            {agentReason === null && permReason === null
              ? '（创建后经官方通道即时生效）'
              : '（部分能力不可用，见控件旁原因）'}
          </span>
        </div>
        <div className="dhm-line" style={{ flexWrap: 'wrap' }}>
          {QUICK_CHIPS.map((c) => (
            <button type="button" key={c} className="dhm-chip" onClick={() => fill(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="dhm-note" data-dhm-semantics="conversation">
          主页 = <b>创建并开始一段官方 Conversation</b>（不是 Task）：点「开始」→ 官方 sessions.create →
          （可选）Agent 预设经官方 agentPresets.select 绑定、权限预设经官方 /permission 命令应用并读回校验 →
          打开该会话并把目标文本填入输入框。任一项被官方拒绝，都会在下方如实报告；需要被管理/调度/追踪的正式工作 →
          侧栏「＋ 新任务」。
        </div>
        {notice ? (
          <div className="dhm-note" role="status" data-dhm-notice="1">
            {notice}
          </div>
        ) : null}
        {receipt ? (
          <div
            className="dhm-note"
            role="status"
            data-dhm-receipt={receipt.failed ? 'failed' : 'ok'}
            style={receipt.failed ? { borderLeftColor: 'rgba(255,120,120,.7)' } : undefined}
          >
            <b>{receipt.failed ? '上一步有未生效的绑定' : '上一次创建回执'}</b>：{receipt.message}
            {receipt.sessionId ? (
              <>
                {' '}
                <button
                  type="button"
                  className="dhm-chip"
                  data-dhm-open-created="1"
                  onClick={() => {
                    try {
                      openSessionFn?.(receipt.sessionId as string)
                    } catch {
                      // best-effort
                    }
                  }}
                >
                  打开该会话
                </button>{' '}
              </>
            ) : null}
            <button
              type="button"
              className="dhm-chip"
              data-dhm-receipt-dismiss="1"
              onClick={() => {
                lastReceipt = null
                setReceipt(null)
                setNotice(null)
              }}
            >
              知道了
            </button>
          </div>
        ) : null}
      </section>

      {/* ② AI 正在做什么（running 真源） */}
      <section className="dhm-sec">
        <div className="dhm-k">AI 正在做什么 · Running</div>
        {hostDown ? (
          <span className="dhm-badge warn">任务板宿主不可达 —— 以下为官方运行中会话（降级视图）</span>
        ) : null}
        {runningTasks.length > 0 ? (
          runningTasks.slice(0, 6).map((p) => {
            const pname = taskProjName(p.task.id)
            return (
              <button type="button" className="dhm-row" key={p.task.id} onClick={() => openBoardAt(p.task.id)} title="在任务板查看/控制">
                <span className="dhm-dot" title="运行中" />
                <span className="dhm-t">{p.task.title}</span>
                {pname ? <span className="dhm-tag prj">{pname}</span> : null}
                <span className="dhm-sub">{ago(p.task.updatedAt)}</span>
                {p.attach?.archived ? <span className="dhm-tag arch">会话已归档</span> : null}
                <span className="dhm-sub">执行中</span>
                {p.attach?.sessionId !== undefined ? (
                  <span className="dhm-act" role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); openSess(p.attach!.sessionId!) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openSess(p.attach!.sessionId!) } }}>
                    会话
                  </span>
                ) : null}
              </button>
            )
          })
        ) : !feed.ready ? (
          <div className="dhm-empty">会话数据暂不可用，刷新重试。</div>
        ) : runningSessions.length === 0 ? (
          <div className="dhm-empty">
            当前没有正在执行的任务。
            <button type="button" className="dhm-chip" style={{ marginLeft: 8 }} onClick={scrollToStart}>
              开始一件事
            </button>
          </div>
        ) : (
          runningSessions.slice(0, 6).map((s) => {
            const pname = sessProjName(s.id)
            return (
              <div className="dhm-row" key={s.id}>
                <span className="dhm-dot" title="运行中" />
                <span className="dhm-t">{s.title}</span>
                {pname ? <span className="dhm-tag prj">{pname}</span> : null}
                {s.updatedAt ? <span className="dhm-sub">{ago(s.updatedAt)}</span> : null}
                <button type="button" className="dhm-act" onClick={() => openSess(s.id)}>
                  打开会话
                </button>
              </div>
            )
          })
        )}
      </section>

      {/* ③ 需要你处理（E4-FIX-7：真源，不猜） */}
      <section className="dhm-sec">
        <div className="dhm-k">需要你处理 · Needs Attention</div>
        {hostDown ? (
          <div className="dhm-empty">任务板宿主不可达，暂时无法读取待处理事项。</div>
        ) : attention.length === 0 ? (
          tasks.ready ? (
            <div className="dhm-empty">暂无可处理事项。</div>
          ) : (
            <div className="dhm-empty">正在读取任务板…</div>
          )
        ) : (
          attention.map((p) => {
            const tag = attentionTag(p)
            const pname = taskProjName(p.task.id)
            return (
              <button type="button" className={`dhm-row attn${tag?.cls === 'fail' ? ' err' : ''}`} key={p.task.id}
                onClick={() => openBoardAt(p.task.id)} title="打开任务板处理">
                <span className={`dhm-dot ${tag?.dot ?? 'amber'}`} />
                <span className="dhm-t">{p.task.title}</span>
                {pname ? <span className="dhm-tag prj">{pname}</span> : null}
                {tag ? <span className={`dhm-tag ${tag.cls}`}>{tag.text}</span> : null}
                <span className="dhm-err">{p.attention?.label ?? ''}</span>
              </button>
            )
          })
        )}
      </section>

      {/* ④ 最近完成（官方 task host done） */}
      <section className="dhm-sec">
        <div className="dhm-k dhm-sec-title">最近完成 · Done</div>
        {hostDown ? (
          <div className="dhm-empty">任务板宿主不可达，暂时无法读取最近完成。</div>
        ) : !tasks.ready ? (
          <div className="dhm-empty">正在读取任务板…</div>
        ) : recentDone.length === 0 ? (
          <div className="dhm-empty">还没有已完成的任务。</div>
        ) : (
          recentDone.map((p) => {
            const pname = taskProjName(p.task.id)
            return (
              <button type="button" className="dhm-row" key={p.task.id} onClick={() => openBoardAt(p.task.id)}>
                <span className="dhm-tag ok">完成</span>
                <span className="dhm-t">{p.task.title}</span>
                {pname ? <span className="dhm-tag prj">{pname}</span> : null}
                <span className="dhm-sub">{ago(p.task.updatedAt)} · {execSummary(p)}</span>
              </button>
            )
          })
        )}
      </section>

      {/* ⑤ 最近会话（官方 sessions；排除 archived —— Home 不把 Archived 当 Active） */}
      <section className="dhm-sec">
        <div className="dhm-k dhm-sec-title">最近会话 · 可继续</div>
        {!feed.ready ? (
          <div className="dhm-empty">会话数据暂不可用，刷新重试。</div>
        ) : recentSessions.length === 0 ? (
          <div className="dhm-empty">
            还没有可继续的会话记录。
            {archivedSet.size > 0 ? <span className="dhm-badge" style={{ marginLeft: 8 }}>已归档会话不列在最近</span> : null}
          </div>
        ) : (
          recentSessions.map((s) => {
            const pname = sessProjName(s.id)
            return (
              <div className="dhm-row" key={s.id}>
                <span className="dhm-dot idle" />
                <span className="dhm-t">{s.title}</span>
                {pname ? <span className="dhm-tag prj">{pname}</span> : null}
                {s.updatedAt ? <span className="dhm-sub">{ago(s.updatedAt)}</span> : null}
                <button type="button" className="dhm-act" onClick={() => openSess(s.id)}>
                  继续
                </button>
              </div>
            )
          })
        )}
        {archivedSet.size > 0 ? (
          <span className="dhm-badge" data-home-archived-note="1">官方已归档会话 N={archivedSet.size}（不在「最近会话」/Running 显示，任务状态不受影响）</span>
        ) : null}
      </section>
    </div>
  )
}
