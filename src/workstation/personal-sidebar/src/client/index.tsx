// dsh-personal-sidebar — client entry.
// Registers the Personal browsing region as a shadowing occupant of the
// official `sidebar.workspaces` seat (priority < the built-in ui-workspace
// browser), plus a footer-action toggle that switches between the Personal
// region and the official Workspace browser. Official shell seats (brand,
// New Session, rail, Settings, cost-meter footer cards) are never touched.
import type { ReactNode } from 'react'
import { CSS } from './styles'
import { personalMode, usePersonalMode } from './controller'
import { PersonalBrowser } from './PersonalBrowser'
import { SwitcherIcon } from './icons'
import { adoptThoughtSwitcher } from './thoughtdagSwitch'
import { PersonalBrandName } from './brand'
import { buildSelfCheckReport, diagPkgTick } from './diag'

// Cordis client contract: ctx.<service> is only readable after the module
// declares it in `inject`. Mirrors ui-workspace's own client entry.
export const inject = ['slots', 'sessions']

// Returning from the Personal region: the engine's ctx.slots.register()
// returns a plain cleanup function (() => void) — NOT an object with
// dispose(). Calling that cleanup removes our occupant and the built-in
// ui-workspace occupant (same cell, higher priority, always registered)
// becomes the winner again — a seamless switch with no page reload. A reload
// is only used as a last-resort fallback if the cleanup itself throws.
const reloadFallback = (): void => {
  try {
    window.setTimeout(() => {
      try {
        window.location.reload()
      } catch {
        // reload best-effort
      }
    }, 150)
  } catch {
    // no window timer in this environment (e.g. headless smoke)
  }
}

// ---- diagnostic live badge (v0.1.8; hidden unless localStorage dps.debug=1) --
// 版本/构建哈希：__DPS_VERSION__ / __DPS_SHA__ 由 build.mjs 注入（package.json +
// repo HEAD 短哈希）→ 证据链 repo HEAD = build = installed = runtime-loaded。
const DPS_VERSION = typeof __DPS_VERSION__ === 'string' && __DPS_VERSION__.length > 0 ? __DPS_VERSION__ : '0.1.18'
const DPS_SHA = typeof __DPS_SHA__ === 'string' && __DPS_SHA__.length > 0 ? __DPS_SHA__ : 'dev'
/**
 * 诊断浮层的 z（PHASE J 叠层审计结论）：这两个表面是**排障专用**，仅在 `?dpsdebug=1` / 显式开关下挂载，
 * 需要盖住一切（含官方 Modal/Toast）便于取证。我方面向用户的表面一律走 `layering.ts` 的 LAYERS token，
 * **不**使用此值 —— 它是「有意为之的诊断例外」，不是随手魔数。
 */
const DIAG_DEBUG_Z = 2147483000
const DPS_DEBUG = (() => {
  try {
    return window.localStorage.getItem('dps.debug') === '1'
  } catch {
    return false
  }
})()
const badge = (phase: string): void => {
  if (!DPS_DEBUG) return
  try {
    let el = document.getElementById('dps-live-badge')
    if (!el) {
      el = document.createElement('div')
      el.id = 'dps-live-badge'
      el.style.cssText =
        'position:fixed;right:10px;bottom:30px;z-index:' + DIAG_DEBUG_Z + ';font:11px/1.3 system-ui,sans-serif;' +
        'color:#fff;background:rgba(40,44,60,.85);padding:2px 7px;border-radius:5px;pointer-events:none;'
      document.body.appendChild(el)
    }
    el.textContent = phase
  } catch {
    // badge is best-effort diagnostics only
  }
}
if (DPS_DEBUG) badge('dps:' + DPS_VERSION + ' loaded')
// ---------------------------------------------------------------------------

// Loose host typing: the loader passes the Cordis client context. All host
// calls are guarded so a missing capability degrades to "official UI only".
type LooseCtx = {
  get?: (key: string) => unknown
  effect?: (fn: () => unknown, label?: string) => unknown
  slots?: {
    inject: (name: string, cb: () => unknown, label?: string) => unknown
    // Engine contract: register returns a cleanup function (see ui-slots SlotCore.register).
    register: (opts: Record<string, unknown>, component: unknown) => () => void
  }
}

/** Mode toggle pill — **唯一位置 = 官方页脚行动区**（`sidebar.footer.action`，左下角）。
 *  2026-09-10 真机反馈：会话头 utilities 行里的第二枚「返回官方」已删除（页面里不需要两个）。 */
function ModeToggle(_props: { wide?: boolean }): ReactNode {
  const mode = usePersonalMode()
  const personal = mode === 'personal'
  return (
    <button
      type="button"
      className="dps-foot-toggle"
      data-on={personal}
      aria-pressed={personal}
      title={personal ? 'Personal Sidebar 已开启 · 点击返回官方浏览' : '进入 Personal Harness（个人工作台）'}
      onClick={() => personalMode.set(personal ? 'official' : 'personal')}
    >
      <SwitcherIcon size={12} />
      <span>{personal ? '返回官方' : '进入 Personal'}</span>
    </button>
  )
}

export function apply(ctx: LooseCtx): void {
  // Hardening (safety release after a recovery-cycle report): apply must never
  // throw during client boot. The Personal occupant is registered only after
  // the user enables it (default = official browsing), so a fresh profile
  // boots exactly like stock and this plugin adds at most one passive footer
  // action until it is switched on.
  try {
    applyInner(ctx) // applyInner reports fine-grained results via the badge
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    badge('dps✗ ' + msg.slice(0, 42))
    console.warn('[dsh-personal-sidebar] apply aborted, kept stock UI:', error)
  }
}

// E4-FIX-IA-2 · MAIN NAV：运行期诊断。
//   - window.__dshRunSelfCheck()：devtools 随时可调用并粘贴 JSON 报告（20×20 协议取证）。
//   - dps.debug=1 时显示右上角常驻调试面板（实例计数 / host 状态 / seat / 版本+哈希 /
//     自检按钮）——真机截图即证据链。
function armDiagnostics(): void {
  try {
    const w = window as unknown as { __dshRunSelfCheck?: () => unknown }
    w.__dshRunSelfCheck = () => buildSelfCheckReport()
  } catch {
    // best-effort
  }
  if (!DPS_DEBUG) return
  try {
    const arm = (): void => {
      const host = document.getElementById('dps-debug-panel')
      if (host) return
      const el = document.createElement('div')
      el.id = 'dps-debug-panel'
      el.style.cssText =
        'position:fixed;top:8px;right:8px;z-index:' + DIAG_DEBUG_Z + ';max-width:380px;max-height:72vh;overflow:auto;' +
        'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#dde2ec;' +
        'background:rgba(28,32,46,.94);border:1px solid rgba(255,255,255,.18);border-radius:8px;' +
        'padding:7px 10px;pointer-events:auto;user-select:text;white-space:pre-wrap;word-break:break-all;'
      const refresh = (): void => {
        try {
          const r = buildSelfCheckReport() as Record<string, unknown>
          const pkg = (r.pkg ?? {}) as Record<string, unknown>
          const dom = (r.dom ?? {}) as Record<string, unknown>
          const md = (r.mainDiag ?? {}) as Record<string, unknown>
          const lines: string[] = []
          lines.push(`[dps-nav ${DPS_VERSION} ${DPS_SHA}] sidebar×${pkg.sidebarInstances ?? '?'} ws×${pkg.workspaceInstances ?? '?'}`)
          lines.push(`hostReady=${r.hostReady} domHost=${dom.mainHostView ?? '∅'}${dom.mainHostError ? ' ERROR' : ''}`)
          lines.push(`mainDiag: cur=${md.current ?? '?'} tag=${md.tag ?? '?'} reg=${md.registered ?? '?'} pri=${md.seatPriority ?? '?'}`)
          lines.push(`navRoots=${dom.navRoots ?? '?'} rows=${dom.navRows ?? '?'} dupRows=${dom.duplicateRows ? JSON.stringify(dom.duplicateRows) : '0'}`)
          const scan = (dom.labelScan as Array<{ text: string; where: string }>) ?? []
          lines.push(`labelScan=${scan.length}${scan.length > 0 ? ' → ' + JSON.stringify(scan.slice(0, 6)) : ''}`)
          const seats = r.seats as { conversation?: unknown; sidebar?: unknown } | undefined
          lines.push(`seats: conv=${JSON.stringify((seats?.conversation ?? '∅')).slice(0, 140)}`)
          const traces = (window as unknown as { __dshDiag?: { traces?: Array<{ t: number; kind: string; nav?: string; detail?: string; ms?: number }> } }).__dshDiag?.traces ?? []
          const last = traces.slice(-3).map((x) => `${x.kind}:${x.nav ?? ''}${x.ms != null ? `+${x.ms}ms` : ''}${x.detail ? `(${x.detail})` : ''}`)
          lines.push(`trace: ${last.join(' | ') || '—'}`)
          el.textContent = lines.join('\n')
        } catch {
          el.textContent = 'dps-debug: refresh error'
        }
      }
      refresh()
      const iv = window.setInterval(refresh, 900)
      el.addEventListener('click', () => {
        try {
          const full = JSON.stringify(buildSelfCheckReport(), null, 1)
          el.textContent = el.textContent === full ? 'dps-debug panel（点击刷新详情）' : full
        } catch {
          // ignore
        }
      })
      const stop = (): void => {
        try {
          window.clearInterval(iv)
        } catch {
          // ignore
        }
        try {
          el.remove()
        } catch {
          // ignore
        }
      }
      try {
        window.addEventListener('beforeunload', stop)
      } catch {
        // ignore
      }
      document.body.appendChild(el)
    }
    if (typeof document !== 'undefined' && document.body) arm()
    else if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', arm)
  } catch {
    // best-effort
  }
}

function applyInner(ctx: LooseCtx): boolean {
  // E4-FIX-IA-2 · MAIN NAV：实例计数 + selfCheck 暴露 + 调试面板（真实取证用）。
  try {
    diagPkgTick('sidebar', DPS_VERSION, DPS_SHA)
  } catch {
    // best-effort
  }
  armDiagnostics()

  const slots = ctx?.slots
  if (!ctx || !slots || typeof slots.inject !== 'function') {
    badge('dps no-slots')
    return false
  }

  // Engine contract: register() returns a cleanup function (ui-slots). Call it
  // to remove our occupant; the official occupant (priority 0, always
  // registered) then wins the single cell again — seamless, no reload.
  let handle: (() => void) | null = null
  let mounted = false

  const sessionsOf = (): unknown => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    } catch {
      return undefined
    }
  }

  /**
   * E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST —— official Session truth 句柄。
   * 只读投影：`sessions.list`（官方 Host Session Controller 快照 store）+ `sessions.open`。
   * **不**建第二份会话存储/缓存；每次调用都重新解析服务（晚注册也能拿到）。
   * 归档真源 = 可选服务 `workspaces.list.archivedSessionIds`：**刻意不写进 inject**
   * （未知服务会让插件 park），改为运行时探测 + 有界重试，源不可读 → 诚实标注「未知」。
   */
  const conversationsOf = (): unknown => {
    const listOf = (): { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } | null => {
      try {
        const svc = sessionsOf() as { list?: unknown } | null
        const list = svc?.list as { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } | undefined
        return list && typeof list.getSnapshot === 'function' && typeof list.subscribe === 'function' ? list : null
      } catch {
        return null
      }
    }
    const archiveOf = (): { archivedSessionIds?: unknown } | null => {
      try {
        const svc = typeof ctx.get === 'function' ? (ctx.get('workspaces') as { list?: unknown } | undefined) : undefined
        const list = svc?.list as { getSnapshot?: () => unknown } | undefined
        if (!list || typeof list.getSnapshot !== 'function') return null
        const snap = list.getSnapshot()
        return snap !== null && typeof snap === 'object' ? (snap as { archivedSessionIds?: unknown }) : null
      } catch {
        return null
      }
    }
    return {
      /** 官方会话快照（未就绪 → undefined，UI 说「读取中」而不是「暂无会话」）。 */
      getSnapshot: (): unknown => listOf()?.getSnapshot?.() ?? undefined,
      /** 订阅官方 store（会话创建/重命名/继续/归档 → 官方自行推送，无需轮询）。 */
      subscribe: (fn: () => void): (() => void) => {
        try {
          const off = listOf()?.subscribe?.(fn)
          return typeof off === 'function' ? off : () => {}
        } catch {
          return () => {}
        }
      },
      /** 官方归档集（workspaces.list）；null = 源不可读（未知）。 */
      archive: (): unknown => archiveOf(),
      /**
       * 订阅官方归档集 store（`workspaces.list.subscribe`；源码证据：官方 ui-workspace
       * 自身即 `this.workspaces.list.subscribe(reconcile)`）。
       * 归档/取消归档由官方推送 → 会话列表即时刷新，**不轮询**。
       * 返回 null = 官方 workspaces 服务（或其 list store）尚不可用 → 调用方**有界**重试。
       */
      subscribeArchive: (fn: () => void): (() => void) | null => {
        try {
          const svc = typeof ctx.get === 'function' ? (ctx.get('workspaces') as { list?: unknown } | undefined) : undefined
          const list = svc?.list as { subscribe?: (f: () => void) => unknown } | undefined
          if (!list || typeof list.subscribe !== 'function') return null
          const off = list.subscribe(fn)
          return typeof off === 'function' ? (off as () => void) : (): void => {}
        } catch {
          return null
        }
      },
      /** 打开官方会话（唯一合法路径；不创建会话/不建任务/不重放 prompt）。 */
      open: (sessionId: string): void => {
        try {
          const svc = sessionsOf() as { open?: (id: string) => void } | null
          svc?.open?.(sessionId)
        } catch {
          // opening is best-effort; failure must not fabricate a session
        }
      },
      // -----------------------------------------------------------------------
      // E4-FINAL · Personal「会话列表」复现官方 Session 菜单：三个动作**逐句复用官方 handler**
      // （官方接线源码证据：@deepseek-ai/dsh-client-ui-workspace/lib/client.js:2674-2700）。
      //   rename  → `const session = sessions.binding(id)?.session; if (session===void 0)
      //              throw new Error(\`unknown session "${id}"\`); const r = await session.rename(t);
      //              if (!r.ok) throw new Error(r.error.message)`
      //   fork    → `sessions.fork({sessionId, increaseTitle:true})` → childId（官方随后 sessions.open）
      //   archive → `workspaces.archiveSession(sessionId)`（官方归档真源唯一写路径）
      // 本层**不新增**任何会话状态/归档真源/缓存：调用成功 → 官方 store 自行推送 → 列表刷新。
      // 失败一律**抛出**（不吞、不假装成功），由 UI 如实呈现。
      // -----------------------------------------------------------------------
      rename: async (sessionId: string, title: string): Promise<void> => {
        const svc = sessionsOf() as
          | { binding?: (id: string) => { session?: { rename?: (t: string) => Promise<unknown> } } | undefined }
          | null
        const session = typeof svc?.binding === 'function' ? svc.binding(sessionId)?.session : undefined
        if (session === undefined || typeof session.rename !== 'function') {
          // 与官方同一句错误文案。
          throw new Error(`unknown session "${sessionId}"`)
        }
        const result = (await session.rename(title)) as
          | { ok?: boolean; error?: { message?: string } | undefined }
          | undefined
        if (result === undefined || result.ok !== true) {
          throw new Error(result?.error?.message ?? '官方会话重命名未返回成功结果')
        }
      },
      fork: async (sessionId: string): Promise<string> => {
        const svc = sessionsOf() as
          | { fork?: (opts: { sessionId: string; increaseTitle?: boolean }) => Promise<unknown> }
          | null
        if (typeof svc?.fork !== 'function') throw new Error('官方 sessions.fork 不可用')
        // increaseTitle: true = 官方参数（子会话标题自动「（副本）」式递增）。
        const child = await svc.fork({ sessionId, increaseTitle: true })
        const childId =
          typeof child === 'string'
            ? child
            : child !== null && typeof child === 'object'
              ? (child as { id?: unknown }).id
              : undefined
        if (typeof childId !== 'string' || childId === '') {
          throw new Error('官方 sessions.fork 未返回子会话 id')
        }
        return childId
      },
      /**
       * 归档会话 = **写动作**（官方 `workspaces.archiveSession`）。
       * 命名注意：上面那个 `archive()` 是**只读真源读取**（`workspaces.list.archivedSessionIds`），
       * 两者一字之差但语义相反（读真值 vs 写动作），故此处沿用官方方法名 `archiveSession` 以免混淆。
       * 归档 ≠ 删除：会话本体保留，恢复入口仍在官方侧。
       */
      archiveSession: async (sessionId: string): Promise<void> => {
        const svc =
          typeof ctx.get === 'function'
            ? (ctx.get('workspaces') as { archiveSession?: (id: string) => Promise<unknown> } | undefined)
            : undefined
        if (typeof svc?.archiveSession !== 'function') throw new Error('官方 workspaces.archiveSession 不可用')
        await svc.archiveSession(sessionId)
      },
    }
  }

  const betterSidebarOf = (): unknown => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('betterSidebar') : undefined
    } catch {
      return undefined
    }
  }

  // IA2-2 §2：Personal 模式标记 → CSS 隐藏官方 shell 顶部「＋新会话」竞争入口。
  // 官方模式移除标记 → 官方按钮恢复（官方 shell seats 本身从不改动）。
  const setPersonalAttr = (on: boolean): void => {
    try {
      const root = typeof document !== 'undefined' ? document.documentElement : undefined
      if (!root) return
      if (on) root.setAttribute('data-dps-personal', '1')
      else root.removeAttribute('data-dps-personal')
    } catch {
      // best-effort: hide rule simply does not apply
    }
  }

  const unmount = (): void => {
    setPersonalAttr(false)
    if (mounted) {
      let removed = false
      if (handle) {
        try {
          handle()
          removed = true
        } catch {
          // cleanup threw — fall back to a page reload so the user is never
          // stranded on the Personal region
        }
      }
      if (!removed) reloadFallback()
    }
    handle = null
    mounted = false
  }

  /**
   * 会话行状态点 · 第二条真源（**会话级**待交互，2026-09-14 用户收口）。
   * 官方 Host 在 `dsh-client-ui-session` 里把这份 store 作为 root hook 暴露
   * （`provideRoot({ hooks: { sessionPendingInteraction } })`，官方
   * `dsh-client-ui-conversation` / `dsh-client-ui-workspace` 即用它的 `use*` 绑定）；
   * 同一份对象也在 cordis 服务 `uiSession.pendingInteractions` 上（`getSnapshot`/`subscribe`）。
   * 本插件按既有惯例（`sessions` / `workspaces` 同款）从服务面**只读**接它：
   *   · 不写进 inject（未注册的服务会让插件 park）；运行时逐次探测，晚注册也能拿到。
   *   · 不建第二份存储/缓存；读不到 → UI 只表达 running/idle（绝不伪造“需要你”）。
   */
  const pendingOf = (): unknown => {
    const storeOf = (): { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } | null => {
      try {
        const svc = typeof ctx.get === 'function' ? (ctx.get('uiSession') as { pendingInteractions?: unknown } | undefined) : undefined
        const p = svc?.pendingInteractions as { getSnapshot?: () => unknown; subscribe?: (f: () => void) => () => void } | undefined
        return p && typeof p.getSnapshot === 'function' && typeof p.subscribe === 'function' ? p : null
      } catch {
        return null
      }
    }
    return {
      /** 官方待交互快照（Map<sessionId, PendingApproval|PendingQuestion>）；未就绪 → undefined。 */
      getSnapshot: (): unknown => storeOf()?.getSnapshot?.() ?? undefined,
      /** 订阅官方 store（审批出现/消失、提问出现/回答 → 官方推送，无需轮询）。 */
      subscribe: (fn: () => void): (() => void) => {
        try {
          const off = storeOf()?.subscribe?.(fn)
          return typeof off === 'function' ? off : () => {}
        } catch {
          return () => {}
        }
      },
    }
  }

  const mount = (): void => {
    if (mounted) return
    setPersonalAttr(true)
    const sessions = sessionsOf() as { open?: (id: string) => void } | null
    try {
      const cleanup = slots.register(
        {
          name: 'sidebar.workspaces',
          id: 'personal-sidebar-workspaces',
          // Shadow the built-in ui-workspace browser (default priority 0).
          priority: -1000,
          inject: () => ({
            openSession: (sessionId: string): void => {
              try {
                sessions?.open?.(sessionId)
              } catch {
                // opening is best-effort from the Legacy list
              }
            },
            switchOfficial: (): void => {
              personalMode.set('official')
            },
            /** §5/§6：Sidebar 会话列表的 official Session 只读投影 + 官方打开路径。 */
            conversations: conversationsOf(),
            /** 会话行状态点：官方 pendingInteractions（审批/提问，会话级真源）。 */
            pending: pendingOf(),
            betterSidebar: betterSidebarOf(),
          }),
        },
        PersonalBrowser,
      )
      handle = typeof cleanup === 'function' ? cleanup : null
      mounted = handle !== null
    } catch (error) {
      console.warn('[dsh-personal-sidebar] occupant registration failed:', error)
      handle = null
      setPersonalAttr(false)
    }
  }


  // ---------------------------------------------------------------------------
  // 品牌头部（2026-09-10 用户真机反馈）：占用官方 `sidebar.brand.name` 单槽，把左栏顶部
  //   原本空着的官方品牌行变成「鲸鱼 + Personal Harness + Personal Workspace 副标题」。
  //   · 官方 `sidebar.brand.mark` **不动**（鲸鱼由官方 occupant 绘制，零复制/零外部图片）。
  //   · 与 `sidebar.workspaces` 同一模式生命周期：personal 挂载、官方模式卸载（官方品牌名随即回来）。
  //   · 失败只降级（官方品牌名照旧），绝不影响导航/会话列表/工具区。
  let brandHandle: (() => void) | null = null
  let brandMounted = false

  const unmountBrand = (): void => {
    if (!brandMounted) return
    try {
      brandHandle?.()
    } catch {
      // brand cleanup failure is non-fatal: the official brand name returns on reload
    }
    brandHandle = null
    brandMounted = false
  }

  const mountBrand = (): void => {
    if (brandMounted) return
    try {
      const cleanup = slots.register(
        { name: 'sidebar.brand.name', id: 'personal-sidebar-brand', priority: -1000 },
        PersonalBrandName,
      )
      brandHandle = typeof cleanup === 'function' ? cleanup : null
      brandMounted = brandHandle !== null
    } catch (error) {
      console.warn('[dsh-personal-sidebar] brand seat registration failed:', error)
      brandHandle = null
      brandMounted = false
    }
  }

  const syncBrand = (): void => {
    if (personalMode.get() === 'personal') mountBrand()
    else unmountBrand()
  }

  const brandLife = (): (() => void) => {
    syncBrand()
    const off = personalMode.subscribe(syncBrand)
    return () => {
      off()
      unmountBrand()
    }
  }

  const sync = (): void => {
    if (personalMode.get() === 'personal') mount()
    else unmount()
  }

  // ---------------------------------------------------------------------------
  // 「对话 / 思维图」视图开关（2026-09-14 用户真机反馈）：`dsh-thoughtdag` 把它做成宿主
  //   页面浮层（`.dsh-td-switch`，fixed + top:12px + left:50%），悬在窗口顶端中央；用户
  //   要求把它放进侧栏那一栏、排在第三方「任务看板」入口之上。宿主侧栏插槽里**没有**
  //   能排在该行之前的槽位，所以由本插件在 Personal 模式下**领养**那个节点（详见
  //   thoughtdagSwitch.ts）。切回官方模式即原样交还宿主（不留残留）。
  //   · 纯增强：任何异常只降级为「开关保持浮动原位」，绝不影响侧栏其余部分。
  let tabbarHandle: (() => void) | null = null
  let tabbarMounted = false

  const unmountTabbar = (): void => {
    if (!tabbarMounted) return
    try {
      tabbarHandle?.()
    } catch {
      // best-effort: 残留节点会在页面重载后消失
    }
    tabbarHandle = null
    tabbarMounted = false
  }

  const mountTabbar = (): void => {
    if (tabbarMounted) return
    try {
      tabbarHandle = adoptThoughtSwitcher()
      tabbarMounted = true
    } catch (error) {
      console.warn('[dsh-personal-sidebar] thoughtdag switcher adoption failed:', error)
      tabbarHandle = null
      tabbarMounted = false
    }
  }

  const syncTabbar = (): void => {
    if (personalMode.get() === 'personal') mountTabbar()
    else unmountTabbar()
  }

  const tabbarLife = (): (() => void) => {
    syncTabbar()
    const off = personalMode.subscribe(syncTabbar)
    return () => {
      off()
      unmountTabbar()
    }
  }

  // One stylesheet for this plugin's region.
  const injectStyles = (): void => {
    const el = document.createElement('style')
    el.setAttribute('data-dsh-plugin', 'dsh-personal-sidebar')
    el.textContent = CSS
    document.head.appendChild(el)
    return () => {
      el.remove()
    }
  }

  // Fine-grained guarded steps: any failure is captured into a visible badge
  // instead of aborting silently.
  const errors: string[] = []
  const step = <T,>(label: string, fn: () => T): T | undefined => {
    try {
      return fn()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`${label}: ${msg}`)
      console.warn('[dsh-personal-sidebar] step failed:', label, error)
      return undefined
    }
  }

  step('styles', () => {
    if (typeof ctx.effect === 'function') return ctx.effect(injectStyles, 'dps: styles')
    return injectStyles()
  })

  // Occupant: register once the `sidebar` shell declares its workspaces hole.
  const seatLife = (): (() => void) => {
    sync()
    const off = personalMode.subscribe(sync)
    return () => {
      off()
      unmount()
    }
  }
  const injectSeat = (name: string, make: () => unknown, label: string): void => {
    step(label, () => {
      if (typeof ctx.effect === 'function') {
        return ctx.effect(() => slots.inject(name, make, label), label + ' lifecycle')
      }
      return slots.inject(name, make, label)
    })
  }

  injectSeat('sidebar.workspaces', seatLife, 'dps: occupant')
  injectSeat('sidebar.brand.name', brandLife, 'dps: brand')
  injectSeat(
    'sidebar.footer.action',
    () =>
      slots.register(
        { name: 'sidebar.footer.action', id: 'personal-sidebar-toggle', order: 1 },
        (props: { wide?: boolean }) => ModeToggle(props),
      ),
    'dps: footer',
  )

  // 领养第三方「对话 / 思维图」开关（非插槽：直接操作 DOM，因此不用 injectSeat）。
  step('tabbar', () => {
    if (typeof ctx.effect === 'function') return ctx.effect(tabbarLife, 'dps: tabbar')
    return tabbarLife()
  })

  if (errors.length > 0) {
    badge('dps✗ ' + errors[0].slice(0, 42))
  } else {
    badge('dps:' + DPS_VERSION + ' applied')
  }
  return errors.length === 0
}
