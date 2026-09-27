// dsh-personal-sidebar — V1.2-J（J1 收起/展开 + J2 拖动排序）的**纯逻辑 + 本机存储**层。
//
// 为什么单独一个文件（而不是塞进 PersonalBrowser.tsx）：
//   · PersonalBrowser.tsx 里 `NAV` 是**字面量真源**，且被两个既有核验套件按**书写形状**与
//     **逐字 id 顺序**断言（scripts/smoke-nav-integration.mjs:352-353/354/366-367/492/537/740/840、
//     scripts/smoke-v12e-memory-tree-view.mjs:313-317）。用户顺序因此**只能是运行时叠加层**：
//     默认顺序永远由 NAV 定义，本模块只产出「按用户序列重排后的视图」。
//   · 收起/展开的状态与行序都要**本机记住**（下次打开还是上次的样子），存储纪律（try/catch、
//     坏数据退回默认、绝不抛错）集中在这里，渲染层只做接线。
//
// 真源纪律（延续仓库既有约定）：
//   · 本机存储键 `dsh.personal.nav.v1`（照 `dsh.personal.*.v1` 既有命名，见
//     personal-registry/src/projects.ts:122 `dsh.personal.projects.v1`）。**只存**用户的两个
//     偏好：行序 id 序列 + 是否收起。不复制任何官方状态（会话/任务/工作区一个字节都不动）。
//   · 只对**我们自己的行**（NAV 的 8 个 id）成立；第三方「任务看板」行不参与排序、不参与
//     收起判定中的「被隐藏」集合（它有自带 rootObserver，搬走会被自动插回 —— 我们不碰）。
//   · 读不到 localStorage（隐私模式 / 配额 / 无 window）→ 退回默认（收起、NAV 默认顺序），
//     侧栏照常渲染，绝不崩。
//
// 诚实边界：本模块与它的套件只能证明**逻辑与 DOM 属性**（jsdom 无布局、无真指针手势）。
// 「真机上收起后确实只有 4 行可见」「真机上拖动手感」属真机观察项，见套件末尾的诚实声明。
import { useSyncExternalStore } from 'react'

/** 本机偏好单键：`{ order: string[], collapsed: boolean }`（偏好，不是真源数据）。 */
export const NAV_PREFS_KEY = 'dsh.personal.nav.v1'

/** 收起态**默认值 = 收起**（用户口径：平时只展示上面四个）。 */
export const NAV_COLLAPSED_DEFAULT = true

/** 收起态下**整条列表**（含第三方行）允许可见的行数上限。 */
export const NAV_VISIBLE_WHEN_COLLAPSED = 4

/**
 * 我方行渲染锚点：`.dps-nav` 是**既有选区**（核验套件与样式都按它取行），
 * 收起/展开的隐藏标记只加在行上，包一层 wrapper 不改 `.dps-nav` 的语义。
 */
export const NAV_LIST_SELECTOR = '.dps-nav'

/** 我方行选择器（宽栏与窄栏都是 `[data-nav]`；此处只用于计数与落点，不用于改 NAV）。 */
export const NAV_ROW_SELECTOR = '[data-nav]'

/**
 * 第三方「任务看板」行的**实际 DOM 选择器**（出处：PersonalBrowser.tsx 上方 IA 收口注释
 * 「@linxin666/dsh-client-ui-task-board 0.3.16，原生 DOM 注入 button[data-dsh-taskboard-entry]」）。
 * 它不在本插件 React 树内、也不在任何插槽 ⇒ 只能按 DOM 实测计数。
 */
export const THIRD_PARTY_NAV_ROW_SELECTOR = '[data-dsh-taskboard-entry]'

/** 持久化形状（版本化：将来加字段不破坏旧数据）。 */
interface NavPrefs {
  v: 1
  order: string[]
  collapsed: boolean
}

const DEFAULT_PREFS: NavPrefs = { v: 1, order: [], collapsed: NAV_COLLAPSED_DEFAULT }

// ---------------------------------------------------------------------------
// 纯函数（全部无 IO，可在核验套件里独立喂夹具）
// ---------------------------------------------------------------------------

/**
 * 用户序列叠加到默认顺序上（**唯一的排序规则**，与 NAV 字面量解耦）：
 *   ① 序列里**已知**的 id 按序列顺序排在前面（去重，第一个位置胜出）；
 *   ② 序列里**未知/已消失**的 id 直接忽略（绝不凭空造行，也不让表变空）；
 *   ③ 默认顺序里**未被序列提到**的 id（例如以后新增的行）按默认顺序**追加到末尾**；
 *   ④ 非数组 / 空数组 / 全部未知 ⇒ 原样返回默认顺序。
 */
export function applyNavOrder(defaultIds: readonly string[], stored: unknown): string[] {
  const defaults = [...defaultIds]
  if (!Array.isArray(stored)) return defaults
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const raw of stored) {
    if (typeof raw !== 'string') continue
    if (seen.has(raw)) continue
    if (!defaultIds.includes(raw)) continue // 未知 id 忽略
    seen.add(raw)
    ordered.push(raw)
  }
  for (const id of defaults) if (!seen.has(id)) ordered.push(id)
  return ordered
}

/** 序列是否与默认顺序一致（= 没有自定义顺序 ⇒ 不必存、也不必给「恢复默认」入口）。 */
export function isDefaultNavOrder(defaultIds: readonly string[], order: readonly string[]): boolean {
  return order.length === defaultIds.length && order.every((id, i) => id === defaultIds[i])
}

/** 从**任意**已解析值里取出合法偏好（坏数据一律退回默认，绝不抛错）。 */
export function parseNavPrefs(raw: unknown): NavPrefs {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_PREFS }
  const value = raw as Record<string, unknown>
  const order = Array.isArray(value.order) ? value.order.filter((x): x is string => typeof x === 'string') : []
  // collapsed 缺失/非布尔 ⇒ 默认（收起）——**未知不等于展开**。
  const collapsed = typeof value.collapsed === 'boolean' ? value.collapsed : NAV_COLLAPSED_DEFAULT
  return { v: 1, order, collapsed }
}

/** 解析本机存储字节 → 偏好（非法 JSON / 坏形状都退回默认）。 */
export function decodeNavPrefs(text: string | null): NavPrefs {
  if (text === null || text === '') return { ...DEFAULT_PREFS }
  try {
    return parseNavPrefs(JSON.parse(text))
  } catch {
    return { ...DEFAULT_PREFS } // 非法 JSON：退回默认，不抛错
  }
}

/**
 * 收起态**我方应隐藏的行 id**（按**实际渲染**判定，不靠猜布局）：
 *   上方第三方可见行数 above → 我方可见上限 = max(1, 4 − above)（**至少留 1 行**，
 *   否则收起后一条我们自己的入口都不剩，用户无从展开所在的面）。
 * 返回空数组 = 不隐藏任何行（已展开）。
 */
export function hiddenNavIds(
  order: readonly string[],
  collapsed: boolean,
  aboveThirdPartyVisible = 0,
): string[] {
  if (!collapsed) return []
  const above = Number.isFinite(aboveThirdPartyVisible) ? Math.max(0, Math.floor(aboveThirdPartyVisible)) : 0
  const ownVisible = Math.max(1, NAV_VISIBLE_WHEN_COLLAPSED - above)
  return order.slice(ownVisible)
}

/** 收起态该隐藏的**我方行数**（上面函数的计数形式，供断言与文案用）。 */
export function collapsedHiddenCount(orderLength: number, aboveThirdPartyVisible = 0): number {
  const above = Number.isFinite(aboveThirdPartyVisible) ? Math.max(0, Math.floor(aboveThirdPartyVisible)) : 0
  const ownVisible = Math.max(1, NAV_VISIBLE_WHEN_COLLAPSED - above)
  return Math.max(0, orderLength - ownVisible)
}

/**
 * 拖动落点：把 fromId 插到 targetId 的前/后半区（`half` = 'before' | 'after'）。
 * 返回**新的完整序列**（同序拖动 → 返回等价序列，调用方据此判定「无实质变化」）。
 */
export function reorderNavIds(
  order: readonly string[],
  fromId: string,
  targetId: string,
  half: 'before' | 'after',
): string[] {
  const next = [...order]
  const from = next.indexOf(fromId)
  if (from < 0) return next
  next.splice(from, 1)
  const target = next.indexOf(targetId)
  if (target < 0) return [...order] // 落点不在我方行内：不动
  next.splice(half === 'after' ? target + 1 : target, 0, fromId)
  return next
}

// ---------------------------------------------------------------------------
// 本机存储（写穿 + 订阅；读不到就退回默认，绝不抛错）
// ---------------------------------------------------------------------------

const subscribers = new Set<() => void>()

function readPrefs(): NavPrefs {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return { ...DEFAULT_PREFS }
    return decodeNavPrefs(window.localStorage.getItem(NAV_PREFS_KEY))
  } catch {
    return { ...DEFAULT_PREFS } // 隐私模式 / 配额 / 安全异常：退回默认
  }
}

function writePrefs(prefs: NavPrefs): void {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return
    window.localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 存储失败 = 本次页面内存里仍然生效（与 controller.ts 的 personalMode.set 同口径）
  }
}

function notify(): void {
  for (const fn of subscribers) fn()
}

// 快照必须**引用稳定**（useSyncExternalStore 的硬要求：每次 getSnapshot 返回新对象 ⇒ 无限重渲染）。
// 因此按「上次读到的原始字节」缓存：字节没变就复用同一个对象；变了才重新解析并替换。
// 同时覆盖：① 同标签页 setItem 后 notify；② 其它 bundle 改键后我们被 storage 事件唤醒；
// ③ 无 window（SSR/裸 Node）时退回进程内默认快照。
let cacheRaw: string | null | undefined
let cacheValue: NavPrefs = DEFAULT_PREFS

function snapshot(): NavPrefs {
  let raw: string | null
  try {
    raw = typeof window === 'undefined' || window.localStorage === undefined
      ? null
      : window.localStorage.getItem(NAV_PREFS_KEY)
  } catch {
    raw = null // 隐私模式 / 安全异常：视为「无存储」
  }
  if (cacheRaw !== undefined && cacheRaw === raw) return cacheValue
  cacheRaw = raw
  cacheValue = decodeNavPrefs(raw)
  return cacheValue
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  try {
    // 跨 bundle / 跨标签页同步（同一个键 = 同一份偏好；与 projects.ts 的 storage 事件同口径）。
    window.addEventListener('storage', (event: Event) => {
      const key = (event as StorageEvent).key
      if (key !== null && key !== undefined && key !== NAV_PREFS_KEY) return
      notify()
    })
  } catch {
    // 监听失败不影响本标签页内的即时生效
  }
}

/** 提交新序列（与默认一致 ⇒ 落回「无自定义顺序」，键里不留废数据）。 */
export function setNavOrder(defaultIds: readonly string[], order: readonly string[]): void {
  const normalized = applyNavOrder(defaultIds, [...order])
  const current = readPrefs()
  writePrefs({ v: 1, order: isDefaultNavOrder(defaultIds, normalized) ? [] : normalized, collapsed: current.collapsed })
  notify()
}

/** 提交收起/展开。 */
export function setNavCollapsed(collapsed: boolean): void {
  const current = readPrefs()
  writePrefs({ v: 1, order: current.order, collapsed: collapsed === true })
  notify()
}

export function subscribeNavPrefs(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function getServerNavPrefs(): NavPrefs {
  return { ...DEFAULT_PREFS }
}

/** React hook：本机偏好（行序 + 收起态）。宽栏/窄栏共用一个快照。 */
export function useNavPrefs(): NavPrefs {
  return useSyncExternalStore(subscribeNavPrefs, snapshot, getServerNavPrefs)
}

/** 仅收起态（渲染层读这个就够）。 */
export function useNavCollapsed(): boolean {
  return useNavPrefs().collapsed
}

// ---------------------------------------------------------------------------
// DOM 实测（只读；只用于「收起时可见行数 = 4」的真实判定）
// ---------------------------------------------------------------------------

const isElementVisible = (el: Element): boolean => {
  if (el.hasAttribute('hidden')) return false
  // 我方隐藏标记（收起态）：属性即真相，jsdom 与真机一致。
  if (el.getAttribute('data-nav-hidden') === 'true') return false
  const style = el.getAttribute('style')
  if (style !== null && /display\s*:\s*none/i.test(style)) return false
  return true
}

/**
 * `root` 内、位于 `.dps-nav` **之前**（文档序）的**可见**第三方导航行数。
 * jsdom 无布局 ⇒ 用属性与文档序判定；真机上「在我们的列表之上」= 文档序在我们之前
 * （官方侧栏是竖向文档流）。找不到我们自己的列表 ⇒ 记 0（保守：不改自己的可见行数）。
 */
export function countVisibleThirdPartyRowsAbove(
  root: Element | null | undefined,
  thirdPartySelector: string = THIRD_PARTY_NAV_ROW_SELECTOR,
): number {
  if (root === null || root === undefined) return 0
  let nav: Element | null = null
  try {
    nav = root.querySelector(NAV_LIST_SELECTOR)
  } catch {
    nav = null
  }
  if (nav === null) return 0
  let rows: Element[] = []
  try {
    rows = [...root.querySelectorAll(thirdPartySelector)]
  } catch {
    rows = []
  }
  let above = 0
  for (const row of rows) {
    if (!isElementVisible(row)) continue
    // 文档序：该行是否位于 nav **之前**？
    //   判据（实测校准，见本函数上方的火候说明）：问「nav 相对该行在哪儿」——
    //   返回 DOCUMENT_POSITION_FOLLOWING(4) 表示 **该行先于 nav**（nav 在其后）。
    //   千万别把它读反：`row.compareDocumentPosition(nav)` 的 FOLLOWING 指 nav 在 row 之后，
    //   也就是说 row 在前 —— 这正是我们想数的"上方"。第一种写法读反了，套件①b 直接抓住。
    let before = false
    try {
      const rel = nav.compareDocumentPosition(row)
      before = (rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    } catch {
      before = false
    }
    if (before) above += 1
  }
  return above
}
