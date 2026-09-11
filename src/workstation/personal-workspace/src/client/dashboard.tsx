// dsh-personal-workspace — Dashboard overview view (first custom workspace
// view, hosted as a better-sidebar tab). Static registry data + notes;
// richer live data arrives in later stages.
// V1.1 Phase 1 E1: Agent/Project 数据改读个人层单一数据源（personal-registry），不再本地硬编码清单。
import type { ReactNode } from 'react'
import { BASE_VIEWS } from './registry'
import { AGENT_CATALOG, PROJECT_CATALOG } from '../../../personal-registry/src/index'

const AGENTS = AGENT_CATALOG.map((a) => a.name)
const PROJECTS = PROJECT_CATALOG.map((p) => [p.name, p.zh] as const)

export const CSS_WS = String.raw`
.dpw-root { padding: 10px 12px; font: var(--dsw-font-xxs-12, 12px); color: var(--dsw-alias-label-primary); user-select: none; }
.dpw-title { font: var(--dsw-font-s-strong-14, 600 13px); margin-bottom: 4px; }
.dpw-sub { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11, 11px); margin-bottom: 10px; }
.dpw-group { margin: 8px 0 3px; font: var(--dsw-font-xxxs-strong-11, 600 11px); letter-spacing: .06em; color: var(--dsw-alias-label-tertiary); }
.dpw-chip { display: inline-block; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); border-radius: 6px; padding: 2px 7px; margin: 2px 4px 2px 0; }
.dpw-row { display: flex; gap: 6px; align-items: baseline; padding: 2px 0; }
.dpw-row b { color: var(--dsw-alias-label-primary); }
.dpw-muted { color: var(--dsw-alias-label-dimmed); }
.dpw-note { margin-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2)); padding-top: 8px; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11, 11px); line-height: 1.6; }
`

export function DashboardView(): ReactNode {
  const workbench = BASE_VIEWS.filter((v) => v.kind === 'workbench').map((v) => v.title).join(' / ')
  return (
    <div className="dpw-root" data-dsh-plugin="dsh-personal-workspace">
      <div className="dpw-title">Personal Dashboard</div>
      <div className="dpw-sub">Workspace Host v1 · Chat 仍是中央默认视图</div>

      <div className="dpw-group">Agents（{AGENT_CATALOG.length} 原生预设）</div>
      <div>{AGENTS.map((a) => <span className="dpw-chip" key={a}>{a}</span>)}</div>

      <div className="dpw-group">Projects（{PROJECT_CATALOG.length} 档案）</div>
      {PROJECTS.map(([n, zh]) => (
        <div className="dpw-row" key={n}><b>{n}</b><span className="dpw-muted">{zh}</span></div>
      ))}

      <div className="dpw-group">Workspace 视图</div>
      <div className="dpw-row"><b>Chat</b><span className="dpw-muted">官方默认中央视图</span></div>
      <div className="dpw-row"><b>工作台</b><span className="dpw-muted">{workbench}（better-sidebar 内建）</span></div>

      <div className="dpw-note">
        本视图 = 首块 Generated Workspace App 雏形（STAGE 5）。⌘I HUD / Personal 侧栏 / 官方浏览不受影响。
        设计系统方向待定（ADR-008）；中央多视图接管与 Monaco/dock 按需后置。
      </div>
    </div>
  )
}
