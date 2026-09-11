// dsh-personal-workspace — Recent 面板（E4-FIX-IA-2 · IA2-2：一级导航「最近」的真实目标）。
//
// 语义：最近发生了什么 —— 官方 sessions 真源的「最近会话」浏览（可继续），
// 遵守 E4-FIX D6 / IA2 §27：**不把 Archived 当 Active** —— 官方已归档会话不在列表，
// 但给出诚实归档计数提示（可到官方会话浏览查看/恢复）；任务状态以 Host 为准，本面板不改任务。
// 数据：官方 sessions.list 快照（与 Home 同源）+ reconcile.archivedSessionIds（workspaces 源）。
// 不做任何本地“最近”假状态。
import { useSyncExternalStore, type ReactNode } from 'react'
import type { TaskReconcile } from './reconcile'
import { archiveNoteOf, archiveTruthOf, sessionRowsOf, type SessionSnapshotRow } from './projection'
import { pushNewTaskSession } from './newtask'

// ---------------------------------------------------------------------------
// CSS（与 Home dhm-* / NewTask dnt-* 同设计语言）
export const CSS_RECENT = String.raw`
.drc-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.drc-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);}
.drc-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);}
.drc-row{display:flex;align-items:center;gap:8px;width:100%;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 45%,transparent);padding:6px 8px;text-align:left;color:inherit;font:inherit;cursor:pointer;}
.drc-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1)) 60%,transparent);}
.drc-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#37c871;}
.drc-dot.idle{background:var(--dsw-alias-label-dimmed,#6a6a74);}
.drc-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.drc-time{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);white-space:nowrap;flex:none;}
.drc-act{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:2px 9px;cursor:pointer;flex:none;}
.drc-act:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.drc-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);font:var(--dsw-font-xxs-12,12px);padding:2px 0;line-height:1.5;}
.drc-badge{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:20px;padding:1px 8px;align-self:flex-start;}
.drc-badge.warn{border-color:rgba(240,180,60,.4);color:#e0b96a;}
.drc-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
`

// ---------------------------------------------------------------------------
// 会话源（同 Home attachFeed 同构：官方 sessions.list 快照）
export interface RecentSession {
  id: string
  title: string
  running: boolean
  updatedAt?: number
}
interface RecentState {
  ready: boolean
  rows: RecentSession[]
  archivedIds: string[]
  /** PHASE I：归档来源是否可读（false = 未知，不得当作「没有归档」）。 */
  archiveKnown: boolean
  archiveReady: boolean
}
const EMPTY_STATE: RecentState = { ready: false, rows: [], archivedIds: [], archiveKnown: false, archiveReady: false }

let recentState: RecentState = EMPTY_STATE
const subs = new Set<() => void>()
function notify(): void {
  subs.forEach((f) => {
    try {
      f()
    } catch {
      // ignore
    }
  })
}

function rowOf(r: SessionSnapshotRow): RecentSession | null {
  const id = String(r.id ?? '')
  if (!id) return null
  const title = r.displayTitle ?? r.title ?? ''
  return { id, title: title.length > 0 ? title : '（未命名会话）', running: r.running === true, updatedAt: r.updatedAt }
}

function applySessions(snapshot: unknown): void {
  const rows = sessionRowsOf(snapshot)
    .map(rowOf)
    .filter((x): x is RecentSession => x !== null)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 200)
  recentState = { ...recentState, ready: true, rows }
  notify()
}

function applyArchive(truth: { known: boolean; ids: ReadonlySet<string> }): void {
  // PHASE I：未知 ≠ 空集 —— archiveKnown=false 时列表**不**按归档过滤（不隐藏、不误判）。
  recentState = { ...recentState, archiveReady: true, archiveKnown: truth.known, archivedIds: [...truth.ids] }
  notify()
}

let openSessionFn: ((id: string) => void) | null = null
let createTaskFn: (() => void) | null = null

/**
 * index.tsx apply 时绑定：官方 sessions 快照 + reconcile（archivedSessionIds）+ 打开动作。
 * openNewTask（可选）：TASK-7「从会话建任务」打开 New Task 面板的动作（Personal 不做内容推断，
 * 只把官方会话引用带给 Composer，正文留在官方会话）。
 * 返回释放函数。
 */
export function bindRecentServices(
  getSessions: () => unknown,
  reconcile: TaskReconcile | null,
  openSession: (id: string) => void,
  openNewTask?: () => void,
): () => void {
  openSessionFn = openSession
  createTaskFn = openNewTask ?? null
  const offs: Array<() => void> = []
  try {
    const svc = getSessions() as { list?: { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } }
    const source = svc?.list ?? null
    if (source && typeof source.getSnapshot === 'function' && typeof source.subscribe === 'function') {
      const apply = (): void => {
        try {
          applySessions(source.getSnapshot!())
        } catch {
          // ignore transient parse failures
        }
      }
      apply()
      const off = source.subscribe(apply)
      if (typeof off === 'function') offs.push(off)
    } else {
      recentState = { ...recentState, ready: false, rows: [] }
      notify()
    }
  } catch {
    recentState = { ...recentState, ready: false, rows: [] }
    notify()
  }
  if (reconcile) {
    const push = (): void => {
      try {
        const st = reconcile.getState()
        applyArchive(archiveTruthOf({ archivedSessionIds: st.archivedSessionIds, workspacesSource: st.workspacesSource }))
      } catch {
        // ignore
      }
    }
    push()
    offs.push(reconcile.subscribe(push))
  }
  return () => {
    for (const off of offs) {
      try {
        off()
      } catch {
        // ignore
      }
    }
    openSessionFn = null
    createTaskFn = null
  }
}

export function useRecentState(): RecentState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
    () => recentState,
    () => EMPTY_STATE,
  )
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

export function RecentView(): ReactNode {
  const state = useRecentState()
  const archived = new Set(state.archivedIds)
  // 来源未知 → 不过滤（并给出明确说明），绝不把未知当「未归档」也不静默隐藏。
  const shown = (state.archiveKnown ? state.rows.filter((r) => !archived.has(r.id)) : state.rows).slice(0, 14)
  const open = (id: string): void => {
    try {
      openSessionFn?.(id)
    } catch {
      // opening is best-effort
    }
  }
  // TASK-7：从会话建任务 —— 保守检测（不做内容推断）：把官方会话引用带给 Composer，
  // 用户写清要做的事后创建；Personal 不伪造“AI 判断”。
  const makeTask = (s: RecentSession): void => {
    try {
      pushNewTaskSession({ sessionId: s.id, title: s.title })
      createTaskFn?.()
    } catch {
      // best-effort
    }
  }
  return (
    <div className="drc-root" data-dsh-plugin="dsh-personal-workspace" data-dsh-recent="1">
      <div>
        <div className="drc-h">最近</div>
        <div className="drc-sub">官方真源 · 已归档会话不列在此（任务状态以宿主为准）</div>
      </div>

      {!state.ready ? (
        <div className="drc-empty">会话数据暂不可用，刷新重试。</div>
      ) : shown.length === 0 ? (
        <div className="drc-empty">
          还没有可继续的会话记录。
          {archived.size > 0 ? <span className="drc-badge" style={{ marginLeft: 8 }}>已归档会话不列在最近</span> : null}
        </div>
      ) : (
        shown.map((s) => (
          <div className="drc-row" key={s.id} role="button" tabIndex={0} onClick={() => open(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(s.id) } }}>
            <span className={`drc-dot${s.running ? '' : ' idle'}`} />
            <span className="drc-t">{s.title}</span>
            {s.running ? <span className="drc-time">运行中</span> : null}
            {s.updatedAt ? <span className="drc-time">{ago(s.updatedAt)}</span> : null}
            {!s.running ? (
              <button
                type="button"
                className="drc-act"
                title="从该会话新建任务（内容留在官方会话；请补写具体要做的事）"
                onClick={(e) => {
                  e.stopPropagation()
                  makeTask(s)
                }}
              >
                建任务
              </button>
            ) : null}
            <span className="drc-act" aria-hidden="true">
              打开
            </span>
          </div>
        ))
      )}

      {state.archiveReady && !state.archiveKnown ? (
        <span className="drc-badge warn" data-recent-archive-unknown="1">
          {archiveNoteOf({ known: false, ids: new Set() })}
        </span>
      ) : state.archiveReady && archived.size > 0 ? (
        <span className="drc-badge warn" data-recent-archived-note="1">
          官方已归档会话 N={archived.size}（不在本列表显示；到「官方会话浏览」查看/恢复，任务状态不受影响）
        </span>
      ) : null}

      <div className="drc-note">
        要开始新的会话：回「主页」用 Quick Start 输入你想做的事（可指定 项目/工作区/Agent/权限）。
      </div>
    </div>
  )
}
