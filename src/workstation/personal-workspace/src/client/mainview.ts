// dsh-personal-workspace — 中央 Main Workspace View host（E4-FIX-IA-2 · Main/Aux
// Workspace + Desktop Tooling + Overlay Layering · FIX-2 的官方能力路径）。
//
// 官方能力结论（source-level audit，2026-09-07，docs/ROADMAP「现况」同步）：
//   - 桌面壳 AppFrame（@deepseek-ai/dsh-client-ui-layout）把中央主内容区声明为
//     child-slot **name:"conversation"**（kind: single，scope: session-maybe），
//     与 left「sidebar」/ right「details」/ root「shell.overlay」并列。
//   - 官方 Conversation UI = 该 seat 的唯一 occupant（dsh-client-ui-conversation，
//     priority 缺省 0）。ui-slots 语义：**single 槽 lowest priority 渲染**，
//     shadow 只需以更低 priority 注册同 seat；dispose 后官方 occupant 自动胜出恢复。
//   - ui-slots 硬约束（source-verified 2026-09-08，dsh-client-ui-slots register()）：
//     single 槽 **同 priority 只允许一个 occupant，重复注册直接 throw**。因此多副本
//     加载（旧+新 bundle 并存）时若死守固定 -2000，后注册副本必然 throw → 新 bundle
//     永远无法接管中央。实现改为 **自 -2000 向下探测空闲 priority**（本文件
//     tryRegisterAt/syncOccupant），让每个副本各占一个唯一负 priority、最低者渲染，
//     彻底消除“同 priority 冲突 throw / 旧实例占位锁死”这一真机导航失败模式。
//   - 因此 Personal Main Workspace 的最小真实实现 = 注册 conversation-seat occupant
//     （priority < 0，如 -2000），内部按 MainViewId 切换 home / task-board /
//     new-task / project-center / project-detail / workspace-center / recent；
//     「conversation」= dispose occupant 放行官方 Conversation。
//     · 不伪造 Main、不把 better-sidebar Aux 放大冒充、不重写 Harness Shell；
//     · Conversation 会话状态由官方 sessions 引擎持有，occupant 挂/卸不触碰引擎，
//       切回 Conversation 时官方 occupant 重渲染当前绑定 → 会话内容不丢；
//     · 中央 Main 与 右侧/底部 Auxiliary 可并存（Aux 面板独立于 AppFrame 中央列）。
//   不可用降级：无 slots / seat 注册失败 → hostOk=false，调用方回退
//   better-sidebar openTab（与旧 Aux 模型一致），UI 不假装成功。
//
// NOTE: 本模块保持纯 TS（零 react import）→ headless node smoke 可直接 import。

/** 中央主区视图标识。'conversation' 表示放行官方 Conversation（非 Personal 页面）。 */
export type MainViewId =
  | 'conversation'
  | 'home'
  | 'task-board'
  | 'new-task'
  | 'project-center'
  | 'project-detail'
  | 'workspace-center'
  | 'recent'

export const MAIN_VIEWS: readonly MainViewId[] = [
  'conversation',
  'home',
  'task-board',
  'new-task',
  'project-center',
  'project-detail',
  'unassigned',
  'workspace-center',
  'recent',
]

export function isMainView(v: unknown): v is MainViewId {
  return typeof v === 'string' && (MAIN_VIEWS as readonly string[]).includes(v)
}

/** Sidebar「主视图」项的中文名（smoke/UI 共用，避免跨 bundle 拷贝文案漂移）。 */
export const MAIN_VIEW_TITLES: Record<MainViewId, string> = {
  conversation: '会话',
  home: '主页',
  'task-board': '任务看板',
  'new-task': '＋新任务',
  'project-center': '项目',
  'project-detail': '项目详情',
  unassigned: '未分配',
  'workspace-center': '工作区',
  recent: '最近',
}

// ---------------------------------------------------------------------------
// 跨 bundle 事件字面量（personal-workspace ↔ personal-sidebar 不互相 import）。
export const MAIN_OPEN_EVENT = 'dsh:personal-main-open' // detail: { view }
export const MAIN_ACK_EVENT = 'dsh:personal-main-ack' // detail: { view, ok, reason? }
export const MAIN_STATE_EVENT = 'dsh:personal-main-state' // detail: { view }
export const MAIN_HOST_READY_FLAG = '__dshPersonalMainReady'
/**
 * PHASE C：Main-only 页面在主区不可用时**不提供 Aux 复制品** → 广播诚实原因，
 * 由 sidebar/Home 显示明确提示（含刷新/重试指引），绝不假装成功也不开替代面板。
 * detail: { view, reason }
 */
export const MAIN_UNAVAILABLE_EVENT = 'dsh:personal-main-unavailable'

// ---------------------------------------------------------------------------
// 轻量 store（persist per browser；默认 Conversation；惰性 hydrate 保 node smoke）。
const STORAGE_KEY = 'dsh.personal.mainview.v1'

let current: MainViewId = 'conversation'
let hydrated = false
const subs = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (isMainView(raw)) current = raw
  } catch {
    // storage 不可用 → 默认 Conversation
  }
}

function notify(): void {
  subs.forEach((fn) => {
    try {
      fn()
    } catch {
      // ignore per-listener failures
    }
  })
}

function persist(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // best-effort
  }
}

function broadcastState(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(MAIN_STATE_EVENT, { detail: { view: current } }))
  } catch {
    // best-effort
  }
}

export function mainViewGet(): MainViewId {
  hydrate()
  return current
}

export function mainViewSubscribe(fn: () => void): () => void {
  hydrate()
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

function setCurrent(view: MainViewId): void {
  current = view
  persist()
  notify()
  broadcastState()
  publishDiag()
}

/** 诊断读取：当前 host 状态（sidebar selfCheck / 真机取证共用）。 */
export function mainViewDiag(): {
  tag: string
  ready: boolean
  current: MainViewId
  registered: boolean
  seatPriority: number | null
  hostOk: boolean
} {
  return {
    tag: INSTANCE_TAG,
    ready,
    current,
    registered: disposer !== null,
    seatPriority: disposer !== null ? seatPriority : null,
    hostOk: mainHostOk(),
  }
}

/** 请求中央主区显示某视图（conversation = 放行官方 Conversation）。 */
export function mainViewShow(view: MainViewId): void {
  const next = isMainView(view) ? view : 'conversation'
  setCurrent(next)
}

/** workspace 内部「打开会话/建新会话」链路调用：切回官方 Conversation 主区。 */
export function mainViewBackToConversation(): void {
  setCurrent('conversation')
}

/** 中央 host 是否已接管（sidebar 用它决定直发事件 or 回退 Aux openTab）。 */
export function mainHostOk(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (window as unknown as Record<string, unknown>)[MAIN_HOST_READY_FLAG] === true
  } catch {
    return false
  }
}

function acknowledge(view: MainViewId, ok: boolean, reason?: string, seatPriority?: number | null): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(MAIN_ACK_EVENT, {
        detail: {
          view,
          ok,
          ...(seatPriority !== undefined && seatPriority !== null ? { seatPriority } : {}),
          ...(reason ? { reason } : {}),
        },
      }),
    )
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// conversation-seat occupant 管理（host 侧，纯逻辑；occupant React 组件由
// index.tsx 提供并经 initMainHost 注入 —— 本模块不依赖 react）。
export interface MainSlotsLike {
  register?: (options: Record<string, unknown>, component: unknown) => (() => void) | void
}

let slots: MainSlotsLike | null = null
let hostComponent: unknown = null
let disposer: (() => void) | null = null
let ready = false

const CONVERSATION_SEAT = 'conversation'
// single 槽同 priority 重复注册会 throw（ui-slots register 硬约束）→ 探测式占用：
// 自 -2000 向下找空闲 priority（最低者渲染），杜绝多副本场景新 bundle 被锁死。
const MAIN_PRIORITY_BASE = -2000
const MAIN_PRIORITY_FLOOR = -4096
// 本模块实例标识（跨 bundle/多副本区分：每个 bundle 副本各自独立模块作用域）。
const INSTANCE_TAG = 'dpw-' + Math.random().toString(36).slice(2, 8)

let seatPriority = MAIN_PRIORITY_BASE // 本副本赢得 seat 所用的 priority

function tryRegisterAt(priority: number): (() => void) | null {
  if (!ready || !slots || typeof slots.register !== 'function' || hostComponent === null) {
    return null
  }
  try {
    const cleanup = slots.register(
      { name: CONVERSATION_SEAT, priority, registrant: 'dsh-personal-workspace' },
      hostComponent,
    )
    if (typeof cleanup !== 'function') return null
    return cleanup
  } catch {
    // 同 cell 同 priority 已占用（或其它注册错误）→ 换更低 priority 重试
    return null
  }
}

function disposeOccupant(): void {
  if (disposer) {
    try {
      disposer()
    } catch {
      // ignore
    }
    disposer = null
    publishDiag()
  }
}

/** 诊断发布：把本副本 host 状态写进 window（真机/selfCheck/取证用；尽力而为）。 */
function publishDiag(): void {
  if (typeof window === 'undefined') return
  try {
    const g = (window as unknown as { __dshMainDiag?: unknown }).__dshMainDiag
    const target = (g ?? {}) as Record<string, unknown>
    target.tag = INSTANCE_TAG
    target.ready = ready
    target.current = current
    target.registered = disposer !== null
    target.seatPriority = disposer !== null ? seatPriority : null
    target.hostOk = mainHostOk()
    target.updatedAt = Date.now()
    ;(window as unknown as { __dshMainDiag: unknown }).__dshMainDiag = g ?? target
  } catch {
    // best-effort
  }
}

/** 依据当前视图维护 conversation-seat occupant：personal 视图 → 注册；conversation → 注销。 */
function syncOccupant(): boolean {
  if (current === 'conversation') {
    disposeOccupant()
    return true
  }
  if (disposer !== null) {
    publishDiag()
    return true
  }
  // 探测式占用：优先用上次成功 priority；冲突则逐级下探（最低者渲染）。
  let priority = seatPriority
  for (;;) {
    const cleanup = tryRegisterAt(priority)
    if (cleanup !== null) {
      disposer = cleanup
      seatPriority = priority
      publishDiag()
      return true
    }
    if (priority <= MAIN_PRIORITY_FLOOR) {
      console.warn(
        `[dsh-personal-workspace] 中央主区 occupant 注册失败（-2000..${MAIN_PRIORITY_FLOOR} 均被占用，保持官方 Conversation）`,
      )
      publishDiag()
      return false
    }
    priority -= 1
  }
}

function onOpen(ev: Event): void {
  let view: unknown
  try {
    view = (ev as CustomEvent<{ view?: unknown }>).detail?.view
  } catch {
    view = undefined
  }
  const target = isMainView(view) ? view : 'conversation'
  setCurrent(target)
  // syncOccupant 在 setCurrent→notify 的同步订阅里已执行；这里补一次并回 ACK
  // （ACK 回传本副本 seatPriority，供 sidebar 取证实际赢得 seat 的优先级/实例归属）。
  const ok = syncOccupant()
  acknowledge(target, ok, ok ? undefined : '中央主区不可用（seat 注册失败）——已回退辅助面板打开', ok ? seatPriority : null)
}

/**
 * 初始化中央主区 host（workspace apply 的 mount 内调用一次）。
 * @param opts.slots - 官方 ui-slots 服务句柄（ctx.get('slots')；缺失 → host 降级）
 * @param opts.host  - conversation-seat occupant React 组件（index.tsx 注入）
 * @returns 清理函数
 */
export function initMainHost(opts: { slots: MainSlotsLike | null; host: unknown }): () => void {
  slots = opts.slots
  hostComponent = opts.host
  ready = Boolean(slots && typeof slots.register === 'function' && hostComponent !== null)
  try {
    ;(window as unknown as Record<string, boolean>)[MAIN_HOST_READY_FLAG] = ready
  } catch {
    // best-effort
  }
  publishDiag()
  const offSub = mainViewSubscribe(() => {
    syncOccupant()
  })
  const onOpenRef = (ev: Event): void => onOpen(ev)
  try {
    window.addEventListener(MAIN_OPEN_EVENT, onOpenRef)
  } catch {
    // ignore
  }
  syncOccupant()
  broadcastState()
  return () => {
    try {
      window.removeEventListener(MAIN_OPEN_EVENT, onOpenRef)
    } catch {
      // ignore
    }
    try {
      offSub()
    } catch {
      // ignore
    }
    disposeOccupant()
    try {
      ;(window as unknown as Record<string, boolean>)[MAIN_HOST_READY_FLAG] = false
    } catch {
      // ignore
    }
    slots = null
    hostComponent = null
    ready = false
    seatPriority = MAIN_PRIORITY_BASE
    publishDiag()
  }
}

// headless smoke 用：重置模块态（多次 init/销毁不泄漏订阅与 occupant）。
export function mainViewResetForTests(): void {
  disposeOccupant()
  slots = null
  hostComponent = null
  ready = false
  seatPriority = MAIN_PRIORITY_BASE
  subs.clear()
  current = 'conversation'
  hydrated = true
  publishDiag()
}

/** 宿主级样式：中央列全高 + 独立滚动（数据属性供 smoke/真机断言）。 */
export const CSS_MAIN_HOST = String.raw`
.dpw-main-host {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--dsw-alias-bg-base, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.dpw-main-error {
  padding: 20px;
  font: 13px/1.7 var(--ds-font-family, system-ui, sans-serif);
  color: var(--dsw-alias-label-tertiary, #9a9aa5);
}
.dpw-main-error code { font-family: var(--ds-font-family-code, monospace); word-break: break-all; }
`
