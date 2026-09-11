// dsh-personal-workspace — Unassigned（未分配）Main 视图（E4-FIX-IA-2 FINAL · PHASE F）。
//
// 语义（用户 §20）：「未归入项目」是**合法状态**，不是错误 —— 必须在项目面板有**计数与入口**，
//   并且能在这里把项**归入项目 / 移出项目**（Task↔Project、Conversation↔Project 的关系改挂）。
//   关系只写在 Personal relation 层（registry），绝不修改官方 Session/Task schema；
//   官方会话/任务的正文与状态不受影响（UI 明文写出这条边界）。
//
// 数据源全部为真源投影：任务 = reconcile（官方 task-board Host），会话 = 官方 sessions 快照。
//   宿主不可达/未就绪 → 如实说明「未知」，不显示 0 冒充（未知 ≠ 0）。
import { useMemo, useState, type ReactNode } from 'react'
import { projectRegistry } from '../../../personal-registry/src/projects'
import { useProjects } from './selectors'
import { useHomeTaskState } from './home'
import { useProjectDetailSessions } from './project-detail'
import { RELATION_NOTE, rebindSession, rebindTask, unassignedCounts, unassignedOf } from './relations'

export const CSS_UNASSIGNED = String.raw`
.dun-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.dun-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;}
.dun-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dun-sec{display:flex;flex-direction:column;gap:6px;}
.dun-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 45%,transparent);}
.dun-main{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dun-tag{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:4px;padding:0 6px;flex:none;}
.dun-sel{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 60%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:2px 6px;max-width:190px;flex:none;}
.dun-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dun-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);padding:2px 0;}
.dun-msg{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dun-count{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:4px;padding:0 6px;}
`

export function UnassignedView(): ReactNode {
  const projects = useProjects()
  const tasks = useHomeTaskState()
  const sessions = useProjectDetailSessions()
  const [msg, setMsg] = useState<string | null>(null)

  const taskRows = useMemo(
    () => unassignedOf(tasks.tasks.map((p) => ({ id: p.task.id, title: p.task.title, status: p.task.status, updatedAt: p.task.updatedAt, archived: p.taskArchived })), (id) => projectRegistry.projectOfTask(id)),
    [tasks.tasks],
  )
  const sessionRows = useMemo(
    () => unassignedOf(sessions.rows.map((s) => ({ id: s.id, title: s.title, archived: s.archived, running: s.running, updatedAt: s.updatedAt })), (id) => projectRegistry.projectOfSession(id)),
    [sessions.rows],
  )
  const counts = useMemo(
    () => unassignedCounts(
      tasks.tasks.map((p) => ({ id: p.task.id })),
      sessions.rows.map((s) => ({ id: s.id })),
      { projectOfTask: (id) => projectRegistry.projectOfTask(id), projectOfSession: (id) => projectRegistry.projectOfSession(id) },
    ),
    [tasks.tasks, sessions.rows],
  )
  // 宿主/会话源未就绪 → 「未知」，不显示 0 冒充（未知 ≠ 0）。
  const tasksUnknown = tasks.ready === false && tasks.hostReachable === false && tasks.tasks.length === 0
  const sessionsUnknown = sessions.ready === false

  const assign = (kind: 'task' | 'session', id: string, projectId: string): void => {
    // 关系变更经 registry.subscribe 广播 → useSyncExternalStore 自动重渲染（无需手工刷新）。
    const nameOf = (pid: string): string | undefined => projects.find((p) => p.id === pid)?.name
    const r = kind === 'task'
      ? rebindTask(projectRegistry, id, projectId, nameOf)
      : rebindSession(projectRegistry, id, projectId, nameOf)
    setMsg(r.message)
  }

  return (
    <div className="dun-root" data-dsh-plugin="dsh-personal-workspace" data-dun-view="1">
      <h2 className="dun-h">未分配 · Unassigned</h2>
      <div className="dun-note" data-dun-note="1">
        {RELATION_NOTE} 「未归入项目」是合法状态：不归属任何项目不影响官方任务/会话的运行与状态。
      </div>

      <section className="dun-sec" data-dun-tasks="1">
        <div className="dun-k">
          未归入项目的任务
          {tasksUnknown ? <span className="dun-count" data-dun-unknown="1"> 未知（任务宿主不可达）</span> : <span className="dun-count"> {counts.tasks}</span>}
        </div>
        {tasksUnknown ? (
          <div className="dun-empty">任务宿主不可达 → 计数为「未知」而非 0（不伪造）。请到任务看板确认宿主状态后重试。</div>
        ) : taskRows.length === 0 ? (
          <div className="dun-empty">没有未归入项目的任务（全部任务都已归入项目，或任务板为空）。</div>
        ) : (
          taskRows.map((t) => (
            <div className="dun-row" key={t.id} data-dun-task-row="1" data-dun-task-id={t.id}>
              <span className="dun-main">{t.title}</span>
              <span className="dun-tag">{t.status}</span>
              {t.archived ? <span className="dun-tag" data-dun-archived="1">已归档</span> : null}
              <select
                className="dun-sel"
                aria-label={`把任务「${t.title}」归入项目`}
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') assign('task', t.id, e.target.value)
                }}
              >
                <option value="">归入项目…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.glyph} {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </section>

      <section className="dun-sec" data-dun-sessions="1">
        <div className="dun-k">
          未归入项目的会话
          {sessionsUnknown ? <span className="dun-count" data-dun-unknown="1"> 未知（官方会话源未就绪）</span> : <span className="dun-count"> {counts.sessions}</span>}
        </div>
        {sessionsUnknown ? (
          <div className="dun-empty">官方会话快照当前不可读 → 计数为「未知」而非 0（不伪造）。</div>
        ) : sessionRows.length === 0 ? (
          <div className="dun-empty">没有未归入项目的会话。</div>
        ) : (
          sessionRows.map((s) => (
            <div className="dun-row" key={s.id} data-dun-session-row="1" data-dun-session-id={s.id}>
              <span className="dun-main">{s.title}</span>
              {s.archived ? <span className="dun-tag">归档</span> : null}
              {s.running ? <span className="dun-tag">运行中</span> : null}
              <select
                className="dun-sel"
                aria-label={`把会话「${s.title}」归入项目`}
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') assign('session', s.id, e.target.value)
                }}
              >
                <option value="">归入项目…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.glyph} {p.name}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </section>

      {msg !== null ? (
        <div className="dun-msg" role="status" data-dun-msg="1">
          {msg}
        </div>
      ) : null}
    </div>
  )
}
