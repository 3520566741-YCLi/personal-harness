// dsh-personal-sidebar — runtime diagnostics (E4-FIX-IA-2 · MAIN NAVIGATION
// RUNTIME FAILURE evidence layer). Everything is best-effort + debug-visible:
//   - window.__dshDiag: shared cross-bundle ledger { pkg, traces, crashes }
//   - diagTrace(): append one click/ack/verify trace record (bounded ring)
//   - buildSelfCheckReport(): one-shot DOM/seat/host audit — the artifact the
//     real-device protocol screenshots/pastes (elementFromPoint at each nav
//     row center, mount counts, duplicate-label scanner, ui-slots seat snapshot,
//     host flag, version+repo-hash). Exposed as window.__dshRunSelfCheck().
// Pure string event constants live in the caller; this file imports nothing
// from personal-workspace so the two bundles stay independent at runtime.

export type Trace = {
  t: number
  kind: string
  nav?: string
  view?: string
  ms?: number
  detail?: string
}

type AnyDiag = {
  pkg?: Record<string, unknown>
  traces?: Trace[]
  crashes?: Array<{ t: number; view: string; error: string }>
  sha?: Record<string, unknown>
  slotsRaw?: unknown
  [key: string]: unknown
}

export function ensureDiag(): AnyDiag {
  try {
    const w = window as unknown as { __dshDiag?: AnyDiag }
    if (!w.__dshDiag) w.__dshDiag = {}
    return w.__dshDiag
  } catch {
    return {}
  }
}

export function diagPkgTick(pkg: string, version: string, sha: string): void {
  try {
    const d = ensureDiag()
    const p = (d.pkg ??= {} as Record<string, unknown>)
    p[`${pkg}Instances`] = ((p[`${pkg}Instances`] as number) ?? 0) + 1
    p[`${pkg}Version`] = version
    p[`${pkg}Sha`] = sha
    const s = (d.sha ??= {} as Record<string, unknown>)
    s[pkg] = sha
  } catch {
    // best-effort
  }
}

export function diagTrace(kind: string, data: { nav?: string; view?: string; ms?: number; detail?: string }): void {
  try {
    const d = ensureDiag()
    const list = (d.traces ??= [] as Trace[])
    list.push({ t: Date.now(), kind, ...data })
    if (list.length > 600) list.splice(0, list.length - 600)
  } catch {
    // best-effort
  }
}

export function diagCrash(view: string, error: string): void {
  try {
    const d = ensureDiag()
    const list = (d.crashes ??= [] as Array<{ t: number; view: string; error: string }>)
    list.push({ t: Date.now(), view, error })
    if (list.length > 40) list.splice(0, list.length - 40)
  } catch {
    // best-effort
  }
}

function elDesc(el: Element | null): string | null {
  if (!el) return null
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls = typeof el.className === 'string' && el.className.trim().length > 0
    ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
    : ''
  const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 4)
    .map((a) => `${a.name}="${a.value.slice(0, 30)}"`)
    .join(' ')
  return `${tag}${id}${cls}${data ? ' [' + data + ']' : ''}`.slice(0, 160)
}

/**
 * 一次性自检报告（纯同步；node smoke / devtools / 调试面板共用）。
 * 覆盖验收协议要求的：mount/registry 计数、elementFromPoint 命中、重复项扫描、
 * conversation/sidebar seat 真实 occupant 快照、host 状态、版本+repo 哈希。
 */
export function buildSelfCheckReport(): Record<string, unknown> {
  const out: Record<string, unknown> = { t: Date.now() }
  try {
    const d = ensureDiag()
    out.pkg = d.pkg ?? {}
    out.crashes = d.crashes ?? []
    out.sha = d.sha ?? {}
    try {
      out.hostReady = (window as unknown as Record<string, unknown>).__dshPersonalMainReady === true
    } catch {
      out.hostReady = false
    }
    try {
      out.mainDiag = (window as unknown as { __dshMainDiag?: unknown }).__dshMainDiag ?? null
    } catch {
      out.mainDiag = null
    }
    try {
      out.persistedMainView = window.localStorage.getItem('dsh.personal.mainview.v1')
    } catch {
      out.persistedMainView = null
    }

    // —— DOM 结构：导航根/行数量（>1 = 重复渲染实例的实锤）——
    if (typeof document !== 'undefined') {
      const navRoots = document.querySelectorAll('[data-dps-nav="1"], [data-dps-nav-rail="1"]')
      out.dom = out.dom ?? {}
      ;(out.dom as Record<string, unknown>).navRoots = navRoots.length
      const rows = [...document.querySelectorAll<HTMLElement>('[data-nav]')]
      ;(out.dom as Record<string, unknown>).navRows = rows.length
      const byId: Record<string, number> = {}
      for (const r of rows) {
        const id = r.getAttribute('data-nav') ?? '?'
        byId[id] = (byId[id] ?? 0) + 1
      }
      const dups = Object.entries(byId).filter(([, n]) => n > 1)
      ;(out.dom as Record<string, unknown>).duplicateRows = dups.length > 0 ? dups : null

      // —— 双「任务看板」归属取证（E4-FIX-IA-2 · 真机复核项）——
      // 左栏可能同时存在两个语义相近的入口，来源必须可判：
      //   own  = 本插件（dsh-personal-sidebar）在 sidebar.workspaces 座位渲染的行
      //          <button class="dps-nav-item" data-nav="task-board">
      //   foreign = 第三方插件 @linxin666/dsh-client-ui-task-board 的**原生 DOM 注入**
      //          <button data-dsh-taskboard-entry data-dsh-plugin="task-board">（无 slot 注册）
      // 只报告事实（数量/文案/宿主属性），不隐藏、不删除任何第三方入口。
      const ownBoardRows = [...document.querySelectorAll<HTMLElement>('[data-dps-nav] [data-nav="task-board"]')]
      const foreignBoardRows = [...document.querySelectorAll<HTMLElement>('[data-dsh-taskboard-entry]')]
      ;(out.dom as Record<string, unknown>).taskboardEntries = {
        own: ownBoardRows.length,
        ownLabels: ownBoardRows.map((r) => (r.textContent ?? '').trim()),
        foreign: foreignBoardRows.length,
        foreignLabels: foreignBoardRows.map((r) => (r.textContent ?? '').trim()),
        foreignOwners: foreignBoardRows.map((r) => ({
          plugin: r.getAttribute('data-dsh-plugin'),
          part: r.getAttribute('data-dsh-part'),
          inSidebarPane: r.closest('[data-pane="sidebar"]') !== null,
        })),
      }

      // —— elementFromPoint：每个导航行中心点击位是否真的落在该行（找拦点覆盖物）——
      const hits: Array<Record<string, unknown>> = []
      for (const r of rows) {
        const rect = r.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        let top: Element | null = null
        try {
          top = document.elementFromPoint(cx, cy)
        } catch {
          top = null
        }
        hits.push({
          nav: r.getAttribute('data-nav'),
          x: Math.round(cx),
          y: Math.round(cy),
          rowRect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          top: elDesc(top),
          onRow: top === r || (top !== null && r.contains(top)),
        })
      }
      ;(out.dom as Record<string, unknown>).navHitTest = hits

      // —— 中央主区 occupant DOM（是否真的上屏 + 视图名）——
      const host = document.querySelector('[data-dsh-main-host="1"]')
      ;(out.dom as Record<string, unknown>).mainHostView = host?.getAttribute('data-dsh-main-view') ?? null
      ;(out.dom as Record<string, unknown>).mainHostError = document.querySelector('[data-dsh-main-error="1"]') !== null
      ;(out.dom as Record<string, unknown>).mainHostFound = host !== null

      // —— occupant 挂载计时（Click→Main Shell 上屏量测：与 trace main-click/ack ms 对照）——
      try {
        const mounts = (ensureDiag().mounts as Array<{ t: number; view: string }> | undefined) ?? []
        ;(out.dom as Record<string, unknown>).mounts = mounts.slice(-12)
      } catch {
        ;(out.dom as Record<string, unknown>).mounts = []
      }

      // —— 重复标签扫描：全 DOM 找与侧栏导航同文案的可见叶子（找第二任务看板/加号来源）——
      const labels = ['任务看板', '任务板', '新任务', '＋新任务', '＋ 新任务']
      const labelHits: Array<Record<string, unknown>> = []
      const seen = new Set<Element>()
      const walk = (el: Element): void => {
        for (const child of el.children) {
          if (seen.has(child)) continue
          seen.add(child)
          walk(child)
          const text = (child.textContent ?? '').trim()
          if (text.length === 0 || text.length > 24) continue
          if (labels.includes(text) || labels.includes(text.replace(/\s+/g, ' '))) {
            labelHits.push({ text, where: elDesc(child), path: pathOf(child) })
          }
        }
      }
      const pathOf = (el: Element): string => {
        const parts: string[] = []
        let cur: Element | null = el
        let guard = 0
        while (cur && guard < 8) {
          const p = elDesc(cur)
          parts.unshift(p ?? cur.tagName)
          cur = cur.parentElement
          guard += 1
        }
        return parts.join(' < ')
      }
      walk(document.body)
      out.dom.labelScan = labelHits

      // —— ui-slots seat 快照：conversation / sidebar.workspaces 真实 occupant 清单 ——
      try {
        const slots = (window as unknown as { __dshDiag?: { slotsRaw?: { snapshot?: (root: string) => unknown } } }).__dshDiag
          ?.slotsRaw
        if (slots && typeof slots.snapshot === 'function') {
          const conv = slots.snapshot('conversation')
          const side = slots.snapshot('sidebar')
          out.seats = { conversation: conv, sidebar: side }
        } else {
          out.seats = { note: 'slotsRaw 句柄缺失（workspace 未运行或版本过旧）' }
        }
      } catch (error) {
        out.seats = { error: error instanceof Error ? error.message : String(error) }
      }
    }
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error)
  }
  return out
}
