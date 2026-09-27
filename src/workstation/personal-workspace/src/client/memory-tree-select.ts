// dsh-personal-workspace — V1.2-E2 · 记忆树**可见面选择**（纯函数，零依赖，无 react import）
//
// 为什么单独一层：E-2/E-3 裁定的是"首屏展示什么、上限是多少"，这些是**语义**，
//   必须能 headless 断言（`scripts/smoke-v12e-memory-tree-view.mjs`）。React 壳只负责
//   取数 + 渲染，判断留给这里 —— 否则"首屏到底展开了几层"只能靠肉眼看截图。
//
// 裁定来源：
//   · E-1 入口 = 中央主区视图 + 左栏一条导航行
//   · E-2 首屏 = 最近 **1** 个工作区 + **20** 个会话（轮次默认折叠，点击懒展开）
//   · E-3 可见节点上限仍 300（服务端硬闸；本层只如实显示"被裁了多少"）
//   · ADR-021：自绘薄画布（不引入 React Flow / 布局库）
//
// 三条纪律（与宿主半同源，只是搬到了 UI 这一侧）：
//   ① **未知 ≠ 空集**：取数失败 ⇒ 显示"取不到"+ 原因，**绝不**渲染成"你没有记忆"；
//   ② **不静默截断**：显示了几个 / 图内几个 / 上游几个 / 被 300 闸裁掉几个，全部如实标出；
//   ③ **不伪造**：episodes 面没有 trace id ⇒ 轮次节点上没有 traceId 可显示，
//      来源行只写真实存在的 sessionId / episodeId / 时间（不编一个 id 上去）。

import type { MemoryGraphEdge, MemoryGraphNode } from './memory-layout'

/** 首屏默认（E-2 裁定，是可调常数，不是架构）。 */
export const FIRST_SCREEN_WORKSPACES = 1
export const FIRST_SCREEN_SESSIONS = 20
/** 命中"再显示 N 个"时每次增加的量。 */
export const MORE_STEP = 20

/**
 * 宿主半只读路由（客户端侧声明，照 `mirror-push.ts` 的 MIRROR_ROUTE 同一做法）。
 * ⚠️ 与 `server/memory-tree.js` 的 `MEMORY_TREE_PATH` 是**两份**字面量 ⇒ 有漂移风险；
 * 由 `scripts/smoke-v12e-memory-tree-view.mjs` 断言两者逐字相等来兜住。
 */
export const MEMORY_TREE_ROUTE = '/personal-workspace/memory/tree'

export interface MemoryTreeSource {
  scope?: string
  endpoint?: string
  sessionId?: string | null
  returned?: number
  /** 上游声明的 turn 记录总数（null = 未声明 ⇒ 未知，不是 0）。 */
  total?: number | null
  hasMore?: boolean
  fetchTruncated?: boolean
  budgetClamped?: boolean
  budget?: number
  globalStatus?: string
  globalReason?: string | null
}

export interface MemoryTreeGraph {
  nodes: MemoryGraphNode[]
  edges: MemoryGraphEdge[]
  stats?: Record<string, unknown>
  layers?: {
    traces?: { total?: number | null; fetched?: number }
    policies?: number | null
    worldModels?: number | null
    skills?: number | null
  }
  truncation?: { budget?: number; included?: number; dropped?: number }
  recordIds?: { kind?: string }
}

/** 路由响应（成功 / 诚实失败两种形状）。 */
export type TreeFetch =
  | { ok: true; graph: MemoryTreeGraph; source: MemoryTreeSource }
  | { ok: false; reason: string; source: MemoryTreeSource | null }

/**
 * 解析路由响应。**形状不符 ⇒ ok:false**（不把"响应看不懂"当成"没有记忆"）。
 * @param status HTTP 状态码（拿不到传 0）
 */
export function parseTreeResponse(status: number, body: unknown): TreeFetch {
  if (typeof status !== 'number' || status < 200 || status >= 300) {
    return { ok: false, reason: `宿主路由返回 HTTP ${status}`, source: null }
  }
  if (body === null || typeof body !== 'object') {
    return { ok: false, reason: '宿主路由响应不是 JSON 对象（形状变化）', source: null }
  }
  const b = body as Record<string, unknown>
  if (b.ok !== true) {
    return {
      ok: false,
      reason: typeof b.reason === 'string' && b.reason !== '' ? b.reason : '宿主路由未给出原因',
      source: (b.source ?? null) as MemoryTreeSource | null,
    }
  }
  const g = b.graph as MemoryTreeGraph | undefined
  if (g === null || typeof g !== 'object' || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
    return { ok: false, reason: '宿主路由缺少 graph.nodes/edges（形状变化）', source: (b.source ?? null) as MemoryTreeSource | null }
  }
  return { ok: true, graph: g, source: (b.source ?? {}) as MemoryTreeSource }
}

export function kindOf(node: MemoryGraphNode): 'workspace' | 'session' | 'turn' | 'unknown' {
  const t = node?.type
  return t === 'workspace' || t === 'session' || t === 'turn' ? t : 'unknown'
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 节点的时间键：工作区/会话用 lastTs，轮次用 ts（缺则 0 ⇒ 排到最后，不编时间）。 */
export function timeOf(node: MemoryGraphNode): number {
  const d = node.data ?? {}
  if (node.type === 'turn') return num(d.ts)
  return num(d.lastTs)
}

/** 按时间降序（新的在前）；同时刻按 id 升序，保证同输入同输出。 */
export function byRecencyDesc(nodes: readonly MemoryGraphNode[]): MemoryGraphNode[] {
  return [...nodes].sort((a, b) => timeOf(b) - timeOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export interface VisibleSelection {
  /** 可见节点（已按 `isCollapsed` 标注 —— 布局层据此用折叠高）。 */
  nodes: MemoryGraphNode[]
  edges: MemoryGraphEdge[]
  shown: { workspaces: number; sessions: number; turns: number }
  hidden: { workspaces: number; sessions: number; turns: number }
  /** 还存在没显示的工作区（供"再显示 N 个"按钮的文案与置灰判断）。 */
  moreWorkspaces: number
  /**
   * **当前可见工作区内**还能再显示几个会话（"+N 个会话"按钮的真实增量）。
   * 注意它 ≠ `hidden.sessions`（后者是整张图未显示的总数，含被折叠工作区里的）。
   */
  moreSessions: number
}

export interface SelectOptions {
  workspaceLimit?: number
  sessionLimit?: number
  /** 已被用户展开（显示其轮次）的会话 id。 */
  expandedSessions?: ReadonlySet<string>
}

/**
 * 从整张图里挑出**当前可见**的子集。
 *
 * 两条容易踩错、因此写死在这里的规则：
 *   ① **已展开的会话必须可见**：否则用户点了"展开"却什么也没出现（它可能因超出
 *      首屏 20 个名额而被折叠在外）。同理，**已展开会话所在的工作区也必须可见**。
 *   ② 边只保留**两端都可见**的（否则会出现指向画布外的悬空连线）。
 */
export function selectVisible(graph: MemoryTreeGraph, options: SelectOptions = {}): VisibleSelection {
  const workspaceLimit = Math.max(1, Math.floor(options.workspaceLimit ?? FIRST_SCREEN_WORKSPACES))
  const sessionLimit = Math.max(1, Math.floor(options.sessionLimit ?? FIRST_SCREEN_SESSIONS))
  const expanded = options.expandedSessions ?? new Set<string>()

  const all = graph?.nodes ?? []
  const wsNodes = all.filter((n) => kindOf(n) === 'workspace')
  const seNodes = all.filter((n) => kindOf(n) === 'session')
  const trNodes = all.filter((n) => kindOf(n) === 'turn')

  // 已展开会话（及其父工作区）—— 无条件可见。
  const expandedInGraph = new Set(
    seNodes.filter((n) => expanded.has(String(n.data?.sessionId ?? ''))).map((n) => String(n.data?.sessionId ?? '')),
  )
  const pinnedWs = new Set(
    seNodes
      .filter((n) => expandedInGraph.has(String(n.data?.sessionId ?? '')))
      .map((n) => String(n.data?.workspaceId ?? 'unknown')),
  )

  const wsChosen = byRecencyDesc(wsNodes).filter(
    (n, i) => i < workspaceLimit || pinnedWs.has(String(n.data?.workspaceId ?? '')),
  )
  const wsVisible = new Set(wsChosen.map((n) => String(n.data?.workspaceId ?? 'unknown')))

  const seInVisibleWs = seNodes.filter((n) => wsVisible.has(String(n.data?.workspaceId ?? 'unknown')))
  const seChosen = byRecencyDesc(seInVisibleWs).filter(
    (n, i) => i < sessionLimit || expandedInGraph.has(String(n.data?.sessionId ?? '')),
  )
  const seVisible = new Set(seChosen.map((n) => String(n.data?.sessionId ?? '')))

  const trChosen = trNodes.filter((n) => seVisible.has(String(n.data?.sessionId ?? '')) && expandedInGraph.has(String(n.data?.sessionId ?? '')))

  const visibleIds = new Set<string>([...wsChosen, ...seChosen, ...trChosen].map((n) => n.id))
  const edges = (graph?.edges ?? []).filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))

  // 折叠态**如实标注**：会话未展开 ⇒ isCollapsed（布局层用折叠高）；展开了则标 false。
  const nodes: MemoryGraphNode[] = []
  for (const n of [...wsChosen, ...seChosen, ...trChosen]) {
    const kind = kindOf(n)
    let isCollapsed: boolean
    if (kind === 'workspace') isCollapsed = false
    else if (kind === 'session') isCollapsed = !expandedInGraph.has(String(n.data?.sessionId ?? ''))
    else isCollapsed = false
    nodes.push({ ...n, data: { ...(n.data ?? {}), isCollapsed } })
  }

  const shown = { workspaces: wsChosen.length, sessions: seChosen.length, turns: trChosen.length }
  const hidden = {
    workspaces: Math.max(0, wsNodes.length - shown.workspaces),
    sessions: Math.max(0, seNodes.length - shown.sessions),
    turns: Math.max(0, trNodes.length - shown.turns),
  }
  return {
    nodes,
    edges,
    shown,
    hidden,
    // ⚠️ 两个数**不是一回事**（混用会让"再显示 N 个"按钮撒谎）：
    //   · `hidden` = 整张图里没显示的数量（全局，含被折叠在外的工作区里的）；
    //   · `moreXxx` = **当前这一层还能直接加出来多少**（"+N"按钮的真实增量）：
    //     工作区是全局的（每个都能单独显示），会话只能是**已可见工作区内**的。
    moreWorkspaces: Math.max(0, wsNodes.length - shown.workspaces),
    moreSessions: Math.max(0, seInVisibleWs.length - shown.sessions),
  }
}

/**
 * 懒展开：把 `scope=session` 取回的那一批轮次**并入**当前图。
 *
 * 只并入该会话的 turn 节点与"轮次之间"的 sequence 边 —— 工作区/会话节点用本地已有的
 * （本地那份带着真实计数与时间），避免上游单会话响应把工作区摘要覆盖成"只有这个会话"。
 * 重复 id 以新数据覆盖（幂等：重复展开同一会话结果不变）。
 */
export function mergeSessionTurns(graph: MemoryTreeGraph, sessionId: string, payload: MemoryTreeGraph): MemoryTreeGraph {
  const incomingTurns = (payload?.nodes ?? []).filter((n) => kindOf(n) === 'turn' && String(n.data?.sessionId ?? '') === sessionId)
  const incomingIds = new Set(incomingTurns.map((n) => n.id))
  const keptNodes = (graph?.nodes ?? []).filter((n) => !incomingIds.has(n.id))
  // 该会话原有的轮次一并去掉（避免"展开两次留下两批"），由 incoming 顶替。
  const cleaned = keptNodes.filter((n) => !(kindOf(n) === 'turn' && String(n.data?.sessionId ?? '') === sessionId))
  const nodes = [...cleaned, ...incomingTurns]

  const seen = new Set(nodes.map((n) => n.id))
  const keptEdges = (graph?.edges ?? []).filter(
    (e) => seen.has(e.source) && seen.has(e.target) && !incomingIds.has(e.target) && !incomingIds.has(e.source),
  )
  const incomingEdges = (payload?.edges ?? []).filter((e) => seen.has(e.source) && seen.has(e.target))
  const edgeIds = new Set<string>()
  const edges: MemoryGraphEdge[] = []
  for (const e of [...keptEdges, ...incomingEdges]) {
    if (edgeIds.has(e.id)) continue
    edgeIds.add(e.id)
    edges.push(e)
  }
  return { ...graph, nodes, edges }
}

/** 会话是否已在本地图中带有轮次（⇒ 展开无需打网）。 */
export function hasTurnsFor(graph: MemoryTreeGraph, sessionId: string): boolean {
  return (graph?.nodes ?? []).some((n) => kindOf(n) === 'turn' && String(n.data?.sessionId ?? '') === sessionId)
}

// ---------------------------------------------------------------------------
// 诚实文案（集中在这里 ⇒ 套件可逐字断言，UI 与测试不会各写一份而漂移）

/**
 * 取数失败时的说明。**关键**：必须让用户明白"是读不到，不是没有记忆" ——
 *   这正是 E 组反复强调的"未知 ≠ 空集"在 UI 上的落点。
 */
export function failureNotice(f: { reason: string }): string {
  return `记忆树取不到：${f.reason}。这是**读取失败**，不是"你没有记忆"；可稍后重试或先看会话。`
}

/** 规模声明：显示了几个 / 图内几个 / 上游几个 / 被 300 闸裁掉几个。 */
export function scaleNotice(graph: MemoryTreeGraph, source: MemoryTreeSource): string {
  const tr = graph?.truncation ?? {}
  const budget = num(tr.budget)
  const included = num(tr.included)
  const dropped = num(tr.dropped)
  const total = source?.total ?? null
  const parts: string[] = []
  parts.push(`图中已构建 ${included} 轮`)
  if (budget > 0) parts.push(`${budget} 节点上限`)
  if (dropped > 0) parts.push(`被上限裁掉 ${dropped} 轮`)
  if (typeof total === 'number') parts.push(`上游共 ${total} 轮`)
  else parts.push('上游未声明总数（未知）')
  if (source?.hasMore === true) parts.push('上游还有更多可分页')
  return parts.join(' · ')
}

/** 全局层（策略/世界模型/技能）计量：读到记真实数字，读不到如实说未知。 */
export function layerNotice(graph: MemoryTreeGraph, source: MemoryTreeSource): string {
  const l = graph?.layers ?? {}
  if (source?.globalStatus !== 'ok') {
    return `其它三层（策略 / 世界模型 / 技能）计量读不到，**未知**（不是 0）：${source?.globalReason ?? '未给原因'}`
  }
  return `其它三层：策略 ${num(l.policies)} · 世界模型 ${num(l.worldModels)} · 技能 ${num(l.skills)}（实测计数，0 = 确实为空）`
}

/**
 * 名称来源声明（诚实性）：记忆库的 episodes 面**不提供**工作区名/会话名
 * ⇒ 投影层只好按 ID 生成占位标签（`工作区 941b9480`），并如实标 `labelDerived`。
 * 真机实测：本机 2/2 工作区、119/119 会话**全是**占位 —— 逐行打标记会变成
 * 谁都不看的噪声，而且真名一旦补上就又变成假话。所以：
 *   · 全局**说一次**（数量由数据算出来，不是写死的文案）
 *   · 逐节点只标"会变化的项"（摘要被截断 / 摘要为空）
 * 没有派生名时**返回 null**（这句声明自己也不许变成过期的假话）。
 */
export function labelProvenanceNotice(graph: MemoryTreeGraph): string | null {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const ws = nodes.filter((n) => kindOf(n) === 'workspace')
  const se = nodes.filter((n) => kindOf(n) === 'session')
  const wsDerived = ws.filter((n) => n?.data?.labelDerived === true).length
  const seDerived = se.filter((n) => n?.data?.labelDerived === true).length
  if (wsDerived + seDerived === 0) return null
  const parts: string[] = []
  if (wsDerived > 0) parts.push(`工作区 ${wsDerived}/${ws.length}`)
  if (seDerived > 0) parts.push(`会话 ${seDerived}/${se.length}`)
  return `名称口径：${parts.join('、')} 的标签由 ID 生成 —— 记忆库未提供名称，这不是项目真名。`
}
