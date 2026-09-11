// dsh-personal-sidebar — Sidebar「会话列表」投影（E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST）。
//
// 产品职责（用户 2026-09-10 决策）：Sidebar 会话列表只回答一个问题 ——
//   「我最近和 AI 聊了什么，我怎么快速回去继续？」
//   它不是 Task Dashboard / Mission Control / Execution Monitor / Attention Center / Done History。
//   因此本模块**只**投影 official Session truth，绝不携带任何 Task 字段。
//
// 数据源（硬性要求，§5）：official `sessions.list` 快照 store（Host Session Controller）。
//   本模块是**纯投影**：不建 Session DB、不写 localStorage、不做缓存、不 mock。
//   official 快照真形（源码证据：@deepseek-ai/dsh-api-session-controller/lib/client.js `projectList()`）：
//     { ids: string[], byId: Record<id, {
//         id, displayTitle, running, completed?, blank, updatedAt,
//         projectionValues?, title?, cwd?, parentId?, origin? }>,
//       current?: string, phase, subagentsByParent, jobsBySession, currentAddress }
//   · `updatedAt` = 官方注释「Advance Session-list activity from one user-authored durable message」
//     → 即「最近一次用户交互时间」，正是 §9 要求的“最能表示最近交互”的字段（已审计而非猜测）。
//   · `displayTitle` = 官方派生（durable title → cwd basename → 原始 id）。
//   · `current` = 当前活动会话 id → §7 的 selected state 必须基于它（真实身份，不靠标题判断）。
//
// 可见性规则与官方会话浏览器一致（源码证据：dsh-client-ui-workspace/lib/client.js
//   `sessionVisible(session, current, archived)` = `origin !== 'subagent'` && 未归档 &&
//   (`!blank || id === current`））。排序同样沿用官方 `byRecency`（updatedAt desc，id 决胜负）。
//
// 归档（§11）：唯一真源 = official `workspaces.list.archivedSessionIds`（与 workspace 插件同源）。
//   源不可读 → **未知 ≠ 未归档**：默认不隐藏任何行，并如实标注「归档状态未知」。
//
// React-free / 可 headless（scripts/smoke-sidebar-conversations.mjs）。

/** 官方会话快照行（只取本模块需要的字段，防御式解析）。 */
export interface ConversationRow {
  id: string
  /** 显示名（displayTitle 优先；官方派生含 durable title → cwd basename → id）。 */
  title: string
  /** 最近一次用户交互时间（官方 `updatedAt`）。 */
  updatedAt: number
  running: boolean
  /** 官方 blank = 该会话尚无内容（官方只显示 current 的那一个）。 */
  blank: boolean
  /** 父会话（official lineage）。 */
  parentId?: string
  /** subagent 子会话（不进 Sidebar 会话列表）。 */
  origin?: string
  /** 官方 cwd（Workspace context；只做展示，不伪造）。 */
  cwd?: string
}

export interface ConversationSnapshot {
  rows: ConversationRow[]
  /** 当前活动会话 id（官方 `current`）→ selected state 的唯一依据。 */
  currentId?: string
  /** store 是否已就绪（未就绪 → 「读取中」，而不是「暂无会话」）。 */
  ready: boolean
}

export const EMPTY_CONVERSATIONS: ConversationSnapshot = { rows: [], ready: false }

/** Sidebar 默认显示的会话数（§10）；超出部分折叠为「展开其余 N 个会话」。 */
export const DEFAULT_VISIBLE = 5

/** §27 空态文案与入口。 */
export const CONV_EMPTY_TEXT = '暂无最近会话'
export const CONV_EMPTY_CTA = '去主页开始会话'

/** §11 归档源未知时的诚实说明（未知 ≠ 未归档）。 */
export const CONV_ARCHIVE_UNKNOWN_NOTE = '归档状态未知：官方 workspaces（归档来源）未就绪，本列表未按归档过滤。'

/** §4 明示：本列表只承载 Conversation，不承载 Task。 */
export const CONV_SCOPE_NOTE = '这里只是会话入口（恢复对话）；任务状态/需要处理在任务看板。'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 解析 official `sessions.list` 快照 → 行。
 * 只认官方真形（`byId`）；也兼容防御式的 array / `list` / `sessions`（旧投影形态），
 * 但绝不凭空造行（无 id → 丢弃）。
 */
export function parseConversations(snapshot: unknown): ConversationSnapshot {
  if (snapshot === null || snapshot === undefined) return EMPTY_CONVERSATIONS
  const s = snapshot as Record<string, unknown>
  const raw: unknown[] = []
  const byId = s.byId
  if (byId !== null && typeof byId === 'object' && !Array.isArray(byId)) {
    raw.push(...Object.values(byId as Record<string, unknown>))
  } else if (Array.isArray(s)) {
    raw.push(...s)
  } else if (Array.isArray(s.list)) {
    raw.push(...(s.list as unknown[]))
  } else if (Array.isArray(s.sessions)) {
    raw.push(...(s.sessions as unknown[]))
  } else {
    return EMPTY_CONVERSATIONS
  }
  const rows: ConversationRow[] = []
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>
    const id = str(r.id) || str(r.sessionId)
    if (id === '') continue
    const displayTitle = str(r.displayTitle)
    const title = str(r.title)
    const cwd = str(r.cwd)
    const fallback = cwd !== '' ? (cwd.split('/').filter(Boolean).pop() ?? cwd) : id
    rows.push({
      id,
      title: displayTitle !== '' ? displayTitle : title !== '' ? title : fallback,
      updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
      running: r.running === true,
      blank: r.blank === true,
      ...(str(r.parentId) !== '' ? { parentId: str(r.parentId) } : {}),
      ...(str(r.origin) !== '' ? { origin: str(r.origin) } : {}),
      ...(cwd !== '' ? { cwd } : {}),
    })
  }
  const currentId = str(s.current) !== '' ? str(s.current) : undefined
  return { rows, currentId, ready: true }
}

export interface ArchiveTruth {
  /** false = 归档来源不可读（未知），不得当成「没有归档会话」。 */
  known: boolean
  ids: ReadonlySet<string>
}

/** 官方归档集解析（`workspaces.list.archivedSessionIds`）；源不可读 → known:false。 */
export function archiveTruthOf(source: unknown): ArchiveTruth {
  const s = (source ?? {}) as Record<string, unknown>
  const ids = s.archivedSessionIds
  if (!Array.isArray(ids)) return { known: false, ids: new Set() }
  return { known: true, ids: new Set(ids.filter((x): x is string => typeof x === 'string')) }
}

/**
 * 可见会话（与官方 `sessionVisible` 同规则）+ 官方 recency 排序：
 *   · 排除 subagent 子会话（origin === 'subagent'）
 *   · 排除已归档会话（**仅当**归档来源可读；未知 → 不隐藏，另由 UI 标注）
 *   · 排除尚无内容的 blank 会话（官方只显示 current 的那一个）
 */
export function visibleConversations(
  snap: ConversationSnapshot,
  archive: ArchiveTruth,
): ConversationRow[] {
  const out = snap.rows.filter((r) => {
    if (r.origin === 'subagent') return false
    if (archive.known && archive.ids.has(r.id)) return false
    if (r.blank && r.id !== snap.currentId) return false
    return true
  })
  return out.sort((a, b) => (b.updatedAt !== a.updatedAt ? b.updatedAt - a.updatedAt : a.id < b.id ? -1 : 1))
}

export interface ConversationListModel {
  /** 默认显示的行（≤ DEFAULT_VISIBLE）。 */
  shown: ConversationRow[]
  /** 被折叠的其余数量（0 = 不显示「展开其余」）。 */
  hiddenCount: number
  /** 展开后的文案（§10）：`展开其余 N 个会话`。 */
  expandLabel: string
  /** 归档来源未知（UI 需如实标注，不得声称已按归档过滤）。 */
  archiveUnknown: boolean
}

/** 折叠模型（§10）：默认 DEFAULT_VISIBLE 条；超出 → 折叠计数 + 展开文案。 */
export function conversationListModel(
  rows: readonly ConversationRow[],
  archive: ArchiveTruth,
  expanded: boolean,
  limit: number = DEFAULT_VISIBLE,
): ConversationListModel {
  const shown = expanded ? [...rows] : rows.slice(0, limit)
  const hiddenCount = expanded ? 0 : Math.max(0, rows.length - limit)
  return {
    shown,
    hiddenCount,
    expandLabel: hiddenCount > 0 ? `展开其余 ${hiddenCount} 个会话` : '',
    archiveUnknown: !archive.known,
  }
}

/**
 * 人类可读相对时间（§9）：刚刚 / N 分钟 / N 小时 / N 天 / N 个月。
 * 只吃真实时间戳（官方 updatedAt）；非法/缺失 → 空串（UI 不显示假时间）。
 */
export function relativeTime(updatedAt: number, now: number): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return ''
  const diff = Math.max(0, now - updatedAt)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天`
  const months = Math.floor(days / 30)
  return `${months} 个月`
}

/** 标题单行化（§8：仅用于 title 属性/可访问名，不改变列表内 ellipsis 行为）。 */
export function clipTitle(title: string, max = 80): string {
  const t = title.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
