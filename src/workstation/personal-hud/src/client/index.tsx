// dsh-personal-hud — client entry.
// Renders the bottom Status Bar + collapsible right Inspector as self-managed
// DOM overlays. Deliberately touches NO official slot seats (learned in
// STAGE 1: single-seat shadowing is risky), so the HUD is fully removable,
// adds zero boot-health risk, and needs no engine disposal semantics.
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CSS_PH, StatusBar, Inspector } from './hud-ui'
import { hudWindow, attachSessionFeed } from './store'
import { hudComponentVersion, PRODUCT_LABEL } from './product'

export const inject = ['sessions']

// 组件版本改为构建注入（E5-3）：不再写死（写死会在 bump 后立刻说谎）。
const HUD_VERSION = hudComponentVersion()
// Single-instance guard: if apply ever runs twice without a clean disposal
// (HMR / double activation), keep only the first overlay set.
let hudMounted = false

type LooseCtx = {
  get?: (key: string) => unknown
  effect?: (fn: () => unknown, label?: string) => unknown
}

export function apply(ctx: LooseCtx): void {
  // Never throw during client boot.
  try {
    applyInner(ctx)
  } catch (error) {
    console.warn('[dsh-personal-hud] apply aborted:', error)
  }
}

function applyInner(ctx: LooseCtx): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (hudMounted) return true // single instance per page

  const sessionsOf = (): unknown => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    } catch {
      return undefined
    }
  }

  const mount = (): (() => void) => {
    hudMounted = true
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-dsh-plugin', 'dsh-personal-hud')
    styleEl.textContent = CSS_PH
    document.head.appendChild(styleEl)

    const barHost = document.createElement('div')
    barHost.id = 'ph-statusbar-host'
    const inspHost = document.createElement('div')
    inspHost.id = 'ph-inspector-host'
    document.body.appendChild(barHost)
    document.body.appendChild(inspHost)

    let barRoot: Root | null = null
    let inspRoot: Root | null = null
    try {
      barRoot = createRoot(barHost)
      barRoot.render(<StatusBar /> as ReactNode)
      inspRoot = createRoot(inspHost)
      inspRoot.render(<Inspector /> as ReactNode)
    } catch (error) {
      // react-dom unavailable or render failed: keep DOM shell + keyboard only
      console.warn('[dsh-personal-hud] react render unavailable:', error)
    }

    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        hudWindow.setOpen(!hudWindow.get().open)
      }
    }
    window.addEventListener('keydown', onKey)

    const offFeed = attachSessionFeed(sessionsOf)

    return () => {
      hudMounted = false
      try {
        offFeed()
      } catch {
        // ignore
      }
      window.removeEventListener('keydown', onKey)
      try {
        barRoot?.unmount()
      } catch {
        // ignore
      }
      try {
        inspRoot?.unmount()
      } catch {
        // ignore
      }
      barHost.remove()
      inspHost.remove()
      styleEl.remove()
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => mount(), `ph: ${PRODUCT_LABEL} · hud ${HUD_VERSION}`)
  } else {
    mount()
  }
  return true
}
