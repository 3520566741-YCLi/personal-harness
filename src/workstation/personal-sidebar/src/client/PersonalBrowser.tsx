// dsh-personal-sidebar — PersonalBrowser occupant of the official
// `sidebar.workspaces` seat (E4-FIX-IA-2 · IA2-2 restructure).
//
// V1.1 P1 E2/E3/E4 的「CTA 新任务 + 主页/最近/项目 inline 页」与 IA2 早期
// 「一级导航 → better-sidebar 工作台面板」模型，均被 E4-FIX-IA-2 中央主区模型取代：
//
//   新任务     ＋ → 中央 Main Composer （图标即加号；文案不带第二加号 —— 双加号修复）
//   主页       ⌂  → 中央 Main 主页
//   项目       ▣  → 中央 Main Project Center
//   工作区     ▣  → 中央 Main Workspace Center
//   最近       ◷  → 中央 Main Recent
//   会话       ◈  → 放行官方 Conversation（occupant dispose，官方会话状态由引擎持有）
//   ──────────────────────────────
//   **左栏导航内不再有「官方会话浏览」行**（用户 2026-09-10 真机反馈：与官方 shell 页脚
//     「返回官方」功能重复，无额外价值 → 删除）。切回官方仍随时可达：
//     `sidebar.footer.action` 的「返回官方」pill（官方 shell 页脚，宽/窄都常驻）
//     + 官方会话头 utilities 行同名 pill；窄栏（rail）保留图标形切换按钮。
//   ──────────────────────────────
//   **左栏不提供** Personal Task Board 主导航行（IA 收口，2026-09-10 用户驳回改名方案后）：
//     唯一主要 Task Board 入口 = 既有第三方「任务看板」（其行上由本插件挂**真实**
//     Needs Attention 徽标，见 PHASE B）；Personal 任务板 = 辅助能力，经 Aux 标签与
//     辅助入口进入（见 NAV 上方注释）。
//   ──────────────────────────────
//   **Mini Mission Control 已整块删除**（E4-FIX-IA-2 FINAL · PHASE B）：AI 正在做什么 /
//   需要你处理 / 最近完成 / 最近会话 / 查看全部全部移除 —— 它们与中央主页 ②③④⑤ 重复，
//   属于第二份仪表盘。替代 = 「任务看板」行上的 Needs Attention 计数徽标（单一真源）。
//
// 点击模型（E4-FIX-IA-2 · MAIN NAV RUNTIME FIX —— 本轮真机失效修复核心）：
//   - 一行一个 <button data-nav>，唯一 onClick → go(n)（无第二 handler、无遮罩依赖）。
//   - 点击 = 权威动作：**同 tick** 立即高亮 + 同步 hostReady 判定 + dispatch
//     MAIN_OPEN_EVENT；workspace 同 tick 同步切换中央 occupant。不再存在
//     「等 ACK 600ms 才反应」的静默窗（旧 sendMain 的 ACK-gate 已删除）。
//   - ACK 只作事后校正（seat 注册失败→Aux）；DOM 上屏验证（[data-dsh-main-host]）
//     是最终裁决；latest-wins token：快速连点 = 最后一次胜出。
//   - host 明确不可用 → 立即 Aux 回退（conversation 目标无需 host）；绝不假装成功。
//   - 每步写 diagTrace（click/ack/verify/fallback + 时间戳）供真机取证（20×20 协议）。
//   - 不渲染任何「新会话」入口 —— Conversation 创建归 Home（§1/§2）；
//     官方 shell 顶部「＋新会话」由 index.tsx 在 personal 模式隐藏（官方模式保留）。
//   - attention 徽标不是第二数据源：计数 = workspace bundle 经 window CustomEvent（纯内存
//     广播，不落盘）推送的 reconcile/projection 派生值。宿主不可达（n=null）→ **不显示**徽标，
//     绝不把“未知”当“0 项需要处理”。
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { ClockIcon, FolderIcon, HomeIcon, PlusIcon, SwitcherIcon, WorkspaceIcon, BoardIcon, ChatIcon, AgentIcon, MemoryIcon } from './icons'
import {
  CONV_ARCHIVE_UNKNOWN_NOTE,
  CONV_EMPTY_CTA,
  CONV_EMPTY_TEXT,
  CONV_BACKGROUND_TOGGLE_HIDE,
  CONV_BACKGROUND_TOGGLE_SHOW,
  CONV_BACKGROUND_UNKNOWN_NOTE,
  CONV_SCOPE_NOTE,
  CONVERSATION_DOT_CLASS,
  DEFAULT_VISIBLE,
  EMPTY_COMPLETION_TRACK,
  PENDING_ATTACH_MS,
  PENDING_ATTACH_TRIES,
  archiveTruthOf,
  convBackgroundHiddenNote,
  conversationDotNote,
  conversationDotState,
  conversationListModel,
  markConversationSeen,
  parseConversations,
  pendingSessions,
  samePendingSessions,
  relativeTime,
  trackUnseenCompletions,
  visibleConversations,
  type ConversationRow,
  type ConversationSnapshot,
  type ConvCompletionTrack,
  type PendingInteractionLike,
} from './conversations'
// V1.2-C · 后台执行会话隔离：分类（纯投影）+ 真源读取器（只读任务板账本旁路）。
import { filterBackgroundSessions, UNKNOWN_BACKGROUND, type BackgroundTruth } from './convbackground'
import { createLedgerReader, sameBackgroundTruth } from './convledger'
// V1.2-I · 中断投影（只读宿主真源）：紫点（G10）/ 任务看板徽章计数（G11）/ 已读回执（G12）。
//   与绿点（纯内存观察器）**不同**：紫点必须跨重启仍在 ⇒ 真源是宿主文件 + 一次 HTTP 读。
import {
  clearUnread,
  createInterruptReader,
  markInterruptRead,
  sameInterruptTruth,
  UNKNOWN_INTERRUPTS,
  type InterruptTruth,
} from './interrupts'
// V1.2-I · I14「打开任务详情 ⇒ 紫点消除」的**事实来源**。
//   为什么不在自己这边加条带让用户手动 [标记已读]：需求原文（ACCEPTANCE TESTS 第 19 条逐字）
//   是「**Opening Task** clears purple unread indicator」= 打开即消除；那条路意味着"打开不消除、
//   还要再点一次"，第 19 条严格讲就不成立。用户 2026-09-18 就 D8 裁定走第三方补丁，正是此因。
//   所以这里只做两件事：**只读**第三方 DOM 拿"谁被打开了"，然后复用 I12 的 read-to-clear。
import { createTaskDetailReadWatcher } from './taskDetailRead'
// 中央 Main Workspace 事件/视图常量 —— 单一来源：personal-workspace/src/client/mainview.ts
// （纯 TS 模块；sidebar 只读常量与 isMainView，不复制第二套定义）。
import {
  MAIN_ACK_EVENT,
  MAIN_OPEN_EVENT,
  MAIN_STATE_EVENT,
  MAIN_UNAVAILABLE_EVENT,
  MAIN_VIEW_TITLES,
  type MainViewId,
} from '../../../personal-workspace/src/client/mainview'
import { diagTrace } from './diag'
// V1.2-J（J1 收起/展开 + J2 拖动排序）：用户偏好层（本机存储 + 纯排序/落点/可见行算法）。
//   默认顺序仍由本文件的 NAV 字面量定义；这里只产出「按用户序列重排后的视图」。
import {
  countVisibleThirdPartyRowsAbove,
  collapsedHiddenCount,
  applyNavOrder,
  hiddenNavIds,
  NAV_COLLAPSED_DEFAULT,
  NAV_PREFS_KEY,
  NAV_VISIBLE_WHEN_COLLAPSED,
  reorderNavIds,
  setNavCollapsed,
  setNavOrder,
  THIRD_PARTY_NAV_ROW_SELECTOR,
  useNavPrefs,
} from './navorder'
// E4-FINAL：会话行「…」菜单 = **官方 Menu/Modal/Button 与官方图标**（P1 复用），
// 三个动作 = 官方 handler（P2 复用）。本组件只持有菜单/对话框的**瞬态 UI 状态**。
import { SessionActionsMenu, SessionRenameDialog } from './sessionActions'
import {
  ProjectAssignDialog,
  applyProjectAssign,
  hasProjectBridge,
  readProjectAssignData,
  type ProjectAssignData,
} from './projectAssign'

export interface PersonalBrowserProps {
  /** Sidebar column state from the shell: true = wide content. */
  wide: boolean
  /** Ask the shell to expand from the 56px rail. */
  expandSidebar: () => void
  /** Open a session by id (host Session Controller). */
  openSession: (sessionId: string) => void
  /** Hand control of the browsing region back to the official browser. */
  switchOfficial: () => void
  /** Standard root-scope hook provided by ui-session. */
  useSessions?: (selector: (snapshot: unknown) => unknown) => unknown
  /** better-sidebar workbench service (registerTab/openTab/getTab). */
  betterSidebar?: WorkbenchHandle | null
  /**
   * E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST：official Session truth 句柄（只读投影）。
   * getSnapshot/subscribe = 官方 `sessions.list` 快照 store；archive = 官方
   * `workspaces.list.archivedSessionIds`（null = 源不可读 → 归档状态未知）；open = 官方
   * `sessions.open`。缺失（旧宿主/服务未就绪）→ 诚实降级，不伪造会话列表。
   */
  conversations?: ConversationsHandle | null
  /**
   * 会话行状态点的第二条真源（**会话级**待交互）：官方 `uiSession.pendingInteractions`
   * ——Host 用 `provideRoot({ hooks: { sessionPendingInteraction } })` 暴露的同一份 store
   * （`Map<sessionId, PendingApproval|PendingQuestion>`）。审批与提问都在里面，正是
   * 「需要我审批或介入」。缺失（旧宿主 / uiSession 未就绪）→ 只表达 running/idle，
   * **绝不**把“读不到”显示成“需要你”。
   */
  pending?: PendingInteractionsHandle | null
}

/** 官方 pendingInteractions 只读句柄（index.tsx 从 cordis 服务面构建）。 */
export interface PendingInteractionsHandle {
  getSnapshot: () => unknown
  subscribe: (fn: () => void) => () => void
}

/** official Session 只读句柄（由 index.tsx 从 cordis 服务面构建）。 */
/** 归档真值状态（与 conversations.ArchiveTruth 同形）。 */
type ArchiveTruthState = { known: boolean; ids: ReadonlySet<string> }

export interface ConversationsHandle {
  getSnapshot: () => unknown
  subscribe: (fn: () => void) => () => void
  archive: () => unknown
  /** 订阅官方归档 store；null = 服务/订阅尚不可用（调用方有界重试，不轮询数据）。 */
  subscribeArchive: (fn: () => void) => (() => void) | null
  open: (sessionId: string) => void
  /**
   * E4-FINAL · 官方 Session 菜单三动作（P2 复用：逐句照抄官方 handler）。
   * 三个方法**直接调用官方 API**，本插件不落地任何会话/归档状态：
   *   rename  → `sessions.binding(id).session.rename(title)`
   *   fork    → `sessions.fork({sessionId, increaseTitle:true})` → 子会话 id
   *   archive → `workspaces.archiveSession(id)`（归档 ≠ 删除，会话本体保留）
   * 失败一律 reject（真错误消息上抛，UI 如实呈现）；缺失（旧宿主/服务未就绪）→ UI 如实提示不可用。
   */
  rename?: (sessionId: string, title: string) => Promise<void>
  fork?: (sessionId: string) => Promise<string>
  /** 注意：这是**写动作**；上面那个 `archive()` 是只读真源读取（`workspaces.list`）。 */
  archiveSession?: (sessionId: string) => Promise<void>
}

/** Minimal handle of the better-sidebar service our occupant consumes. */
export interface WorkbenchHandle {
  getTab?: (id: string) => unknown
  openTab?: (seed: { type: string; title?: string; path?: string; id?: string }) => void
  activateTab?: (tabId: string) => void
}

// 面板 type（= better-sidebar tab id，由 dsh-personal-workspace 注册）。
const TAB_TASK_BOARD = 'task-board'
const TAB_NEW_TASK = 'new-task'
const TAB_HOME = 'mission-control'
const TAB_PROJECTS = 'project-center'
const TAB_WORKSPACES = 'workspace-center'
const TAB_RECENT = 'recent'
const TAB_AGENTS = 'agents'
/** V1.2-E2 · 记忆树：**仅主区**页面（无 aux 复制品，`tab` 留空 —— 同「会话」行的既有先例）。 */
const TAB_MEMORY = ''

class SafeBoundary extends Component<{ onFallback: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.warn('[dsh-personal-sidebar] PersonalBrowser crashed:', error)
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="dps-root dps-empty">
          Personal Sidebar 渲染出错。
          <button type="button" className="dps-link dps-link-strong" onClick={() => this.props.onFallback()}>
            <SwitcherIcon size={12} /> 切回官方会话浏览
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// E4-FIX-IA-2 FINAL · PHASE B：**Mini Mission Control 整块已删除**。
// 事件名与 workspace client/attention.ts 常量一致（跨 bundle 用字符串字面量，不 import）。
//   删除内容：AI 正在做什么 / 需要你处理 / 最近完成 / 最近会话 / 查看全部（与主页 ②③④⑤ 重复，
//   属第二份仪表盘）。替代：唯一「任务看板」入口上的**真实 Needs Attention 徽标**——
//   真源 = workspace 的 reconcile/projection 广播，**不建立第二份 attention store**；
//   N = 0 → 无徽标；宿主不可达（未知）→ 无徽标（绝不把未知当 0）；点击仍进入任务看板。
const ATTENTION_EVENT = 'dsh:personal-attention'
const ATTENTION_REQUEST_EVENT = 'dsh:personal-attention-request'
const BOARD_ENTRY_SELECTOR = '[data-dsh-taskboard-entry]'
/**
 * 既有第三方「任务看板」的**打开真值**（它自己在开板时写到 <html> 上，关板时移除；
 * 源码证据：@linxin666/dsh-client-ui-task-board `applyActive()` 写 data-dsh-taskboard-active）。
 * 它开板期间用自带 CSS 把中央栏里「非任务板」的一切 `display:none!important`：
 *   html[data-dsh-taskboard-active] [data-pane=conversation] > :not([data-dsh-taskboard-view]) { display:none!important }
 * 而它的「点侧栏行自动关板」只认官方行 class（sessionRow/projectRow/…），
 * Personal 模式这些官方行是隐藏的 → 我方导航行不在其列。
 * 结果（真机投诉）：任务板开着时点我方其它导航行 → 中央仍显示任务板、我方视图被 !important 隐藏，
 * DOM 上屏校验失败 → 用户必须先再点一次任务板才能切换。
 */
const BOARD_OPEN_ATTR = 'data-dsh-taskboard-active'

/**
 * 离开任务板：按**它自己的开关**关板（等价于用户点它自己的入口按钮），
 * 不写它的 localStorage/Host 数据、不改它的状态机、不碰它的 DOM 结构。
 * 只在它真的开着时动作；失败静默（随后我方仍会做 DOM 上屏校验并如实提示）。
 */
function closeBoardIfOpen(): void {
  try {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (root === null || !root.hasAttribute(BOARD_OPEN_ATTR)) return
    const entry = document.querySelector(BOARD_ENTRY_SELECTOR)
    // 不用 `instanceof HTMLElement`：跨 realm（iframe / 测试沙箱 / 多 document）下构造函数
    // 不同会假阴性；这里只要求它「真的可点」（有 click 方法）。
    if (entry !== null && typeof (entry as HTMLElement).click === 'function') (entry as HTMLElement).click()
  } catch {
    // 关板失败不阻断导航：上屏校验会如实报告
  }
}

/**
 * 广播快照（防御式解析；格式不符 → null = 忽略该事件）。
 * 徽标只认 `badge`（口径单一真源 = workspace 的 composeBoardBadge）：
 *   运作中（橙）+ 需要我介入 / 已失败（红）；其余状态不显示。
 */
interface BoardBadge {
  total: number
  running: number
  attention: number
  tone: 'attention' | 'running' | 'none'
}
interface AttentionSnapshot {
  ready: boolean
  hostUp: boolean
  hostError?: string
  badge: BoardBadge
}
function parseBadge(raw: unknown): BoardBadge | null {
  if (raw === null || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const total = num(b.total)
  const running = num(b.running)
  const attention = num(b.attention)
  const tone = b.tone
  if (total === null || running === null || attention === null) return null
  if (tone !== 'attention' && tone !== 'running' && tone !== 'none') return null
  return { total, running, attention, tone }
}
function adaptAttentionPayload(raw: unknown): AttentionSnapshot | null {
  const p = (raw ?? {}) as Record<string, unknown>
  if (p.v !== 1) return null
  const badge = parseBadge(p.badge)
  // 没有合法 badge 的快照一律忽略（宁可无徽标，也不显示口径不明的数字）。
  if (badge === null) return null
  return {
    ready: p.ready === true,
    hostUp: p.hostUp === true,
    hostError: typeof p.hostError === 'string' ? p.hostError : undefined,
    badge,
  }
}

// ---------------------------------------------------------------------------
// 导航：一级入口顺序 = 用户目标 Sidebar（§1）。
// main = 该行打开的是「中央 Main Workspace View」（AppFrame 中央列 seat
// conversation，由 workspace 注册的 occupant 渲染）；无 main = 走旧 Aux 面板。
interface NavItem {
  id: string
  tab: string
  path: string
  label: string
  hint: string
  icon: ReactNode
  /** 中央主区视图 id（见 personal-workspace mainview.ts MAIN_VIEWS）。 */
  main?: MainViewId
}
// IA 收口 · 决定性结论（E4-FIX-IA-2 · 真机复核 DUP-1，用户驳回「改名」方案后重审）：
//   用户原始 IA 要求 = 左侧保留**一个**主要 Task Board 入口，且不得为 Personal Task Control
//   再造第二个语义重复的主导航；Personal Task Board 属**辅助**能力，经「右上/底部 + 辅助窗口
//   （Aux）」进入。改名（任务看板/任务板）只解决字面重名，不解决「两行主导航 = 两个 Task Board
//   概念」的 IA 问题，故本插件**不再在 Primary Sidebar 提供 Task Board 行**：
//     · 左栏唯一主要 Task Board 入口 = 既有第三方「任务看板」
//       （@linxin666/dsh-client-ui-task-board 0.3.16，原生 DOM 注入 button[data-dsh-taskboard-entry]，
//        无 slot 注册；属既有产品，本轮不移除、不改名、不接管）。
//     · Personal 任务板 → Aux 标签「任务板」（registerTab）+ 左栏底部辅助入口
//       （两者仍经 BOARD_ENTRY 打开中央主区完整任务板）。
//   中央主区视图 id 仍为 'task-board'（BOARD_ENTRY.main），Task System 未做任何改动。
const NAV: NavItem[] = [
  // 双加号修复（E4-FIX-IA-2 · MAIN NAV）：行内已渲染 PlusIcon（加号图标），
  // label 若再以「＋ 」开头 = 图标加号 + 文本加号 = 视觉“＋＋新任务”（真机投诉项）。
  // 唯一加号来源 = 图标；文案仅「新任务」。
  { id: 'new-task', tab: TAB_NEW_TASK, path: 'new', label: '新任务', hint: '创建一个需要执行、跟踪、控制的任务（中央主区打开完整 New Task Composer）', icon: <PlusIcon size={18} />, main: 'new-task' },
  { id: 'home', tab: TAB_HOME, path: 'home', label: '主页', hint: 'Mission Control：我现在要做什么 / AI 在做什么（中央主区打开完整主页）', icon: <HomeIcon size={18} />, main: 'home' },
  { id: 'projects', tab: TAB_PROJECTS, path: 'center', label: '项目', hint: '我长期在搞哪些事情（中央主区打开 Project Center）', icon: <FolderIcon size={18} />, main: 'project-center' },
  { id: 'workspaces', tab: TAB_WORKSPACES, path: 'center', label: '工作区', hint: 'AI 实际在哪些真实文件/目录里工作（中央主区打开 Workspace Center）', icon: <WorkspaceIcon size={18} />, main: 'workspace-center' },
  { id: 'recent', tab: TAB_RECENT, path: 'list', label: '最近', hint: '最近发生了什么（中央主区打开 Recent）', icon: <ClockIcon size={18} />, main: 'recent' },
  { id: 'conversation', tab: '', path: '', label: '会话', hint: '回到中央 Conversation（当前会话；会话状态由官方引擎保留）', icon: <ChatIcon size={18} />, main: 'conversation' },
  // V1.2-G · Agent Center：按用户规格「会话之下」新增，且**追加在表尾**——
  // 既有行（新任务/主页/项目/工作区/最近/会话）的 id、顺序、main 目标一字未动，
  // 因此不改变任何既有跳转路径与高亮镜像（NAV_ID_OF_VIEW 亦为增量新增）。
  // 语义：会话 = 我此刻在跟谁说话；智能体 = 我有哪些能自己干活的专业主体。
  { id: 'agents', tab: TAB_AGENTS, path: 'center', label: '智能体', hint: '我有哪些专业智能体、各自能干什么（中央主区打开 Agent Center）', icon: <AgentIcon size={18} />, main: 'agent-center' },
  // V1.2-E2 · 记忆树：同样**追加在表尾**（E-1 裁定「左栏新增一条导航行」）——
  // 既有行的 id、顺序、main 目标一字未动，故不改变任何既有跳转路径与高亮镜像。
  // 语义：会话/最近看的是**官方会话真源**；记忆树看的是**跨会话记忆库**的层级结构
  // （工作区 → 会话 → 轮次），且是**只读**视图。
  { id: 'memory', tab: TAB_MEMORY, path: '', label: '记忆', hint: '跨会话记忆的层级结构（中央主区打开记忆树；只读，不改记忆库）', icon: <MemoryIcon size={18} />, main: 'memory-tree' },
]

/**
 * Personal 任务板入口（**不属于** NAV：见上方 IA 收口结论）。
 * 用途：辅助入口/aux 标签等**辅助**跳转需打开中央主区完整任务板；
 * 左栏主导航不再出现第二行 Task Board。
 */
const BOARD_ENTRY: NavItem = {
  id: 'task-board',
  tab: TAB_TASK_BOARD,
  path: 'board',
  label: '任务板',
  hint: 'Personal 任务板（辅助入口：Aux 标签 / 左栏底部辅助 / 主页）；左栏主要 Task Board 入口为「任务看板」',
  icon: <BoardIcon size={18} />,
  main: 'task-board',
}

/** 中央主区视图 → nav id（active 高亮镜像用）。 */
const NAV_ID_OF_VIEW: Partial<Record<MainViewId, string>> = {
  conversation: 'conversation',
  home: 'home',
  // 'task-board' **有意不设**：Personal 任务板无主导航行（辅助区能力），
  // 故打开它时不高亮任何主导航行——避免用高亮暗示它是第二个 Primary Entry。
  'new-task': 'new-task',
  'project-center': 'projects',
  'project-detail': 'projects',
  'workspace-center': 'workspaces',
  recent: 'recent',
  'agent-center': 'agents',
  'memory-tree': 'memory',
}

// ===========================================================================
// V1.2-J（用户原话逐字）：
//   ①「发给你的截图的列表可以收起和展开，平时只展示上面四个」
//   ②「我可以随意拖动列表里按键的顺序」
//
// 落地口径（用户已裁定，本文件照做，不再自行改）：
//   · "截图的列表" = 本插件在官方 `sidebar.workspaces` 座位上渲染的主导航行列表。
//   · 收起态**默认**、且**整条列表 3–4 行可见**：第三方「任务看板」行**计入**这四个
//     （真机渲染顺序：任务看板 → 我们的 8 行）。第三方行数量与位置由它自己决定
//     （原生 DOM 注入 + 自带 rootObserver，搬走会被插回）⇒ **运行时按实际渲染数**，
//     见 countVisibleThirdPartyRowsAbove：我方可见上限 = max(1, 4 − 上方第三方可见行数)。
//   · 收起 ≠ 卸载：行**仍在 DOM**（`data-nav` 齐全），只加 `data-nav-hidden="true"` +
//     CSS `display:none`。理由：核验套件用 `querySelectorAll('[data-nav]')` 数行并逐字断言
//     8 行顺序（scripts/smoke-nav-integration.mjs:352-353 等）——条件卸载或 slice(0,4)
//     会让这些断言 FAIL，也会让「恢复默认/顺序真源」失去可核对的行集合。
//   · 不能动第三方行：不排序它、不隐藏它、不接管它的点击。
//   · 顺序 = **运行时叠加层**：默认顺序永远由 NAV 字面量定义（scripts/smoke-v12e-memory-tree-view.mjs
//     按 NAV 的书写形状做正则断言），用户序列只决定渲染顺序。
// ===========================================================================
const NAV_ORDER_HINT = '拖动可调整顺序（只影响本机显示顺序，不改变任何数据）'
const NAV_TOGGLE_COLLAPSE = '收起'
const NAV_TOGGLE_EXPAND = '展开'
const NAV_RESTORE_DEFAULT = '恢复默认顺序'

/** 拖动落点：行的上/下半（照官方既有第三方插件 ui-workspace/lib/client.js 的判定手法）。 */
function navDropHalf(target: HTMLElement, clientY: number | undefined): 'before' | 'after' {
  if (typeof clientY !== 'number' || !Number.isFinite(clientY)) return 'before'
  const rect = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null
  const height = rect?.height ?? 0
  // jsdom / 未布局：拿不到高度 ⇒ 用元素自身已知行高（36px，见 styles.ts 同级断言）折半。
  const effective = height > 0 ? height : 36
  const top = rect !== null && height > 0 ? rect.top : 0
  return clientY < top + effective / 2 ? 'before' : 'after'
}

/** 从拖动事件里取被拖走的行 id（先取 dataTransfer，再退回模块内静态标记）。 */
function navDragFromId(event: { dataTransfer?: DataTransfer | null }): string {
  const dt = event.dataTransfer ?? null
  try {
    const raw = dt?.getData?.('application/x-dps-nav') ?? dt?.getData?.('text/plain') ?? ''
    if (typeof raw === 'string' && raw.startsWith('dps-nav:')) return raw.slice('dps-nav:'.length)
  } catch {
    // 某些环境（隐私模式/受限 dataTransfer）getData 会抛：退回静态标记
  }
  return NAV_DRAG_FROM
}

/** 模块内静态标记：原生 DnD 的最后一道保险（dataTransfer 不可用时仍然能完成一次拖动）。 */
let NAV_DRAG_FROM = ''

/**
 * 拖动结束后「click 守卫」的时间窗口（毫秒）。
 * 补发 click 与 dragend 在**同一事件批次**内到达（毫秒级），而用户"松手 → 再去点一下"至少要一个
 * 反应时间（远大于此）。窗口取值要满足：> 补发 click 的延迟，< 人的反应时间。250ms 两边都留足余量。
 * ⚠ 这个常量只用于**在 click 到达时比时间**；**不许**拿它去注册 setTimeout 清守卫（见 `go` 注释①）。
 */
const NAV_DRAG_GUARD_MS = 250

export function PersonalBrowser(props: PersonalBrowserProps): ReactNode {
  const { wide, expandSidebar, switchOfficial, betterSidebar, conversations, pending } = props
  // PHASE B：Needs Attention 计数（唯一真源 = workspace 广播；本组件不做任何派生/缓存）。
  const [attention, setAttention] = useState<AttentionSnapshot | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeNavId, setActiveNavId] = useState<string | null>(null)
  // ---------------------------------------------------------------------------
  // V1.2-J · 导航行偏好（本机存储）：收起态 + 用户行序。两个都是**偏好**，不是数据真源：
  //   读不到（隐私模式/配额）→ 默认（收起 + NAV 顺序），侧栏照常渲染。
  const navPrefs = useNavPrefs()
  const navCollapsed = navPrefs.collapsed === true
  // 收起时**上方可见第三方行数**的真实判定（读 DOM，不猜布局）。第三方行插入/移除后要重算。
  const [thirdPartyAbove, setThirdPartyAbove] = useState(0)
  const navWrapRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ from: string; target: string; half: 'before' | 'after' } | null>(null)
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  // 「刚发生过拖动」守卫：HTML5 DnD 在真浏览器里 drop 后**可能**补发一次 click，
  // 而拖动结束绝不能再触发跳转 ⇒ onClick 里第一道守卫就是它。
  // 用**时间窗口**而非"一次性标记"实现：补发 click 与 dragend 在同一批次内到达（毫秒级），
  // 而用户"松手 → 再点一下"至少要一个反应时间 ⇒ 窗口足以分开两者，边界稳。
  // 这里 `dragEndAt` 只被读来比时间，**没有任何定时器去清它**（原因见 `go` 里的注释①）。
  const dragEndAt = useRef(0)
  const [dropMark, setDropMark] = useState<{ target: string; half: 'before' | 'after' } | null>(null)
  // ---------------------------------------------------------------------------
  // E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST：会话列表（§3–§11）。
  //   数据 = official `sessions.list` 快照 store（订阅官方推送 → 创建/重命名/继续/归档即时刷新，
  //   无轮询、无第二份存储）；归档 = official `workspaces.list.archivedSessionIds`
  //   （源不可读 → 未知，不隐藏任何行并如实标注）。
  const [convSnap, setConvSnap] = useState<ConversationSnapshot>({ rows: [], ready: false })
  const [archiveKnownNow, setArchiveKnownNow] = useState<ArchiveTruthState>({ known: false, ids: new Set<string>() })
  const [convExpanded, setConvExpanded] = useState(false)
  const [convNow, setConvNow] = useState<number>(() => Date.now())
  // ---------------------------------------------------------------------------
  // V1.2-C · 后台执行会话隔离（用户痛点：每晚 23:30 的定期任务把会话列表刷乱）。
  //   分类真源 = 任务板账本 `executions[].sessionId`（只读旁路，见 convledger.ts）；
  //   过滤落点 = **投影层**（隐藏 ≠ 删除：Session 本体/官方引擎/账本一个字节都不改）。
  //   开关默认 = **隐藏**（这正是用户要的）；`backgroundShow` 只活在本组件内存里，
  //   不落盘、不写官方状态、不建第二份真源。
  const [convBackground, setConvBackground] = useState<BackgroundTruth>(UNKNOWN_BACKGROUND)
  const [backgroundShow, setBackgroundShow] = useState(false)
  useEffect(() => {
    const reader = createLedgerReader()
    return reader.start((next) => {
      setConvBackground((prev) => (sameBackgroundTruth(prev, next) ? prev : next))
    })
  }, [])
  // ---------------------------------------------------------------------------
  // V1.2-I（G9–G12）· 中断投影：紫点 / 任务看板徽章计数 / 已读回执。
  //   真源 = 宿主半 `dsh-personal-quickstop` 的中断投影（文件跨重启仍在），本组件只读。
  //   初值 = **UNKNOWN**（不是空集）：读不到时不许谎称"没有中断"（未知 ≠ 0）。
  const [interrupts, setInterrupts] = useState<InterruptTruth>(UNKNOWN_INTERRUPTS)
  useEffect(() => {
    const reader = createInterruptReader()
    return reader.start((next) => {
      setInterrupts((prev) => (sameInterruptTruth(prev, next) ? prev : next))
    })
  }, [])
  // ---------------------------------------------------------------------------
  // V1.2-J · 「上方第三方可见行数」的实时判定（只读 DOM；**不改**第三方节点）。
  //   为什么必须观测：第三方「任务看板」行由它自己的插件异步插入/移除，我们的收起逻辑要
  //   按**实际渲染**算「我方可见行数 = max(1, 4 − above)」。观测器只读、不写、不搬节点
  //   （搬走会被它的 rootObserver 插回，那正是我们不该碰的理由）。
  useEffect(() => {
    if (typeof document === 'undefined') return
    // 观测/计数范围 = 「本行列表所在的那条侧栏导航容器」：
    //   第三方「任务看板」行由它自己注入在**座位容器**里（我方 occupant 的 React root 之外，
    //   两者是兄弟），所以不能只看我方的 React root 的 parentElement —— 必须向上找到同时
    //   装着我们与它的那层。真机路径 = .dps-root →(官方 seat/regionArea)→ #sidebar；
    //   最多上溯 6 层，找不到就退回 parentElement（保守：不改自己的可见行数）。
    const climb = (start: Element | null): Element | null => {
      let node: Element | null = start
      let best: Element | null = start
      for (let i = 0; i < 6 && node !== null; i += 1) {
        best = node
        if (typeof node.querySelector === 'function' && node.querySelector(THIRD_PARTY_NAV_ROW_SELECTOR) !== null) break
        node = node.parentElement
      }
      return best
    }
    const root = climb(navWrapRef.current?.parentElement ?? null)
    if (root === null) return
    const measure = (): void => {
      const above = countVisibleThirdPartyRowsAbove(root)
      setThirdPartyAbove((prev) => (prev === above ? prev : above))
    }
    measure()
    if (typeof MutationObserver === 'undefined') return
    // **只观测子节点增删**，不观测属性：我方渲染自己会写 `data-*` 属性，若把属性也纳入观测，
    // 「观测到属性变化 → setState → 重渲染 → 再写属性」会自我循环（React 只会收敛，但会白白空转）。
    // 第三方行的出现/消失是**节点增删**；它自己被第三方插件用 style 隐藏的极端情形由 measure
    // 在每次子节点变动时重新判定兜住（不引入属性回环）。
    const observer = new MutationObserver(measure)
    observer.observe(root, { childList: true, subtree: true })
    return () => { observer.disconnect() }
  }, [])
  // 拖动结束的**文档级**兜底：命中我方行时由行自己的 onDrop/onDragEnd 提交（见 goNavDrop）；
  //   拖到列表外（第三方区域/窗口外）时也必须在**冒泡阶段**清干净视觉态（此时 target 不是
  //   我方行 ⇒ 不会去动顺序）。注意：只在 dragState 仍存在时清理，绝不抢先清掉「已落点待提交」。
  useEffect(() => {
    if (typeof document === 'undefined') return
    const doc = document
    const clearIfStale = (event: Event): void => {
      const target = event.target
      // 落点在我方行内 ⇒ 交给该行的 onDrop 处理（本监听只负责列表之外的情形）。
      if (target instanceof Element && target.closest(NAV_ROW_SELECTOR) !== null) return
      if (dragState.current !== null) {
        dragState.current = null
        setDragFrom(null)
        setDropMark(null)
      }
    }
    doc.addEventListener('drop', clearIfStale)
    return () => { doc.removeEventListener('drop', clearIfStale) }
  }, [])
  // ---------------------------------------------------------------------------
  // 会话行状态点 · 第二条真源（官方 pendingInteractions，**会话级**）：
  //   黄闪 = 这个会话正在等你（审批 / 回答）；订阅官方 store，本组件不缓存成第二真源。
  //   读不到（旧宿主 / uiSession 未就绪）→ 空 Map = 只表达 running/idle（不伪造“需要你”）。
  const [pendingBySession, setPendingBySession] = useState<ReadonlyMap<string, PendingInteractionLike>>(
    () => new Map<string, PendingInteractionLike>(),
  )
  // ---------------------------------------------------------------------------
  // 会话行状态点 · 绿点 = 「刚结束且你还没查看」（2026-09-14 用户收口修正）。
  //   旧口径把 idle 画成常驻绿点 → 3/7/9 天前的会话也挂着绿点（用户：点进去看完就该消掉）。
  //   观察器只在**本组件存活期间**观察 running→非 running 的转变；点开一行即“已查看”。
  //   纯内存、不落盘（conversations.ts 的纯投影纪律：不写 localStorage）。
  const [convTrack, setConvTrack] = useState<ConvCompletionTrack>(EMPTY_COMPLETION_TRACK)
  useEffect(() => {
    if (pending === null || pending === undefined) {
      setPendingBySession((prev) => (prev.size === 0 ? prev : new Map<string, PendingInteractionLike>()))
      return
    }
    let disposed = false
    let timer: number | null = null
    let tries = 0
    let off: (() => void) | null = null
    const apply = (next: ReadonlyMap<string, PendingInteractionLike>): void => {
      setPendingBySession((prev) => (samePendingSessions(prev, next) ? prev : next))
    }
    const attach = (): void => {
      if (disposed) return
      let snap: unknown
      try {
        snap = pending.getSnapshot()
      } catch {
        snap = undefined
      }
      // undefined = 官方 uiSession 服务尚未注册（晚注册）→ **有界**重试探测服务本身，
      // 不是轮询数据；超限即放弃（UI 保持 running/idle 诚实降级，绝不假装“需要你”）。
      if (snap === undefined || snap === null) {
        if (tries < PENDING_ATTACH_TRIES) {
          tries += 1
          timer = window.setTimeout(attach, PENDING_ATTACH_MS)
        }
        return
      }
      apply(pendingSessions(snap))
      try {
        off = pending.subscribe(() => {
          if (disposed) return
          let live: unknown
          try {
            live = pending.getSnapshot()
          } catch {
            return
          }
          if (live === undefined || live === null) return
          apply(pendingSessions(live))
        })
      } catch {
        off = null
      }
    }
    attach()
    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
      try {
        off?.()
      } catch {
        // best-effort：退订失败不得影响侧栏
      }
    }
  }, [pending])
  // ---------------------------------------------------------------------------
  // E4-FINAL · 官方 Session 菜单（重命名/分叉会话/归档会话）的**瞬态 UI 状态**。
  //   只存「哪一行的菜单开着」「重命名对话框的目标/草稿/提交中/错误」——与官方
  //   WorkspaceBrowser 的同名状态变量一一对应（ui-workspace :2086-2101）。
  //   **不存**会话标题/列表/归档标记：那些真源永远是官方 store。
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  // ⓐ Personal 扩展项「加入项目」（2026-09-17 用户需求）的**瞬态 UI 状态**。
  //   与重命名同构：只存「对话框目标/已选项目/错误」，**不存**项目的归属关系
  //   （那是 personal-registry 的真源，住在 workspace bundle，经 window 桥读写）。
  const [projectTarget, setProjectTarget] = useState<{ id: string; title: string } | null>(null)
  const [projectData, setProjectData] = useState<ProjectAssignData | null>(null)
  const [projectDraftId, setProjectDraftId] = useState<string | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // E4-FIX-IA-2 · MAIN NAV：latest-wins token（快速连点 = 最后一次）+ 进行中 send 资源清理。
  const navSeq = useRef(0)
  const sendCleanupRef = useRef<(() => void) | null>(null)


  // 会话列表：官方 store 订阅（每次变更 re-parse，不缓存）+ 归档源有界探测。
  useEffect(() => {
    if (conversations === null || conversations === undefined) return
    const read = (): void => {
      try {
        const snap = parseConversations(conversations.getSnapshot())
        setConvSnap(snap)
      } catch {
        setConvSnap({ rows: [], ready: false })
      }
      try {
        setArchiveKnownNow(archiveTruthOf(conversations.archive()))
      } catch {
        setArchiveKnownNow({ known: false, ids: new Set<string>() })
      }
    }
    read()
    let off: (() => void) | null = null
    try {
      off = conversations.subscribe(read)
    } catch {
      off = null
    }
    // 归档真源（官方 workspaces）在冷启动时可能晚于本插件注册 → 有界重试**订阅**
    // （一旦订阅成功即停止；此后归档/取消归档由官方 store 推送，无轮询）。
    let offArchive: (() => void) | null = null
    const ensureArchiveSub = (): boolean => {
      if (offArchive !== null) return true
      try {
        offArchive = conversations.subscribeArchive(read)
      } catch {
        offArchive = null
      }
      return offArchive !== null
    }
    ensureArchiveSub()
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      read()
      if (ensureArchiveSub() || tries >= 24) clearInterval(timer)
    }, 500)
    return () => {
      try {
        off?.()
      } catch {
        // ignore
      }
      try {
        offArchive?.()
      } catch {
        // ignore
      }
      clearInterval(timer)
    }
  }, [conversations])

  // 相对时间（§9）：每分钟刷新一次显示（只重算文案，**不**轮询数据源）。
  useEffect(() => {
    const t = setInterval(() => setConvNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  // 中央主区状态镜像：workspace 广播 MAIN_STATE_EVENT（含 boot/会话切换），
  // 让「会话/主页/任务板…」行高亮与中央主区真实内容保持一致（只读镜像，不反向写）。
  useEffect(() => {
    if (typeof window === 'undefined') return
    // PHASE C：主区不可用（Main-only 页面被请求但 host 未就绪）→ 诚实提示，不开替代面板。
    const onUnavailable = (ev: Event): void => {
      try {
        const detail = (ev as CustomEvent<{ view?: unknown; reason?: unknown }>).detail
        const view = typeof detail?.view === 'string' ? (detail.view as MainViewId) : null
        const label = view !== null ? (MAIN_VIEW_TITLES[view] ?? view) : '该页面'
        const reason = typeof detail?.reason === 'string' ? detail.reason : '中央主区尚未就绪'
        showNotice(`「${label}」未能打开：${reason}。请稍候重试。`)
        setActiveNavId(null)
      } catch {
        // malformed → ignore
      }
    }
    const onState = (ev: Event): void => {
      try {
        const view = (ev as CustomEvent<{ view?: unknown }>).detail?.view
        if (typeof view !== 'string') return
        setActiveNavId(NAV_ID_OF_VIEW[view as MainViewId] ?? null)
      } catch {
        // ignore malformed state
      }
    }
    try {
      window.addEventListener(MAIN_STATE_EVENT, onState)
      window.addEventListener(MAIN_UNAVAILABLE_EVENT, onUnavailable)
      return () => {
        try {
          window.removeEventListener(MAIN_STATE_EVENT, onState)
        window.removeEventListener(MAIN_UNAVAILABLE_EVENT, onUnavailable)
        } catch {
          // ignore
        }
      }
    } catch {
      return
    }
  }, [])

  useEffect(
    () => () => {
      if (noticeTimer.current) {
        try {
          clearTimeout(noticeTimer.current)
        } catch {
          // ignore
        }
      }
      if (sendCleanupRef.current) {
        try {
          const c = sendCleanupRef.current
          sendCleanupRef.current = null
          c()
        } catch {
          // ignore
        }
      }
    },
    [],
  )

  // PHASE B：订阅 **Needs Attention** 快照（workspace 广播，唯一真源）。挂载即 request 拉一次
  // （防“订阅晚于广播”丢首帧）。
  useEffect(() => {
    if (typeof window === 'undefined') return
    let alive = true
    const onAttention = (ev: Event): void => {
      try {
        const next = adaptAttentionPayload((ev as CustomEvent<unknown>).detail)
        if (next === null) return
        if (alive) setAttention(next)
      } catch {
        // malformed event → ignore
      }
    }
    try {
      window.addEventListener(ATTENTION_EVENT, onAttention)
    } catch {
      return
    }
    try {
      window.dispatchEvent(new CustomEvent(ATTENTION_REQUEST_EVENT))
    } catch {
      // best-effort
    }
    return () => {
      alive = false
      try {
        window.removeEventListener(ATTENTION_EVENT, onAttention)
      } catch {
        // ignore
      }
    }
  }, [])

  // PHASE B：把计数挂到**既有第三方「任务看板」入口**上（原生 DOM 行，非本插件 React 树）。
  //   纪律：不改名、不删除、不新增第二行主导航；只追加一个徽标子节点，且可自愈（行被宿主
  //   重建 → MutationObserver 重新挂载）。总数 = 0 / 未知 → 无徽标。
  //   口径（2026-09-14 用户收口）：只显示「运作中」（橙）+「需要我介入 / 已失败」（红）；
  //   其余状态（待办 / 已完成 / 已归档）不进数字。数字与颜色都来自同一个 badge（单一真源）。
  useEffect(() => {
    if (typeof document === 'undefined') return
    let observer: MutationObserver | null = null
    let disposed = false
    const TONE: Record<'attention' | 'running', { bg: string; fg: string; border: string }> = {
      // 红 = 需要你介入 / 已失败（盖过橙）
      attention: { bg: 'rgba(229,100,106,.18)', fg: '#e5646a', border: 'rgba(229,100,106,.45)' },
      // 橙 = 正在运作
      running: { bg: 'rgba(240,180,60,.18)', fg: '#e8b64c', border: 'rgba(240,180,60,.4)' },
    }
    const paint = (): void => {
      if (disposed) return
      const row = document.querySelector(BOARD_ENTRY_SELECTOR)
      if (row === null || row === undefined) return
      const existing = row.querySelector('[data-dps-attn-badge]')
      const badge = attention !== null && attention.hostUp ? attention.badge : null
      const n = badge !== null && badge.tone !== 'none' ? badge.total : null
      if (n === null || n <= 0) {
        if (existing !== null) existing.remove()
        return
      }
      const phrase =
        badge !== null && badge.attention > 0 && badge.running > 0
          ? `需要你介入 ${badge.attention} 项 · 运作中 ${badge.running} 项`
          : badge !== null && badge.attention > 0
            ? `需要你介入 ${badge.attention} 项（失败 / 需权限确认 / 宿主错误）`
            : `运作中 ${badge?.running ?? n} 项`
      const tone = TONE[badge?.tone === 'attention' ? 'attention' : 'running']
      const style =
        'margin-left:auto;flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:999px;' +
        'display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;' +
        `line-height:18px;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border}`
      if (existing !== null) {
        if (existing.textContent !== String(n)) existing.textContent = String(n)
        existing.setAttribute('data-dps-attn-tone', badge?.tone ?? 'none')
        if (existing.getAttribute('title') !== phrase) existing.setAttribute('title', phrase)
        if (existing.getAttribute('style') !== style) existing.setAttribute('style', style)
        return
      }
      const el = document.createElement('span')
      el.setAttribute('data-dps-attn-badge', '1')
      el.setAttribute('data-dps-attn-tone', badge?.tone ?? 'none')
      el.textContent = String(n)
      el.title = phrase
      el.style.cssText = style
      try {
        row.appendChild(el)
      } catch {
        // best-effort
      }
    }
    paint()
    const root = document.body
    if (root !== null && root !== undefined && typeof MutationObserver === 'function') {
      observer = new MutationObserver(() => paint())
      observer.observe(root, { childList: true, subtree: true })
    }
    return () => {
      disposed = true
      try {
        observer?.disconnect()
      } catch {
        // ignore
      }
      try {
        document.querySelector('[data-dps-attn-badge]')?.remove()
      } catch {
        // ignore
      }
    }
  }, [attention])

  // V1.2-I（G11）· 任务看板入口行上的**紫色未读中断徽章**。
  //   复用上面 attention 徽章的机制（原生 DOM 行 + 幂等查 + MutationObserver 自愈重挂），但有三条硬约束：
  //     · 独立属性名 `data-dps-int-badge`：**不能**共用 `data-dps-attn-badge` —— 上面 effect 的 cleanup 是
  //       `querySelector('[data-dps-attn-badge]')?.remove()`，共用会让 attention 重跑时把紫徽章一起删掉。
  //     · **不**写 `margin-left:auto`：attention 徽章已经吃掉左侧弹性空间，两个 auto 会互相挤压/重叠。
  //     · 计数只取真源的 `counts.unread.tasks`（本组件不二次统计，避免第二套口径）。
  //   未知态（known=false）→ **不画徽章**：绝不把"不知道"显示成 0。
  useEffect(() => {
    if (typeof document === 'undefined') return
    let observer: MutationObserver | null = null
    let disposed = false
    const paint = (): void => {
      if (disposed) return
      const row = document.querySelector(BOARD_ENTRY_SELECTOR)
      if (row === null || row === undefined) return
      const existing = row.querySelector('[data-dps-int-badge]')
      const n = interrupts.known ? interrupts.unreadTasks : null
      if (n === null || n <= 0) {
        if (existing !== null) existing.remove()
        return
      }
      const phrase = `有 ${n} 个任务被快速停止、你还没看过`
      const style =
        'flex:none;margin-left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;' +
        'display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;' +
        'line-height:18px;background:rgba(160,107,255,.18);color:#a06bff;border:1px solid rgba(160,107,255,.45)'
      if (existing !== null) {
        if (existing.textContent !== String(n)) existing.textContent = String(n)
        if (existing.getAttribute('title') !== phrase) existing.setAttribute('title', phrase)
        if (existing.getAttribute('style') !== style) existing.setAttribute('style', style)
        return
      }
      const el = document.createElement('span')
      el.setAttribute('data-dps-int-badge', '1')
      el.textContent = String(n)
      el.title = phrase
      el.style.cssText = style
      try {
        row.appendChild(el)
      } catch {
        // best-effort
      }
    }
    paint()
    const root = document.body
    if (root !== null && root !== undefined && typeof MutationObserver === 'function') {
      observer = new MutationObserver(() => paint())
      observer.observe(root, { childList: true, subtree: true })
    }
    return () => {
      disposed = true
      try {
        observer?.disconnect()
      } catch {
        // ignore
      }
      try {
        document.querySelector('[data-dps-int-badge]')?.remove()
      } catch {
        // ignore
      }
    }
  }, [interrupts])

  // V1.2-I（I14）· 「**打开**任务详情 ⇒ 消除该任务的紫点」。
  //   需求原文（ACCEPTANCE TESTS 第 19 条逐字）=「Opening Task clears purple unread indicator」，
  //   即**打开即消除**。第三方任务详情的 DOM 是唯一能"知道哪个任务被打开了"的地方，而它此前
  //   只有 role="dialog" + aria-label（没有 task id），controller 的 selectedTaskId 也不对外 provide
  //   ⇒ 事实来源必须由第三方补丁补上：`scripts/third-party-patches/任务看板-任务详情带上任务ID.py`
  //   往 dialog 写 `data-dsh-taskboard-task-id`（详情脚本头部逐条对该需求项、并写明没做什么）。
  //
  //   本 effect 的边界（三条，都是硬约束）：
  //     · **只读**第三方 DOM，绝不改它的节点（观测器只读属性；属性 filter 只订阅这一个属性，
  //       而我们从不写它 ⇒ 原理上不可能自激回环）。
  //     · 写动作只有一个 = I12 既有的 read-to-clear（宿主**追加** read 事件，中断历史一条不删）。
  //     · 不猜：属性缺失/空值 ⇒ 什么都不做；同时出现多个不同 id ⇒ 也不做（不猜哪个是你打开的那个）。
  //   挂载边界（诚实边界，写进验收报告）：本组件只在 Personal 模式挂载（index.tsx:533-534），
  //     而紫点/徽章本来就只存在于 Personal 侧栏 ⇒ 官方模式下打开任务详情**不会**清点，
  //     与 I11 徽章的既有边界一致（不是本 effect 引入的新缺口）。
  useEffect(() => {
    const watcher = createTaskDetailReadWatcher({
      // 成功才清点：宿主确认（200）⇒ 乐观翻掉未读位；404（该任务本就没有中断记录）
      // 与 5xx/网络失败都**不清**，等下一轮真源刷新 —— 宁可暂时不消，也不谎报已读。
      onCleared: (taskId) => {
        setInterrupts((prev) => clearUnread(prev, 'task', taskId))
      },
    })
    return () => {
      watcher.stop()
    }
  }, [])

  const showNotice = (text: string): void => {
    setNotice(text)
    if (noticeTimer.current) {
      try {
        clearTimeout(noticeTimer.current)
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      noticeTimer.current = window.setTimeout(() => setNotice(null), 3200)
    }
  }

  /**
   * PHASE C：Main-only 页面（主页/新任务/任务板/最近/项目/项目详情/工作区）**没有 Aux 复制品**。
   * 旧实现的 openPanel 会在中央主区不可用时，到右侧辅助面板再开一个同名页面 —— 那正是用户
   * 要求的「第二产品」。现在统一走 handleUnavailable：只给**诚实的不可用提示**（含指引），
   * 不打开任何替代面板、不假装成功。
   */
  const handleUnavailable = (item: NavItem, reason: string): void => {
    diagTrace('main-unavailable', { nav: item.id, detail: reason })
    setActiveNavId((prev) => (prev === item.id ? null : prev))
    showNotice(
      `「${item.label}」是中央主区页面：当前${reason}。请稍候重试；若持续不可用，请确认 Personal 工作台插件已启用后重新打开窗口（本插件不再在辅助面板提供重复页面）。`,
    )
  }

  /**
   * 中央主区导航请求（E4-FIX-IA-2 · MAIN NAV RUNTIME FIX）。
   *
   * 旧的 ACK-gate 模型（dispatch → 等 ACK 至多 600ms 才动 → 超时/未 ack 才回退 Aux）
   * 是「点击无反应 / 1–2s 延迟 / 有时要点两次」的头号来源：真机上 workspace 宿主一旦
   * 未 ACK，首次点击 = 600ms 静默 + 才打开辅助面板，用户感知为“点了没反应”。
   *
   * 新模型 = 点击即权威、同 tick 决策、DOM 验证兜底、latest-wins：
   *   1) 立即 setActiveNavId（同 tick 视觉反馈）+ dispatch MAIN_OPEN_EVENT；
   *      workspace 同步 setCurrent + 注册 conversation-seat occupant（single 槽
   *      lowest renders，同 realm 同 tick 生效 → Main 外壳切换应 <50ms）。
   *   2) hostReady 仅同步采样进 trace（取证），**不 gate 首次反馈**：host 尚未就绪
   *      （冷启动 workspace 晚一拍 apply）也照常 dispatch，交由 DOM 验证裁决，
   *      避免“冷启动第一击被误判 Aux”的假阳性。
   *   3) ACK 只做「seat 注册失败」事后校正；不 gate 首次反馈。
   *   4) DOM 上屏验证（t+120 / 再 +330ms 读 [data-dsh-main-host] data-dsh-main-view）：
   *      未上屏 / 渲染崩溃占位 → 诚实提示 + Aux 回退，绝不假装成功、不留死区。
   *   5) navSeq token：过期（被更新点击取代）的结果一律丢弃 → 快速连点 = 最后一次。
   *   每步 diagTrace（含 ms）供真机取证；无任何 await 前置步骤。
   */
  const sendMain = (view: MainViewId, item: NavItem, seq: number): void => {
    if (typeof window === 'undefined') return
    // 2026-09-10 真机反馈：任务板开着时先把板关掉（用它自己的开关），否则它的
    // display:none!important 会把我方中央视图压住 → 用户被迫「再点一次任务板」才能切换。
    closeBoardIfOpen()
    const t0 = Date.now()
    // 新请求取代进行中请求：清理旧 listener/定时器（latest-wins 的物理前提）。
    if (sendCleanupRef.current) {
      try {
        const c = sendCleanupRef.current
        sendCleanupRef.current = null
        c()
      } catch {
        sendCleanupRef.current = null
      }
    }
    let hostReady = false
    try {
      hostReady = (window as unknown as Record<string, unknown>).__dshPersonalMainReady === true
    } catch {
      hostReady = false
    }
    diagTrace('main-click', { nav: item.id, view, detail: `hostReady=${hostReady} seq=${seq}` })
    setActiveNavId(item.id) // ① 立即视觉反馈（MAIN_STATE 镜像随后权威校正）

    const stale = (): boolean => seq !== navSeq.current
    const cancelPending = (): void => {
      if (sendCleanupRef.current) {
        try {
          const c = sendCleanupRef.current
          sendCleanupRef.current = null
          c()
        } catch {
          sendCleanupRef.current = null
        }
      }
    }
    const fallbackToAux = (reason: string): void => {
      if (stale()) return
      diagTrace('main-unavailable', { nav: item.id, view, detail: reason, ms: Date.now() - t0 })
      // PHASE C：不再回退 Aux（Main-only 页面无复制品）→ 只做诚实提示 + 取消高亮。
      setActiveNavId((prev) => (prev === item.id ? null : prev))
      if (view === 'conversation') {
        showNotice('无法切换到中央会话：Personal 工作台未连接（请确认已启用 Personal 工作台）。')
        return
      }
      showNotice(`中央主区暂不可用（${reason}）——「${item.label}」不再提供辅助面板复制品，请稍候重试。`)
    }
    const markOk = (detail: string): void => {
      if (stale()) return
      diagTrace('main-ok', { nav: item.id, view, detail, ms: Date.now() - t0 })
      cancelPending()
    }

    // 注意：hostReady=false **不**提前回退 Aux —— 冷启动时 workspace 可能晚于本次点击
    // 完成 apply（flag 置位晚一拍）；此时照常 dispatch，由下方 DOM 上屏验证裁决：
    //   验证通过 → Main 已切换（ok）；验证失败且 hostReady 仍 false → 诚实 Aux 回退。
    // hostReady 仅作 trace/取证字段，不再充当 600ms 静默 gate（旧模型失效根因之一）。

    // host 就绪 → 监听 ACK（seat 注册失败才 fallback；不 gate 首次反馈）
    let acked = false
    const onAck = (ev: Event): void => {
      try {
        const detail = (ev as CustomEvent<{ view?: unknown; ok?: boolean; seatPriority?: number | null }>).detail
        if (detail?.view !== view || acked) return
        acked = true
        diagTrace('main-ack', {
          nav: item.id,
          view,
          detail: `ok=${detail?.ok === true} seat=${detail?.seatPriority ?? '—'}`,
          ms: Date.now() - t0,
        })
        if (detail?.ok !== true) {
          try {
            window.removeEventListener(MAIN_ACK_EVENT, onAck)
          } catch {
            // ignore
          }
          cancelPending()
          fallbackToAux('中央主区 seat 注册失败')
        }
      } catch {
        // ignore malformed ack
      }
    }

    // DOM 上屏验证：中央 occupant 真 DOM = data-dsh-main-host[data-dsh-main-view]
    const checkMainDom = (): string => {
      if (typeof document === 'undefined') return 'no-dom'
      const host = document.querySelector('[data-dsh-main-host="1"]')
      if (!host) return 'absent'
      if (host.getAttribute('data-dsh-main-error') === '1') return 'error'
      return host.getAttribute('data-dsh-main-view') ?? 'unknown'
    }

    const verifyTarget = (expected: string, attempt: number): void => {
      if (stale()) return
      const actual = checkMainDom()
      const ok = expected === 'conversation' ? actual === 'absent' || actual === 'no-dom' : actual === expected
      if (ok) {
        markOk(`verified data-dsh-main-view=${actual} (attempt ${attempt + 1})`)
        return
      }
      if (attempt >= 1) {
        diagTrace('main-verify-fail', {
          nav: item.id,
          view,
          detail: `expected ${expected}, got ${actual}`,
          ms: Date.now() - t0,
        })
        cancelPending()
        if (actual === 'error') {
          fallbackToAux('中央主区视图渲染崩溃（详见诊断日志）')
          return
        }
        let hostNow = false
        try {
          hostNow = (window as unknown as Record<string, unknown>).__dshPersonalMainReady === true
        } catch {
          hostNow = false
        }
        fallbackToAux(
          actual === 'absent' && !hostNow
            ? 'Personal 工作台宿主未运行（请确认已启用后重试）'
            : expected === 'conversation'
              ? '中央主区仍被 Personal 视图占用'
              : `中央主区未显示「${item.label}」（实际 ${actual}）`,
        )
        return
      }
      window.setTimeout(() => verifyTarget(expected, attempt + 1), 330)
    }

    const arm = (): void => {
      const tVerify = window.setTimeout(() => verifyTarget(view, 0), 120)
      sendCleanupRef.current = () => {
        try {
          window.clearTimeout(tVerify)
        } catch {
          // ignore
        }
        try {
          window.removeEventListener(MAIN_ACK_EVENT, onAck)
        } catch {
          // ignore
        }
      }
    }
    try {
      window.addEventListener(MAIN_ACK_EVENT, onAck)
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(new CustomEvent(MAIN_OPEN_EVENT, { detail: { view } }))
    } catch {
      try {
        window.removeEventListener(MAIN_ACK_EVENT, onAck)
      } catch {
        // ignore
      }
      cancelPending()
      fallbackToAux('事件派发失败')
      return
    }
    arm()
  }

  // ---- Sidebar 会话列表派生（纯投影：official Session truth → 可见行 → 折叠模型）----
  const convArchive: ArchiveTruthState = archiveKnownNow
  const convVisible: ConversationRow[] = visibleConversations(convSnap, convArchive)
  // V1.2-C：后台执行会话过滤**在折叠之前**（否则"折叠 5 条"里会先占满后台会话，
  //   用户展开后才发现真正想找的会话被挤到后面）。两处 owner 不重叠：
  //   `visibleConversations` 管 subagent/归档/blank，本步只管后台执行归属。
  const convFiltered = filterBackgroundSessions(convVisible, convBackground, backgroundShow)
  const convRows: ConversationRow[] = convFiltered.rows
  const convModel = conversationListModel(convRows, convArchive, convExpanded, DEFAULT_VISIBLE)

  // 推进「未查看的完成态」观察器。依赖用**签名**而非数组身份：行集合或运行态变了才推进，
  // 其余渲染不触碰（观察器无变化时返回同一对象 → React 跳过重渲染）。
  const convRunSig = convRows.map((r) => `${r.id}:${r.running === true ? '1' : '0'}`).join('|')
  useEffect(() => {
    setConvTrack((prev) => trackUnseenCompletions(prev, convRows, pendingBySession))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- convRows 由 convRunSig 覆盖（身份每帧新）
  }, [convRunSig, pendingBySession])

  const go = (item: NavItem): void => {
    // V1.2-J：拖动结束**绝不触发跳转**。HTML5 DnD 的 drop 在部分实现里会补发一次 click，
    //   而「用鼠标拖动一下就把用户带到另一个视图」是不可接受的副作用 ⇒ 第一道守卫在这里。
    //   实现要点（两个都踩过坑，别再改回去）：
    //   ① **绝不能用 `setTimeout` 去清守卫**：补发 click 与 dragend 在同一事件批次内到达，而任何
    //      `setTimeout(0)` 都可能抢先执行（微任务排程、宿主排程、jsdom 的 act 批次都会这样），
    //      守卫会在补发 click 到达之前就失效 ⇒ 守卫形同不存在。这里**只在 click 到达时比时间**。
    //   ② **不能只"吃一次"**：任何 click（哪怕来自别的行/别处）都会消耗那一次机会，于是手势里
    //      真正补发的那次就漏过去。窗口期内一律拦下，用户松手后隔一个窗口再点仍然正常。
    if (dragEndAt.current > 0 && Date.now() - dragEndAt.current <= NAV_DRAG_GUARD_MS) return
    dragEndAt.current = 0
    navSeq.current += 1
    const seq = navSeq.current
    if (!wide) expandSidebar()
    if (item.main) {
      sendMain(item.main, item, seq)
      return
    }
    // 非 Main 行（历史遗留）：同样不给 Aux 复制品，只诚实提示。
    handleUnavailable(item, '该入口不是中央主区页面')
  }

  const goHome = (): void => {
    const item = NAV.find((n) => n.id === 'home')
    if (item) go(item)
  }

  // ---------------------------------------------------------------------------
  // V1.2-J · J2 拖动排序（原生 HTML5 DnD，零第三方依赖）
  //   与官方既有先例同手法（第三方插件 ui-workspace/lib/client.js）：
  //     draggable + dataTransfer.setData → dragover 取落点（行的上/下半）→ drop 记录 →
  //     **dragend 才提交**（真机手势结束时才落盘）→ 文档级兜底接受列表之外的落点。
  //   只允许拖我们自己的行：第三方行的目标不是 `[data-nav]` ⇒ 不参与、不落点、不排序。
  // ---------------------------------------------------------------------------
  const navOrderIds = applyNavOrder(NAV.map((n) => n.id), navPrefs.order)
  const navById = new Map(NAV.map((n) => [n.id, n]))
  const navItems: NavItem[] = navOrderIds.map((id) => navById.get(id)!).filter(Boolean)
  const navHidden = new Set(hiddenNavIds(navOrderIds, navCollapsed, thirdPartyAbove))
  const navOwnHiddenCount = collapsedHiddenCount(navOrderIds.length, thirdPartyAbove)
  // 「有没有自定义顺序」= 本机存了非空序列（setNavOrder 已把"等于默认"归一成空数组）。
  const navOrderCustom = navPrefs.order.length > 0
  const navAriaLabelOrder = navItems.filter((n) => !navHidden.has(n.id)).map((n) => n.label).join('、')

  const navDropIndex = (targetId: string, half: 'before' | 'after'): number => {
    const others = navItems.filter((n) => n.id !== dragFrom).map((n) => n.id)
    const at = others.indexOf(targetId)
    return at < 0 ? others.length : half === 'after' ? at + 1 : at
  }

  const handleNavDragStart = (event: React.DragEvent<HTMLButtonElement>, item: NavItem): void => {
    NAV_DRAG_FROM = item.id
    // 新手势开始 ⇒ 上一次拖动留下的守卫窗口立即失效（避免上一手势的窗口影响本次点击）。
    dragEndAt.current = 0
    dragState.current = null
    setDropMark(null)
    setDragFrom(item.id)
    // 拖动中若恰好被第三方行"接住"……不可能：它没有 dragover handler，浏览器默认不接受 drop。
    try {
      event.dataTransfer?.setData('application/x-dps-nav', `dps-nav:${item.id}`)
      event.dataTransfer?.setData('text/plain', `dps-nav:${item.id}`)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    } catch {
      // dataTransfer 只读/受限：静态标记 NAV_DRAG_FROM 仍然保证本次拖动可完成
    }
  }

  const handleNavDragOver = (event: React.DragEvent<HTMLButtonElement>, item: NavItem): void => {
    const from = dragState.current?.from ?? dragFrom ?? NAV_DRAG_FROM
    if (from === '' || from === item.id) {
      setDropMark(null)
      return
    }
    // **在 dragover 阶段**标记"这个落点可以接受"（HTML5 契约：想接收 drop 就必须在这里
    // preventDefault；click 事件是**之后**才可能补发 ⇒ 该标记足以把"拖动"与"点击"分开）。
    event.preventDefault()
    try {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    } catch {
      // 同上：受限环境不影响逻辑
    }
    const half = navDropHalf(event.currentTarget, event.clientY)
    dragState.current = { from, target: item.id, half }
    setDropMark((prev) => (prev !== null && prev.target === item.id && prev.half === half ? prev : { target: item.id, half }))
  }

  const handleNavDrop = (event: React.DragEvent<HTMLButtonElement>, item: NavItem): void => {
    // 落点在我们自己的行上 ⇒ 拦住浏览器默认行为（否则可能被解释为导航/复制）。
    event.preventDefault()
    const from = navDragFromId(event)
    const half = dragState.current?.half ?? navDropHalf(event.currentTarget, event.clientY)
    dragState.current = { from, target: item.id, half }
    setDropMark({ target: item.id, half })
  }

  /** 真机手势结束 → 提交顺序（dragend 是唯一提交点）。 */
  const handleNavDragEnd = (): void => {
    const state = dragState.current
    dragState.current = null
    setDragFrom(null)
    setDropMark(null)
    // 只有**真的拖动过**（dragover/drop 至少命中过一次，dragState 有值）才武装守卫：
    //   某些宿主会派发"没有实际移动"的 dragstart→dragend（长按/触摸/辅助技术），
    //   那种手势之后用户紧接着的点击是**真实点击**，不能被吃掉。
    if (state !== null) dragEndAt.current = Date.now()
    if (state === null) return
    if (state.from === state.target) return
    const next = reorderNavIds(navOrderIds, state.from, state.target, state.half)
    if (next.join('|') === navOrderIds.join('|')) return // 无实质变化：不写盘
    setNavOrder(NAV.map((n) => n.id), next)
  }

  /** 「恢复默认顺序」= 可发现入口（收起态也常驻，否则用户收起后找不到它）。 */
  const restoreNavOrder = (): void => {
    setNavOrder(NAV.map((n) => n.id), NAV.map((n) => n.id))
  }

  const toggleNavCollapsed = (): void => {
    setNavCollapsed(!navCollapsed)
  }

  /**
   * 2026-09-10 真机反馈（单次点击即切换）：
   * 「点击会话列表里的会话，主窗口也应该直接跳过去 —— 不能要求我先点『会话』按钮、
   *   再点会话列表里的会话。」
   *
   * 事实：中央主区同一时刻只有一个 occupant。我方 Personal 视图占着中央时，
   * 点会话行只调官方 `sessions.open(id)`（会话确实切换了），但我方宿主仍盖在中央 →
   * 用户看不见切换结果，只能先点「会话」导航行让出中央。两处入口优先级应当一致。
   *
   * 因此：**仅当我方宿主真的占着中央**（`[data-dsh-main-host]` 存在）时，
   * 走「会话」导航行**完全相同**的路径（`go(conversationItem)` → MAIN_OPEN_EVENT →
   * workspace 主区 occupant 让位），再调官方 open。
   * 我方宿主不在中央（已经停在官方会话）时**一个多余导航请求都不发**。
   * 不新造事件、不复制会话、不改官方引擎状态。
   */
  const goConversationIfOccupied = (): void => {
    if (typeof document === 'undefined') return
    if (document.querySelector('[data-dsh-main-host="1"]') === null) return
    const item = NAV.find((n) => n.id === 'conversation')
    if (item) go(item)
  }

  /**
   * 「打开一行官方会话」的唯一路径（点击会话行 / 分叉后打开子会话共用）：
   * 先离板（若任务板开着）→ 若我方宿主占着中央则让位 → 官方 `sessions.open`。
   * 不复制会话、不新建会话、不建任务、不重放 prompt。
   */
  const openConversationRow = (sessionId: string): void => {
    closeBoardIfOpen()
    goConversationIfOccupied()
    try {
      conversations?.open(sessionId)
    } catch {
      showNotice('打开会话失败：官方 sessions.open 调用异常。')
    }
  }

  // ---------------------------------------------------------------------------
  // E4-FINAL · 官方 Session 菜单三动作 —— UI 层只做「派发到官方 handler + 如实报告结果」。
  //   官方对照（ui-workspace）：rename 对话框状态机 :2086-2101、fork :2678-2690
  //   （fork 后立刻 open 子会话）、archive :2698-2700（失败只 console.warn）。
  //   本层**不做**：删除、置顶、收藏、导出、标签、自定义归档中心、恢复。
  //   例外 ⓐ（2026-09-17 用户明确要求）：「加入项目」—— 见下方 beginProjectAssign 一段。
  // ---------------------------------------------------------------------------
  const renameTrimmed = renameDraft.trim()
  /** 官方判据：`renaming || trimmed === '' || target === null`。 */
  const renameBlocked = renaming || renameTrimmed === '' || renameTarget === null

  const beginSessionRename = (row: ConversationRow): void => {
    setRenameTarget({ id: row.id, title: row.title })
    setRenameDraft(row.title)
    setRenameError(null)
  }

  const closeSessionRename = (): void => {
    if (renaming) return // 官方：提交中关闭是空操作
    setRenameTarget(null)
    setRenameError(null)
  }

  const confirmSessionRename = (): void => {
    if (renameBlocked || renameTarget === null) return
    const handle = conversations
    if (handle === null || handle === undefined || typeof handle.rename !== 'function') {
      setRenameError('官方会话服务未就绪（sessions.rename 不可达）—— 未做任何修改。')
      return
    }
    setRenaming(true)
    setRenameError(null)
    // 官方同序：提交中禁用 → 成功后关对话框；失败把官方错误消息原样显示在对话框里。
    void handle
      .rename(renameTarget.id, renameTrimmed)
      .then(() => {
        setRenaming(false)
        setRenameTarget(null)
      })
      .catch((reason: unknown) => {
        setRenaming(false)
        setRenameError(reason instanceof Error ? reason.message : String(reason))
      })
  }

  // ⓐ「加入项目」状态机 —— 与重命名同构（目标/草稿/错误三态，绝不本地缓存归属真源）。
  const beginProjectAssign = (row: ConversationRow): void => {
    // 打开即**现读**真源（桥 → workspace 的同一个 store 实例）；读不到就如实报原因。
    setProjectTarget({ id: row.id, title: row.title })
    setProjectData(readProjectAssignData(typeof window === 'undefined' ? null : window, row.id))
    setProjectDraftId(null)
    setProjectError(null)
  }

  const closeProjectAssign = (): void => {
    setProjectTarget(null)
    setProjectData(null)
    setProjectDraftId(null)
    setProjectError(null)
  }

  /** 提交 = 走桥写给**同一份**项目关系真源（与"项目详情 → 收录会话"完全同一写路径）。 */
  const confirmProjectAssign = (): void => {
    if (projectTarget === null || projectData === null || !projectData.ok) return
    const projectId = projectDraftId
    if (projectId === null) return
    const name = projectData.projects.find((p) => p.id === projectId)?.name ?? projectId
    const r = applyProjectAssign(typeof window === 'undefined' ? null : window, projectTarget.id, projectId)
    if (r.ok) {
      closeProjectAssign()
      showNotice(`已把会话「${projectTarget.title}」加入项目「${name}」。`)
      return
    }
    setProjectError(r.reason ?? '写入失败（未知原因）')
  }

  /** 「移出项目」：同一写路径的反向操作（projectId=null）。 */
  const unassignProjectAssign = (): void => {
    if (projectTarget === null || projectData === null || !projectData.ok) return
    const r = applyProjectAssign(typeof window === 'undefined' ? null : window, projectTarget.id, null)
    if (r.ok) {
      const title = projectTarget.title
      closeProjectAssign()
      showNotice(`已把会话「${title}」移出项目。`)
      return
    }
    setProjectError(r.reason ?? '写入失败（未知原因）')
  }

  const forkSessionRow = (row: ConversationRow): void => {
    const handle = conversations
    if (handle === null || handle === undefined || typeof handle.fork !== 'function') {
      showNotice('分叉会话失败：官方会话服务未就绪（sessions.fork 不可达）。')
      return
    }
    void handle
      .fork(row.id)
      .then((childId) => {
        // 官方：fork 后立刻打开子会话。我方走「点会话行」同一条路径，中央主区同样让位官方会话。
        openConversationRow(childId)
      })
      .catch((reason: unknown) => {
        showNotice(`分叉会话失败：${reason instanceof Error ? reason.message : String(reason)}`)
      })
  }

  const archiveSessionRow = (row: ConversationRow): void => {
    const handle = conversations
    if (handle === null || handle === undefined || typeof handle.archiveSession !== 'function') {
      showNotice('归档会话失败：官方 workspaces 服务未就绪（archiveSession 不可达）。')
      return
    }
    void handle
      .archiveSession(row.id)
      .then(() => {
        // 成功 = 官方归档集已更新（workspaces.list 推送）→ 本列表按官方真值把该行筛掉。
        // 归档 ≠ 删除：会话本体与任务状态都不动，恢复入口仍在官方侧。
      })
      .catch((reason: unknown) => {
        showNotice(`归档会话失败：${reason instanceof Error ? reason.message : String(reason)}`)
      })
  }

  return (
    <SafeBoundary onFallback={switchOfficial}>
      {!wide ? (
        <div className="dps-rail" data-dps-nav-rail="1">
          {NAV.map((n) => (
            <button
              type="button"
              key={n.id}
              className="dps-rail-btn"
              title={n.hint}
              onClick={() => go(n)}
              data-nav={n.id}
              data-active={activeNavId === n.id ? 'true' : undefined}
            >
              {n.icon}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button type="button" className="dps-rail-btn" title="切回官方会话浏览" onClick={switchOfficial}>
            <SwitcherIcon size={15} />
          </button>
        </div>
      ) : (
        <div className="dps-root" data-dps-nav="1" data-dps-nav-collapsed={navCollapsed ? 'true' : 'false'}>
          {/* V1.2-J：`data-dps-nav-collapsed` = 收起态（本机记忆，默认 true）。
              `data-dps-nav-visible-limit` = 收起时"整条列表"的可见行上限（含第三方行）；
              `data-dps-nav-third-party-above` = 运行时实测的上方可见第三方行数（真布局判定依据）。
              `data-dps-nav-hidden-count` = 我们自己的行里被隐藏的行数（收起时可见行数 = 4 − above）。 */}
          <div
            className="dps-navwrap"
            data-dps-nav-wrap="1"
            ref={navWrapRef}
            data-dps-nav-visible-limit={String(NAV_VISIBLE_WHEN_COLLAPSED)}
            data-dps-nav-third-party-above={String(thirdPartyAbove)}
            data-dps-nav-hidden-count={String(navOwnHiddenCount)}
            data-dps-nav-order-custom={navOrderCustom ? 'true' : 'false'}
          >
            <div className="dps-nav" aria-label={`主导航（当前可见：${navAriaLabelOrder || '无'}）`}>
              {navItems.map((n) => {
                const isHidden = navHidden.has(n.id)
                const isDropTarget = dropMark !== null && dropMark.target === n.id
                return (
                  <button
                    type="button"
                    key={n.id}
                    className="dps-nav-item"
                    data-nav={n.id}
                    data-active={activeNavId === n.id ? 'true' : undefined}
                    // 收起态：行**仍在 DOM**（data-nav 齐全、顺序不变），只加隐藏标记 + CSS display:none。
                    data-nav-hidden={isHidden ? 'true' : undefined}
                    data-nav-index={String(navOrderIds.indexOf(n.id))}
                    data-nav-dragging={dragFrom === n.id ? 'true' : undefined}
                    data-nav-drop={isDropTarget ? dropMark.half : undefined}
                    title={`${n.hint}${navCollapsed ? '' : `\n${NAV_ORDER_HINT}`}`}
                    // 原生 HTML5 DnD：只挂在我们自己的行上（第三方行不参与）。
                    draggable="true"
                    aria-grabbed={dragFrom === n.id ? 'true' : undefined}
                    onClick={() => go(n)}
                    onDragStart={(event) => handleNavDragStart(event, n)}
                    onDragOver={(event) => handleNavDragOver(event, n)}
                    onDrop={(event) => handleNavDrop(event, n)}
                    onDragEnd={handleNavDragEnd}
                  >
                    {n.icon}
                    <span>{n.label}</span>
                  </button>
                )
              })}
            </div>
            {/* 收起/展开 + 恢复默认顺序：**列表之外**的一行控件。
                为什么不塞进 `.dps-nav`：`.dps-nav` 是既有的「行容器」选区，核验套件按它取行；
                把控件塞进去会让"行"与"控件"在同一个容器里混淆（且它有 `[data-nav]` 计数契约）。 */}
            <div className="dps-nav-ctl" data-dps-nav-ctl="1">
              <button
                type="button"
                className="dps-nav-ctl-btn"
                data-dps-nav-toggle={navCollapsed ? 'collapsed' : 'expanded'}
                aria-expanded={navCollapsed ? 'false' : 'true'}
                title={
                  navCollapsed
                    ? `展开全部导航行（当前只显示上面 ${NAV_VISIBLE_WHEN_COLLAPSED} 行，含第三方「任务看板」入口）`
                    : `收起导航行（只保留上面 ${NAV_VISIBLE_WHEN_COLLAPSED} 行）`
                }
                onClick={toggleNavCollapsed}
              >
                {navCollapsed ? NAV_TOGGLE_EXPAND : NAV_TOGGLE_COLLAPSE}
              </button>
              {navOrderCustom ? (
                <button
                  type="button"
                  className="dps-nav-ctl-btn"
                  data-dps-nav-restore="1"
                  title="把导航行顺序恢复为本插件默认顺序（本机偏好，立即生效）"
                  onClick={restoreNavOrder}
                >
                  {NAV_RESTORE_DEFAULT}
                </button>
              ) : null}
            </div>
          </div>

          {/* E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST（§3–§11）：Mini Mission Control 的替代物。
              只承载 **Conversation recovery**：标题 + 相对时间 + selected；点击 = 官方 sessions.open。
              这里**不出现**任何 Task 字段（任务 running/done/attention/schedule/progress）——那些归任务看板。
              例外且**仍是会话级真相**（2026-09-14 用户收口）：标题后的状态点 =
              官方 `sessions.list.running`（运作中=旋转圈）+ 官方 `uiSession.pendingInteractions`
              （需要你审批/介入=黄闪）+ 两者皆否=已结束（绿点）。它不是任务状态，也不读任务账本。 */}
          {conversations !== null && conversations !== undefined ? (
            <div className="dps-conv" data-dps-conversations="1" aria-label="会话列表">
              <div className="dps-conv-h">
                <span>会话列表</span>
                {convSnap.ready && convRows.length > 0 ? (
                  <span className="dps-conv-n" data-dps-conv-count={convRows.length}>
                    {convRows.length}
                  </span>
                ) : null}
                {/* V1.2-C：后台任务会话开关。**只在账本可读时**出现 —— 读不到账本时
                    这个开关点了也不会有任何效果，摆出来等于骗人（未知 ≠ 无）。 */}
                {convBackground.known ? (
                  <button
                    type="button"
                    className="dps-conv-toggle"
                    data-dps-conv-bg-toggle={backgroundShow ? 'show' : 'hide'}
                    aria-pressed={backgroundShow}
                    title={
                      backgroundShow
                        ? '后台任务会话当前可见（点此隐藏）'
                        : '后台任务会话当前已隐藏；会话未被删除，可在任务→执行历史打开'
                    }
                    onClick={() => setBackgroundShow((v) => !v)}
                  >
                    {backgroundShow ? CONV_BACKGROUND_TOGGLE_HIDE : CONV_BACKGROUND_TOGGLE_SHOW}
                  </button>
                ) : null}
              </div>

              {!convSnap.ready ? (
                <div className="dps-conv-empty" data-dps-conv-state="loading">
                  正在读取官方会话…
                </div>
              ) : convRows.length === 0 ? (
                <div className="dps-conv-empty" data-dps-conv-state="empty">
                  <div>{CONV_EMPTY_TEXT}</div>
                  <button type="button" className="dps-conv-cta" data-dps-conv-cta="1" onClick={goHome}>
                    {CONV_EMPTY_CTA}
                  </button>
                </div>
              ) : (
                <>
                  <ul className="dps-conv-list">
                    {convModel.shown.map((row) => {
                      const active = convSnap.currentId !== undefined && convSnap.currentId === row.id
                      const menuOpen = menuOpenId === row.id
                      // 状态点：待交互（等你审批/回答）> 运行中 > 刚完成且未查看（绿点）> 已结束（**不画点**）。
                      // 正在看的那个会话不挂绿点（你就在里面，它已经"被看过"了）。
                      const unseenDone = !active && convTrack.unseen.has(row.id)
                      // G10：紫点 = 「被 Quick Stop 中断，且你还没重新打开看过」（未查看语义，同绿点）。
                      // 优先级：待交互 > 运行中 > 未读中断 > 刚完成 > 不画点（纯函数内部实现，此处只传事实）。
                      const interruptedUnread = interrupts.unreadSessions.has(row.id)
                      const dotState = conversationDotState(row, pendingBySession, unseenDone, interruptedUnread)
                      const dotNote = conversationDotNote(dotState, pendingBySession.get(row.id))
                      return (
                        <li
                          key={row.id}
                          className="dps-conv-item"
                          data-conv-menu-open={menuOpen ? 'true' : undefined}
                        >
                          <button
                            type="button"
                            className="dps-conv-row"
                            data-dps-conv-row="1"
                            data-conv-id={row.id}
                            data-conv-active={active ? 'true' : 'false'}
                            aria-current={active ? 'true' : undefined}
                            title={`${row.title}${row.cwd !== undefined ? `｜工作区 ${row.cwd}` : ''}｜打开该官方会话`}
                            onClick={() => {
                              // §6：唯一合法路径 = 官方 sessions.open(sessionId)。
                              // 不复制会话、不新建会话、不建任务、不重放 prompt、不造假详情页。
                              setMenuOpenId(null) // 官方：点行 = 收起该行菜单
                              // 点开 = 已查看 → 绿点消失（用户 2026-09-14：「点进去看完了就该消掉」）
                              setConvTrack((prev) => markConversationSeen(prev, row.id))
                              // V1.2-I G12（read-to-clear）：打开该行 = 已读。
                              //   · 只清**未读位**（宿主追加 read 事件，中断历史一条不删）
                              //   · fire-and-forget：失败只提示、绝不阻断打开；也绝不 throw 进 onClick
                              //   · 只在此处（行点击分支）发 —— 不能放进 openConversationRow：
                              //     分叉子会话也走那条路，而子会话从未被中断 ⇒ 会白拿一堆 404
                              void markInterruptRead('session', row.id).then((res) => {
                                if (!res.ok) return // 非 2xx / 网络失败：本地不清点，等下一轮真源刷新
                                setInterrupts((prev) => clearUnread(prev, 'session', row.id))
                              })
                              openConversationRow(row.id)
                            }}
                          >
                            <span className="dps-conv-title">
                              {row.title}
                              {/* 状态点（2026-09-14 用户收口）：dps-conv-run = 旋转圈（运作中）；
                                  dps-conv-wait = 黄闪（需要你审批/介入）；dps-conv-done = 绿点（刚完成且未查看，
                                  点开即消失）；idle **不挂点**（历史会话不该常驻绿点）。 */}
                              {dotState === 'idle' ? null : (
                                <span
                                  className={`dps-conv-state ${CONVERSATION_DOT_CLASS[dotState]}`}
                                  data-conv-state={dotState}
                                  aria-label={dotNote}
                                  title={dotNote}
                                />
                              )}
                            </span>
                            <span className="dps-conv-time">{relativeTime(row.updatedAt, convNow)}</span>
                          </button>
                          {/* E4-FINAL：与官方会话行同构的「…」入口 —— 同一组官方菜单项，
                              同一顺序（重命名/分叉会话/归档会话），官方图标与官方 zh 文案。
                              官方没有的动作一律不在此出现。 */}
                          <span className="dps-conv-actions">
                            <SessionActionsMenu
                              title={row.title}
                              open={menuOpen}
                              onOpenChange={(next) => setMenuOpenId(next ? row.id : null)}
                              onRename={() => beginSessionRename(row)}
                              onFork={() => forkSessionRow(row)}
                              onArchive={() => archiveSessionRow(row)}
                              // ⓐ 仅当项目数据桥可用时追加「加入项目」（渲染期廉价探测，不缓存）。
                              onProject={
                                hasProjectBridge(typeof window === 'undefined' ? null : window)
                                  ? () => beginProjectAssign(row)
                                  : undefined
                              }
                            />
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  {convModel.hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="dps-conv-more"
                      data-dps-conv-expand="1"
                      onClick={() => setConvExpanded(true)}
                    >
                      {convModel.expandLabel}
                    </button>
                  ) : convExpanded && convRows.length > DEFAULT_VISIBLE ? (
                    <button
                      type="button"
                      className="dps-conv-more"
                      data-dps-conv-collapse="1"
                      onClick={() => setConvExpanded(false)}
                    >
                      收起
                    </button>
                  ) : null}
                </>
              )}

              {convModel.archiveUnknown ? (
                <div className="dps-conv-note" data-dps-conv-archive-unknown="1">
                  {CONV_ARCHIVE_UNKNOWN_NOTE}
                </div>
              ) : null}
              {/* V1.2-C 诚实标注：#1 账本读不到 ⇒ **什么都没隐藏**，必须说出来；
                  #2 已隐藏 ⇒ 说明隐藏数量与"未删除、去哪打开"。 */}
              {convFiltered.backgroundUnknown ? (
                <div className="dps-conv-note" data-dps-conv-bg-unknown="1">
                  {CONV_BACKGROUND_UNKNOWN_NOTE}
                </div>
              ) : null}
              {convFiltered.hiddenBackground > 0 ? (
                <div className="dps-conv-note" data-dps-conv-bg-hidden={convFiltered.hiddenBackground}>
                  {convBackgroundHiddenNote(convFiltered.hiddenBackground)}
                </div>
              ) : null}
              <div className="dps-conv-note" data-dps-conv-scope="1">
                {CONV_SCOPE_NOTE}
              </div>

              {/* E4-FINAL：官方「重命名会话」对话框（官方 Modal + 官方 Button + 官方 IME 守卫）。
                  提交 = 官方 `sessions.binding(id).session.rename(title)`；成功后官方 store 推送新标题。 */}
              <SessionRenameDialog
                open={renameTarget !== null}
                draft={renameDraft}
                renaming={renaming}
                blocked={renameBlocked}
                error={renameError}
                onDraft={(value) => {
                  setRenameDraft(value)
                  setRenameError(null)
                }}
                onConfirm={confirmSessionRename}
                onClose={closeSessionRename}
              />

              {/* ⓐ Personal「加入项目」对话框（官方 Modal + 官方 Button；同一对话框内含换项目/移出）。
                  数据源 = window 桥 → personal-registry 的同一 store 实例（不是第二份数据）。 */}
              <ProjectAssignDialog
                open={projectTarget !== null && projectData !== null}
                sessionTitle={projectTarget?.title ?? ''}
                data={projectData ?? { ok: false, reason: '项目数据未读取' }}
                draftId={projectDraftId}
                error={projectError}
                onPick={(id) => {
                  setProjectDraftId(id)
                  setProjectError(null)
                }}
                onConfirm={confirmProjectAssign}
                onUnassign={unassignProjectAssign}
                onClose={closeProjectAssign}
              />
            </div>
          ) : null}

          {/* E4-FIX-IA-2 · 2026-09-10 用户真机反馈：左栏**不再罗列辅助工具**。
              辅助工具（文件/Git/Diff/浏览器/旁路会话…）的归属地 = 官方右栏与底栏（官方 shell
              区域，本插件从不接管）。左栏重复一份列表既无新能力，又让左栏变成第二个 Aux 面板。
              能力**未删除**：真源仍是 better-sidebar 服务与官方右/底窗格（见 §「返回官方」）。 */}

          {/* PHASE B：Mini Mission Control 区块已删除（见文件头注释）。此处只保留导航反馈。 */}
          {notice ? (
            <div className="dps-mm" data-dps-nav-notice-host="1">
              <div className="dps-mm-notice" data-dps-nav-notice="1">
                {notice}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </SafeBoundary>
  )
}
