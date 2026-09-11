// dsh-personal-hud — local stores + session feed (React-free core).
import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// HUD window state (open/width) persisted per browser.
export interface HudWindow {
  open: boolean
  width: number
}
const OPEN_KEY = 'dsh.hud.open'
const WIDTH_KEY = 'dsh.hud.width'
const MIN_W = 260
const MAX_W = 520

function readOpen(): boolean {
  // v0.1.2: never auto-open at boot — a persisted "open" from a previous page
  // used to re-overlay the top-right (covering the better-sidebar tab row and
  // blocking its collapse). The Inspector opens only via an explicit ⌘I /
  // button in the current page session.
  return false
}
function readWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(n)) return Math.min(MAX_W, Math.max(MIN_W, n))
  } catch {
    // ignore
  }
  return 320
}

let windowState: HudWindow = { open: readOpen(), width: readWidth() }
const winSubs = new Set<() => void>()

export const hudWindow = {
  get(): HudWindow {
    return windowState
  },
  setOpen(open: boolean): void {
    if (windowState.open === open) return
    windowState = { ...windowState, open }
    try {
      window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
    } catch {
      // ignore storage failures
    }
    winSubs.forEach((f) => f())
  },
  setWidth(width: number): void {
    const w = Math.min(MAX_W, Math.max(MIN_W, Math.round(width)))
    if (windowState.width === w) return
    windowState = { ...windowState, width: w }
    try {
      window.localStorage.setItem(WIDTH_KEY, String(w))
    } catch {
      // ignore
    }
    winSubs.forEach((f) => f())
  },
  subscribe(f: () => void): () => void {
    winSubs.add(f)
    return () => {
      winSubs.delete(f)
    }
  },
}

export function useHudWindow(): HudWindow {
  return useSyncExternalStore(
    (f) => hudWindow.subscribe(f),
    () => hudWindow.get(),
    () => ({ open: false, width: 320 }),
  )
}

// ---------------------------------------------------------------------------
// Session feed — honest data from the official Session Controller snapshot.
export interface HudSession {
  id: string
  title: string
  running: boolean
  updatedAt?: number
}

export interface HudState {
  ready: boolean
  currentId: string | undefined
  current: HudSession | null
  recent: HudSession[]
  modelLabel: string
  runtime: 'connecting' | 'online' | 'offline'
}

const INITIAL: HudState = {
  ready: false,
  currentId: undefined,
  current: null,
  recent: [],
  modelLabel: '',
  runtime: 'connecting',
}

interface FeedSnapshotLike {
  list?: unknown
  current?: unknown
  selection?: unknown
}

let state: HudState = INITIAL
const feedSubs = new Set<() => void>()

function notify(): void {
  feedSubs.forEach((f) => f())
}

function rowOf(raw: unknown): HudSession | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const id = String(r.id ?? r.sessionId ?? '')
  if (!id) return null
  const title = typeof r.label === 'string' ? r.label : typeof r.title === 'string' ? r.title : ''
  return {
    id,
    title: title && title.length > 0 ? title : '（未命名会话）',
    running: r.running === true,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : undefined,
  }
}

function parseSnapshot(snap: unknown): { rows: HudSession[]; currentId: string | undefined } {
  const s = snap as FeedSnapshotLike | null
  const raw = Array.isArray(s)
    ? s
    : Array.isArray(s?.list)
      ? s.list
      : Array.isArray((s as { sessions?: unknown })?.sessions)
        ? (s as { sessions?: unknown[] }).sessions
        : []
  const rows = (raw as unknown[])
    .map((r) => rowOf(r))
    .filter((x): x is HudSession => x !== null)
    .filter((x) => x.id !== undefined)
  const currentId =
    typeof (s as { current?: unknown })?.current === 'string'
      ? (s as { current: string }).current
      : typeof (s as { selection?: unknown })?.selection === 'string'
        ? (s as { selection: string }).selection
        : undefined
  return { rows, currentId }
}

/** Attach to the host Session Controller list snapshot; returns a disposer. */
export function attachSessionFeed(getSessions: () => unknown): () => void {
  let source: { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } | null = null
  try {
    const svc = getSessions() as { list?: { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } }
    source = svc?.list ?? null
  } catch {
    source = null
  }
  if (!source || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') {
    // no session feed available — keep the HUD shell usable with placeholders
    return () => {
      // nothing attached
    }
  }

  const apply = (): void => {
    try {
      const snap = source!.getSnapshot!()
      const { rows, currentId } = parseSnapshot(snap)
      const current = rows.find((r) => r.id === currentId) ?? null
      const next: HudState = {
        ready: true,
        currentId,
        current,
        recent: rows.slice(0, 12),
        modelLabel: state.modelLabel, // preserved; not sourced in STAGE 2
        runtime: 'online',
      }
      state = next
      notify()
    } catch {
      // ignore transient parse failures
    }
  }
  apply()
  const off = source.subscribe(apply)
  return () => {
    try {
      off?.()
    } catch {
      // ignore
    }
  }
}

export function getHudState(): HudState {
  return state
}

export function useHudState(): HudState {
  return useSyncExternalStore(
    (f) => {
      feedSubs.add(f)
      return () => {
        feedSubs.delete(f)
      }
    },
    () => state,
    () => INITIAL,
  )
}

// E5-3 · FAIL-1 修复：旧 STAGE-2 的 `MOCK`（写死的 Agent/Project 占位名 + "Stage 3/4 接入"）
//   已**删除** —— 它把假名字当成当前 Agent/Project 显示，且文案早已过期（Stage 3/4 均已交付）。
//   现在没有真源的字段一律渲染 '—'（未知 ≠ 0），绝不显示占位名。
