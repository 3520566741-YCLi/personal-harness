// dsh-personal-workspace — 官方 Workspaces 目录投影（E4-FIX-IA-2 · IA2-3/4/7/8 共用）。
//
// 只投影官方真源 ctx.get('workspaces').list（{items, archivedSessionIds, state, phase,
// error}），item 字段以官方为准：{workspaceId, path, title, sessionIds[], createdAt,
// updatedAt}。绝不复制文件/目录树、不做假 workspace DB（IA2 §19）。
// 未注入（未知服务会 park 插件）→ 由 index 运行时 probe 后 bind；不可用 = ready:false，
// 消费 UI 诚实降级（禁用选择器 + 说明）。
import { useSyncExternalStore } from 'react'

export interface WorkspaceItem {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  createdAt?: number
  updatedAt?: number
}

export interface WorkspaceCatalogState {
  ready: boolean
  items: WorkspaceItem[]
  archivedSessionIds: string[]
  phase?: string
  error?: string
  /**
   * 尚未就绪、但**仍在有界重试**探测官方服务。
   * 真机语义（E4-FIX-IA-2 · 工作区能力确认）：probing=true → UI 只能说「读取中」；
   * 只有 probing=false 且 ready=false 才是「已确认能力不可用」的诚实结论。
   */
  probing?: boolean
}

const EMPTY: WorkspaceCatalogState = { ready: false, items: [], archivedSessionIds: [] }
let state: WorkspaceCatalogState = EMPTY
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

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function parseSnapshot(snapshot: unknown): void {
  const s = (snapshot ?? {}) as {
    items?: unknown
    archivedSessionIds?: unknown
    phase?: unknown
    error?: unknown
  }
  const items: WorkspaceItem[] = []
  if (Array.isArray(s.items)) {
    for (const raw of s.items) {
      const r = (raw ?? {}) as Record<string, unknown>
      const workspaceId = str(r.workspaceId) || str(r.id)
      const path = str(r.path)
      if (!workspaceId) continue
      const sessionIds = Array.isArray(r.sessionIds)
        ? r.sessionIds.filter((x): x is string => typeof x === 'string')
        : []
      const base = path.length > 0 ? path.split('/').filter(Boolean).pop() ?? path : workspaceId
      const title = str(r.title) || str(r.name) || base
      items.push({
        workspaceId,
        path,
        title,
        sessionIds,
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : undefined,
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : undefined,
      })
    }
  }
  const archived = Array.isArray(s.archivedSessionIds)
    ? s.archivedSessionIds.filter((x): x is string => typeof x === 'string')
    : []
  state = {
    ready: true,
    items,
    archivedSessionIds: archived,
    phase: str(s.phase) || undefined,
    error: str(s.error) || undefined,
  }
  notify()
}

let detach: (() => void) | null = null

// 官方 `workspaces` 服务（@deepseek-ai/dsh-api-workspace-controller）在 core web app bundle 里注册，
// 但注册**顺序**不保证早于本插件的 apply：真机曾出现 prepare 期 probe 得到 null →
// 若只 probe 一次，ready 就永久停在 false（=真机「工作区数据读取中…/官方 workspaces 服务未就绪」）。
// 因此：一次失败不落结论，改为**有界重试**（500ms × 24 ≈ 12s，覆盖冷启动顺序差），
// 重试窗口内 probing=true（UI 只能说“读取中”），窗口耗尽才写 probing=false 的诚实“不可用”。
const RETRY_INTERVAL_MS = 500
const RETRY_MAX_ATTEMPTS = 24
let retryTimer: ReturnType<typeof setInterval> | null = null
let retryAttempts = 0
/** 绑定期的「立刻尝试绑定」句柄：**不随重试窗口结束而失效**（窗口耗尽后仍可手动救援）。 */
let retryAttach: (() => boolean) | null = null
let retryCleanup: (() => void) | null = null

type TimerId = ReturnType<typeof setInterval>

// 计时器解析（防御式）：宿主/测试沙箱不保证全局 setInterval —— 真机是 window.setInterval，
// 无计时器能力时退化为「只探测一次」而不抛异常（绝不让能力探测失败拖垮 apply）。
function retrySetInterval(fn: () => void, ms: number): TimerId | null {
  const w = typeof window !== 'undefined' ? (window as unknown as { setInterval?: (f: () => void, m: number) => TimerId }) : null
  try {
    if (w && typeof w.setInterval === 'function') return w.setInterval(fn, ms)
    if (typeof setInterval === 'function') return setInterval(fn, ms)
  } catch {
    // ignore
  }
  return null
}

function retryClearInterval(id: TimerId): void {
  const w = typeof window !== 'undefined' ? (window as unknown as { clearInterval?: (i: TimerId) => void }) : null
  try {
    if (w && typeof w.clearInterval === 'function') w.clearInterval(id)
    else if (typeof clearInterval === 'function') clearInterval(id)
  } catch {
    // ignore
  }
}

/** 只停计时器，保留 retryAttach（手动重试 / 回前台重试仍可用）。 */
function stopRetry(): void {
  if (retryTimer !== null) {
    retryClearInterval(retryTimer)
    retryTimer = null
  }
  retryAttempts = 0
}

function onVisibilityRetry(): void {
  if (retryAttach === null || state.ready) return
  // 回到前台立即再试一次（桌面端窗口可能长时间挂起，期间服务恰好注册）。
  retryAttempts = 0
  if (retryAttach()) stopRetry()
}

/** 开始/继续有界重试；返回是否已就绪。 */
function runRetryAttempt(): boolean {
  if (retryAttach === null) return false
  if (retryAttach()) {
    stopRetry()
    return true
  }
  return false
}

function scheduleRetry(): void {
  if (retryTimer !== null) return
  const tick = (): void => {
    retryAttempts += 1
    if (runRetryAttempt()) return
    if (retryAttempts >= RETRY_MAX_ATTEMPTS) {
      stopRetry()
      state = {
        ready: false,
        items: [],
        archivedSessionIds: [],
        probing: false,
        error: `官方 workspaces 服务在 ${(RETRY_INTERVAL_MS * RETRY_MAX_ATTEMPTS) / 1000}s 重试窗口内未就绪`,
      }
      notify()
    }
  }
  const id = retrySetInterval(tick, RETRY_INTERVAL_MS)
  if (id !== null) retryTimer = id
  else retryTimer = null
}

/** index apply 时 probe ctx.get('workspaces') 并订阅其 .list；返回释放函数。 */
export function bindWorkspaceCatalog(
  getWorkspaces: () => unknown,
  /**
   * V1.2-J J3：服务**每次成功绑定**时回调（带原始服务对象）。
   * 用途 = 官方「服务晚于本插件 apply 注册」的真机场景下，写面（create/delete）也能跟上 ——
   * 否则写面会永久停留在"不可用"（那是不诚实的降级）。
   */
  onAttached?: (svc: unknown) => void,
): () => void {
  /** 尝试绑定官方服务；成功 true（已 apply + subscribe）。 */
  const tryAttach = (): boolean => {
    let svc: unknown = null
    try {
      svc = getWorkspaces()
    } catch {
      return false
    }
    const list = (svc as { list?: unknown } | null)?.list as
      | { getSnapshot?: () => unknown; subscribe?: (fn: () => void) => () => void }
      | null
    if (!list || typeof list.getSnapshot !== 'function' || typeof list.subscribe !== 'function') {
      return false
    }
    const apply = (): void => {
      try {
        parseSnapshot(list.getSnapshot!())
      } catch {
        // ignore transient parse failures
      }
    }
    try {
      apply()
      const off = list.subscribe(apply)
      detach = typeof off === 'function' ? off : null
    } catch {
      // 订阅失败 = 未绑定（保留重试机会），不写 ready
      return false
    }
    try {
      onAttached?.(svc)
    } catch {
      // 写面回调失败不影响只读投影（诚实降级：写面自己会报不可用）
    }
    return true
  }

  const cleanup = (): void => {
    stopRetry()
    retryAttach = null
    retryCleanup = null
    try {
      detach?.()
    } catch {
      // ignore
    }
    detach = null
    state = EMPTY
  }

  if (tryAttach()) {
    // 首次即成功：无需重试，但保留 visibility 兜底（服务可能在切会话后重建）。
    return cleanup
  }

  state = { ready: false, items: [], archivedSessionIds: [], probing: true }
  notify()
  retryAttempts = 0
  retryAttach = (): boolean => {
    if (!tryAttach()) return false
    state = { ...state, ready: true, probing: false, error: undefined }
    // tryAttach 内的 subscribe(apply) 已写入真实快照；这里仅确保 probing 状态被清掉。
    notify()
    return true
  }
  scheduleRetry()
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibilityRetry)
    retryCleanup = () => {
      try {
        document.removeEventListener('visibilitychange', onVisibilityRetry)
      } catch {
        // ignore
      }
    }
  }
  return () => {
    retryCleanup?.()
    cleanup()
  }
}

/**
 * 外部（如 Workspace Center「立即重试」按钮 / 回前台）立即重试一次；返回当前是否已就绪。
 * 重试窗口**耗尽后仍可用**（这是真机 rebadge 场景的救援路径）。
 */
export function retryWorkspaceCatalogNow(): boolean {
  if (state.ready) return true
  if (retryAttach === null) return false
  // 回到「探测中」的诚实显示（不是「已确认不可用」），因为在重试。
  if (!state.probing) {
    state = { ...state, probing: true, error: undefined }
    notify()
  }
  stopRetry()
  if (runRetryAttempt()) return true
  scheduleRetry()
  return false
}

export function useWorkspaceCatalog(): WorkspaceCatalogState {
  return useSyncExternalStore(subscribeWorkspaceCatalog, () => state, () => EMPTY)
}

/** 订阅目录状态（React 之外也可用；getSnapshot 语义 = 同状态同引用）。 */
export function subscribeWorkspaceCatalog(f: () => void): () => void {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

export function workspaceCatalogSnapshot(): WorkspaceCatalogState {
  return state
}
