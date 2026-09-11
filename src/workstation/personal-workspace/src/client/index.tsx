// dsh-personal-workspace — client entry (STAGE 5 + E4-FIX).
// Probes the existing better-sidebar service (never declared in `inject` —
// unknown-service inject would park the plugin on hosts without it) and, when
// present, registers our custom workspace views (Personal Dashboard) as tabs.
// When absent the plugin stays inert. Chat/center and official seats are
// never touched.
//
// E4-FIX-2..5 接线：任务板 = reconcile store（官方 task-board Host +
// sessions.list + workspaces.list 三源合一，见 reconcile.ts）驱动的控制面，
// 注册为 better-sidebar「任务板」标签；Stop 走官方 binding.session.cancel()
// （D3，capability probe）；打开会话走官方 sessions.open（D5）。
import { Component, useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { projectRegistry } from '../../../personal-registry/src/projects'
import { CSS_WS } from './dashboard'
import {
  CSS_MAIN_HOST,
  initMainHost,
  mainHostOk,
  mainViewBackToConversation,
  MAIN_UNAVAILABLE_EVENT,
  mainViewGet,
  mainViewShow,
  mainViewSubscribe,
  type MainSlotsLike,
  type MainViewId,
} from './mainview'
import { bindAttentionFeed, bindBoardOpenTask } from './attention'
import {
  bindHomeServices,
  bindHomeTaskSource,
  CSS_HOME,
  HomeView,
  type CreateConversationFn,
  type NewConversationOpts,
  type NewConversationResult,
} from './home'
import { CSS_NEWTASK, NewTaskTab, pushStartPrefill } from './newtask'
import { bindProjectCenterAction, bindProjectCenterDetail, bindProjectCenterUnassigned, CSS_PROJECT_CENTER, ProjectCenterView } from './project-center'
import {
  bindProjectDetailActions,
  bindProjectDetailSessions,
  CSS_PROJECT_DETAIL,
  ProjectDetailView,
  refreshProjectDetailArchived,
  setDetailProjectId,
} from './project-detail'
import { bindRecentServices, CSS_RECENT, RecentView } from './recent'
import { startBoardGuard } from './boardguard'
import { TaskReconcile } from './reconcile'
import { TaskBoardClient } from './taskboard'
import { CSS_SELECTORS } from './selectors'
import { CSS_UNASSIGNED, UnassignedView } from './unassigned'
import { bindWorkspaceCatalog, subscribeWorkspaceCatalog, workspaceCatalogSnapshot } from './workspace-catalog'
import { applyAgentPreset, applyPermissionPreset, bindSessionBindings } from './session-bindings'
import { bindWorkspaceCenterActions, CSS_WORKSPACE_CENTER, WorkspaceCenterView } from './workspace-center'
import {
  bindTaskBoard,
  CSS_TASKBOARD,
  requestOpenTask,
  setOpenSessionForBoard,
  setStopExecutor,
  TaskBoardView,
} from './taskboard-view'

export const inject = ['sessions']

// 运行期诊断（E4-FIX-IA-2 · MAIN NAVIGATION RUNTIME FAILURE 取证）：
//   - 每次 apply 递增 window.__dshDiag.pkg.workspaceInstances → 真机一眼可判
//     「是否同时存活新旧两份 bundle」（1 = 单份；≥2 = 重复加载，正是中央导航失效的
//     头号怀疑根因之一：single 槽同 priority 重复注册 throw / 旧实例占位锁死）。
//   - __DPS_SHA__ 由构建注入 repo HEAD 短哈希（repo HEAD = build = installed =
//     runtime-loaded 证据链的一环，见 docs/E4_FIX_IA2_MAIN_NAV_RUNTIME.md）。
// 版本语义（E5-3）：**组件**版本由 build.mjs 注入（package.json version），不再写死在代码里；
//   **产品**版本（Personal Harness V1.1）= personal-version/product.json，由左栏品牌头部/Inspector 显示。
//   诊断只报组件版本，两者**绝不混用**（旧值曾写死 0.1.18 → 会对着装机的 0.1.20 说谎）。
declare const __DPS_VERSION__: string
const PKG_VERSION = typeof __DPS_VERSION__ === 'string' && __DPS_VERSION__.length > 0 ? __DPS_VERSION__ : '0.1.20'
const BUILD_SHA = typeof __DPS_SHA__ === 'string' && __DPS_SHA__.length > 0 ? __DPS_SHA__ : 'dev'

type LooseCtx = {
  get?: (key: string) => unknown
  effect?: (fn: () => unknown, label?: string) => unknown
}

function ensureDiag(): Record<string, unknown> {
  const w = window as unknown as { __dshDiag?: Record<string, unknown> }
  if (!w.__dshDiag) w.__dshDiag = {}
  return w.__dshDiag
}

/** apply 计数 + 版本/构建哈希 + slots 服务句柄留存（slotsRaw 供 selfCheck 快照 seat）。 */
function diagApplyTick(ctx: LooseCtx): void {
  try {
    const d = ensureDiag()
    const pkg = ((d.pkg ?? {}) as Record<string, unknown>)
    d.pkg = pkg
    pkg.workspaceInstances = ((pkg.workspaceInstances as number) ?? 0) + 1
    pkg.workspaceVersion = PKG_VERSION
    pkg.workspaceSha = BUILD_SHA
    const sha = ((d.sha ?? {}) as Record<string, unknown>)
    d.sha = sha
    sha.workspace = BUILD_SHA
    if (!d.slotsRaw) {
      const raw = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
      if (raw && typeof raw === 'object') d.slotsRaw = raw
    }
  } catch {
    // diag best-effort
  }
}

export function apply(ctx: LooseCtx): void {
  try {
    applyInner(ctx)
  } catch (error) {
    console.warn('[dsh-personal-workspace] apply aborted (kept stock UI):', error)
  }
}

type TabSeed = { type: string; title?: string; path?: string; id?: string; url?: string; meta?: unknown }

function betterSidebarOf(ctx: LooseCtx): {
  registerTab?: (d: unknown) => unknown
  openTab?: (seed: TabSeed) => void
  getTab?: (id: string) => unknown
} | null {
  try {
    const sb = typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined
    if (sb && typeof (sb as { registerTab?: unknown }).registerTab === 'function') {
      return sb as {
        registerTab: (d: unknown) => unknown
        openTab?: (seed: TabSeed) => void
        getTab?: (id: string) => unknown
      }
    }
    return null
  } catch {
    return null
  }
}

// 当前可用的 better-sidebar 句柄（mount 内赋值），供 Home ① 打开「新任务」标签。
let workbench: ReturnType<typeof betterSidebarOf> | null = null

/** 打开「新任务」：中央主区 host 可用 → 中央 Main 全尺寸 Composer；否则回退 Aux 标签。 */
export function openNewTaskTab(text?: string): boolean {
  try {
    pushStartPrefill(text ?? '')
    if (mainHostOk()) {
      mainViewShow('new-task')
      return true
    }
    const wb = workbench
    if (!wb || typeof wb.openTab !== 'function') return false
    wb.openTab({ type: 'new-task', path: 'new' })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 中央 Main Workspace View（E4-FIX-IA-2 · FIX-2）：
//   view 模型/seat occupant 生命周期在 mainview.ts（纯 TS）；React 壳在本文件
//   （occupant 必须能独立渲染于 better-sidebar 之外的 AppFrame 中央列，因此
//   由 conversation-seat occupant 提供，见 initMainHost 注入）。

function usePersonalMainView(): MainViewId {
  return useSyncExternalStore(mainViewSubscribe, mainViewGet, () => 'conversation')
}

/** 中央主区可渲染的 Personal 页面（不含 conversation —— 那由官方 occupant 提供）。 */
const MAIN_RENDER: Record<Exclude<MainViewId, 'conversation'>, () => ReactNode> = {
  home: () => <HomeView />,
  'task-board': () => <TaskBoardView />,
  'new-task': () => <NewTaskTab />,
  'project-center': () => <ProjectCenterView />,
  'project-detail': () => <ProjectDetailView />,
  unassigned: () => <UnassignedView />,
  'workspace-center': () => <WorkspaceCenterView />,
  recent: () => <RecentView />,
}

/**
 * 中央主区视图渲染错误边界：视图渲染崩溃 → 显示错误占位（不静默回退官方
 * Conversation —— 静默回退正是“点击后 Main 不切换、无任何反馈”的真机现象之一），
 * 并记入 window.__dshDiag.crashes 供侧栏调试面板/取证读取。
 */
class MainBoundary extends Component<{ view: MainViewId; children: ReactNode }, { failed: string | null }> {
  override state: { failed: string | null } = { failed: null }

  static getDerivedStateFromError(error: unknown): { failed: string | null } {
    return { failed: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[dsh-personal-workspace] 中央主区视图「${this.props.view}」渲染崩溃：`, error)
    try {
      const w = window as unknown as { __dshDiag?: { crashes?: Array<{ t: number; view: string; error: string }> } }
      const d = (w.__dshDiag ??= {} as { crashes?: Array<{ t: number; view: string; error: string }> })
      d.crashes = d.crashes ?? []
      d.crashes.push({ t: Date.now(), view: this.props.view, error: msg })
    } catch {
      // diag best-effort
    }
  }

  override render(): ReactNode {
    if (this.state.failed !== null) {
      return (
        <div
          className="dpw-main-host dpw-main-error"
          data-dsh-plugin="dsh-personal-workspace"
          data-dsh-main-host="1"
          data-dsh-main-error="1"
          data-dsh-main-view={this.props.view}
        >
          中央主区视图「{this.props.view}」渲染失败，已显示错误占位（已记入诊断）。<br />
          <code>{this.state.failed}</code>
          <br />
          <br />
          请点击左侧「会话」切回官方会话，或改用辅助面板打开该视图。
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * conversation-seat occupant：当前 Personal 主视图（occupant 仅在非 conversation 时被注册）。
 * 挂载计时（证据链 ⑩ mount times）：每次 Personal 主视图 commit 记
 * window.__dshDiag.mounts {t: performance.now(), view} —— 与 sidebar trace 的
 * main-click/ack ms 对照即可量化 Click→Main Shell 上屏延迟。
 */
function PersonalMainOccupant(): ReactNode {
  const view = usePersonalMainView()
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || view === 'conversation') return
      const w = window as unknown as { __dshDiag?: { mounts?: Array<{ t: number; view: string }> } }
      const d = (w.__dshDiag ??= {} as { mounts?: Array<{ t: number; view: string }> })
      d.mounts = d.mounts ?? []
      d.mounts.push({ t: performance.now(), view })
      if (d.mounts.length > 60) d.mounts.splice(0, d.mounts.length - 60)
    } catch {
      // diag best-effort
    }
  }, [view])
  if (view === 'conversation') return null
  const render = MAIN_RENDER[view]
  if (!render) return null
  return (
    <div className="dpw-main-host" data-dsh-plugin="dsh-personal-workspace" data-dsh-main-host="1" data-dsh-main-view={view}>
      <MainBoundary view={view} key={view}>
        {render()}
      </MainBoundary>
    </div>
  )
}

/** 视图 → 更好-sidebar Aux 标签的降级 seed（host 不可用时 openTab 回退，不假装成功）。 */
function auxSeedOf(view: MainViewId): { type: string; path: string; title?: string } | null {
  switch (view) {
    case 'task-board':
      return { type: 'task-board', path: 'board' }
    case 'new-task':
      return { type: 'new-task', path: 'new' }
    case 'home':
      return { type: 'mission-control', path: 'home' }
    case 'project-center':
      return { type: 'project-center', path: 'center' }
    case 'project-detail':
      return { type: 'project-detail', path: 'detail', title: '项目详情' }
    case 'workspace-center':
      return { type: 'workspace-center', path: 'center' }
    case 'recent':
      return { type: 'recent', path: 'recent' }
    default:
      return null
  }
}

/**
 * 主视图导航：中央 Main host 可用 → 切中央；否则回退 Aux 标签（与旧面板模型一致）。
 * conversation = 放行官方 Conversation（dispose occupant）。
 */
export function navigateMain(view: MainViewId): boolean {
  try {
    if (view === 'conversation') {
      mainViewBackToConversation()
      return true
    }
    if (mainHostOk()) {
      mainViewShow(view)
      return true
    }
    const seed = auxSeedOf(view)
    if (!seed) return false
    const wb = workbench
    if (wb && typeof wb.openTab === 'function') {
      wb.openTab(seed)
      return true
    }
    return false
  } catch {
    return false
  }
}

/** ui-slots 服务探测（与 betterSidebar 同模式：不 inject，运行时 get；缺失 → null 降级）。 */
function slotsOf(ctx: LooseCtx): MainSlotsLike | null {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
    const s = (viaGet as MainSlotsLike | null | undefined) ?? (ctx as { slots?: MainSlotsLike | null }).slots ?? null
    if (s && typeof s.register === 'function') return s
  } catch {
    // slots 服务缺失 → null（honest degrade）
  }
  return null
}


function applyInner(ctx: LooseCtx): boolean {
  if (typeof window === 'undefined') return false

  diagApplyTick(ctx)

  const getSessions = (): unknown => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    } catch {
      return undefined
    }
  }
  const openSession = (id: string): void => {
    // 打开官方会话 = 中央回到 Conversation 主区（Personal Main occupant 释放，
    // 官方 conversation occupant 胜出渲染当前绑定 —— 会话状态由引擎持有）。
    try {
      mainViewBackToConversation()
    } catch {
      // best-effort
    }
    try {
      const s = getSessions() as { open?: (sid: string) => void } | null
      s?.open?.(id)
    } catch {
      // opening is best-effort
    }
  }

  const mount = (): (() => void) => {
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-dsh-plugin', 'dsh-personal-workspace')
    styleEl.textContent =
      CSS_WS +
      '\n' +
      CSS_HOME +
      '\n' +
      CSS_SELECTORS +
      '\n' +
      CSS_NEWTASK +
      '\n' +
      CSS_TASKBOARD +
      '\n' +
      CSS_RECENT +
      '\n' +
      CSS_PROJECT_CENTER +
      '\n' +
      CSS_PROJECT_DETAIL +
      CSS_UNASSIGNED +
      '\n' +
      CSS_WORKSPACE_CENTER +
      '\n' +
      CSS_MAIN_HOST
    document.head.appendChild(styleEl)

    // IA2-3：官方 workspaces 目录投影（Home/New Task/Workspace Center 共用数据源；
    //   未 probe 到 → ready=false，选择器诚实降级）。bindHomeServices 3rd param =
    //   createConversation（官方 sessions.create+open → composer setDraft 预填）。
    const offWsCat = bindWorkspaceCatalog(() => probeWorkspaces(ctx))
    // E4-FIX-IA-2 FINAL · PHASE A：官方会话「创建后绑定」通道（Agent 预设 via ctx.remote.agentPresets、
    //   权限预设 via 官方 /permission 命令 + permissions 投影读回校验）。绝不假装生效。
    const offBindings = bindSessionBindings(ctx as unknown as { get?: (k: string) => unknown; remote?: Record<string, unknown> }, getSessions)
    const offHome = bindHomeServices(getSessions, openSession, createConversation(ctx, getSessions, openSession))

    // E4-FIX-2..5：任务板 reconcile store。
    //   官方三源：task-board Host HTTP(state/action/SSE) + sessions.list +
    //   workspaces.list（archivedSessionIds）。workspaces 未 inject（未知服务
    //   会 park 插件）→ 运行时 try/catch 探测；不可用时诚实降级（归档标记缺）。
    const boardClient = new TaskBoardClient()
    const sessionsList = adaptSnapshotStore(getSessions() as { list?: unknown } | null)
    // E4-FIX-IA-2 · 工作区能力确认：archived 集改由 **workspace-catalog** 提供 —— 该目录带
    //   有界重试（见 workspace-catalog.ts），能吸收「官方 workspaces 服务晚于本插件 apply
    //   注册」的启动顺序差。原实现在此一次性 probe：服务晚到 → 该 store 永久 null，
    //   归档标记静默缺失（真机“工作区数据读取中…”的另一半根因）。
    const workspacesList = {
      // PHASE I（§18/§21 真相修正）：目录**未就绪**时**不提供** archivedSessionIds 字段。
      //   旧实现恒返回数组（可能是空数组）→ reconcile 的 `!Array.isArray(ids)` 永不触发 →
      //   workspacesSource 恒 true → 全产品把「归档来源不可读」显示成「没有归档」（未知当 0）。
      //   现在：未就绪 → 投递 `{}`（= 未知），由 projection.archiveTruthOf 统一判定。
      getSnapshot: () => {
        const snap = workspaceCatalogSnapshot()
        return snap.ready ? { archivedSessionIds: snap.archivedSessionIds } : {}
      },
      subscribe: (f: () => void) => subscribeWorkspaceCatalog(f),
    }
    const reconcile = new TaskReconcile({
      fetchHost: () => boardClient.state(),
      sessionsList,
      workspacesList,
      subscribeHost: (listener) => boardClient.subscribe(listener),
    })
    const offBind = bindTaskBoard(reconcile, boardClient)
    // IA2-2：最近面板 = 官方 sessions 真源 + reconcile archived 集（同 Home 接线模式）。
    const offRecent = bindRecentServices(getSessions, reconcile, (sessionId) => openSession(sessionId), () => void openNewTaskTab())
    // D5：任务详情「打开会话」= 官方 sessions.open（与 Home 同一注入点）。
    setOpenSessionForBoard((sessionId) => openSession(sessionId))
    // D3：Stop/Cancel = 官方 binding(sessionId).session.cancel()（同 ui-conversation
    //   停止按钮路径）。capability probe：binding 不存在/无 cancel → 诚实失败。
    setStopExecutor((sessionId) => stopViaBinding(getSessions(), sessionId))
    // E4-FIX-6/7：Home 的 task host 真源（attention/running/recent done/archived 集）+ 定位动作。
    //   定位 = 中央 Main「任务板」并选中该任务（host 不可用自动回退 Aux 任务板标签）。
    const openBoardAt = (taskId: string): void => {
      try {
        requestOpenTask(taskId)
        navigateMain('task-board')
      } catch {
        // best-effort: task board tab unavailable → Home keeps honest empty/badge state
      }
    }
    const offHomeTasks = bindHomeTaskSource(reconcile, openBoardAt)
    // IA2-5：Project Center 的「未归入项目 → 定位任务板」动作 = 同一 openBoardAt 注入点。
    const offProjectAction = bindProjectCenterAction(openBoardAt)
    // IA2-6：Project Detail —— 会话真源订阅（全量）+ 归档集联动 + 动作注入。
    const offDetailSessions = bindProjectDetailSessions(getSessions, () => reconcile.getState().archivedSessionIds)
    const offDetailArchive = reconcile.subscribe(() =>
      refreshProjectDetailArchived(() => reconcile.getState().archivedSessionIds),
    )
    const offDetailActions = bindProjectDetailActions({
      openSession: (sessionId) => openSession(sessionId),
      openTaskBoard: openBoardAt,
      openProjectCenter: () => {
        try {
          navigateMain('project-center')
        } catch {
          // best-effort
        }
      },
      openNewTaskPanel: () => {
        try {
          openNewTaskTab('')
        } catch {
          // best-effort
        }
      },
      // IA2-8：项目详情 → 工作区中心跳转（中央 Main；host 不可用自动回退 Aux）。
      openWorkspaceCenter: () => {
        try {
          navigateMain('workspace-center')
        } catch {
          // best-effort
        }
      },
    })
    // IA2-6：项目中心行点击 → 中央 Main「项目详情」（先置当前项目；host 不可用回退 Aux 面板）。
    const offCenterDetail = bindProjectCenterDetail((projectId) => {
      setDetailProjectId(projectId)
      navigateMain('project-detail')
    })
    // PHASE F：项目面板「查看未分配」→ 中央 Main「未分配」视图（Unassigned 是合法状态，有计数有入口）。
    const offCenterUnassigned = bindProjectCenterUnassigned(() => {
      navigateMain('unassigned')
    })
    // IA2-7：Workspace Center 动作（打开会话 / 打开真实目录 = better-sidebar editor 文件夹窗口）。
    const offWsCenterActions = bindWorkspaceCenterActions({
      openSession: (sessionId) => openSession(sessionId),
      openFolder: (path) => {
        try {
          const wb = workbench
          if (wb && typeof wb.openTab === 'function') {
            wb.openTab({ type: 'editor', path, meta: { dir: true } })
            return
          }
        } catch {
          // best-effort
        }
      },
      // IA2-8：工作区中心 → 项目详情跳转（置当前项目 + 中央 Main；host 不可用回退 Aux）。
      openProjectDetail: (projectId) => {
        setDetailProjectId(projectId)
        navigateMain('project-detail')
      },
    })
    reconcile.bind()
    // E4-FIX-IA-2 FINAL · PHASE B：**删除 Mini Mission Control**，改为向 sidebar 广播
    //   **Needs Attention 计数**（唯一真源 = reconcile/projection，不做第二份 attention store）。
    //   bind 必须在 reconcile.bind() 之后（保证首拉已发起）。
    const offAttention = bindAttentionFeed(reconcile)
    // IA2-9：Sidebar 点「任务行」→ 任务板定位（面板由 sidebar openTab；这里只把目标任务
    //   交给 taskboard-view.requestOpenTask —— pending 持久，面板晚挂载也能消费）。
    const offLocate = bindBoardOpenTask((taskId) => {
      try {
        requestOpenTask(taskId)
      } catch {
        // best-effort: board tab unavailable → Home/sidebar honest empty/badge state
      }
    })

    let registered = false
    const tryRegister = (sb: {
      registerTab: (d: unknown) => unknown
      openTab?: (seed: TabSeed) => void
    }): boolean => {
      workbench = sb
      if (registered) return true
      try {
        // E4-FIX-IA-2 FINAL · PHASE C（§9/§10）：**Main-only 页面不再注册为 Aux 工具**。
        //   主页 / 新任务 / 任务板 / 最近 / 项目 / 项目详情 / 工作区 = 中央主区页面语义，
        //   它们不是「做某件事时需要的工具」。功能**没有删除** —— 仍在 MAIN_RENDER 中由
        //   中央主区渲染；此处只是把它们从 Aux Tool Registry 中移除（避免右侧/底部出现
        //   一整套与主区重复的「第二产品」）。Aux 只保留真正的工具（官方右栏/底栏自有窗格）。
        registered = true
        return true
      } catch (error) {
        console.warn('[dsh-personal-workspace] registerTab failed:', error)
        registered = false
        return false
      }
    }

    const s0 = betterSidebarOf(ctx)
    if (s0) tryRegister(s0)

    let tries = 0
    const iv = window.setInterval(() => {
      tries += 1
      if (!registered) {
        const sb = betterSidebarOf(ctx)
        if (sb) tryRegister(sb)
      }
      if (registered || tries >= 40) window.clearInterval(iv)
    }, 100)

    const offBoard = startBoardGuard()

    // 中央 Main Workspace host：把 PersonalMainOccupant 挂到官方 AppFrame 中央
    // 列 seat「conversation」（priority -2000 < 官方 0 → shadow）；dispose 释放回
    // 官方 Conversation。slots 缺失/注册失败 → hostOk=false，导航自动回退 Aux。
    const offMainHost = initMainHost({ slots: slotsOf(ctx), host: PersonalMainOccupant })

    return () => {
      try {
        window.clearInterval(iv)
      } catch {
        // ignore
      }
      try {
        offBoard()
      } catch {
        // ignore
      }
      try {
        offHome()
      } catch {
        // ignore
      }
      try {
        offBindings()
      } catch {
        // ignore
      }
      try {
        offHomeTasks()
      } catch {
        // ignore
      }
      try {
        offProjectAction()
      } catch {
        // ignore
      }
      try {
        offDetailSessions()
      } catch {
        // ignore
      }
      try {
        offDetailArchive()
      } catch {
        // ignore
      }
      try {
        offDetailActions()
      } catch {
        // ignore
      }
      try {
        offCenterDetail()
      offCenterUnassigned()
      } catch {
        // ignore
      }
      try {
        offWsCenterActions()
      } catch {
        // ignore
      }
      try {
        offBind()
      } catch {
        // ignore
      }
      try {
        offRecent()
      } catch {
        // ignore
      }
      try {
        offWsCat()
      } catch {
        // ignore
      }
      try {
        offAttention()
      } catch {
        // ignore
      }
      try {
        offLocate()
      } catch {
        // ignore
      }
      try {
        offMainHost()
      } catch {
        // ignore
      }
      try {
        reconcile.dispose()
      } catch {
        // ignore
      }
      styleEl.remove()
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => mount(), 'dpw: workspace host')
  } else {
    mount() // no effect channel (headless): page reload resets anyway
  }
  return true
}

/** 把官方 store 形态（{getSnapshot, subscribe}）归一成 reconcile 需要的形态。 */
function adaptSnapshotStore(svc: { list?: unknown } | null): { getSnapshot: () => unknown; subscribe: (fn: () => void) => () => void } | null {
  try {
    const list = (svc ?? {})?.list as { getSnapshot?: unknown; subscribe?: unknown } | null
    if (
      list !== null &&
      list !== undefined &&
      typeof (list as { getSnapshot?: unknown }).getSnapshot === 'function' &&
      typeof (list as { subscribe?: unknown }).subscribe === 'function'
    ) {
      return list as { getSnapshot: () => unknown; subscribe: (fn: () => void) => () => void }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * workspaces 服务探测（**运行时可重试**：由 workspace-catalog 的有界重试反复调用）。
 * 注意：`workspaces` 已在 package.json 的 dsh.client.inject 中声明（官方
 * @deepseek-ai/dsh-api-workspace-controller），此处仍保留 try/catch —— 服务可能尚未注册
 * 或本环境未提供，返回 null = 未就绪（绝不伪造工作区）。
 */
function probeWorkspaces(ctx: LooseCtx): { list?: unknown } | null {
  try {
    const ws = typeof ctx.get === 'function' ? ctx.get('workspaces') : undefined
    if (ws && typeof ws === 'object' && 'list' in (ws as object)) {
      return ws as { list?: unknown }
    }
  } catch {
    // service absent → null（诚实降级：归档标记缺）
  }
  return null
}

/** D3：官方停止 = binding(sessionId)?.session.cancel()（capability probe）。 */
async function stopViaBinding(
  sessionsSvc: unknown,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  try {
    const svc = sessionsSvc as {
      binding?: (id: string) => { session?: { cancel?: () => Promise<{ ok?: boolean; error?: string }> } } | undefined
    } | null
    if (!svc || typeof svc.binding !== 'function') {
      return { ok: false, error: '官方会话停止能力不可用（sessions.binding 缺失）——请到官方会话内停止' }
    }
    const session = svc.binding(sessionId)?.session
    if (!session || typeof session.cancel !== 'function') {
      return { ok: false, error: '该会话未激活，无法停止（请到官方会话内操作）' }
    }
    const result = await session.cancel()
    if (result && result.ok === false) {
      return { ok: false, error: result.error ?? '宿主拒绝了停止请求' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ---------------------------------------------------------------------------
// IA2-3：Home Quick Start「开始」= 官方新会话创建链路。
//   链路（H 取证）：目标工作区 = 用户选择 ?? 自动（当前会话所在 / 最近 / 首个）→
//   sessions.create({workspaceId}) → sessions.open(id) → composer setDraft 预填
//   （probe conversation 服务；同 better-sidebar appendToDraft 通道）→ 归入所选项目。
//   诚实降级：无可用工作区 / 创建或预填能力缺失 → 明确 message（不假装）。
interface LooseSessionsLike {
  create?: (opts: { workspaceId?: string }) => unknown | Promise<unknown>
  open?: (id: string) => unknown
}

/** 目标工作区选择：显式选择 ?? 自动（当前会话所在 / updatedAt 最近 / 首个）。 */
function pickTargetWorkspace(
  opts: NewConversationOpts,
  getSessions: () => unknown,
): { workspaceId: string | null; reason?: string } {
  if (opts.workspaceId && opts.workspaceId.length > 0) {
    return { workspaceId: opts.workspaceId }
  }
  const cat = workspaceCatalogSnapshot()
  if (!cat.ready) {
    return {
      workspaceId: null,
      reason: cat.probing
        ? '官方 workspaces 服务仍在探测中'
        : '本环境未提供官方 workspaces 服务（capability limitation）',
    }
  }
  if (cat.items.length === 0) {
    return { workspaceId: null, reason: '当前没有任何官方工作区目录' }
  }
  // 当前会话所在 workspace（官方会话必属某个 workspace → 大多数场景第一选择）
  let currentId = ''
  try {
    const svc = getSessions() as { list?: { getSnapshot?: () => { current?: unknown } } } | null
    const snap = svc?.list?.getSnapshot?.()
    const cur = (snap as { current?: unknown } | undefined)?.current
    currentId = typeof cur === 'string' ? cur : ''
  } catch {
    // ignore
  }
  if (currentId) {
    const hit = cat.items.find((w) => w.sessionIds.includes(currentId))
    if (hit) return { workspaceId: hit.workspaceId }
  }
  const sorted = [...cat.items].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return { workspaceId: sorted[0]?.workspaceId ?? cat.items[0].workspaceId }
}

/** composer 预填：sessions.scope(id) → conversation.input.for(actx).setDraft（probe；失败返回 false）。 */
function prefillDraftViaConversation(ctx: LooseCtx, sessionId: string, text: string): boolean {
  try {
    const sessionsSvc = (typeof ctx.get === 'function' ? ctx.get('sessions') : undefined) as {
      scope?: (id: string) => unknown
    } | null
    const actx = sessionsSvc?.scope?.(sessionId)
    if (actx === undefined || actx === null) return false
    const conversation = (typeof ctx.get === 'function' ? ctx.get('conversation') : undefined) as {
      input?: { for?: (a: unknown) => { state?: { getSnapshot?: () => { draft?: string } }; setDraft?: (t: string) => void } }
    } | null
    const input = conversation?.input?.for?.(actx)
    if (!input || typeof input.setDraft !== 'function') return false
    const draft = input.state?.getSnapshot?.().draft ?? ''
    input.setDraft(draft.trim() === '' ? text : `${draft.trim()}\n${text}`)
    return true
  } catch {
    return false
  }
}

/** 创建 createConversation 闭包（Home Quick Start 提交执行体）。 */
function createConversation(
  ctx: LooseCtx,
  getSessions: () => unknown,
  openSession: (id: string) => void,
): CreateConversationFn {
  return async (draft, opts): Promise<NewConversationResult> => {
    try {
      const t = draft.trim()
      if (!t) return { ok: false, message: '内容为空。' }
      const target = pickTargetWorkspace(opts, getSessions)
      const svc = getSessions() as LooseSessionsLike | null
      if (!svc || typeof svc.create !== 'function') {
        return { ok: false, message: '官方会话创建能力不可用（sessions.create 缺失）——请改用官方 ＋新会话。' }
      }
      // §2.3 纪律：**绝不伪造 workspaceId**。官方 contract（实证
      //   @deepseek-ai/dsh-api-session-controller/lib/client.js:1786-1794 + host
      //   types/commands.js:85-98）允许 workspaceId / cwd 都不给 → 宿主用 defaultCwd 建会话。
      //   因此工作区能力缺失时**不再拒绝创建**（那会让「主页 = 开始一段会话」直接不可用），
      //   而是按官方默认目录创建 + 在回执里如实说明未指定工作区的原因。
      const wsNote = target.workspaceId
        ? ''
        : `未指定工作区：${target.reason ?? '没有可用工作区'}（已按官方默认目录创建）`
      const created = await svc.create(target.workspaceId ? { workspaceId: target.workspaceId } : {})
      const sessionId = typeof created === 'string' ? created : String((created as { id?: unknown })?.id ?? '')
      if (!sessionId) return { ok: false, message: '会话创建未返回会话编号，请重试。' }

      // E4-FIX-IA-2 FINAL · PHASE A：Agent / Permission 必须**真实作用**到这个 Conversation。
      //   只有走官方通道并拿到官方回执才算生效；任一项被拒 → 如实报告（绝不假装）。
      //   · Agent 预设：官方 agentPresets.select（仅空白会话可换；host 以 agent-preset/locked 拒绝）
      //   · 权限预设：官方 /permission 命令 + permissions 投影读回校验
      const applied: string[] = []
      const failed: string[] = []
      if (opts.agentId) {
        const r = await applyAgentPreset(sessionId, opts.agentId)
        if (r.ok) applied.push(`Agent 预设「${opts.agentId}」已按官方通道绑定`)
        else failed.push(`Agent 预设未绑定：${r.reason}`)
      }
      if (opts.permission) {
        const r = await applyPermissionPreset(sessionId, opts.permission)
        if (r.ok) applied.push(`权限预设「${opts.permission}」已应用${r.note !== undefined ? `（${r.note}）` : '（官方投影读回校验通过）'}`)
        else failed.push(`权限预设未应用：${r.reason}`)
      }

      // 归入所选项目（Personal relation layer；未选则不写）
      if (opts.projectId) {
        try {
          projectRegistry.assignSession(sessionId, opts.projectId)
        } catch {
          // best-effort: relation failure must not block conversation creation
        }
      }
      // 打开官方会话（注入点：sessions.open —— 与 Home/Board/Recent 同一路径）。
      // E4-FIX-IA-2 FINAL：**有绑定失败就不自动跳转** —— openSession 会让中央主区交还
      // 官方 Conversation（Main occupant 退场），Home 的失败回执会在渲染前被卸载，
      // 用户永远看不到原因（真机可复现）。失败时留在主页展示原因，由用户自行打开。
      const hasFailure = failed.length > 0
      if (!hasFailure) {
        try {
          openSession(sessionId)
        } catch {
          // opening is best-effort
        }
      }
      // composer 预填（probe conversation；同 better-sidebar appendToDraft 通道）
      // 绑定结果（官方回执）拼进提示：成功也明确说明，失败必须显示原因。
      const bindNote = (): string => {
        const parts = [...applied, ...failed]
        return parts.length > 0 ? parts.join('；') : ''
      }
      const joinNotes = (...parts: string[]): string => parts.filter((p) => p.length > 0).join('；')
      const prefilled = prefillDraftViaConversation(ctx, sessionId, t)
      if (prefilled) {
        return { ok: true, sessionId, message: joinNotes(wsNote, bindNote()), failed: hasFailure }
      }
      // 预填不可用 → 剪贴板降级（诚实：明确告诉用户做了什么）
      let copiedOk = false
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(t)
          copiedOk = true
        }
      } catch {
        copiedOk = false
      }
      const prefillNote = copiedOk
        ? '新会话已打开；未能自动填入，目标文本已复制到剪贴板（⌘V 粘贴发送）。'
        : '新会话已打开；未能自动填入且剪贴板不可用，请在输入框手动粘贴目标文本。'
      const note = joinNotes(wsNote, bindNote())
      return {
        ok: true,
        sessionId,
        message: note.length > 0 ? `${prefillNote}｜${note}` : prefillNote,
        failed: hasFailure,
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
}

// FIX-5 Overlay/Layering：层 token 与 body-portal 工具（headless smoke 直接断言）。
export { LAYERS, mountIntoBody, overlayRootFor, removeOverlayRoot } from './layering'
// PHASE E：把 NewTask Composer 的关键入口暴露给 bundle 消费者（回归脚本直接挂载组件；
//   运行时不依赖这些导出，行为零变化）。
export { NewTaskTab, pushNewTaskProject, pushNewTaskSession, pushStartPrefill, clearPendingSessionOrigin } from './newtask'
