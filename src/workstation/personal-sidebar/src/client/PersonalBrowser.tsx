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
import { ClockIcon, FolderIcon, HomeIcon, PlusIcon, SwitcherIcon, WorkspaceIcon, BoardIcon, ChatIcon } from './icons'
import {
  CONV_ARCHIVE_UNKNOWN_NOTE,
  CONV_EMPTY_CTA,
  CONV_EMPTY_TEXT,
  CONV_SCOPE_NOTE,
  DEFAULT_VISIBLE,
  archiveTruthOf,
  conversationListModel,
  parseConversations,
  relativeTime,
  visibleConversations,
  type ConversationRow,
  type ConversationSnapshot,
} from './conversations'
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
// E4-FINAL：会话行「…」菜单 = **官方 Menu/Modal/Button 与官方图标**（P1 复用），
// 三个动作 = 官方 handler（P2 复用）。本组件只持有菜单/对话框的**瞬态 UI 状态**。
import { SessionActionsMenu, SessionRenameDialog } from './sessionActions'

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

/** 广播快照（防御式解析；格式不符 → null = 忽略该事件）。 */
interface AttentionSnapshot {
  /** null = 不可知（宿主不可达）→ 不显示徽标，也不声称“没有需要处理的事”。 */
  n: number | null
  ready: boolean
  hostUp: boolean
  hostError?: string
}
function adaptAttentionPayload(raw: unknown): AttentionSnapshot | null {
  const p = (raw ?? {}) as Record<string, unknown>
  if (p.v !== 1) return null
  const n = typeof p.n === 'number' && Number.isFinite(p.n) ? p.n : null
  return {
    n,
    ready: p.ready === true,
    hostUp: p.hostUp === true,
    hostError: typeof p.hostError === 'string' ? p.hostError : undefined,
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
}

export function PersonalBrowser(props: PersonalBrowserProps): ReactNode {
  const { wide, expandSidebar, switchOfficial, betterSidebar, conversations } = props
  // PHASE B：Needs Attention 计数（唯一真源 = workspace 广播；本组件不做任何派生/缓存）。
  const [attention, setAttention] = useState<AttentionSnapshot | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeNavId, setActiveNavId] = useState<string | null>(null)
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
  // E4-FINAL · 官方 Session 菜单（重命名/分叉会话/归档会话）的**瞬态 UI 状态**。
  //   只存「哪一行的菜单开着」「重命名对话框的目标/草稿/提交中/错误」——与官方
  //   WorkspaceBrowser 的同名状态变量一一对应（ui-workspace :2086-2101）。
  //   **不存**会话标题/列表/归档标记：那些真源永远是官方 store。
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
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
  //   重建 → MutationObserver 重新挂载）。N = 0 / 未知 → 无徽标。
  useEffect(() => {
    if (typeof document === 'undefined') return
    let observer: MutationObserver | null = null
    let disposed = false
    const paint = (): void => {
      if (disposed) return
      const row = document.querySelector(BOARD_ENTRY_SELECTOR)
      if (row === null || row === undefined) return
      const existing = row.querySelector('[data-dps-attn-badge]')
      const n = attention !== null && attention.hostUp && attention.n !== null ? attention.n : null
      if (n === null || n <= 0) {
        if (existing !== null) existing.remove()
        return
      }
      if (existing !== null) {
        if (existing.textContent !== String(n)) existing.textContent = String(n)
        return
      }
      const badge = document.createElement('span')
      badge.setAttribute('data-dps-attn-badge', '1')
      badge.textContent = String(n)
      badge.title = `需要你处理：${n} 项（失败 / 需权限确认 / 宿主错误）`
      badge.style.cssText =
        'margin-left:auto;flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:999px;' +
        'display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;' +
        'line-height:18px;background:rgba(240,180,60,.18);color:#e8b64c;border:1px solid rgba(240,180,60,.4)'
      try {
        row.appendChild(badge)
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
  const convRows: ConversationRow[] = visibleConversations(convSnap, convArchive)
  const convModel = conversationListModel(convRows, convArchive, convExpanded, DEFAULT_VISIBLE)

  const go = (item: NavItem): void => {
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
  //   本层**不做**：删除、置顶、收藏、移动项目、导出、标签、自定义归档中心、恢复。
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
        <div className="dps-root" data-dps-nav="1">
          <div className="dps-nav">
            {NAV.map((n) => (
              <button
                type="button"
                key={n.id}
                className="dps-nav-item"
                data-nav={n.id}
                data-active={activeNavId === n.id ? 'true' : undefined}
                title={n.hint}
                onClick={() => go(n)}
              >
                {n.icon}
                <span>{n.label}</span>
              </button>
            ))}
          </div>

          {/* E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST（§3–§11）：Mini Mission Control 的替代物。
              只承载 **Conversation recovery**：标题 + 相对时间 + selected；点击 = 官方 sessions.open。
              这里**不出现**任何 Task 字段（running/done/attention/schedule/progress）——那些归任务看板。 */}
          {conversations !== null && conversations !== undefined ? (
            <div className="dps-conv" data-dps-conversations="1" aria-label="会话列表">
              <div className="dps-conv-h">
                <span>会话列表</span>
                {convSnap.ready && convRows.length > 0 ? (
                  <span className="dps-conv-n" data-dps-conv-count={convRows.length}>
                    {convRows.length}
                  </span>
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
                              openConversationRow(row.id)
                            }}
                          >
                            <span className="dps-conv-title">
                              {row.title}
                              {row.running ? <span className="dps-conv-run" aria-label="运行中" /> : null}
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
