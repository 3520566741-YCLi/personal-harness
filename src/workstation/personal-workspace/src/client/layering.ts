// dsh-personal-workspace — overlay/layering token single source of truth.
//
// WHY THIS FILE EXISTS (E4-FIX-IA-2 · FIX-5 Overlay/Layering)
// ---------------------------------------------------------------------------
// The desktop profile renders three independent DOM planes that all fight over
// vertical order:
//
//   1. Official DSH app inside `#root`. The desktop shell wraps it in an
//      intermediate transform, so every `position:fixed` inside the app is
//      confined to that wrapper's stacking context. Official *primitives*
//      escape it: Menu / HoverCard / Modal / Toast / Onboarding portal into
//      document.body (`react-dom.createPortal`), which is why they can float
//      above everything else. Anything rendered inline inside #root (a plain
//      seat occupant, a third-party plugin's hand-rolled popover) can NOT be
//      raised above a body-level host by CSS alone — z-index is trapped by
//      the wrapper context.
//
//   2. better-sidebar 0.17.1 appends a body-level panel host:
//         [data-dsh-panel-host] { position: fixed; inset: 0; z-index: 25;
//                                  pointer-events: none; overflow: hidden }
//      Right/bottom workbench panels (z-index 40 inside the host), floating
//      windows (42), the top-right toggle cluster (45), a boundary error
//      banner (50) and the text-selection popup (60) live in that host.
//
//   3. This repo's personal plugins (workspace / sidebar / hud). Their own
//      floating chrome (bottom status bar, Inspector card, future Personal
//      overlay surfaces) must pick a level that never guesses.
//
// LAYER SCALE (measured from installed builds, not invented):
//
//   20    official AppFrame overlay layer   (@deepseek-ai/dsh-client-ui-layout)
//   25    better-sidebar panel host         (body-level, see above)
//   40    better-sidebar right/bottom panel
//   42    better-sidebar floating window
//   45    better-sidebar toggle cluster (top-right "＋")
//   50    better-sidebar boundary error banner
//   60    better-sidebar text-selection popup
//   100   official Tooltip / HoverCard / inline Menu
//   1000  official Modal                     (body portal)
//   1100  official portaled Menu / Toast / Onboarding   (body portal)
//
// RULES (documented contract for every Personal surface):
//   * Never use ad-hoc huge z-index values ("everything 999999"). Pick a named
//     LAYERS token; if none fits, extend this file with a comment.
//   * A surface that must float ABOVE the Aux workbench AND can be clipped by
//     an ancestor context must be portaled to document.body (see
//     mountIntoBody) at a LAYERS.popover-or-above level. Native <select>
//     popups are rendered by the OS and are immune to CSS layering — no token
//     needed.
//   * Third-party inline (non-portaled) overlays inside #root — e.g. the
//     dsh-cost-meter balance-chip detail panel — cannot be lifted above the
//     better-sidebar host by CSS from another plugin. That is a documented
//     limitation (see docs/OVERLAY_LAYERING.md), not a reason to push z to
//     the maximum.
// ---------------------------------------------------------------------------

export const LAYERS = {
  /** Official AppFrame in-frame overlay seat (shell.overlay). */
  frameOverlay: 20,
  /** better-sidebar body-level panel host (all Aux panels live inside it). */
  auxHost: 25,
  /** better-sidebar right/bottom workbench panel. */
  auxPanel: 40,
  /** better-sidebar free-floating window. */
  auxFloat: 42,
  /** better-sidebar top-right "＋" toggle cluster. */
  auxToggle: 45,
  /** better-sidebar boundary error banner. */
  auxBoundary: 50,
  /** better-sidebar text-selection popup. */
  auxSelection: 60,
  /**
   * hud status bar & Inspector live between the Aux selection popup (60) and
   * the official Modal (1000): they are always-on chrome that must stay above
   * the workbench panels yet never cover a modal backdrop / toast.
   */
  hudStatus: 450,
  hudInspector: 550,
  /** Official primitives band (body-portaled when they need to escape). */
  popover: 100,
  modal: 1000,
  toast: 1100,
} as const

export type LayerToken = (typeof LAYERS)[keyof typeof LAYERS]

/**
 * Append `node` directly to document.body so it escapes the #root wrapper
 * transform and can participate in the body-level stacking order at `z`.
 * Best-effort: returns false when the DOM is unavailable (headless smoke).
 */
export function mountIntoBody(node: HTMLElement, z: LayerToken): boolean {
  try {
    if (typeof document === 'undefined' || typeof document.body === 'undefined') return false
    node.style.position = 'fixed'
    node.style.zIndex = String(z)
    document.body.appendChild(node)
    return true
  } catch {
    return false
  }
}

/**
 * Ensure a Personal overlay root exists as a direct body child at `z` and
 * return it (creating one per level on first use). Children are interactive;
 * the root itself never intercepts pointers (mirrors the official
 * `._1qAH1q_overlayLayer` pattern). Guarded for headless environments.
 */
export function overlayRootFor(z: LayerToken): HTMLElement | null {
  try {
    if (typeof document === 'undefined' || typeof document.body === 'undefined') return null
    const attr = 'data-dpw-overlay'
    const existing = document.querySelector(`[${attr}="${String(z)}"]`)
    if (existing instanceof HTMLElement) return existing
    const root = document.createElement('div')
    root.setAttribute(attr, String(z))
    root.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${String(z)}`
    document.body.appendChild(root)
    return root
  } catch {
    return null
  }
}

/** Remove a root created by overlayRootFor (idempotent). */
export function removeOverlayRoot(z: LayerToken): void {
  try {
    if (typeof document === 'undefined') return
    document.querySelectorAll(`[data-dpw-overlay="${String(z)}"]`).forEach((el) => el.remove())
  } catch {
    // best-effort cleanup
  }
}
