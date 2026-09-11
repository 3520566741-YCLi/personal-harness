// dsh-personal-workspace — E4-FIX · reconcile store（E4-FIX-1/D9）。
//
// 统一「官方事实」刷新与投影发布，给 Home / Task Board / Recent 共享同一份派生状态：
//   - Task Host（state/action/SSE）→ tasks + sessionDefaultPermission（官方账本）
//   - sessions.list 快照订阅        → runtime 行（running/updatedAt）
//   - workspaces.list 快照订阅      → archivedSessionIds（registry 归档集）
//   - projectBoard(...)（纯函数）   → ProjectedTask[] 发布给订阅者
//
// 同步策略（D9：不造高频轮询；事件驱动优先）：
//   · 启动：拉一次 Host state
//   · 任何 action：以 Host 返回的快照为准
//   · Host SSE：revision 变化才重拉（事件本身不带任务列表）
//   · visibilitychange → 回前台重拉一次（官方 host-api 同款）
//   · sessions/workspaces 官方 store 变化 → 只重投影
//   · UI 打开（mount）时显式 refresh()
//
// React-free：无 fetch 直连（fetch 全部经注入的 client），可 headless 测状态机。
import type { TaskBoardSnapshot } from './taskboard'
import { projectBoard, sessionRowsOf, type ProjectedTask, type ProjectionInput } from './projection'

export interface TaskReconcileState {
  /** 至少拉取过一次 Host state 并完成投影。 */
  ready: boolean
  /** 任务板宿主是否可达。 */
  hostReachable: boolean
  /** Host 快照 revision。 */
  revision: number
  /** 拉取 Host 的错误信息（无 = 正常）。 */
  hostError?: string
  /** 投影结果（Active + Archived 全量，官方顺序）。 */
  tasks: ProjectedTask[]
  /** 官方 registry 归档会话集（workspaces.list.archivedSessionIds；源缺失 = [] + workspacesSource=false）。 */
  archivedSessionIds: string[]
  /** 会话源 / 归档源是否可用（缺失 → archived 恒 false 诚实降级）。 */
  sessionsSource: boolean
  workspacesSource: boolean
}

const INITIAL: TaskReconcileState = {
  ready: false,
  hostReachable: false,
  revision: 0,
  tasks: [],
  archivedSessionIds: [],
  sessionsSource: false,
  workspacesSource: false,
}

export interface SnapshotStoreLike<T> {
  getSnapshot: () => T
  subscribe: (fn: () => void) => () => void
}

export interface ReconcileDeps {
  /** 每次需要拉 Host 时调用（state()）。 */
  fetchHost: () => Promise<TaskBoardSnapshot>
  /** sessions.list（官方 store）；null = 宿主无该服务。 */
  sessionsList?: SnapshotStoreLike<unknown> | null
  /** workspaces.list（官方 store）；null = 宿主无该服务。 */
  workspacesList?: SnapshotStoreLike<unknown> | null
  /** Host SSE/visibility 订阅（client.subscribe）。 */
  subscribeHost?: (listener: (event?: { revision?: number }) => void) => () => void
}

/** 模块级 reconcile（一个页面一个实例；apply 时 bind）。 */
export class TaskReconcile {
  private readonly deps: ReconcileDeps
  private state: TaskReconcileState = { ...INITIAL }
  private readonly subs = new Set<() => void>()
  private disposers: Array<() => void> = []
  private bound = false
  private fetchInFlight: Promise<void> | null = null
  private lastSnapshot: TaskBoardSnapshot | null = null
  private hostRevisionSeen = 0
  private sessionsAvail: boolean | null = null
  private workspacesAvail: boolean | null = null

  constructor(deps: ReconcileDeps) {
    this.deps = deps
  }

  getState(): TaskReconcileState {
    return this.state
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn)
    return () => {
      this.subs.delete(fn)
    }
  }

  private notify(): void {
    for (const fn of [...this.subs]) {
      try {
        fn()
      } catch {
        // subscriber failure is isolated
      }
    }
  }

  bind(): () => void {
    if (this.bound) return this.dispose.bind(this)
    this.bound = true
    const offS = this.safeSubscribe(this.deps.sessionsList, () => this.reproject())
    const offW = this.safeSubscribe(this.deps.workspacesList, () => this.reproject())
    const offH = this.safeSubscribeHost()
    if (offS !== undefined) this.disposers.push(offS)
    if (offW !== undefined) this.disposers.push(offW)
    if (offH !== undefined) this.disposers.push(offH)
    // 首次拉取（headless 无 document 时不主动 fetch，避免 smoke 悬空）。
    this.reproject()
    void this.refresh()
    return this.dispose.bind(this)
  }

  dispose(): void {
    for (const d of this.disposers.splice(0)) {
      try {
        d()
      } catch {
        // ignore
      }
    }
    this.bound = false
    this.subs.clear()
  }

  private safeSubscribe(store: SnapshotStoreLike<unknown> | null | undefined, fn: () => void): (() => void) | undefined {
    try {
      if (store && typeof store.subscribe === 'function') return store.subscribe(fn)
    } catch {
      // ignore
    }
    return undefined
  }

  private safeSubscribeHost(): (() => void) | undefined {
    try {
      const off = this.deps.subscribeHost?.((event) => {
        if (event?.revision !== undefined && event.revision !== this.hostRevisionSeen) {
          void this.refresh()
        } else if (event === undefined) {
          // visibilitychange 回前台：重拉一次
          void this.refresh()
        }
      })
      return off
    } catch {
      return undefined
    }
  }

  /** 手动 reconcile（mount / 用户刷新）：重拉 Host + 重投影。 */
  refresh(): Promise<void> {
    return this.fetchHostState()
  }

  /** 直接应用一份 Host 快照（action 的返回体）——不重复 GET。 */
  ingest(snapshot: TaskBoardSnapshot): void {
    this.lastSnapshot = snapshot
    this.hostRevisionSeen = snapshot.revision ?? 0
    const tasks = this.project(snapshot)
    const archivedSessionIds = this.readArchived()
    this.state = {
      ...this.state,
      ready: true,
      hostReachable: true,
      revision: snapshot.revision ?? 0,
      hostError: undefined,
      tasks,
      archivedSessionIds,
      sessionsSource: this.sessionsAvail === true,
      workspacesSource: this.workspacesAvail === true,
    }
    this.notify()
  }

  private async fetchHostState(): Promise<void> {
    if (this.fetchInFlight !== null) return this.fetchInFlight
    const run = async (): Promise<void> => {
      try {
        const snapshot = await this.deps.fetchHost()
        this.lastSnapshot = snapshot
        this.hostRevisionSeen = snapshot.revision ?? 0
        const tasks = this.project(snapshot)
        const archivedSessionIds = this.readArchived()
        this.state = {
          ...this.state,
          ready: true,
          hostReachable: true,
          revision: snapshot.revision ?? 0,
          hostError: undefined,
          tasks,
          archivedSessionIds,
          sessionsSource: this.sessionsAvail === true,
          workspacesSource: this.workspacesAvail === true,
        }
      } catch (error) {
        const archivedSessionIds = this.readArchived()
        this.state = {
          ...this.state,
          hostReachable: false,
          hostError: error instanceof Error ? error.message : String(error),
          archivedSessionIds,
          sessionsSource: this.sessionsAvail === true,
          workspacesSource: this.workspacesAvail === true,
        }
      }
      this.notify()
    }
    this.fetchInFlight = run()
    try {
      await this.fetchInFlight
    } finally {
      this.fetchInFlight = null
    }
  }

  /** 用最近快照重投影（sessions/workspaces 变化时）。 */
  private reproject(): void {
    const snapshot = this.lastSnapshot
    if (snapshot === null) return
    const tasks = this.project(snapshot)
    const archivedSessionIds = this.readArchived()
    this.state = {
      ...this.state,
      tasks,
      archivedSessionIds,
      sessionsSource: this.sessionsAvail === true,
      workspacesSource: this.workspacesAvail === true,
    }
    this.notify()
  }

  private project(snapshot: TaskBoardSnapshot): ProjectedTask[] {
    const sessions = this.readSessions()
    const archived = this.readArchived()
    const input: ProjectionInput = {
      tasks: snapshot.tasks,
      sessions,
      archivedSessionIds: archived,
      sessionDefaultPermission: snapshot.sessionDefaultPermission,
    }
    return projectBoard(input)
  }

  private readSessions(): ReturnType<typeof sessionRowsOf> {
    try {
      const snap = this.deps.sessionsList?.getSnapshot()
      if (snap === undefined || snap === null) {
        this.markSource('sessions', false)
        return []
      }
      this.markSource('sessions', true)
      return sessionRowsOf(snap)
    } catch {
      this.markSource('sessions', false)
      return []
    }
  }

  private readArchived(): string[] {
    try {
      const snap = this.deps.workspacesList?.getSnapshot()
      const s = (snap ?? {}) as { archivedSessionIds?: unknown }
      const ids = s.archivedSessionIds
      if (!Array.isArray(ids)) {
        this.markSource('workspaces', false)
        return []
      }
      this.markSource('workspaces', true)
      return ids.filter((x): x is string => typeof x === 'string')
    } catch {
      this.markSource('workspaces', false)
      return []
    }
  }

  /** 只记录源可用性（state 组装点在 emit 时统一写入 sessionsSource/workspacesSource）。 */
  private markSource(key: 'sessions' | 'workspaces', available: boolean): void {
    if (key === 'sessions') this.sessionsAvail = available
    if (key === 'workspaces') this.workspacesAvail = available
  }
}

export type { ProjectedTask }
