// dsh-personal-workspace — board-page guard (v0.1.7, final rule).
// Rule (user-defined): while the task-board full page is OPEN hide the
// better-sidebar right/bottom reopen handles (the top-right toggle cluster,
// [data-dsh-toggle-cluster]) so they stop covering the board's "+ 新建任务"
// button; restore them on leaving the board.
//
// Why identity-based, not geometry (learned from v0.1.4–v0.1.6 diagnostics):
// the cluster is position:absolute at the window's top-right corner
// (y≈39–67, right:vw-10, z=45) — its top sits at y≤40 so the old "thin fixed
// edge handle" heuristic classified it as top chrome and never hit (hid=0,
// skTop=14). Board-open is now the task-board plugin's own authoritative
// marker html[data-dsh-taskboard-active] (the old textContent check matched
// the board's hidden-but-mounted tree and reported a 0x0 button). The guard
// only hides clusters whose rect actually intersects the visible board view,
// so an open (non-collapsed) sidebar — cluster over its own tab strip, board
// narrower — is left alone. Diagnostic badge removed.
export function startBoardGuard(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  const hidden = new Set<HTMLElement>()
  let interval = 0

  /** Task-board plugin marks the overlay active on <html> (CSS: html[data-dsh-taskboard-active]). */
  const boardActive = (): boolean => {
    try {
      if (document.documentElement?.hasAttribute('data-dsh-taskboard-active')) return true
    } catch {
      // ignore
    }
    try {
      // Fallback (other task-board versions): a *visible* 新建任务 button.
      const btn = Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => {
        if (!(b.textContent ?? '').includes('新建任务')) return false
        const r = b.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      return !!btn
    } catch {
      return false
    }
  }

  const restoreOne = (el: HTMLElement): void => {
    try {
      if (el.style.getPropertyValue('display') === 'none') el.style.display = ''
    } catch {
      // ignore
    }
    hidden.delete(el)
  }

  const restoreAll = (): void => {
    hidden.forEach(restoreOne)
    hidden.clear()
  }

  const intersects = (a: DOMRect, b: DOMRect): boolean =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

  const sweep = (): void => {
    try {
      if (!boardActive()) {
        restoreAll()
        return
      }
      const boardEl = document.querySelector<HTMLElement>('[data-dsh-taskboard-view]')
      const boardRect = boardEl?.getBoundingClientRect()
      if (!boardRect || boardRect.width <= 0 || boardRect.height <= 0) {
        // Board tree mounted but not on screen (e.g. data-dsh-ssh-active) — no occlusion.
        restoreAll()
        return
      }
      const clusters = Array.from(document.querySelectorAll<HTMLElement>('[data-dsh-toggle-cluster]'))
      const toHide: HTMLElement[] = []
      const toShow = Array.from(hidden)
      for (const cl of clusters) {
        if (hidden.has(cl)) continue
        const r = cl.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        if (intersects(r, boardRect)) toHide.push(cl)
      }
      if (toShow.length === 0 && toHide.length === 0) return
      for (const el of toShow) restoreOne(el)
      for (const el of toHide) {
        try {
          el.style.setProperty('display', 'none')
          hidden.add(el)
        } catch {
          // ignore
        }
      }
    } catch {
      // guard is best-effort
    }
  }

  const scheduleSweep = (ms: number): void => {
    try {
      window.clearTimeout((window as unknown as { __dph_timer?: number }).__dph_timer)
    } catch {
      // ignore
    }
    try {
      const t = window.setTimeout(() => {
        sweep()
        try {
          window.clearInterval(interval)
        } catch {
          // ignore
        }
        interval = window.setInterval(sweep, 1200)
      }, ms)
      ;(window as unknown as { __dph_timer: number }).__dph_timer = t
    } catch {
      // no timer available
    }
  }

  let mo: MutationObserver | null = null
  try {
    mo = new MutationObserver(() => scheduleSweep(120))
    mo.observe(document.body, { childList: true, subtree: true, attributes: false })
  } catch {
    // observer unavailable
  }
  scheduleSweep(400)

  return () => {
    try {
      mo?.disconnect()
    } catch {
      // ignore
    }
    try {
      window.clearInterval(interval)
    } catch {
      // ignore
    }
    restoreAll()
  }
}
