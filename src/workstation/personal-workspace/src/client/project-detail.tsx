// dsh-personal-workspace — Project Detail（E4-FIX-IA-2 · IA2-6）。
//
// 语义（用户收口 §39 / IA2-6）：点开某个项目 = 该项目的完整工作台视图：
//   Overview（档案 + 统计）· Tasks（该项目任务 = reconcile 真源；可打开任务板 / 移出项目 /
//   Link Existing Task）· Conversations（该项目会话 = 官方 sessions 真源按 sessionProject 反查；
//   可打开 / 移出 / Link Existing Conversation）· Workspaces（该项目关联的官方工作区；可 Link /
//   Unlink Workspace）· Activity（任务/会话最近活动时间线，派生自官方 updatedAt —— 无专门
//   activity 源，诚实投影）。操作区：New Task（打开 NewTask 面板并预选该项目）· New Conversation
//   （复用 Home Quick Start 官方链路 createConversationInProject —— 创建即归项目）。
//
// 数据源纪律：任务/会话/工作区全官方真源（reconcile / sessions.list / workspaces.list 投影）；
// 项目与关系 = projectRegistry（Personal relation layer 单一源）。只读信息（会话标题等）一律
// 官方投影；不 mock、不做假跳转；宿主/服务缺失 → 诚实空态/提示。
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { projectRegistry } from '../../../personal-registry/src/projects'
import { useProjects } from './selectors'
import { createConversationInProject, useHomeTaskState } from './home'
import { pushNewTaskProject } from './newtask'
import { archiveNoteOf, archiveTruthOf } from './projection'
import { rebindSession, rebindTask, rebindTargets, RELATION_NOTE } from './relations'
import type { ProjectedTask } from './projection'
import { sessionRowsOf, sessionDisplayName, type SessionSnapshotRow } from './projection'
import { useWorkspaceCatalog, type WorkspaceItem } from './workspace-catalog'
import { execResultView, latestExecutionOf } from './taskui'
import { personalTasksStore } from './task-model'

// ---------------------------------------------------------------------------
export const CSS_PROJECT_DETAIL = String.raw`
.dpd-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.dpd-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);display:flex;align-items:center;gap:8px;}
.dpd-back{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:1px 8px;cursor:pointer;flex:none;}
.dpd-back:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dpd-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dpd-sec{display:flex;flex-direction:column;gap:6px;}
.dpd-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);font:var(--dsw-font-xxs-12,12px);padding:2px 0;}
.dpd-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dpd-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 45%,transparent);width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer;}
.dpd-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1)) 60%,transparent);}
.dpd-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dpd-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);white-space:nowrap;}
.dpd-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#37c871;}
.dpd-dot.idle{background:var(--dsw-alias-label-dimmed,#6a6a74);}
.dpd-dot.red{background:#e85a5a;}
.dpd-tag{display:inline-flex;align-items:center;font:var(--dsw-font-xxxs-11,11px);border-radius:4px;padding:1px 5px;white-space:nowrap;flex:none;}
.dpd-tag.run{background:rgba(120,150,255,.14);color:#8aa4ff;}
.dpd-tag.done{background:rgba(55,200,113,.12);color:#37c871;}
.dpd-tag.fail{background:rgba(235,90,90,.14);color:#ff8a8a;}
.dpd-tag.arch{color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));}
.dpd-tag.perm{background:rgba(240,180,60,.14);color:#e8b64c;border:1px solid rgba(240,180,60,.35);}
.dpd-act{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:2px 9px;cursor:pointer;flex:none;}
.dpd-act:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dpd-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.dpd-in{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 50%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:6px 10px;width:100%;box-sizing:border-box;outline:none;}
.dpd-in:focus{border-color:rgba(120,150,255,.6);}
.dpd-go{border:1px solid rgba(120,150,255,.55);border-radius:8px;background:rgba(120,150,255,.14);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-strong-12,600 12px);padding:5px 14px;cursor:pointer;flex:none;}
.dpd-go:hover{background:rgba(120,150,255,.22);}
.dpd-go:disabled{opacity:.55;cursor:default;}
.dpd-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);padding:8px 10px;display:flex;flex-direction:column;gap:5px;}
.dpd-glyph{color:var(--dsw-alias-label-secondary,#c8c8d0);flex:none;}
.dpd-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;}
.dpd-count{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:4px;padding:0 6px;}
.dpd-count b{color:var(--dsw-alias-label-secondary,#c8c8d0);font-weight:600;}
.dpd-actrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.dpd-sel{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 60%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:2px 6px;max-width:240px;}
.dpd-msg{border:1px solid rgba(55,200,113,.4);background:rgba(55,200,113,.08);border-radius:8px;padding:6px 10px;font:var(--dsw-font-xxs-12,12px);line-height:1.5;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dpd-msg.err{border-color:rgba(235,90,90,.45);background:rgba(235,90,90,.08);}
`

// ---------------------------------------------------------------------------
// 当前打开的项目 id（模块级；index.tsx 的 openProjectDetail 在 openTab 前设置）。
let detailProjectId: string | null = null
const projectSubs = new Set<() => void>()
function notifyProject(): void {
  projectSubs.forEach((f) => {
    try {
      f()
    } catch {
      // ignore
    }
  })
}
export function setDetailProjectId(id: string | null): void {
  detailProjectId = id
  notifyProject()
}
export function useDetailProjectId(): string | null {
  return useSyncExternalStore(
    (f) => {
      projectSubs.add(f)
      return () => {
        projectSubs.delete(f)
      }
    },
    () => detailProjectId,
    () => null,
  )
}

// 会话全量源（Project Detail 需要完整会话列表 → 反查 sessionProject；recent 只存 60 截断）。
export interface DetailSession {
  id: string
  title: string
  running: boolean
  updatedAt?: number
  archived: boolean
}
interface DetailSessionsState {
  ready: boolean
  rows: DetailSession[]
  archivedIds: string[]
}
const EMPTY_DETAIL: DetailSessionsState = { ready: false, rows: [], archivedIds: [] }
let detailSessions: DetailSessionsState = EMPTY_DETAIL
const sessionSubs = new Set<() => void>()
function notifySessions(): void {
  sessionSubs.forEach((f) => {
    try {
      f()
    } catch {
      // ignore
    }
  })
}
function drowOf(r: SessionSnapshotRow, archived: ReadonlySet<string>): DetailSession | null {
  const id = String(r.id ?? '')
  if (!id) return null
  const title = sessionDisplayName(r)
  return { id, title, running: r.running === true, updatedAt: r.updatedAt, archived: archived.has(id) }
}

export function bindProjectDetailSessions(
  getSessions: () => unknown,
  getArchived: () => readonly string[],
): () => void {
  const offs: Array<() => void> = []
  let lastArchived: readonly string[] = []
  try {
    const svc = getSessions() as { list?: { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } }
    const source = svc?.list ?? null
    if (source && typeof source.getSnapshot === 'function' && typeof source.subscribe === 'function') {
      const apply = (): void => {
        try {
          const archived = archivedSet(lastArchived)
          const rows = sessionRowsOf(source.getSnapshot!())
            .map((r) => drowOf(r, archived))
            .filter((x): x is DetailSession => x !== null)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          detailSessions = { ready: true, rows, archivedIds: [...lastArchived] }
          notifySessions()
        } catch {
          // ignore transient parse failures
        }
      }
      apply()
      const off = source.subscribe(apply)
      if (typeof off === 'function') offs.push(off)
    } else {
      detailSessions = { ...detailSessions, ready: false, rows: [] }
      notifySessions()
    }
  } catch {
    detailSessions = { ...detailSessions, ready: false, rows: [] }
    notifySessions()
  }
  // 归档集（reconcile.archivedSessionIds 变更时重投影 archived 标志）
  const pushArchived = (): void => {
    try {
      const next = getArchived()
      if (next === lastArchived) return
      lastArchived = next
      const archived = archivedSet(next)
      detailSessions = {
        ...detailSessions,
        rows: detailSessions.rows.map((r) => ({ ...r, archived: archived.has(r.id) })),
        archivedIds: [...next],
      }
      notifySessions()
    } catch {
      // ignore
    }
  }
  pushArchived()
  // 无法订阅 reconcile → 由 index 在 reconcile 变化时显式调 refresh（见下面注入）。
  return () => {
    for (const off of offs) {
      try {
        off()
      } catch {
        // ignore
      }
    }
  }
}

export function refreshProjectDetailArchived(getArchived: () => readonly string[]): void {
  try {
    const next = getArchived()
    const archived = archivedSet(next)
    detailSessions = { ...detailSessions, rows: detailSessions.rows.map((r) => ({ ...r, archived: archived.has(r.id) })), archivedIds: [...next] }
    notifySessions()
  } catch {
    // ignore
  }
}

export function useProjectDetailSessions(): DetailSessionsState {
  return useSyncExternalStore(
    (f) => {
      sessionSubs.add(f)
      return () => {
        sessionSubs.delete(f)
      }
    },
    () => detailSessions,
    () => EMPTY_DETAIL,
  )
}

function archivedSet(ids: readonly string[]): Set<string> {
  return new Set(ids ?? [])
}

// ---------------------------------------------------------------------------
// 动作注入（index.tsx apply 时 bind）
let openSessionFn: ((id: string) => void) | null = null
let openTaskBoardFn: ((taskId: string) => void) | null = null
let openProjectCenterFn: (() => void) | null = null
let openNewTaskPanelFn: (() => void) | null = null
let openWorkspaceCenterFn: (() => void) | null = null

export function bindProjectDetailActions(actions: {
  openSession: (id: string) => void
  openTaskBoard: (taskId: string) => void
  openProjectCenter: () => void
  openNewTaskPanel: () => void
  /** IA2-8：跳到 Workspace Center（查看该工作区的完整投影）。 */
  openWorkspaceCenter: () => void
}): () => void {
  openSessionFn = actions.openSession
  openTaskBoardFn = actions.openTaskBoard
  openProjectCenterFn = actions.openProjectCenter
  openNewTaskPanelFn = actions.openNewTaskPanel
  openWorkspaceCenterFn = actions.openWorkspaceCenter
  return () => {
    openSessionFn = null
    openTaskBoardFn = null
    openProjectCenterFn = null
    openNewTaskPanelFn = null
    openWorkspaceCenterFn = null
  }
}

// ---------------------------------------------------------------------------
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

const statusLabel: Record<string, string> = {
  backlog: '待办',
  todo: '待办',
  running: '运行中',
  done: '完成',
  failed: '失败',
}

// ---------------------------------------------------------------------------
export function ProjectDetailView(): ReactNode {
  const projectId = useDetailProjectId()
  // #185 修复点：统一走 useProjects()（稳定 subscribe/getSnapshot，registry 快照已缓存）。
  const projects = useProjects()
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined
  const tasks = useHomeTaskState()
  const sessions = useProjectDetailSessions()
  const wsCat = useWorkspaceCatalog()

  // 新建会话输入（New Conversation）
  const [convText, setConvText] = useState('')
  const [convBusy, setConvBusy] = useState(false)
  const [convMsg, setConvMsg] = useState<string | null>(null)
  // Link selectors
  const [linkTaskId, setLinkTaskId] = useState('')
  const [linkSessionId, setLinkSessionId] = useState('')
  const [linkWorkspaceId, setLinkWorkspaceId] = useState('')
  const [linkMsg, setLinkMsg] = useState<string | null>(null)

  // PHASE I：归档来源未知时**不**把会话当「未归档」也不隐藏 —— 顶部给出诚实说明。
  const archiveTruth = archiveTruthOf({ archivedSessionIds: tasks.archivedSessionIds, workspacesSource: tasks.workspacesSource })

  // —— 派生（都是只读投影）——
  const projTasks: ProjectedTask[] = useMemo(() => {
    if (!projectId) return []
    return tasks.tasks.filter((p) => projectRegistry.projectOfTask(p.task.id) === projectId)
  }, [tasks.tasks, projectId])
  const projSessions: DetailSession[] = useMemo(() => {
    if (!projectId) return []
    return sessions.rows.filter((s) => projectRegistry.projectOfSession(s.id) === projectId)
  }, [sessions.rows, projectId])
  const projWorkspaceIds: string[] = projectId ? projectRegistry.workspacesOf(projectId) : []
  const projWorkspaces: WorkspaceItem[] = projWorkspaceIds
    .map((wid) => wsCat.items.find((w) => w.workspaceId === wid))
    .filter((w): w is WorkspaceItem => w !== undefined)

  // Link 候选：官方真源中「未归项目」的项
  const unassignedTasks = tasks.tasks.filter((p) => projectRegistry.projectOfTask(p.task.id) === undefined && p.task.status !== 'done' && !p.taskArchived)
  const unassignedSessions = sessions.rows.filter((s) => projectRegistry.projectOfSession(s.id) === undefined && !s.archived)
  const unlinkedWorkspaces = wsCat.items.filter((w) => !projWorkspaceIds.includes(w.workspaceId))

  // Activity：项目任务/会话的最近活动（官方 updatedAt 派生，诚实时间线）
  const activity = useMemo(() => {
    const items: Array<{ at: number; text: string; tag: string; kind: 'task' | 'session' }> = []
    for (const p of projTasks) {
      items.push({ at: p.task.updatedAt, text: p.task.title, tag: statusLabel[p.task.status] ?? p.task.status, kind: 'task' })
    }
    for (const s of projSessions) {
      items.push({ at: s.updatedAt ?? 0, text: s.title, tag: s.archived ? '归档' : s.running ? '运行中' : '会话', kind: 'session' })
    }
    return items
      .filter((i) => i.at > 0)
      .sort((a, b) => b.at - a.at)
      .slice(0, 8)
  }, [projTasks, projSessions])

  if (!projectId) {
    return (
      <div className="dpd-root" data-dsh-plugin="dsh-personal-workspace" data-dpd-empty="1">
        <div className="dpd-empty">尚未打开任何项目。请到「项目」面板选择一个项目查看详情。</div>
        <div className="dpd-line">
          <button type="button" className="dpd-go" onClick={() => openProjectCenterFn?.()}>
            去项目中心
          </button>
        </div>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="dpd-root" data-dsh-plugin="dsh-personal-workspace" data-dpd-gone="1">
        <div className="dpd-empty">该项目已不存在（可能已被删除）。</div>
        <div className="dpd-line">
          <button type="button" className="dpd-go" onClick={() => openProjectCenterFn?.()}>
            去项目中心
          </button>
        </div>
      </div>
    )
  }

  const runNewConversation = async (): Promise<void> => {
    const t = convText.trim()
    if (!t) return
    setConvBusy(true)
    setConvMsg(null)
    try {
      const res = await createConversationInProject(t, project.id)
      if (res.ok) {
        setConvText('')
        setConvMsg(res.message && res.message.length > 0 ? res.message : '已在该项目下打开新会话。')
      } else {
        setConvMsg(res.message || '会话创建失败，请重试。')
      }
    } catch (e) {
      setConvMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setConvBusy(false)
    }
  }

  const doLinkTask = (): void => {
    if (!linkTaskId || !projectId) return
    try {
      projectRegistry.assignTask(linkTaskId, projectId)
      setLinkTaskId('')
      setLinkMsg('任务已归入该项目。')
    } catch (e) {
      setLinkMsg(e instanceof Error ? e.message : String(e))
    }
  }
  const doLinkSession = (): void => {
    if (!linkSessionId || !projectId) return
    try {
      projectRegistry.assignSession(linkSessionId, projectId)
      setLinkSessionId('')
      setLinkMsg('会话已归入该项目。')
    } catch (e) {
      setLinkMsg(e instanceof Error ? e.message : String(e))
    }
  }
  const doLinkWorkspace = (): void => {
    if (!linkWorkspaceId || !projectId) return
    try {
      projectRegistry.linkWorkspace(projectId, linkWorkspaceId)
      setLinkWorkspaceId('')
      setLinkMsg('工作区已关联到该项目。')
    } catch (e) {
      setLinkMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="dpd-root" data-dsh-plugin="dsh-personal-workspace" data-dpd-detail="1" data-project-id={project.id}>
      {/* Overview */}
      <div className="dpd-line">
        <button type="button" className="dpd-back" onClick={() => openProjectCenterFn?.()} title="返回项目中心">
          ‹ 项目
        </button>
        <span className="dpd-h">
          <span className="dpd-glyph">{project.glyph}</span>
          <span>{project.name}</span>
          {project.seed ? <span className="dpd-tag arch" style={{ borderStyle: 'dashed' }}>内置</span> : null}
        </span>
      </div>
      {project.description ? <div className="dpd-note" style={{ borderLeft: 'none', paddingLeft: 0 }}>{project.description}</div> : null}
      {archiveNoteOf(archiveTruth) !== '' ? (
        <div className="dpd-note" data-dpd-archive-unknown="1" style={{ borderLeftColor: 'rgba(235,170,90,.5)' }}>
          {archiveNoteOf(archiveTruth)}
        </div>
      ) : null}
      <div className="dpd-note" data-dpd-relation-note="1" style={{ borderLeftColor: 'rgba(120,150,255,.4)' }}>
        {RELATION_NOTE}
      </div>
      <div className="dpd-meta">
        <span className="dpd-count">任务 <b>{projTasks.length}</b></span>
        <span className="dpd-count">会话 <b>{projSessions.length}</b></span>
        <span className="dpd-count">工作区 <b>{projWorkspaces.length}</b></span>
      </div>

      {/* 操作区：New Task / New Conversation */}
      <section className="dpd-sec" data-dpd-actions="1">
        <div className="dpd-k">开始新东西</div>
        <div className="dpd-actrow">
          <button
            type="button"
            className="dpd-go"
            onClick={() => {
              // PHASE E 修复（§3.4）：项目预选走模块态 + 事件双通道 —— 面板若尚未挂载，
              //   事件会丢失（旧 bug：Project Detail → 新任务 丢预选）；模块态在挂载时消费。
              pushNewTaskProject(project.id)
              openNewTaskPanelFn?.()
            }}
            data-dpd-new-task="1"
          >
            ＋ 在此项目新建任务
          </button>
          <span className="dpd-sub">打开「新任务」并已选中该项目</span>
        </div>
        <div className="dpd-card" data-dpd-new-conv="1">
          <div className="dpd-sub">在该项目下开始一段新会话（官方链路，创建即归入项目）</div>
          <div className="dpd-line">
            <input
              className="dpd-in"
              placeholder="用一句话告诉它你想做什么…"
              value={convText}
              onChange={(e) => setConvText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runNewConversation()
              }}
              aria-label="该项目下的新会话目标"
            />
            <button type="button" className="dpd-go" onClick={() => void runNewConversation()} disabled={convBusy}>
              {convBusy ? '创建中…' : '开始'}
            </button>
          </div>
          {convMsg ? (
            <div className={`dpd-msg${convMsg.startsWith('会话创建失败') || convMsg.includes('失败') ? ' err' : ''}`} role="status">
              {convMsg}
            </div>
          ) : null}
        </div>
      </section>

      {/* Tasks */}
      <section className="dpd-sec" data-dpd-tasks="1">
        <div className="dpd-k">任务 · {projTasks.length}</div>
        {tasks.ready && !tasks.hostReachable ? (
          <div className="dpd-empty">任务板宿主不可达，无法读取该项目的任务。</div>
        ) : !tasks.ready ? (
          <div className="dpd-empty">正在读取任务板…</div>
        ) : projTasks.length === 0 ? (
          <div className="dpd-empty">该项目还没有任务。点上方「在此项目新建任务」，或在任务板上把任务归入该项目。</div>
        ) : (
          projTasks.slice(0, 20).map((p) => {
            // TASK-9：任务结果/会话上下文引用 —— 最近执行摘要 + 结果会话/来源会话入口（官方内容不复制）
            const latestRun = latestExecutionOf(p.task.executions)
            const latestView = execResultView(latestRun)
            const runSessionId = latestRun?.sessionId
            const origin = personalTasksStore.originOf(p.task.id)
            const refSessionId = runSessionId ?? origin?.sessionId
            return (
              <div className="dpd-row" key={p.task.id}>
                <span className={`dpd-dot${p.task.status === 'running' ? '' : p.task.attention !== null ? ' red' : ' idle'}`} />
                <span className="dpd-t">{p.task.title}</span>
                {p.attach?.archived || p.taskArchived ? <span className="dpd-tag arch">归档</span> : null}
                {p.attention?.kind === 'confirm-permission' ? <span className="dpd-tag perm">需确认权限</span> : null}
                <span className="dpd-sub">{statusLabel[p.task.status] ?? p.task.status}</span>
                {latestView !== null ? (
                  <span
                    className={`dpd-tag ${latestView.kind === 'running' ? 'run' : latestView.kind === 'succeeded' ? 'done' : latestView.kind === 'failed' ? 'fail' : 'arch'}`}
                    data-dpd-task-result="1"
                    title="最近一次执行结果（官方执行记录摘要；完整历史在任务板详情）"
                  >
                    {latestView.text}
                  </span>
                ) : null}
                {origin !== undefined ? (
                  <span className="dpd-tag arch" data-dpd-task-origin="1" title={`由会话「${origin.title ?? '官方会话'}」创建（内容保留在官方会话）`}>
                    源自会话
                  </span>
                ) : null}
                <span className="dpd-sub">{ago(p.task.updatedAt)}</span>
                <span className="dpd-act" role="button" tabIndex={0} data-dpd-task-open="1"
                  onClick={(e) => { e.stopPropagation(); openTaskBoardFn?.(p.task.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openTaskBoardFn?.(p.task.id) } }}>
                  任务板
                </span>
                {refSessionId !== undefined ? (
                  <span className="dpd-act" role="button" tabIndex={0} data-dpd-task-ref-session="1"
                    title={origin !== undefined && runSessionId === undefined ? '打开创建该任务的来源会话' : '打开最近一次执行所在的官方会话'}
                    onClick={(e) => { e.stopPropagation(); openSessionFn?.(refSessionId as string) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openSessionFn?.(refSessionId as string) } }}>
                    {origin !== undefined && runSessionId === undefined ? '来源' : '执行会话'}
                  </span>
                ) : null}
                {/* PHASE F（§16-§21）：关系可**改挂**（不只移出）—— Task↔Project 仅 Personal 关系层。 */}
                <select
                  className="dpd-sel"
                  data-dpd-task-rebind="1"
                  aria-label={`把任务「${p.task.title}」改挂到其他项目`}
                  value=""
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const target = e.target.value
                    if (target === '') return
                    const r = rebindTask(projectRegistry, p.task.id, target, (pid) => projects.find((x) => x.id === pid)?.name)
                    setLinkMsg(r.message)
                  }}
                >
                  <option value="">改挂到…</option>
                  {rebindTargets(projects, projectId).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.glyph} {x.name}
                    </option>
                  ))}
                </select>
                <span className="dpd-act" role="button" tabIndex={0} data-dpd-task-unassign="1"
                  onClick={(e) => { e.stopPropagation(); try { projectRegistry.unassignTask(p.task.id); setLinkMsg('任务已移出该项目（回到未归入）。') } catch (err) { setLinkMsg(err instanceof Error ? err.message : String(err)) } }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); try { projectRegistry.unassignTask(p.task.id); setLinkMsg('任务已移出该项目（回到未归入）。') } catch (err) { setLinkMsg(err instanceof Error ? err.message : String(err)) } } }}>
                  移出
                </span>
              </div>
            )
          })
        )}
        {/* Link Existing Task */}
        <div className="dpd-card" data-dpd-link-task="1">
          <div className="dpd-sub">Link Existing Task：把任务板上的未归入任务关联进来</div>
          {unassignedTasks.length === 0 ? (
            <div className="dpd-empty">没有可关联的未归入任务（任务板已空或都已归入项目）。</div>
          ) : (
            <div className="dpd-line">
              <select className="dpd-sel" value={linkTaskId} onChange={(e) => setLinkTaskId(e.target.value)} aria-label="选择要关联的任务">
                <option value="">选择任务…</option>
                {unassignedTasks.slice(0, 50).map((p) => (
                  <option key={p.task.id} value={p.task.id}>
                    {p.task.title}
                  </option>
                ))}
              </select>
              <button type="button" className="dpd-go" onClick={doLinkTask} disabled={!linkTaskId}>
                关联
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Conversations */}
      <section className="dpd-sec" data-dpd-conversations="1">
        <div className="dpd-k">会话 · {projSessions.length}</div>
        {!sessions.ready ? (
          <div className="dpd-empty">会话数据暂不可用，刷新重试。</div>
        ) : projSessions.length === 0 ? (
          <div className="dpd-empty">该项目还没有会话。可点上方「开始新会话」，或把已有会话关联进来。</div>
        ) : (
          projSessions.slice(0, 20).map((s) => (
            <div className="dpd-row" key={s.id}>
              <span className={`dpd-dot${s.running ? '' : s.archived ? ' idle' : ' idle'}`} />
              <span className="dpd-t">{s.title}</span>
              {s.archived ? <span className="dpd-tag arch">已归档</span> : null}
              {s.running ? <span className="dpd-sub">运行中</span> : null}
              {s.updatedAt ? <span className="dpd-sub">{ago(s.updatedAt)}</span> : null}
              <span className="dpd-act" role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); openSessionFn?.(s.id) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openSessionFn?.(s.id) } }}>
                打开
              </span>
              <select
                className="dpd-sel"
                data-dpd-conv-rebind="1"
                aria-label={`把会话「${s.title}」改挂到其他项目`}
                value=""
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const target = e.target.value
                  if (target === '') return
                  const r = rebindSession(projectRegistry, s.id, target, (pid) => projects.find((x) => x.id === pid)?.name)
                  setLinkMsg(r.message)
                }}
              >
                <option value="">改挂到…</option>
                {rebindTargets(projects, projectId).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.glyph} {x.name}
                  </option>
                ))}
              </select>
              <span className="dpd-act" role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); try { projectRegistry.unassignSession(s.id); setLinkMsg('会话已移出该项目。') } catch (err) { setLinkMsg(err instanceof Error ? err.message : String(err)) } }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); try { projectRegistry.unassignSession(s.id); setLinkMsg('会话已移出该项目。') } catch (err) { setLinkMsg(err instanceof Error ? err.message : String(err)) } } }}>
                移出
              </span>
            </div>
          ))
        )}
        {/* Link Existing Conversation */}
        <div className="dpd-card" data-dpd-link-conv="1">
          <div className="dpd-sub">Link Existing Conversation：把已有会话关联进该项目</div>
          {unassignedSessions.length === 0 ? (
            <div className="dpd-empty">没有可关联的未归入会话（官方会话都已归入项目，或数据未就绪）。</div>
          ) : (
            <div className="dpd-line">
              <select className="dpd-sel" value={linkSessionId} onChange={(e) => setLinkSessionId(e.target.value)} aria-label="选择要关联的会话">
                <option value="">选择会话…</option>
                {unassignedSessions.slice(0, 50).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <button type="button" className="dpd-go" onClick={doLinkSession} disabled={!linkSessionId}>
                关联
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Workspaces */}
      <section className="dpd-sec" data-dpd-workspaces="1">
        <div className="dpd-k">工作区 · {projWorkspaces.length}</div>
        {projWorkspaces.length === 0 ? (
          <div className="dpd-empty">该项目尚未关联工作区。关联后可在「工作区」面板查看 AI 在这些真实目录里工作。</div>
        ) : (
          projWorkspaces.map((w) => (
            <div className="dpd-row static" key={w.workspaceId}>
              <span className="dpd-dot idle" />
              <span className="dpd-t">{w.title}</span>
              <span className="dpd-sub">{w.path}</span>
              <span className="dpd-sub">{w.sessionIds.length > 0 ? `${w.sessionIds.length} 会话` : '0 会话'}</span>
              <span className="dpd-act" role="button" tabIndex={0} data-dpd-ws-center="1"
                onClick={(e) => { e.stopPropagation(); try { openWorkspaceCenterFn?.() } catch { /* best-effort */ } }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); try { openWorkspaceCenterFn?.() } catch { /* best-effort */ } } }}>
                工作区
              </span>
              <span className="dpd-act" role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); try { projectRegistry.unlinkWorkspace(project.id, w.workspaceId); setLinkMsg('已解除该工作区关联。') } catch (err) { setLinkMsg(err instanceof Error ? err.message : String(err)) } }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); try { projectRegistry.unlinkWorkspace(project.id, w.workspaceId); setLinkMsg('已解除该工作区关联。') } catch (err) { setLinkMsg(err instanceof Error ? err.message : String(err)) } } }}>
                解除
              </span>
            </div>
          ))
        )}
        {/* Link Workspace */}
        <div className="dpd-card" data-dpd-link-ws="1">
          <div className="dpd-sub">Link Workspace：关联一个官方真实工作区目录</div>
          {!wsCat.ready ? (
            <div className="dpd-empty" data-dpd-ws-state={wsCat.probing ? 'probing' : 'unavailable'}>
              {wsCat.probing
                ? '工作区数据读取中…（正在探测官方 workspaces 服务）'
                : '官方工作区能力不可用（capability limitation）：本环境未提供 workspaces 服务，故无法关联真实工作区；不会伪造目录。'}
            </div>
          ) : unlinkedWorkspaces.length === 0 ? (
            <div className="dpd-empty">所有官方工作区都已关联到该项目（或当前没有可用工作区）。</div>
          ) : (
            <div className="dpd-line">
              <select className="dpd-sel" value={linkWorkspaceId} onChange={(e) => setLinkWorkspaceId(e.target.value)} aria-label="选择要关联的工作区">
                <option value="">选择工作区…</option>
                {unlinkedWorkspaces.map((w) => (
                  <option key={w.workspaceId} value={w.workspaceId}>
                    {w.title}
                  </option>
                ))}
              </select>
              <button type="button" className="dpd-go" onClick={doLinkWorkspace} disabled={!linkWorkspaceId}>
                关联
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Activity */}
      <section className="dpd-sec" data-dpd-activity="1">
        <div className="dpd-k">最近活动 · Activity</div>
        {activity.length === 0 ? (
          <div className="dpd-empty">该项目还没有可展示的活动。</div>
        ) : (
          activity.map((a, i) => (
            <div className="dpd-row" key={`${a.kind}-${i}-${a.at}`}>
              <span className={`dpd-dot${a.kind === 'task' ? (a.tag === '运行中' ? '' : ' idle') : ' idle'}`} />
              <span className="dpd-t">{a.text}</span>
              <span className="dpd-tag">{a.kind === 'task' ? '任务' : '会话'}</span>
              <span className="dpd-sub">{a.tag}</span>
              <span className="dpd-sub">{ago(a.at)}</span>
            </div>
          ))
        )}
      </section>

      {linkMsg ? (
        <div className="dpd-msg" role="status" data-dpd-link-msg="1">
          {linkMsg}
        </div>
      ) : null}

      <div className="dpd-note">
        项目关联的是 Host 侧真实 id；任务/会话/工作区本体及其状态一律以官方为准，本项目只做归类（可在上方移出/关联调整）。
      </div>
    </div>
  )
}
