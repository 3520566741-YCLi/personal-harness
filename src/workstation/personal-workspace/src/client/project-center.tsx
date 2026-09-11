// dsh-personal-workspace — Project Center（E4-FIX-IA-2 · IA2-5）。
//
// 语义（用户收口 §39 / IA2-5）：
//   PROJECT CENTER = 「我的项目」（registry 并集：种子内置 + 用户自建，可在此新建）+ 每项目
//   关联概览（任务计数 = reconcile 真源；工作区计数 = 关系层）+ **Unassigned**（官方任务板中
//   尚未归入任何项目的活跃任务 → 点击定位到任务板处理）。
//   项目行点击打开 Project Detail（面板由 IA2-6 注册；此前保持静态、不做假跳转 —— 诚实降级）。
//   Project Detail 的 Link Existing / 重新归类 / 会话与工作区详情在 IA2-6。
//
// 数据源：projects = projectRegistry（Personal relation layer 单一源，IA2-1）；tasks =
//   reconcile（官方 task-board Host 真源，Home/Board 同源 —— bindHomeTaskSource 已在 index
//   绑定，此处经 useHomeTaskState 复用同一实例，避免第二份 reconcile）。
import { useRef, useState, type ReactNode } from 'react'
import { projectRegistry } from '../../../personal-registry/src/projects'
import { useProjects } from './selectors'
import { useHomeTaskState } from './home'
import { useProjectDetailSessions } from './project-detail'
import { unassignedCounts } from './relations'
import type { ProjectedTask } from './projection'

// ---------------------------------------------------------------------------
export const CSS_PROJECT_CENTER = String.raw`
.dpc-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.dpc-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dpc-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dpc-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);padding:8px 10px;display:flex;flex-direction:column;gap:5px;}
.dpc-sec{display:flex;flex-direction:column;gap:6px;}
.dpc-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);font:var(--dsw-font-xxs-12,12px);padding:2px 0;}
.dpc-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dpc-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 45%,transparent);width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer;}
.dpc-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1)) 60%,transparent);}
.dpc-row.static{cursor:default;}
.dpc-glyph{width:18px;text-align:center;flex:none;color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dpc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.dpc-name{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dpc-name b{color:var(--dsw-alias-label-primary,#e8e8ec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dpc-seed{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:4px;padding:0 5px;flex:none;}
.dpc-desc{color:var(--dsw-alias-label-secondary,#c8c8d0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dpc-meta{display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap;}
.dpc-count{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:4px;padding:0 6px;white-space:nowrap;}
.dpc-count b{color:var(--dsw-alias-label-secondary,#c8c8d0);font-weight:600;}
.dpc-arrow{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxs-12,12px);flex:none;}
.dpc-newbtn{border:1px solid rgba(120,150,255,.5);border-radius:6px;background:rgba(120,150,255,.1);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:3px 10px;cursor:pointer;align-self:flex-start;}
.dpc-newbtn:hover{background:rgba(120,150,255,.2);}
.dpc-in{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 50%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:4px 8px;min-width:140px;box-sizing:border-box;width:100%;}
.dpc-in:focus{border-color:rgba(120,150,255,.6);outline:none;}
.dpc-newline{display:flex;gap:8px;align-items:center;}
.dpc-act{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:2px 9px;cursor:pointer;flex:none;}
.dpc-act:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dpc-tag{display:inline-flex;align-items:center;font:var(--dsw-font-xxxs-11,11px);border-radius:4px;padding:1px 5px;white-space:nowrap;flex:none;}
.dpc-tag.run{background:rgba(120,150,255,.14);color:#8aa4ff;}
.dpc-tag.attn{background:rgba(240,180,60,.14);color:#e8b64c;border:1px solid rgba(240,180,60,.3);}
.dpc-tag.done{background:rgba(55,200,113,.12);color:#37c871;}
`

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

/** 任务是否“活跃”（IA2-10 一致口径：已归档任务 → 离开活跃流；任务 done → 完成；
 *  执行会话已归档但任务仍在 running/执行中 → 仍算活跃（合法组合，Home② 也在显示），
 *  仅“会话已归档且任务空闲”的历史任务不计入。 */
function isActive(p: ProjectedTask, archived: ReadonlySet<string>): boolean {
  void archived
  if (p.taskArchived) return false
  if (p.task.status === 'done') return false
  const open = p.task.status === 'running' || p.task.executions.some((e) => e.endedAt === undefined)
  if (p.attach?.archived && !open) return false
  return true
}

export function ProjectCenterView(): ReactNode {
  const projects = useProjects()
  const tasks = useHomeTaskState()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busyNew, setBusyNew] = useState(false)
  const [newErr, setNewErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const archivedSet = new Set(tasks.archivedSessionIds)
  const hostDown = tasks.ready && !tasks.hostReachable
  // PHASE F（§20）：Unassigned 是合法状态 → 项目面板必须给出**任务 + 会话**计数与入口。
  const sessions = useProjectDetailSessions()
  const counts = unassignedCounts(
    tasks.tasks.map((p) => ({ id: p.task.id })),
    sessions.rows.map((s) => ({ id: s.id })),
    { projectOfTask: (id) => projectRegistry.projectOfTask(id), projectOfSession: (id) => projectRegistry.projectOfSession(id) },
  )

  const countsByProject = new Map<string, { active: number; all: number }>()
  const unassigned: ProjectedTask[] = []
  for (const p of tasks.tasks) {
    const pid = projectRegistry.projectOfTask(p.task.id)
    if (pid === undefined) {
      if (isActive(p, archivedSet)) unassigned.push(p)
      continue
    }
    const c = countsByProject.get(pid) ?? { active: 0, all: 0 }
    c.all += 1
    if (isActive(p, archivedSet)) c.active += 1
    countsByProject.set(pid, c)
  }
  unassigned.sort((a, b) => b.task.updatedAt - a.task.updatedAt)

  const create = (): void => {
    const n = name.trim()
    if (!n) {
      setNewErr('项目名称不能为空')
      return
    }
    setBusyNew(true)
    setNewErr(null)
    try {
      const rec = projectRegistry.createProject({ name: n, description: desc.trim() || undefined })
      setNotice(`已创建项目「${rec.name}」。点击卡片进入详情后可关联任务/会话/工作区。`)
      setNewOpen(false)
      setName('')
      setDesc('')
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyNew(false)
    }
  }

  return (
    <div className="dpc-root" data-dsh-plugin="dsh-personal-workspace" data-dpc-project-center="1">
      <div className="dpc-h">项目 · Project Center</div>

      {/* 我的项目（registry 并集） */}
      <section className="dpc-sec" data-dpc-projects="1">
        <div className="dpc-k">我的项目（{projects.length}）</div>
        {projects.length === 0 ? (
          <div className="dpc-empty">还没有项目。新建一个，把长期在做的事情放进来。</div>
        ) : (
          projects.map((p) => {
            const c = countsByProject.get(p.id) ?? { active: 0, all: 0 }
            const wsCount = projectRegistry.workspacesOf(p.id).length
            return (
              <button
                type="button"
                className="dpc-row"
                key={p.id}
                data-dpc-project-row="1"
                data-project-id={p.id}
                onClick={() => openProjectDetail(p.id)}
                title="打开项目详情（任务/会话/工作区/活动 + 关联操作）"
              >
                <span className="dpc-glyph">{p.glyph ?? '·'}</span>
                <span className="dpc-main">
                  <span className="dpc-name">
                    <b>{p.name}</b>
                    {p.seed ? <span className="dpc-seed">内置</span> : null}
                  </span>
                  {p.description ? <span className="dpc-desc">{p.description}</span> : null}
                  <span className="dpc-meta">
                    <span className="dpc-count">
                      任务 <b>{c.active}</b>
                      {c.all !== c.active ? <span> / {c.all}</span> : null}
                    </span>
                    <span className="dpc-count">
                      工作区 <b>{wsCount}</b>
                    </span>
                  </span>
                </span>
                <span className="dpc-arrow">›</span>
              </button>
            )
          })
        )}

        {!newOpen ? (
          <button type="button" className="dpc-newbtn" onClick={() => setNewOpen(true)} data-dpc-new-open="1">
            ＋ 新建项目
          </button>
        ) : (
          <span className="dpc-card" data-dpc-new-form="1">
            <input
              ref={inputRef}
              className="dpc-in"
              placeholder="项目名称 *"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
              }}
              aria-label="新项目名称"
            />
            <input
              className="dpc-in"
              placeholder="一句话描述（可选）"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
              }}
              aria-label="新项目描述"
            />
            <span className="dpc-newline">
              <button type="button" className="dpc-newbtn" onClick={create} disabled={busyNew}>
                {busyNew ? '创建中…' : '创建项目'}
              </button>
              <button type="button" className="dpc-act" onClick={() => setNewOpen(false)}>
                取消
              </button>
            </span>
            {newErr ? <div className="dpc-empty">{newErr}</div> : null}
          </span>
        )}
        {notice ? (
          <div className="dpc-note" role="status" data-dpc-notice="1">
            {notice}
          </div>
        ) : null}
      </section>

      {/* Unassigned：官方任务板中尚未归入项目的活跃任务 */}
      <section className="dpc-sec" data-dpc-unassigned="1">
        <div className="dpc-k">
          未归入项目 · Unassigned（任务 {tasks.ready ? counts.tasks : '未知'} · 会话 {sessions.ready ? counts.sessions : '未知'}）
        </div>
        <button
          type="button"
          className="dpc-row"
          data-dpc-unassigned-entry="1"
          onClick={() => {
            if (openUnassignedFn === null) {
              setNotice('「未分配」视图当前不可用（中央主区未就绪）—— 可先在任务板上处理。')
              return
            }
            openUnassignedFn()
          }}
        >
          <span className="dpc-glyph">＊</span>
          <span className="dpc-main">
            <span className="dpc-name">
              <b>查看未分配</b>
            </span>
            <span className="dpc-desc">把未归入项目的任务/会话归入某个项目（关系层操作，不改官方数据）</span>
          </span>
          <span className="dpc-act">打开</span>
        </button>
        {hostDown ? (
          <div className="dpc-empty">任务板宿主不可达，暂时无法读取未归类任务。</div>
        ) : !tasks.ready ? (
          <div className="dpc-empty">正在读取任务板…</div>
        ) : unassigned.length === 0 ? (
          <div className="dpc-empty">任务板上的活跃任务都已归入项目（或暂无任务）。</div>
        ) : (
          unassigned.slice(0, 8).map((p) => {
            const statusTag =
              p.task.status === 'running' ? (
                <span className="dpc-tag run">运行中</span>
              ) : p.attention !== null ? (
                <span className="dpc-tag attn">需处理</span>
              ) : null
            return (
              <button
                type="button"
                className="dpc-row"
                key={p.task.id}
                data-dpc-unassigned-row="1"
                onClick={() => openBoardAt(p.task.id)}
                title="在任务板查看/归类"
              >
                <span className="dpc-main" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <span className="dpc-name" style={{ flex: 1 }}>
                    <b>{p.task.title}</b>
                  </span>
                  {statusTag}
                  <span className="dpc-note" style={{ borderLeft: 'none', padding: 0 }}>
                    {ago(p.task.updatedAt)}
                  </span>
                </span>
                <span className="dpc-act">任务板</span>
              </button>
            )
          })
        )}
        <div className="dpc-note">
          已归入项目的任务在各项目卡片计数；在任务板上（或项目详情 IA2-6）可重新归类。
        </div>
      </section>
    </div>
  )
}

let openTaskBoardFn: ((taskId: string) => void) | null = null
let openProjectDetailFn: ((projectId: string) => void) | null = null
// PHASE F：Unassigned 入口（Main 视图）—— 由 index.tsx 注入 navigateMain('unassigned')。
let openUnassignedFn: (() => void) | null = null

/** index.tsx 在 apply 时注入「任务板定位」动作（与 Home 同一注入点）。 */
export function bindProjectCenterAction(openTaskBoard: ((taskId: string) => void) | null): () => void {
  openTaskBoardFn = openTaskBoard
  return () => {
    openTaskBoardFn = null
  }
}

/** index.tsx 注入「打开 Project Detail 面板」动作（IA2-6；详情面板由 project-detail.tsx 承载）。 */
export function bindProjectCenterUnassigned(openUnassigned: (() => void) | null): () => void {
  openUnassignedFn = openUnassigned
  return () => {
    openUnassignedFn = null
  }
}

export function bindProjectCenterDetail(openProjectDetail: ((projectId: string) => void) | null): () => void {
  openProjectDetailFn = openProjectDetail
  return () => {
    openProjectDetailFn = null
  }
}

function openBoardAt(taskId: string): void {
  try {
    openTaskBoardFn?.(taskId)
  } catch {
    // best-effort: Board tab may be unavailable
  }
}

function openProjectDetail(projectId: string): void {
  try {
    openProjectDetailFn?.(projectId)
  } catch {
    // best-effort: detail panel may be unavailable
  }
}
