// dsh-personal-sidebar — 领养第三方 ThoughtDAG 的「对话 / 思维图」视图开关。
//
// 背景（2026-09-14 用户真机反馈）：`dsh-thoughtdag` 把这个视图开关做成**宿主页面的浮层**
//   —— `.dsh-td-switch`：position:fixed / top:12px / left:50% / translateX(-50%)，直接
//   append 到 document.body。于是它悬在窗口顶端中央，既不属于侧栏也不属于任何区域，
//   用户要求：把它放进侧栏那一栏、排在第三方「任务看板」入口**之上**。
//
// 为什么不注册插槽：宿主侧栏插槽只有 sidebar.workspaces / sidebar.brand.name /
//   sidebar.brand.mark / sidebar.footer.action / sidebar.settings —— **没有**排在
//   `sidebar.workspaces` 之前（即任务看板行之前）的插槽；而「任务看板」行是
//   `@linxin666/dsh-client-ui-task-board` 直接渲染在侧栏列根上的，不在任何可用的槽位里。
//
// 做法：把一个 `.dps-tabbar` 容器插进侧栏列根、`任务看板` 行**之前**，再把
//   `.dsh-td-switch` 节点**搬进**该容器（不是复制）。开关是纯 DOM、非 React 管理，
//   搬动安全；本模块只搬节点，不改它的事件、状态与内部结构。视觉全部交给 styles.ts
//   的 `.dps-tabbar .dsh-td-switch` 规则（更高特异性，覆盖它的 fixed 定位）。
//
// 覆盖层出口（2026-09-14 第二次真机反馈「思维图里没有回到会话的按钮」）：
//   第三方点「思维图」会显示一个全屏覆盖层 `.dsh-td-overlay`（position:fixed; inset:0;
//   z-index:100）。它原本唯一的出口就是那个浮在 z-index:120 的开关；开关被领养进侧栏后
//   失去浮层身份，**被覆盖层整片盖住**（真机实测 elementFromPoint 在「对话」按钮中心
//   命中的是覆盖层）→ 用户被困在思维图里。修法：覆盖层打开期间把整条领养条临时搬到
//   `document.body` 顶层并浮到 z-index 130（fixed 定位只有在未被 transform 祖先包裹时
//   才可靠，所以是「搬节点」而不是「改样式」），并额外显示一个显式「← 返回对话」按钮；
//   覆盖层一关就自动归位侧栏。出口动作本身就是点第三方自己的「对话」按钮，不复制它的逻辑。
//
// 生命周期：随本插件 Personal 区域一起挂载 / 卸载（切回官方模式即整体还原）。
//   · 卸载 = 把开关节点**原样搬回 document.body**，再移除容器 → 回到插件安装前的形态。
//   · 宿主重排 / ThoughtDAG 重建节点都由 MutationObserver 归位（place() 幂等）。
//   · ThoughtDAG 未安装时不留空容器（无节点即移除容器）。

/** 领养容器的类名（也是 styles.ts 的样式锚点）。 */
export const TABBAR_CLASS = 'dps-tabbar'

/** 领养容器的数据标记（定位用，不依赖类名被覆盖）。 */
const TABBAR_ATTR = 'data-dps-tabbar'

/** 第三方开关的类名（位置由它自己注入的样式决定，此处只做选择器）。 */
const SWITCH_CLASS = 'dsh-td-switch'

/** 第三方全屏覆盖层（「思维图」视图）的类名。 */
const OVERLAY_CLASS = 'dsh-td-overlay'

/** 覆盖层打开期间给领养条打的标记（styles.ts 据此切换成浮层形态）。 */
const OVERLAY_OPEN_ATTR = 'data-dps-overlay-open'

/** 覆盖层打开期间额外显示的显式返回按钮（本插件自己的节点）。 */
const BACK_ATTR = 'data-dps-back'

/** 第三方侧栏入口的可见文案 —— 作为「插到它上面」的锚点。 */
const TASK_BOARD_LABEL = '任务看板'

interface Anchor {
  host: Element
  before: Element | null
}

/** 找到第三方「任务看板」侧栏行（按可见文案，不依赖其 css-module 哈希类名）。 */
const findTaskBoardRow = (): HTMLElement | null => {
  for (const el of document.querySelectorAll<HTMLElement>('button')) {
    if ((el.textContent ?? '').trim() === TASK_BOARD_LABEL) return el
  }
  return null
}

/**
 * 计算容器的落点：
 *   1) 首选「任务看板」行之前（用户要求的正是这个位置）；
 *   2) 该行不存在（未装第三方插件）时，退到本插件根容器的最前面 —— 此时它天然就是
 *      侧栏第一行，视觉等价。
 */
const resolveAnchor = (): Anchor | null => {
  const row = findTaskBoardRow()
  if (row !== null && row.parentElement !== null) return { host: row.parentElement, before: row }
  const root = document.querySelector<HTMLElement>('.dps-root')
  if (root !== null) return { host: root, before: root.firstElementChild }
  return null
}

/** 第三方「思维图」覆盖层当前是否可见（`hidden` 属性即它的开合开关）。 */
const overlayShown = (): boolean => {
  const ov = document.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`)
  return ov !== null && !ov.hidden
}

/** 回到会话：点第三方自己的「对话」按钮 —— 复用它的 close()，不复制它的内部逻辑。 */
const returnToDialog = (): void => {
  const dialog = document.querySelector<HTMLElement>(`.${SWITCH_CLASS} [data-view="dialog"]`)
  if (dialog !== null) dialog.click()
}

/**
 * 领养 ThoughtDAG 的视图开关到侧栏「任务看板」之上。
 * @returns 卸载函数：搬回原节点、移除容器、断开观察（幂等，可重复调用）。
 */
export function adoptThoughtSwitcher(): () => void {
  let stopped = false
  let scheduled = false
  let observer: MutationObserver | null = null
  /** 首次领养前记录的原位（真机实测：它不是 body 的直接子节点，而是 body > 无类名包装层，
      所以交还必须回到**原父节点 + 原后继兄弟**，不能硬写 appendChild(document.body)）。 */
  let home: { parent: Node; next: Node | null } | null = null

  /** 把节点交还宿主原位；原父节点已消失时退回 body（best-effort）。 */
  const restoreHome = (sw: HTMLElement, bar: HTMLElement | null): void => {
    const original = home
    if (original !== null && original.parent.isConnected) {
      const next = original.next !== null && original.next.parentNode === original.parent ? original.next : null
      original.parent.insertBefore(sw, next)
      return
    }
    if (bar === null || sw.parentElement === bar) document.body.appendChild(sw)
  }

  /** 进入浮层形态：整条领养条搬到 body 顶层，并补一个显式「返回对话」按钮。 */
  const enterFloating = (bar: HTMLElement): void => {
    if (bar.parentElement !== document.body) document.body.appendChild(bar)
    if (bar.hasAttribute(OVERLAY_OPEN_ATTR)) return
    bar.setAttribute(OVERLAY_OPEN_ATTR, '1')
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'dps-td-back'
    back.setAttribute(BACK_ATTR, '1')
    back.setAttribute('aria-label', '返回对话')
    back.textContent = '← 返回对话'
    back.addEventListener('click', returnToDialog)
    bar.appendChild(back)
  }

  /** 退出浮层形态：撤掉标记与「返回对话」按钮（归位由 place() 正常路径完成）。 */
  const exitFloating = (bar: HTMLElement): void => {
    if (!bar.hasAttribute(OVERLAY_OPEN_ATTR)) return
    bar.removeAttribute(OVERLAY_OPEN_ATTR)
    const back = bar.querySelector<HTMLElement>(`[${BACK_ATTR}]`)
    if (back !== null) {
      back.removeEventListener('click', returnToDialog)
      back.remove()
    }
  }

  const place = (): void => {
    const sw = document.querySelector<HTMLElement>(`.${SWITCH_CLASS}`)
    const existing = document.querySelector<HTMLElement>(`[${TABBAR_ATTR}]`)

    // ThoughtDAG 不在（未装 / 未挂载）：不保留空容器。
    if (sw === null) {
      existing?.remove()
      return
    }

    // 首次领养前记录原位（仅当它还不属于本容器时）。
    if (home === null && sw.parentElement !== null && !sw.parentElement.hasAttribute(TABBAR_ATTR)) {
      home = { parent: sw.parentElement, next: sw.nextSibling }
    }

    const overlay = overlayShown()

    // 窄栏（图标模式）放不下两段文字开关：**不领养**，把节点交还它的浮动原位，
    // 这样该功能在窄栏下依然可用（藏起来会让用户彻底打不开视图切换）。
    if (document.querySelector('.dps-root') === null) {
      if (overlay && existing !== null) {
        // 窄栏 + 思维图打开：节点原本就在宿主浮层位置（z-index:120），覆盖层盖不住它，
        // 只需要保证它确实握着开关节点。
        if (sw.parentElement === existing) restoreHome(sw, existing)
        exitFloating(existing)
        existing.remove()
        return
      }
      if (existing !== null) {
        if (sw.parentElement === existing) restoreHome(sw, existing)
        existing.remove()
      }
      return
    }

    // 覆盖层打开：领养条进浮层形态并压在覆盖层之上 —— 此时**不做**侧栏归位，
    // 否则每次 mutation 都会把它拽回被盖住的位置（那正是用户被困的原因）。
    if (overlay) {
      let bar = existing
      if (bar === null) {
        bar = document.createElement('div')
        bar.className = TABBAR_CLASS
        bar.setAttribute(TABBAR_ATTR, '1')
        document.body.appendChild(bar)
      }
      if (sw.parentElement !== bar) bar.appendChild(sw)
      enterFloating(bar)
      return
    }

    const anchor = resolveAnchor()
    if (anchor === null) return

    let bar = existing
    if (bar === null) {
      bar = document.createElement('div')
      bar.className = TABBAR_CLASS
      bar.setAttribute(TABBAR_ATTR, '1')
      anchor.host.insertBefore(bar, anchor.before)
    } else if (bar.parentElement !== anchor.host || bar.nextElementSibling !== anchor.before) {
      // 宿主重排把它挪走 / 位置变了 / 刚从浮层形态归来 → 归位（幂等：位置正确时不动 DOM）。
      anchor.host.insertBefore(bar, anchor.before)
    }
    exitFloating(bar)

    // 领养（或重新领养）开关节点本身：只搬这一个节点，不复制、不改其内容。
    if (sw.parentElement !== bar) bar.appendChild(sw)
  }

  const schedule = (): void => {
    if (stopped || scheduled) return
    scheduled = true
    // rAF 合帧：React 每次提交都会触发一批 mutation，用一帧一次的归位把它们收敛掉。
    const run = (): void => {
      scheduled = false
      if (stopped) return
      try {
        place()
      } catch {
        // 领养是增强项：任何异常都不得影响侧栏自身的渲染
      }
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  }

  try {
    place()
    observer = new MutationObserver(schedule)
    // attributeFilter 里必须有 hidden：第三方覆盖层的开合只改这一个属性，
    // 不观察它就不会有「思维图打开 / 关闭」的时机通知。
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    })
  } catch {
    // 无 document / observer 不可用：静默降级为「不领养」，开关保持浮动原位
    return () => {
      stopped = true
    }
  }

  return () => {
    if (stopped) return
    stopped = true
    try {
      observer?.disconnect()
    } catch {
      // ignore
    }
    observer = null
    try {
      const sw = document.querySelector<HTMLElement>(`.${SWITCH_CLASS}`)
      const bar = document.querySelector<HTMLElement>(`[${TABBAR_ATTR}]`)
      if (bar !== null) exitFloating(bar)
      // 原样搬回**原位**（原父节点 + 原后继兄弟）：恢复插件领养前的宿主形态。
      if (sw !== null && bar !== null && sw.parentElement === bar) restoreHome(sw, bar)
      else if (sw !== null && bar === null && home !== null && home.parent.isConnected && sw.parentElement !== home.parent) {
        restoreHome(sw, null)
      }
      bar?.remove()
    } catch {
      // 卸载路径 best-effort：残留节点会在页面重载后消失
    }
  }
}
