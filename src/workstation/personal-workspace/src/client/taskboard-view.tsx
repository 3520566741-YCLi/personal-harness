// dsh-personal-workspace — E4-FIX · Task Board 视图（E4-FIX-2/3/4/5 的 UI 载体）。
//
// 定位（用户 Decision 2/4/5/6）：不建新顶级页面 —— better-sidebar「任务板」标签内，
// 任务卡片点击 → 打开 Task Detail（本视图内展开的详情面），按钮按官方真实能力动态显示。
//
// 数据：一律来自 reconcile store（官方三源投影，见 reconcile.ts/projection.ts）。
//   绝不建立第二套任务/归档状态；按钮点击 → TaskBoardClient action（Host 权威）→
//   ingest(Host 返回快照)。Host 拒绝错误原样展示，不吞、不伪造成功。
//
// 状态拆开显示（六）：Task State / Execution State / Session State / Attention State。
// Archive ≠ Delete / Done / Cancelled：卡与详情分开展示「任务已归档」「会话已归档」。
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { TaskReconcile, TaskReconcileState } from './reconcile'
import { TaskBoardClient, type TaskBoardSnapshot, type TaskStatus } from './taskboard'
import { projectRegistry } from '../../../personal-registry/src/projects'
import { useProjects } from './selectors'
import { useWorkspaceCatalog } from './workspace-catalog'
import {
  groupBoard,
  sessionDisplayName,
  type Attention,
  type ProjectedTask,
  type TaskExecution,
} from './projection'
import { execHistorySummary, execResultView, executionHistoryRows, latestExecutionOf, recurringEnabledOf, scheduleChipOf } from './taskui'
import { personalTasksStore } from './task-model'
import { summarizeMissed } from './schedule'

// ---------------------------------------------------------------------------
// CSS —— 与 Home(dhm-)/NewTask(dnt-) 同一设计语言
export const CSS_TASKBOARD = String.raw`
.dtb-root{display:flex;flex-direction:column;gap:10px;padding:10px 12px 16px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;min-height:0;}
.dtb-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);display:flex;align-items:center;gap:8px;}
.dtb-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dtb-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.dtb-toggle{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:16px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);padding:2px 10px;cursor:pointer;}
.dtb-toggle.on{background:rgba(120,150,255,.18);border-color:rgba(120,150,255,.5);color:var(--dsw-alias-label-primary,#e8e8ec);}
.dtb-tag{display:inline-flex;align-items:center;gap:4px;font:var(--dsw-font-xxxs-11,11px);border-radius:4px;padding:1px 6px;white-space:nowrap;}
.dtb-tag.running{background:rgba(55,200,113,.14);color:#37c871;}
.dtb-tag.done{background:rgba(120,150,255,.12);color:#8aa4ff;}
.dtb-tag.failed{background:rgba(235,90,90,.14);color:#ff8a8a;}
.dtb-tag.todo,.dtb-tag.backlog{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dtb-tag.arch{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));}
.dtb-tag.attention{background:rgba(240,180,60,.14);color:#e8b64c;border:1px solid rgba(240,180,60,.35);}
.dtb-tag.prj{background:rgba(150,120,255,.12);color:#b49bff;border:1px solid rgba(150,120,255,.3);}
.dtb-tag.ws{background:rgba(120,150,255,.12);color:#8aa4ff;border:1px solid rgba(120,150,255,.3);}
.dtb-tag.periodic{background:rgba(120,200,170,.13);color:#6fd6ac;border:1px solid rgba(120,200,170,.32);}
.dtb-tag.off{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));}
.dtb-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);font:var(--dsw-font-xxs-12,12px);padding:2px 0;}
.dtb-badge{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:20px;padding:1px 8px;align-self:flex-start;}
.dtb-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 45%,transparent);padding:7px 10px;display:flex;flex-direction:column;gap:5px;text-align:left;cursor:pointer;width:100%;color:inherit;font:inherit;}
.dtb-card:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1)) 60%,transparent);}
.dtb-cardline{display:flex;align-items:center;gap:6px;min-width:0;}
.dtb-cardtitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dtb-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);}
.dtb-group{margin-top:8px;display:flex;flex-direction:column;gap:5px;}
.dtb-sec{display:flex;flex-direction:column;gap:5px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14));padding-top:8px;}
.dtb-detail{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.34));border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 55%,transparent);padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
.dtb-dhead{display:flex;align-items:flex-start;gap:8px;justify-content:space-between;}
.dtb-dtitle{font:var(--dsw-font-s-strong-14,600 14px);color:var(--dsw-alias-label-primary,#e8e8ec);margin:0;word-break:break-word;}
.dtb-desc{color:var(--dsw-alias-label-secondary,#c8c8d0);line-height:1.55;word-break:break-word;}
.dtb-prompt{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.5;word-break:break-word;border-left:2px solid rgba(120,150,255,.35);padding:1px 0 1px 8px;max-height:84px;overflow:auto;}
.dtb-kv{display:grid;grid-template-columns:92px 1fr;gap:3px 8px;align-items:baseline;}
.dtb-kv b{color:var(--dsw-alias-label-primary,#e8e8ec);font-weight:600;}
.dtb-acts{display:flex;gap:6px;flex-wrap:wrap;}
.dtb-act{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:3px 10px;cursor:pointer;}
.dtb-act:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08)) 70%,transparent);}
.dtb-act:disabled{opacity:.45;cursor:default;}
.dtb-act.stop{border-color:rgba(235,90,90,.45);color:#ff9a9a;background:rgba(235,90,90,.08);}
.dtb-act.stop:hover{background:rgba(235,90,90,.16);}
.dtb-act.confirm{border-color:rgba(240,180,60,.55);color:#f0c46a;background:rgba(240,180,60,.08);}
.dtb-act.confirm:hover{background:rgba(240,180,60,.16);}
.dtb-act.danger{border-color:rgba(235,90,90,.55);color:#ffb0b0;}
.dtb-act.danger:hover{background:rgba(235,90,90,.14);}
.dtb-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dtb-note.warn{border-left-color:rgba(240,180,60,.55);}
.dtb-note.err{border-left-color:rgba(235,90,90,.6);color:#ffb4b4;}
.dtb-states{display:flex;gap:6px;flex-wrap:wrap;}
.dtb-st{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:6px;padding:2px 8px;font:var(--dsw-font-xxxs-11,11px);display:inline-flex;gap:5px;align-items:center;}
.dtb-st b{color:var(--dsw-alias-label-tertiary,#9a9aa5);font-weight:600;}
`

// ---------------------------------------------------------------------------
// 时间工具
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

const fmt = (ts?: number): string => {
  if (!ts || !Number.isFinite(ts)) return '—'
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const STATUS_LABEL: Record<string, string> = {
  backlog: '待规划',
  todo: '待办',
  running: '进行中',
  done: '已完成',
  failed: '已失败',
}

// ---------------------------------------------------------------------------
// 视图状态：当前视图（active/archived）、选中任务、确认态、错误
interface BoardLocal {
  /** PHASE B：新增 'attention' = Needs Attention 过滤（同 projection.attention 单一真源）。 */
  view: 'active' | 'archived' | 'attention'
  selectedId: string | null
  confirmDelete: string | null
  busyTaskId: string | null
  actionError: string | null
  notice: string | null
}

const INITIAL_LOCAL: BoardLocal = {
  view: 'active',
  selectedId: null,
  confirmDelete: null,
  busyTaskId: null,
  actionError: null,
  notice: null,
}

// ---------------------------------------------------------------------------
// 依赖注入：reconcile store + action client（index.tsx 在 apply 时 bind）
let reconcileStore: TaskReconcile | null = null
let actionClient: TaskBoardClient | null = null

/** index.tsx 在 apply 时调用：绑定 reconcile 与 action client。返回释放函数。 */
export function bindTaskBoard(
  reconcile: TaskReconcile | null,
  client: TaskBoardClient | null,
): () => void {
  reconcileStore = reconcile
  actionClient = client
  return () => {
    reconcileStore = null
    actionClient = null
  }
}

export function useTaskBoardState(): TaskReconcileState {
  return useSyncExternalStore(
    (f) => {
      const r = reconcileStore
      if (!r) return () => {}
      return r.subscribe(f)
    },
    () => (reconcileStore?.getState() ?? EMPTY_STATE),
    () => EMPTY_STATE,
  )
}

const EMPTY_STATE: TaskReconcileState = {
  ready: false,
  hostReachable: false,
  revision: 0,
  tasks: [],
  archivedSessionIds: [],
  sessionsSource: false,
  workspacesSource: false,
}

// ---------------------------------------------------------------------------
// 外部定位（E4-FIX-6/7）：Home 点击「需要你处理 / 最近完成」→ 打开任务板并选中任务。
// TaskBoardView 订阅 pendingOpenId；requestOpenTask(id) 由 Home 侧调用（index.tsx 注入）。
let pendingOpenId: string | null = null
const pendingSubs = new Set<() => void>()
function notifyPending(): void {
  for (const f of [...pendingSubs]) {
    try {
      f()
    } catch {
      // isolate
    }
  }
}
export function requestOpenTask(id: string): void {
  pendingOpenId = id
  notifyPending()
}
function clearPendingOpen(): void {
  if (pendingOpenId === null) return
  pendingOpenId = null
  notifyPending()
}
function usePendingOpenId(): string | null {
  return useSyncExternalStore(
    (f) => {
      pendingSubs.add(f)
      return () => {
        pendingSubs.delete(f)
      }
    },
    () => pendingOpenId,
    () => null,
  )
}

/** 宿主错误/诚实源角标行。 */
function SourceBadges({ state }: { state: TaskReconcileState }): ReactNode {
  const badges: ReactNode[] = []
  if (!state.hostReachable && state.ready) {
    badges.push(
      <span className="dtb-badge" key="host" style={{ borderColor: 'rgba(235,90,90,.4)', color: '#ffb4b4' }}>
        任务板宿主不可达{state.hostError ? `：${state.hostError}` : ''}
      </span>,
    )
  } else if (!state.ready) {
    badges.push(
      <span className="dtb-badge" key="host">
        正在读取任务板宿主…
      </span>,
    )
  }
  if (state.ready && !state.workspacesSource) {
    badges.push(
      <span className="dtb-badge" key="ws">
        归档状态源不可用（会话归档标记暂缺）
      </span>,
    )
  }
  return <>{badges}</>
}

// ---------------------------------------------------------------------------
// Task Card（点击打开详情）
function TaskCardView({ p, onOpen }: { p: ProjectedTask; onOpen: (id: string) => void }): ReactNode {
  const { task, attach, attention } = p
  const latest = latestExecutionOf(task.executions)
  // §39：卡上带 项目 / 工作区（若有，= 关系层/官方目录投影；无则不给技术 id）。
  const projects = useProjects()
  const wsCat = useWorkspaceCatalog()
  const pid = projectRegistry.projectOfTask(task.id)
  const prjName = pid === undefined ? undefined : projects.find((pr) => pr.id === pid)?.name
  const wsTitle = task.workspaceId === undefined ? undefined : wsCat.items.find((w) => w.workspaceId === task.workspaceId)?.title
  // TASK-11：周期徽标（只投影展示，不造状态）。归档任务已被官方解除周期 → 不在归档卡上重复「已停用」。
  const chip = !p.taskArchived ? scheduleChipOf(task.schedule) : task.schedule?.enabled === true ? scheduleChipOf(task.schedule) : null
  return (
    <button type="button" className="dtb-card" data-dsh-task-card={task.id} data-status={task.status} onClick={() => onOpen(task.id)}>
      <div className="dtb-cardline">
        <span className={`dtb-tag ${task.status}`}>{STATUS_LABEL[task.status] ?? task.status}</span>
        {p.taskArchived ? <span className="dtb-tag arch">任务已归档</span> : null}
        {attach?.archived ? <span className="dtb-tag arch" title="该任务的执行会话在官方会话归档集中">会话已归档</span> : null}
        {attention !== null ? <span className="dtb-tag attention">{attentionLabel(attention)}</span> : null}
        {chip !== null ? (
          <span
            className={`dtb-tag ${chip.tone === 'on' ? 'periodic' : 'off'}`}
            data-tk-chip="periodic"
            data-tk-periodic-state={chip.tone}
            title={chip.detail !== null ? `${chip.label} · ${chip.detail}（在应用内按周期自动执行）` : `${chip.label}（在应用内按周期自动执行）`}
          >
            {chip.label}
          </span>
        ) : null}
      </div>
      <span className="dtb-cardtitle">{task.title}</span>
      {task.description !== '' ? <span className="dtb-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</span> : null}
      {prjName !== undefined || wsTitle !== undefined ? (
        <div className="dtb-cardline">
          {prjName !== undefined ? (
            <span className="dtb-tag prj" data-dtb-chip="project" title={`该项目中的任务 · 点卡片打开任务板详情`}>
              项目 · {prjName}
            </span>
          ) : null}
          {wsTitle !== undefined ? (
            <span className="dtb-tag ws" data-dtb-chip="workspace" title="该任务执行绑定的工作区">
              工作区 · {wsTitle}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="dtb-cardline">
        <span className="dtb-sub">{ago(task.updatedAt)} 更新</span>
        {latest !== undefined ? (
          <span className="dtb-sub" data-tk-last-run="1">
            {execResultView(latest)?.text ?? '已结束'}
            {task.executions.length > 1 ? ` · 共 ${task.executions.length} 次` : ''}
          </span>
        ) : null}
        {recurringEnabledOf(task.schedule) && task.schedule?.nextRunAt !== undefined ? (
          <span className="dtb-sub" data-tk-next-run="1">下次 {fmt(task.schedule.nextRunAt)}</span>
        ) : null}
        {attach?.sessionId !== undefined ? <span className="dtb-sub" title={attach.sessionId}>⌁ 有会话</span> : null}
      </div>
    </button>
  )
}

function attentionLabel(a: Attention): string {
  switch (a.kind) {
    case 'confirm-permission':
      return '待确认权限'
    case 'failed':
    case 'task-error':
    case 'unknown-failure':
      return '需处理'
  }
}

// ---------------------------------------------------------------------------
// 详情视图（E4-FIX-2）：状态拆开 + 动态按钮
interface DetailProps {
  p: ProjectedTask
  state: TaskReconcileState
  local: BoardLocal
  onBack: () => void
  runAction: (kind: ActionKind, taskId: string) => void
  openConversation: (sessionId: string) => void
  /** TASK-13：把某次错过标为已处理（仅本层标记，不动官方记录）。 */
  onAckMissed: (taskId: string, at: number) => void
}

export type ActionKind =
  | 'run'
  | 'rerun'
  | 'stop'
  | 'archive'
  | 'restore'
  | 'delete'
  | 'cancel-delete'
  | 'confirm-permission'
  | 'move-backlog'
  | 'move-todo'
  | 'disable-schedule'
  | 'enable-schedule'

function Detail({ p, state, local, onBack, runAction, openConversation, onAckMissed }: DetailProps): ReactNode {
  const { task, attach, attention, caps } = p
  const latest = task.executions.length > 0 ? task.executions[task.executions.length - 1] : undefined
  const busy = local.busyTaskId === task.id
  const hostBusy = (): boolean => busy || !state.hostReachable || !actionClient
  const exec = (kind: ActionKind): void => {
    runAction(kind, task.id)
  }

  // D4：running / open execution → delete 禁用 + 引导先 Stop（D4 的 UI 收紧）
  const showRunningGuard = !caps.delete && (task.status === 'running' || task.executions.some((e) => e.endedAt === undefined))
  const sessionId = latest?.sessionId
  // TASK-12：来源会话引用（Personal 组织层映射：官方会话 id+标题，正文不复制）+ 全量执行历史
  const origin = personalTasksStore.originOf(task.id)
  const history = executionHistoryRows(task.executions)
  const histSummary = execHistorySummary(task.executions)
  // TASK-13：错过 reconcile（基准 = 本层 armedAt 书签 > 官方 lastTriggeredAt > 创建时间（最后者置 uncertain））
  const schedOn = recurringEnabledOf(task.schedule)
  const armedBase = task.schedule !== undefined ? personalTasksStore.armedAtOf(task.id) : undefined
  const refBase = task.schedule !== undefined ? (armedBase ?? task.schedule.lastTriggeredAt ?? task.createdAt) : task.createdAt
  const uncertainBase = task.schedule !== undefined && armedBase === undefined && task.schedule.lastTriggeredAt === undefined
  const missedSummary =
    task.schedule !== undefined && schedOn
      ? summarizeMissed(task.schedule.cron, refBase, Date.now(), task.executions, personalTasksStore.missedAcksOf(task.id), uncertainBase)
      : null

  return (
    <div className="dtb-detail" data-dsh-task-detail={task.id}>
      <div className="dtb-dhead">
        <div>
          <h3 className="dtb-dtitle">{task.title}</h3>
          {task.description !== '' ? <div className="dtb-desc">{task.description}</div> : null}
        </div>
        <button type="button" className="dtb-act" onClick={onBack}>
          返回列表
        </button>
      </div>

      {task.prompt !== '' && task.prompt !== task.title ? (
        <div className="dtb-prompt" title="任务指令原文">Prompt：{task.prompt}</div>
      ) : null}

      {/* 状态拆开显示（六）：Task / Execution / Session / Attention */}
      <div className="dtb-states">
        <span className="dtb-st">
          <b>任务</b>
          {STATUS_LABEL[task.status] ?? task.status}
          {p.taskArchived ? '（已归档）' : ''}
        </span>
        <span className="dtb-st">
          <b>执行</b>
          {executionStateText(latest)}
        </span>
        <span className="dtb-st">
          <b>会话</b>
          {attach === undefined ? '未绑定' : attach.running === true ? '运行中' : attach.running === false ? '空闲' : attach.archived ? '已归档' : '未知'}
          {attach?.archived ? '（已归档）' : ''}
        </span>
        <span className="dtb-st">
          <b>注意</b>
          {attention === null ? '无' : attentionLabel(attention)}
        </span>
      </div>

      <div className="dtb-kv">
        <span>任务 ID</span>
        <span className="dtb-sub" style={{ wordBreak: 'break-all' }}>{task.id}</span>
        {task.mode ? (
          <>
            <span>执行 Agent</span>
            <span className="dtb-sub">{task.mode}</span>
          </>
        ) : null}
        {task.permission ? (
          <>
            <span>权限档</span>
            <span className="dtb-sub">
              {task.permission}
              {task.permissionConfirmedAt !== undefined ? '（已确认）' : caps.confirmPermission ? '（待确认）' : ''}
            </span>
          </>
        ) : null}
        {task.schedule !== undefined ? (
          <>
            <span>周期</span>
            <span className="dtb-sub" data-tk-detail-schedule="1">
              {scheduleChipOf(task.schedule)?.label ?? '定期'}
              {scheduleChipOf(task.schedule)?.detail !== null ? ` · ${scheduleChipOf(task.schedule)?.detail}` : ''}
            </span>
            <span>下次执行</span>
            <span className="dtb-sub" data-tk-detail-next="1">
              {task.schedule.enabled
                ? task.schedule.nextRunAt !== undefined
                  ? fmt(task.schedule.nextRunAt)
                  : '宿主尚未给出'
                : '已停用（不再到期执行）'}
            </span>
            <span>上次到期</span>
            <span className="dtb-sub" data-tk-detail-last="1">
              {task.schedule.lastTriggeredAt !== undefined ? fmt(task.schedule.lastTriggeredAt) : '—'}
            </span>
          </>
        ) : null}
        <span>创建时间</span>
        <span className="dtb-sub">{fmt(task.createdAt)}</span>
        <span>更新时间</span>
        <span className="dtb-sub">{fmt(task.updatedAt)}</span>
        {task.archivedAt !== undefined ? (
          <>
            <span>归档时间</span>
            <span className="dtb-sub">{fmt(task.archivedAt)}</span>
          </>
        ) : null}
        {latest !== undefined && sessionId !== undefined ? (
          <>
            <span>执行会话</span>
            <span className="dtb-sub" style={{ wordBreak: 'break-all' }}>{sessionId}</span>
          </>
        ) : null}
      </div>

      {task.schedule !== undefined ? (
        <div className="dtb-note" data-tk-periodic-note="1">
          定期任务由任务板宿主按周期自动执行 —— 仅在 DeepSeek Harness 运行时才会触发；
          应用未运行期间到期的时刻不会被自动补跑。
        </div>
      ) : null}

      {/* 错过的时间（TASK-13：重启/未运行的 reconcile —— 补执行=官方 run、标已处理=本层标记；不动官方记录） */}
      {missedSummary !== null ? (
        <div className="dtb-sec" data-tk-missed="1">
          <div className="dtb-k">错过的时间</div>
          {!missedSummary.analyzable ? (
            <div className="dtb-empty">
              该任务的周期规则较特殊，暂时无法精确推算错过的时间 —— 可看上面的执行记录或手动「运行」。
            </div>
          ) : missedSummary.missed.length === 0 ? (
            <div className="dtb-empty" data-tk-missed-none="1">
              {missedSummary.expected === 0
                ? '还没有到过执行时间。'
                : '没有未处理的错过时间（应执行点均已执行或已标为已处理）。'}
              {missedSummary.uncertain ? '（按任务创建时间推算，可能不精确）' : ''}
            </div>
          ) : (
            <>
              <div className="dtb-empty">
                定期任务仅在 DeepSeek Harness 运行时执行 —— 应用未运行期间到期的时刻不会自动补跑，
                会出现在这里：可对任意一次「补执行一次」（现在运行一次）或「标为已处理」。
                {missedSummary.uncertain ? '（按任务创建时间推算，可能不精确）' : ''}
              </div>
              {missedSummary.missed.map((t) => (
                <div className="dtb-cardline" key={t} data-tk-missed-row="1">
                  <span className="dtb-sub">应执行 {fmt(t)}</span>
                  <button type="button" className="dtb-act" data-dsh-action="missed-run" disabled={hostBusy()}
                    onClick={() => exec('run')}>
                    补执行一次
                  </button>
                  <button type="button" className="dtb-act" data-dsh-action="missed-ack" disabled={busy}
                    onClick={() => onAckMissed(task.id, t)}>
                    标为已处理
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {/* 来源会话引用（TASK-12：Personal 组织层映射 → 打开官方会话；正文留在官方，不复制） */}
      {origin !== undefined ? (
        <div className="dtb-sec" data-tk-origin-session="1">
          <div className="dtb-k">来源会话</div>
          <div className="dtb-cardline">
            <span className="dtb-sub">该任务由会话「{origin.title ?? '官方会话'}」创建而来（内容保留在官方会话中）</span>
            {caps.openConversation ? (
              <button type="button" className="dtb-act" data-dsh-action="open-origin-session" disabled={busy}
                onClick={() => openConversation(origin.sessionId)}>
                打开会话
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 执行记录（最近一次细节） */}
      {latest !== undefined ? <ExecutionLine execution={latest} /> : null}
      {history.length > 1 ? (
        <div className="dtb-sec" data-tk-exec-history="1">
          <div className="dtb-k">
            全部执行记录 · 共 {histSummary.total} 次
            {histSummary.succeeded > 0 ? ` · 成功 ${histSummary.succeeded}` : ''}
            {histSummary.failed > 0 ? ` · 失败 ${histSummary.failed}` : ''}
            {histSummary.cancelled > 0 ? ` · 已取消 ${histSummary.cancelled}` : ''}
            {histSummary.running > 0 ? ` · 进行中 ${histSummary.running}` : ''}
          </div>
          {history.map((e) => {
            const v = execResultView(e)
            const toneCls =
              v?.kind === 'running'
                ? 'running'
                : v?.kind === 'succeeded'
                  ? 'done'
                  : v?.kind === 'failed'
                    ? 'failed'
                    : 'todo'
            return (
              <div className="dtb-cardline" key={e.id} data-tk-exec-row="1">
                <span className={`dtb-tag ${toneCls}`}>{v?.text ?? '已结束'}</span>
                <span className="dtb-sub">
                  开始 {fmt(e.startedAt)}
                  {e.endedAt !== undefined ? ` · 结束 ${fmt(e.endedAt)}` : ' · 进行中'}
                </span>
                {e.error !== undefined && e.error !== '' ? (
                  <span className="dtb-sub" style={{ color: '#ffb4b4' }} title={e.error}>
                    失败原因
                  </span>
                ) : null}
                {caps.openConversation && e.sessionId !== undefined ? (
                  <button type="button" className="dtb-act" style={{ marginLeft: 'auto' }} disabled={busy}
                    onClick={() => openConversation(e.sessionId as string)}>
                    打开会话
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {latest?.error ? (
        <div className="dtb-note err">执行错误（官方原样）：{latest.error}</div>
      ) : null}
      {task.error ? <div className="dtb-note err">任务错误：{task.error}</div> : null}
      {attention?.kind === 'confirm-permission' ? (
        <div className="dtb-note warn">
          权限档高于会话默认且尚未人工确认 —— 宿主在确认前拒绝执行。点「确认权限绑定」由官方放行（不绕过宿主门控）。
        </div>
      ) : null}
      {attention?.kind === 'failed' ? (
        <div className="dtb-note warn">该任务最近一次执行已失败，可「重跑」或先查看错误。</div>
      ) : null}

      {/* 操作区（按真实能力 + D4 删除保护 + D5 打开会话） */}
      <div className="dtb-acts">
        {caps.openConversation && sessionId !== undefined ? (
          <button type="button" className="dtb-act" data-dsh-action="open-conversation" disabled={busy}
            onClick={() => openConversation(sessionId)}>
            打开会话
          </button>
        ) : null}
        {caps.confirmPermission ? (
          <button type="button" className="dtb-act confirm" data-dsh-action="confirm-permission" disabled={hostBusy()}
            onClick={() => exec('confirm-permission')}>
            确认权限绑定
          </button>
        ) : null}
        {caps.stop ? (
          <button type="button" className="dtb-act stop" data-dsh-action="stop" disabled={busy}
            onClick={() => exec('stop')}>
            停止任务
          </button>
        ) : null}
        {caps.rerun ? (
          <button type="button" className="dtb-act" data-dsh-action="rerun" disabled={hostBusy()}
            onClick={() => exec('rerun')}>
            重跑
          </button>
        ) : null}
        {task.schedule !== undefined && !p.taskArchived && task.schedule.enabled ? (
          <button type="button" className="dtb-act" data-dsh-action="disable-schedule" data-tk-schedule-toggle="1"
            title="停用自动到期执行（任务与历史保留，之后可再启用）" disabled={hostBusy()}
            onClick={() => exec('disable-schedule')}>
            停用周期
          </button>
        ) : null}
        {task.schedule !== undefined && !p.taskArchived && !task.schedule.enabled ? (
          <button type="button" className="dtb-act" data-dsh-action="enable-schedule" data-tk-schedule-toggle="1"
            title="启用后由宿主在应用内按周期自动执行" disabled={hostBusy()}
            onClick={() => exec('enable-schedule')}>
            启用周期
          </button>
        ) : null}
        {caps.run ? (
          <button type="button" className="dtb-act" data-dsh-action="run" disabled={hostBusy()}
            onClick={() => exec('run')}>
            运行
          </button>
        ) : null}
        {!caps.run && !caps.rerun && caps.moveTodo && !p.taskArchived ? (
          <button type="button" className="dtb-act" data-dsh-action="move-todo" disabled={hostBusy()}
            onClick={() => exec('move-todo')}>
            移到待办
          </button>
        ) : null}
        {caps.moveBacklog ? (
          <button type="button" className="dtb-act" data-dsh-action="move-backlog" disabled={hostBusy()}
            onClick={() => exec('move-backlog')}>
            移到待规划
          </button>
        ) : null}
        {caps.archive ? (
          <button type="button" className="dtb-act" data-dsh-action="archive" disabled={hostBusy()}
            onClick={() => exec('archive')}>
            归档
          </button>
        ) : null}
        {caps.restore ? (
          <button type="button" className="dtb-act" data-dsh-action="restore" disabled={hostBusy()}
            onClick={() => exec('restore')}>
            恢复
          </button>
        ) : null}
        {caps.delete ? (
          local.confirmDelete === task.id ? (
            <button type="button" className="dtb-act" data-dsh-action="delete-cancel" disabled={busy}
              onClick={() => exec('cancel-delete')}>
              取消删除
            </button>
          ) : (
            <button type="button" className="dtb-act danger" data-dsh-action="delete" disabled={busy}
              onClick={() => exec('delete')}>
              删除任务
            </button>
          )
        ) : null}
      </div>

      {/* D4：running 删除保护（明确文案 + 引导） */}
      {showRunningGuard ? (
        <div className="dtb-note warn" data-dsh-delete-guard="1">
          任务仍在运行 —— 不允许直接删除（官方规则：running task cannot be deleted）。
          请先「停止任务」，待宿主将任务归位后再删除。
        </div>
      ) : null}

      {/* action 反馈 */}
      {local.confirmDelete === task.id && caps.delete ? (
        <div className="dtb-note warn" data-dsh-delete-confirm="1">
          确认删除任务「{task.title}」？此操作将删除任务记录（官方账本），不可撤销。
          <div className="dtb-acts" style={{ marginTop: 6 }}>
            <button type="button" className="dtb-act danger" data-dsh-action="delete-confirm" disabled={busy}
              onClick={() => exec('delete')}>
              {busy ? '删除中…' : '确认删除'}
            </button>
            <button type="button" className="dtb-act" onClick={() => exec('cancel-delete')}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {local.actionError ? (
        <div className="dtb-note err" data-dsh-action-error="1">操作失败（官方原样）：{local.actionError}</div>
      ) : null}
      {local.notice ? <div className="dtb-note" data-dsh-action-notice="1">{local.notice}</div> : null}
      {busy ? <div className="dtb-sub">正在请求宿主…</div> : null}
    </div>
  )
}

function executionStateText(execution: TaskExecution | undefined): string {
  if (execution === undefined) return '未执行'
  if (execution.endedAt === undefined) return '执行中'
  if (execution.result === 'succeeded') return '成功'
  if (execution.result === 'cancelled') return '已取消'
  if (execution.result === 'failed') return '失败'
  return '已结束'
}

function ExecutionLine({ execution }: { execution: TaskExecution }): ReactNode {
  return (
    <div className="dtb-sec" style={{ borderTop: 'none', paddingTop: 0 }}>
      <div className="dtb-k">最近一次执行</div>
      <div className="dtb-kv">
        <span>结果</span>
        <span className="dtb-sub">
          {execution.endedAt === undefined
            ? '进行中'
            : execution.result === 'succeeded'
              ? '成功'
              : execution.result === 'failed'
                ? '失败'
                : execution.result === 'cancelled'
                  ? '已取消'
                  : '未知'}
        </span>
        <span>开始</span>
        <span className="dtb-sub">{fmt(execution.startedAt)}</span>
        {execution.endedAt !== undefined ? (
          <>
            <span>结束</span>
            <span className="dtb-sub">{fmt(execution.endedAt)}</span>
          </>
        ) : null}
        {execution.sessionId !== undefined ? (
          <>
            <span>会话 ID</span>
            <span className="dtb-sub" style={{ wordBreak: 'break-all' }}>{execution.sessionId}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 分组渲染：active 按状态列平铺（不加第六大 Archived 列），archived 单独过滤视图
const COLUMN_ORDER: TaskStatus[] = ['backlog', 'todo', 'running', 'done', 'failed']

export function TaskBoardView(): ReactNode {
  const state = useTaskBoardState()
  const [local, setLocalRaw] = useState<BoardLocal>(INITIAL_LOCAL)
  const [refreshTick, setRefreshTick] = useState(0)
  const pendingOpen = usePendingOpenId()

  const setLocal = (patch: Partial<BoardLocal>): void => {
    setLocalRaw((prev) => ({ ...prev, ...patch }))
  }

  const groups = useMemo(() => groupBoard(state.tasks), [state.tasks])
  // PHASE B：Needs Attention = 与侧栏徽标**同一真源**（projection.attention，非空即计入）。
  //   已归档任务在 attentionOf 中恒为 null → 天然排除；running/调度中/已完成不产生 attention。
  const attentionRows = useMemo(
    () =>
      state.tasks
        .filter((p) => p.attention !== null)
        .sort((a, b) => (b.attention?.weight ?? 0) - (a.attention?.weight ?? 0)),
    [state.tasks],
  )
  const selected = state.tasks.find((p) => p.task.id === local.selectedId)

  // 外部定位：Home 点击 attention / 最近完成 → 打开任务板并选中该任务（E4-FIX-7 §二 直达）。
  useEffect(() => {
    if (pendingOpen === null) return
    setLocal({ selectedId: pendingOpen, confirmDelete: null, actionError: null, notice: null, view: 'active' })
    clearPendingOpen()
  }, [pendingOpen])

  // 打开任务（选中 + 切到 active 视图）
  const openTask = (id: string): void => {
    setLocal({ selectedId: id, confirmDelete: null, actionError: null, notice: null, view: 'active' })
  }
  const closeDetail = (): void => {
    setLocal({ selectedId: null, confirmDelete: null, actionError: null, notice: null })
  }

  const doRefresh = (): void => {
    const r = reconcileStore
    if (!r) return
    void r.refresh().then(() => setRefreshTick((n) => n + 1))
  }

  const openConversation = (sessionId: string): void => {
    openSessionFn?.(sessionId)
  }

  // TASK-13：标为已处理（仅本层标记；官方记录不变）→ notice 触发重渲染即可刷新 missed 列表
  const handleAckMissed = (taskId: string, at: number): void => {
    try {
      personalTasksStore.ackMissed(taskId, at)
      setLocal({ notice: '已标为已处理：不再列入「错过的时间」（仅本层标记，官方执行记录不变）。' })
    } catch {
      setLocal({ actionError: '本地标记写入失败，请重试。' })
    }
  }

  const runAction = (kind: ActionKind, taskId: string): void => {
    // cancel-delete 内部态
    if (kind === 'cancel-delete') {
      setLocal({ confirmDelete: null, actionError: null })
      return
    }
    const client = actionClient
    const r = reconcileStore
    if (!client || !r) {
      setLocal({ actionError: '任务板客户端未就绪' })
      return
    }
    // delete 需要确认态两击（第一击不执行）
    if (kind === 'delete') {
      if (local.confirmDelete !== taskId) {
        setLocal({ confirmDelete: taskId, actionError: null, notice: null })
        return
      }
    }
    const task = state.tasks.find((p) => p.task.id === taskId)?.task
    setLocal({ busyTaskId: taskId, actionError: null, notice: null, confirmDelete: kind === 'delete' ? null : local.confirmDelete })
    const dispatch = async (): Promise<void> => {
      try {
        let snapshot: TaskBoardSnapshot | null = null
        let successNotice: string | null = null
        switch (kind) {
          case 'run':
            snapshot = await client.run(taskId)
            break
          case 'rerun':
            snapshot = await client.rerun(taskId)
            break
          case 'archive':
            snapshot = await client.archive(taskId)
            break
          case 'restore':
            snapshot = await client.restore(taskId)
            break
          case 'delete':
            snapshot = await client.delete(taskId)
            break
          case 'confirm-permission':
            snapshot = await client.confirmPermission(taskId)
            break
          case 'move-backlog':
            snapshot = await client.move(taskId, 'backlog')
            break
          case 'move-todo':
            snapshot = await client.move(taskId, 'todo')
            break
          case 'disable-schedule':
            snapshot = await client.disableSchedule(taskId)
            successNotice = '周期已停用：不再自动到期执行（任务与历史保留，之后可再启用）。'
            break
          case 'enable-schedule': {
            const cron = task?.schedule?.cron
            if (!cron) {
              setLocal({ busyTaskId: null, actionError: '该任务没有可启用的周期规则（官方账本未提供）。' })
              return
            }
            snapshot = await client.enableSchedule(taskId, cron)
            successNotice = '周期已启用：宿主将在应用内按周期自动执行（仅在 DeepSeek Harness 运行时触发）。'
            break
          }
          case 'stop': {
            const execSessionId = task?.executions.find((e) => e.endedAt === undefined)?.sessionId
            if (!execSessionId) {
              setLocal({ busyTaskId: null, actionError: '该执行尚未绑定会话，无法停止（请稍后重试或到官方会话内停止）' })
              return
            }
            // D3：真实 Stop/Cancel —— 先做能力探测，再走官方 session cancel
            const stopped = await stopExecution(execSessionId)
            if (!stopped.ok) {
              setLocal({ busyTaskId: null, actionError: stopped.error ?? '停止失败（官方能力不可用），请到官方会话内停止' })
              return
            }
            setLocal({ busyTaskId: null, notice: '停止请求已发送：任务将由宿主确认后归位（回到待办）。' })
            void r.refresh()
            return
          }
        }
        if (snapshot !== null) {
          r.ingest(snapshot)
          setLocal({ busyTaskId: null, confirmDelete: null, notice: successNotice })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setLocal({ busyTaskId: null, actionError: message })
      }
    }
    void dispatch()
  }

  return (
    <div className="dtb-root" data-dsh-plugin="dsh-personal-workspace" data-e4fix-board="1">
      <div className="dtb-h">
        任务板
        <span className="dtb-sub">Task Control</span>
        <button type="button" className="dtb-act" style={{ marginLeft: 'auto' }} onClick={doRefresh} disabled={!state.ready}>
          刷新
        </button>
      </div>
      <SourceBadges state={state} />

      {local.selectedId === null ? (
        <>
          {/* Active / Archived 过滤（E4-FIX-5：不加第六大列） */}
          <div className="dtb-toolbar">
            <button type="button" className={`dtb-toggle${local.view === 'active' ? ' on' : ''}`} onClick={() => setLocal({ view: 'active', actionError: null })}>
              Active（{groups.active.length}）
            </button>
            <button type="button" className={`dtb-toggle${local.view === 'archived' ? ' on' : ''}`} onClick={() => setLocal({ view: 'archived', actionError: null })}>
              Archived / History（{groups.archived.length}）
            </button>
            <button
              type="button"
              className={`dtb-toggle${local.view === 'attention' ? ' on' : ''}`}
              data-dtb-attention-toggle="1"
              onClick={() => setLocal({ view: 'attention', actionError: null })}
            >
              需要处理（{attentionRows.length}）
            </button>
            <span className="dtb-k">点击卡片查看与控制任务</span>
          </div>

          {!state.ready ? (
            <div className="dtb-empty">正在读取任务板…（无数据时不猜测）</div>
          ) : !state.hostReachable ? (
            <div className="dtb-empty">任务板宿主不可用 —— 请确认官方任务板已启用后刷新。</div>
          ) : local.view === 'active' ? (
            <ActiveColumns projected={groups.active} onOpen={openTask} />
          ) : local.view === 'attention' ? (
            // 需要处理：只列真实需要人介入的任务（失败 / 权限确认 / 宿主错误）。
            <div className="dtb-group" data-dtb-attention="1">
              {attentionRows.length === 0 ? (
                <div className="dtb-empty">当前没有需要你处理的任务（失败 / 需权限确认 / 宿主错误才会出现在这里）。</div>
              ) : (
                attentionRows.map((p) => <TaskCardView key={p.task.id} p={p} onOpen={openTask} />)
              )}
            </div>
          ) : (
            <div className="dtb-group">
              {groups.archived.length === 0 ? (
                <div className="dtb-empty">没有已归档任务（归档 = 官方账本 archivedAt；会话归档不改变任务状态）。</div>
              ) : (
                groups.archived.map((p) => <TaskCardView key={p.task.id} p={p} onOpen={openTask} />)
              )}
            </div>
          )}
        </>
      ) : selected === undefined ? (
        <div className="dtb-empty">
          任务不存在（可能已被删除或归档）。
          <button type="button" className="dtb-act" style={{ marginLeft: 8 }} onClick={closeDetail}>返回列表</button>
        </div>
      ) : (
        <Detail
          p={selected}
          state={state}
          local={local}
          onBack={closeDetail}
          runAction={runAction}
          openConversation={openConversation}
          onAckMissed={handleAckMissed}
        />
      )}
      {local.notice ? <div className="dtb-note" data-dsh-action-notice="1">{local.notice}</div> : null}
    </div>
  )
}

function ActiveColumns({ projected, onOpen }: { projected: ProjectedTask[]; onOpen: (id: string) => void }): ReactNode {
  const byStatus = new Map<TaskStatus, ProjectedTask[]>()
  for (const status of COLUMN_ORDER) byStatus.set(status, [])
  for (const p of projected) {
    const list = byStatus.get(p.task.status as TaskStatus)
    if (list) list.push(p)
    else byStatus.set(p.task.status as TaskStatus, [p])
  }
  return (
    <>
      {COLUMN_ORDER.map((status) => {
        const list = byStatus.get(status) ?? []
        if (list.length === 0) return null
        return (
          <div className="dtb-group" key={status} data-dsh-column={status}>
            <span className="dtb-k">
              {STATUS_LABEL[status] ?? status} · {list.length}
            </span>
            {list.map((p) => (
              <TaskCardView key={p.task.id} p={p} onOpen={onOpen} />
            ))}
          </div>
        )
      })}
      {projected.length === 0 ? <div className="dtb-empty">任务板为空 —— 用「＋新任务」或官方 New Task 创建你的第一个任务。</div> : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Stop 能力探测（D3）：官方真实路径 = binding.session.cancel() / remote.session.cancel。
// 注入点在 index.tsx（apply 时 setStopExecutor）。
type StopResult = { ok: true } | { ok: false; error?: string }
let stopExecutor: ((sessionId: string) => Promise<StopResult>) | null = null

export function setStopExecutor(fn: ((sessionId: string) => Promise<StopResult>) | null): void {
  stopExecutor = fn
}

async function stopExecution(sessionId: string): Promise<StopResult> {
  if (stopExecutor) return stopExecutor(sessionId)
  return { ok: false, error: '停止能力未就绪' }
}

// 打开会话注入（index.tsx bind 提供，与 Home 同一 openSessionFn）
let openSessionFn: ((sessionId: string) => void) | null = null
export function setOpenSessionForBoard(fn: ((sessionId: string) => void) | null): void {
  openSessionFn = fn
}

// ---------------------------------------------------------------------------
// 供 smoke 使用的轻量自检（无 reconcile/client 时组件仍安全渲染）
export function boardHostReachable(state: TaskReconcileState): boolean {
  return state.hostReachable
}
