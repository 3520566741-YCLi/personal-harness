// dsh-personal-sidebar — V1.1 Phase 1 E1/E2 data helpers.
// E1: AGENTS / PROJECTS catalogs now come from the single data source
//     dsh-personal-registry (registry.json, bundled at build time) — no
//     catalog lists live in this file anymore.
// E2: the static AGENTS/PROJECTS/LIBRARY group catalog was removed together
//     with the old worktable pane; the sidebar is now a workflow-centered
//     navigation model (＋新任务 / 主页 / 最近 / 项目) rendered by
//     PersonalBrowser.tsx. Only session helpers remain here.

export interface SessionLike {
  id: string
  title?: string
  label?: string
  running?: boolean
  updatedAt?: number
  origin?: string
}

/** Defensive adapter for whatever snapshot shape the host session list has. */
export function toSessionRows(snapshot: unknown): SessionLike[] {
  const s = snapshot as { list?: unknown; sessions?: unknown; rows?: unknown }
  const raw = Array.isArray(s) ? s : Array.isArray(s?.list) ? s.list : Array.isArray(s?.sessions) ? s.sessions : []
  return (raw as unknown[]).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>
    const id = String(row.id ?? row.sessionId ?? '')
    if (!id) return null
    const title = typeof row.title === 'string' ? row.title : undefined
    const label = typeof row.label === 'string' ? row.label : title
    return {
      id,
      title,
      label: label && label.length > 0 ? label : '（未命名会话）',
      running: row.running === true,
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : undefined,
      origin: typeof row.origin === 'string' ? row.origin : undefined,
    }
  }).filter(Boolean) as SessionLike[]
}
