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

// ---------------------------------------------------------------------------
// 会话行状态点（用户 2026-09-14 收口）：
//   运作 = 旋转圈 / 需要我审批或介入 = 黄色闪烁 / 完成（空闲）= 绿点。
//   真源两条，**都是会话级真相**，都不是 Task 字段（守住 CONV_SCOPE_NOTE 的红线）：
//     ① 官方 `sessions.list.running`（会话活动真相；本模块已投影为 row.running）
//     ② 官方 `uiSession.pendingInteractions`（Map<sessionId, PendingApproval|PendingQuestion>，
//        Host 侧 `provideRoot({hooks:{sessionPendingInteraction}})` 暴露的同一份 store）
//   优先级：待交互 > 运行中 —— 需要你介入的状态必须盖过“它在忙”的状态，
//   否则界面会告诉你“AI 在干活”，而真相是“AI 在等你”。
// ---------------------------------------------------------------------------

/** 官方待交互对象（防御式只取展示需要的字段）。 */
export interface PendingInteractionLike {
  /** 'approval'（审批）/ 'question'（提问）/ 'plan-review'（计划复核）… */
  kind?: string
  /** 审批：请求决策的工具名。 */
  toolName?: string
  /** 审批：请求方给的人类可读原因。 */
  reason?: string
  /** 提问：问题列表。 */
  questions?: unknown[]
}

/**
 * 会话行状态（UI 只认这五种）。
 *   running     = 旋转圈（正在运作）
 *   waiting     = 黄闪（需要你审批 / 介入）
 *   interrupted = 紫点（**被 Quick Stop 中断，且你还没重新打开看过**；打开即消失）
 *   done        = 绿点（**本次观察到它刚结束，且你还没点开看过**；点开即消失）
 *   idle        = **不画点**（已结束的历史会话）
 *
 * 2026-09-14 用户收口（修正）：旧口径把 idle 画成常驻绿点，导致 3 天 / 7 天 / 9 天前的
 * 会话全都挂着绿点 —— 「点进去看完了就该消掉」。故绿点改为**未查看的完成态**，
 * 历史会话一律不画点。
 *
 * 2026-09-18 V1.2-I（G9/G10 原文）：紫色是 **UNSEEN INTERRUPTED INDICATOR**，
 * 表示「用户主动暂时停止，后续可能继续」——**不是** error / failed / cancelled / completed，
 * 也**不是**永久状态装饰（打开即消失，与绿点同款未查看语义）。
 */
export type ConversationDotState = 'running' | 'waiting' | 'done' | 'idle' | 'interrupted'

/**
 * 官方「可见」待交互种类（**照抄**宿主规则，源码证据：`@deepseek-ai/dsh-client-ui-workspace/lib/client.js`
 * `visiblePendingKind(kind)` —— 只认 approval / plan-review / question，其余返回 undefined）。
 * 用途：官方 store 里还可能存在别的内部 kind；那些**不**算「需要你」，侧栏不得据此报警。
 */
const VISIBLE_PENDING_KINDS: ReadonlySet<string> = new Set(['approval', 'plan-review', 'question'])

/** 该待交互是否属于官方会呈现给用户的种类（未知 kind → 否，与宿主逐字同判）。 */
export function isVisiblePendingKind(kind: unknown): boolean {
  return typeof kind === 'string' && VISIBLE_PENDING_KINDS.has(kind)
}

/**
 * 官方 pendingInteractions 快照 → 只保留「可读且官方可见」的 Map。
 * 非 Map / 异常 / 未知 kind → 丢弃（不伪造「需要你」；宁可少报，不可虚报）。
 */
export function pendingSessions(pending: unknown): ReadonlyMap<string, PendingInteractionLike> {
  const out = new Map<string, PendingInteractionLike>()
  if (pending === null || typeof pending !== 'object') return out
  // **刻意不用 `instanceof Map`**：官方这份 store 的 Map 可能来自另一个 realm（跨 realm 的
  // `instanceof` 恒为 false，会把"读得到"误判成"读不到"）。官方自己也是直接 `.get()`，
  // 这里按**结构**认 Map（有 entries() 即可），读不到 → 空 Map（诚实降级）。
  const entries = (pending as { entries?: unknown }).entries
  if (typeof entries !== 'function') return out
  let list: Iterable<[unknown, unknown]>
  try {
    list = (entries as () => Iterable<[unknown, unknown]>).call(pending)
  } catch {
    return out
  }
  for (const [sessionId, interaction] of list) {
    if (typeof sessionId !== 'string' || sessionId === '') continue
    const raw = (interaction ?? {}) as PendingInteractionLike
    if (!isVisiblePendingKind(raw.kind)) continue
    out.set(sessionId, raw)
  }
  return out
}

/**
 * 待交互 store 的「晚注册」有界探测：官方 `uiSession` 服务若晚于侧栏挂载出现，
 * 只重试**探测服务本身**（不是轮询数据）；超限即放弃 → UI 诚实降级为 running/idle。
 * 10 × 800ms ≈ 8s，覆盖宿主启动窗口，不产生持续后台开销。
 */
export const PENDING_ATTACH_TRIES = 10
export const PENDING_ATTACH_MS = 800

/** 两份待交互快照是否等价（逐会话比对交互对象身份）—— 避免无变化的订阅回调触发重渲染。 */
export function samePendingSessions(
  left: ReadonlyMap<string, PendingInteractionLike>,
  right: ReadonlyMap<string, PendingInteractionLike>,
): boolean {
  if (left === right) return true
  if (left.size !== right.size) return false
  for (const [sessionId, interaction] of left) if (right.get(sessionId) !== interaction) return false
  return true
}

/**
 * 一行会话的状态点（纯函数）。
 *   · 该会话有待交互（审批 / 提问）→ 'waiting'（黄色闪烁；盖过 running）
 *   · 否则官方 running → 'running'（旋转圈）
 *   · 否则若「刚结束且未查看」→ 'done'（绿点）
 *   · 否则 → 'idle'（**不画点**）
 *
 * `unseenDone` 由 trackUnseenCompletions 观察得出（不在这里猜，也不读时钟）。
 */
export function conversationDotState(
  row: ConversationRow,
  pending: ReadonlyMap<string, PendingInteractionLike>,
  unseenDone = false,
  interruptedUnread = false,
): ConversationDotState {
  if (pending.has(row.id)) return 'waiting'
  if (row.running === true) return 'running'
  if (interruptedUnread === true) return 'interrupted'
  return unseenDone ? 'done' : 'idle'
}

// ---------------------------------------------------------------------------
// 「未查看的完成态」观察器（纯函数，可 headless 断言）
//
// 为什么需要观察而非派生：宿主快照只能告诉我们「现在没在跑」，分不出
// 「刚刚结束」与「三个月前就结束了」。故用**前一次 running 快照**做转变检测：
//   · 只有被观察到 running → 非 running 的会话才进入 unseen（历史会话永不复活绿点）
//   · 待交互中的会话不算完成（那是黄闪的活，不是绿点）
//   · 集合按当前行剪枝，不会无限增长
// 本模块仍是纯投影：不读时钟、不写 localStorage（持久化由渲染层决定）。

/** 观察器状态：上一次的 running 快照 + 未查看的完成集。 */
export interface ConvCompletionTrack {
  prevRunning: ReadonlyMap<string, boolean>
  unseen: ReadonlySet<string>
}

export const EMPTY_COMPLETION_TRACK: ConvCompletionTrack = { prevRunning: new Map(), unseen: new Set() }

/**
 * 推进观察器（纯函数）。返回**同一对象**（引用相等）表示无变化 —— 渲染层据此避免无谓重渲染。
 */
export function trackUnseenCompletions(
  track: ConvCompletionTrack,
  rows: readonly ConversationRow[],
  pending: ReadonlyMap<string, PendingInteractionLike>,
): ConvCompletionTrack {
  const prevRunning = new Map<string, boolean>()
  const unseen = new Set<string>()
  let changed = rows.length !== track.prevRunning.size
  for (const row of rows) {
    const was = track.prevRunning.get(row.id)
    const isRunning = row.running === true
    prevRunning.set(row.id, isRunning)
    if (was !== isRunning) changed = true
    // 转变检测：观察到「之前在跑 → 现在不跑」且不在待交互 → 未查看的完成
    const justFinished = was === true && !isRunning && !pending.has(row.id)
    if (justFinished) {
      unseen.add(row.id)
      if (!track.unseen.has(row.id)) changed = true
    } else if (track.unseen.has(row.id)) {
      unseen.add(row.id) // 保留既有未查看态（剪枝到当前行）
      changed = true
    }
  }
  if (!changed) return track
  return { prevRunning, unseen }
}

/** 标记某会话已查看（点开一行即调用）；未在集中 → 原样返回（引用相等）。 */
export function markConversationSeen(track: ConvCompletionTrack, id: string): ConvCompletionTrack {
  if (!track.unseen.has(id)) return track
  const unseen = new Set(track.unseen)
  unseen.delete(id)
  return { prevRunning: track.prevRunning, unseen }
}

/** 状态点的 aria/tooltip 文案（黄闪时给**真实原因**；信息缺失绝不编造）。 */
export function conversationDotNote(
  state: ConversationDotState,
  interaction: PendingInteractionLike | undefined,
): string {
  if (state === 'running') return '运作中'
  if (state === 'interrupted') return '上次被快速停止；你还没打开看过（打开后此点消失）'
  if (state === 'done') return '已完成（你还没打开看过；打开后此点消失）'
  if (state === 'idle') return '已结束（当前没在做事）'
  const kind = interaction?.kind
  if (kind === 'approval') {
    const tool = typeof interaction?.toolName === 'string' && interaction.toolName !== '' ? interaction.toolName : ''
    const reason = typeof interaction?.reason === 'string' && interaction.reason !== '' ? `：${interaction.reason}` : ''
    return tool !== '' ? `需要你审批（${tool}）${reason}` : '需要你审批'
  }
  if (Array.isArray(interaction?.questions)) {
    const n = interaction.questions.length
    return n > 0 ? `需要你回答（${n} 个问题）` : '需要你回答'
  }
  return kind === 'question' || kind === 'plan-review' ? '需要你回答' : '需要你介入'
}

/**
 * 状态点 class（CSS 名与状态一一对应；DOM 断言与真机取证都读 data-conv-state）。
 * idle 仍保留类名（历史断言/取证用），但渲染层对 idle **不挂点**。
 */
export const CONVERSATION_DOT_CLASS: Record<ConversationDotState, string> = {
  running: 'dps-conv-run',
  waiting: 'dps-conv-wait',
  done: 'dps-conv-done',
  idle: 'dps-conv-idle',
  interrupted: 'dps-conv-int',
}

/** Sidebar 默认显示的会话数（§10）；超出部分折叠为「展开其余 N 个会话」。 */
export const DEFAULT_VISIBLE = 5

/** §27 空态文案与入口。 */
export const CONV_EMPTY_TEXT = '暂无最近会话'
export const CONV_EMPTY_CTA = '去主页开始会话'

/** §11 归档源未知时的诚实说明（未知 ≠ 未归档）。 */
export const CONV_ARCHIVE_UNKNOWN_NOTE = '归档状态未知：官方 workspaces（归档来源）未就绪，本列表未按归档过滤。'

/** §4 明示：本列表只承载 Conversation，不承载 Task。 */
export const CONV_SCOPE_NOTE = '这里只是会话入口（恢复对话）；任务状态/需要处理在任务看板。'

/**
 * V1.2-C · 后台执行会话隔离的诚实说明（未知 ≠ 无）。
 * 账本读不到 ⇒ 我们**什么都没隐藏**，必须说出来，不得让用户以为「列表已经干净了」。
 */
export const CONV_BACKGROUND_UNKNOWN_NOTE =
  '后台任务会话状态未知：任务看板的执行记录当前读不到，本列表**未**按后台任务过滤。'

/** V1.2-C · 已过滤时的计数说明（隐藏 ≠ 删除）。 */
export function convBackgroundHiddenNote(hidden: number): string {
  return hidden > 0 ? `已隐藏 ${hidden} 个后台任务会话（未删除，可在任务→执行历史打开）` : ''
}

/** V1.2-C · 开关文案。关闭 = 隐藏（**默认**，用户痛点即「列表被每晚任务刷乱」）。 */
export const CONV_BACKGROUND_TOGGLE_HIDE = '隐藏后台任务会话'
export const CONV_BACKGROUND_TOGGLE_SHOW = '显示后台任务会话'

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
