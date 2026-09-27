// dsh-personal-workspace — V1.2-E · 记忆树分层布局（纯函数，零依赖，**无 react import**）
//
// 来源与许可证（**必须保留**）：移植自 **ThoughtDAG**（`dsh-thoughtdag`, MIT,
// Copyright (c) 2026 Xia Chen）宿主侧 `lib/why.mjs` 的 `autoLayout` / `estimateNodeHeight` /
// `nodeHeight` 与常量 `LAYOUT_COL_WIDTH` / `LAYOUT_H_GAP` / `LAYOUT_V_GAP` / `COLLAPSED_LAYOUT_HEIGHT`。
// 裁决与理由：`docs/DECISIONS.md` ADR-021（自绘薄画布 + 移植该分层布局；**不引入** React Flow / 布局库）。
//
// ── 抄了什么（保持数值与骨架一致，便于与上游对照）─────────────────────────────
//   · 常量数值：列宽 540 / 水平间距 48 / 垂直间距 72 / 折叠高 240 / 列内去重叠内边距 24
//   · `estimateNodeHeight` 的**形状**（基底 215 + 各行高度，钳制在 [260, 930]）
//   · `nodeHeight` = max(实测高, 估算高)（实测高优先，防止 DOM 真高被估低）
//   · `autoLayout` 的**分层列骨架**：根 → 首个子节点**同列竖直下推**（continuation）→
//     其余子节点**各自另起一列**（regenerates）→ 列 x = col × (列宽 + 水平间距)
//   · 上游的 "continuation = 同一问题的**后续轮次**" 语义与本图一致：故 `sequence` 边
//     （会话内轮次续接）**与 `contains` 一样参与分层** —— 否则 27 轮会话会被摊成 27 列
//   · 兜底定位（父已定位但自身漏掉 ⇒ 落在父底 + 垂直间距）与**列内去重叠**
//     （同列按 y 排序，逐个下推，并把该节点的**后代整体平移**同样的 delta，跑 5 轮）
//
// ── 没抄什么（我们的图是**严格森林**，这些语义在本图不存在，抄进来只会长成无法测试的复杂度）──
//   · `materialAnchors` 内容节点（`note`/`file`/`link`/`frame`）锚定 —— 上游 Notion 导入语义
//   · `isBranchFromSelection` 探索边与 `explores` 分支定位（y = 父顶 + 父高×0.25）
//   · 多父节点 `claimant` 归并与 `isCrossLink` 交叉边
//   · 虚拟列机制 `VIRT_BASE` / `colXOverride`
//
// 布局不变量（由 `scripts/smoke-v12e-memory-layout.mjs` 守护）：
//   ① 确定性：同输入必同输出；② 零节点 ⇒ 零输出；
//   ③ 子节点列号 ≥ 父节点列号，且列 x 严格等于 col × 588；
//   ④ 同列任意两节点包围盒不重叠；⑤ 每个节点都拿到坐标（不漏、不 NaN）。
import type { MemoryGraphEdge, MemoryGraphNode } from '../server/memory-graph'

export const LAYOUT_COL_WIDTH = 540
export const LAYOUT_H_GAP = 48
export const LAYOUT_V_GAP = 72
export const LAYOUT_V_PAD = 24
export const COLLAPSED_LAYOUT_HEIGHT = 240
export const DEFAULT_NODE_HEIGHT = 220

export interface LayoutNodeInput {
  id: string
  type?: string
  data?: Record<string, unknown>
  measured?: { height?: number } | null
}

function textLen(v: unknown): number {
  return typeof v === 'string' ? v.length : 0
}

/**
 * 估算节点高度（移植的上游形状：基底 215 + 各行高度，钳制 [260, 930]）。
 *
 * 与上游的差异（如实登记）：上游按 `question`/`response`/`highlights`/`attachments` 四段估算；
 * 我们的 turn 节点只有**真实摘要**（`label`）+ 工具痕迹行 + 来源行，故用
 * `label` 顶替上游的 `question` 段（同样的 `min(180, 40 + len/1.2)` 形状），
 * 并新增工具痕迹行与来源行。**不引入**上游没有的字段，也不假装有 response 段。
 */
export function estimateNodeHeight(node: LayoutNodeInput): number {
  const d = node.data ?? {}
  if (d.isCollapsed === true) return COLLAPSED_LAYOUT_HEIGHT
  const labelH = Math.min(180, 40 + textLen(d.label) / 1.2)
  const toolTags = Array.isArray(d.toolTags) ? d.toolTags.length : 0
  const tagsH = Math.min(104, toolTags * 26)
  const sourceH = d.sourceRef ? 30 : 0
  const kindBase = node.type === 'workspace' ? 150 : node.type === 'session' ? 170 : 215
  const estimated = kindBase + labelH + tagsH + sourceH
  return Math.max(260, Math.min(930, estimated))
}

/** 实测高优先（DOM 真高 > 估算），与上游 `nodeHeight` 同义。 */
export function nodeHeight(node: LayoutNodeInput): number {
  const measured = node.measured?.height ?? 0
  return Math.max(Number.isFinite(measured) ? measured : 0, estimateNodeHeight(node))
}

function colX(col: number): number {
  return col * (LAYOUT_COL_WIDTH + LAYOUT_H_GAP)
}

/** 子节点稳定排序：按 (data.ts, id) —— 时间序优先，保证同输入同输出。 */
function sortChildren(ids: string[], byId: Map<string, LayoutNodeInput>): string[] {
  return [...ids].sort((a, b) => {
    const ta = Number((byId.get(a)?.data ?? {}).ts ?? 0)
    const tb = Number((byId.get(b)?.data ?? {}).ts ?? 0)
    if (ta !== tb) return ta - tb
    return a < b ? -1 : a > b ? 1 : 0
  })
}

/**
 * 记忆树分层布局。**只读输入**，返回带坐标的新节点数组（不改调用方对象）。
 *
 * @param nodes 投影层产出的节点（`position` 会被忽略，可传 `{x:0,y:0}`）
 * @param edges 投影层产出的边；**`contains`（层级）与 `sequence`（轮次续接）都参与分层**
 *              （续接链在上游就是 continuation 语义；不参与则多轮会话会摊成并列分支）
 */
export function autoLayout<T extends LayoutNodeInput>(
  nodes: readonly T[],
  edges: readonly MemoryGraphEdge[],
): (T & { position: { x: number; y: number } })[] {
  if (nodes.length === 0) return []

  const byId = new Map<string, T>()
  for (const n of nodes) byId.set(n.id, n)

  const isStructural = (k: unknown): boolean => k === 'contains' || k === 'sequence'
  const structural = edges.filter((e) => isStructural(e.data?.kind) && byId.has(e.source) && byId.has(e.target))
  const childrenMap = new Map<string, string[]>()
  const parentSet = new Set<string>()
  for (const e of structural) {
    const list = childrenMap.get(e.source) ?? []
    list.push(e.target)
    childrenMap.set(e.source, list)
    parentSet.add(e.target)
  }

  const roots = nodes.filter((n) => !parentSet.has(n.id)).map((n) => n.id)
  roots.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  // 列分配：根各占一列；首个子节点留在父列（continuation）；其余子节点各起新列。
  const nodeColumn = new Map<string, number>()
  let nextColumn = 0
  function assign(nodeId: string, col: number): void {
    if (nodeColumn.has(nodeId)) return
    nodeColumn.set(nodeId, col)
    const children = sortChildren(childrenMap.get(nodeId) ?? [], byId)
    if (children.length === 0) return
    assign(children[0]!, col)
    for (let i = 1; i < children.length; i++) assign(children[i]!, nextColumn++)
  }
  for (const r of roots) assign(r, nextColumn++)
  // 森林之外的孤儿（父缺失/成环）：给一列，避免漏节点。
  for (const n of nodes) if (!nodeColumn.has(n.id)) assign(n.id, nextColumn++)

  const heights = new Map<string, number>()
  for (const n of nodes) heights.set(n.id, nodeHeight(n))

  const pos = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()
  const queue: string[] = []
  for (const r of roots) {
    pos.set(r, { x: colX(nodeColumn.get(r) ?? 0), y: 0 })
    visited.add(r)
    queue.push(r)
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    const parentPos = pos.get(current)!
    const parentHeight = heights.get(current) ?? DEFAULT_NODE_HEIGHT
    const floorY = parentPos.y + parentHeight + LAYOUT_V_GAP
    for (const child of sortChildren(childrenMap.get(current) ?? [], byId)) {
      if (visited.has(child)) continue
      visited.add(child)
      pos.set(child, { x: colX(nodeColumn.get(child) ?? 0), y: floorY })
      queue.push(child)
    }
  }
  // 兜底（与上游同序）：父已定位而自身漏掉 ⇒ 落在最靠下的父底 + 垂直间距。
  for (let guard = 0; guard < nodes.length; guard++) {
    let progressed = false
    for (const n of nodes) {
      if (pos.has(n.id)) continue
      const parents = structural.filter((e) => e.target === n.id && pos.has(e.source))
      if (parents.length === 0) continue
      const bottom = Math.max(...parents.map((e) => pos.get(e.source)!.y + (heights.get(e.source) ?? DEFAULT_NODE_HEIGHT)))
      pos.set(n.id, { x: colX(nodeColumn.get(n.id) ?? 0), y: bottom + LAYOUT_V_GAP })
      progressed = true
    }
    if (!progressed) break
  }
  for (const n of nodes) if (!pos.has(n.id)) pos.set(n.id, { x: colX(nodeColumn.get(n.id) ?? 0), y: 0 })

  // 列内去重叠（含后代整体平移）：同列按 y 排序，逐个下推，最多 5 轮。
  const descendantsOf = (rootId: string): string[] => {
    const out: string[] = []
    const stack = [...(childrenMap.get(rootId) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      if (out.includes(id)) continue
      out.push(id)
      stack.push(...(childrenMap.get(id) ?? []))
    }
    return out
  }
  const columnNodes = new Map<number, string[]>()
  for (const n of nodes) {
    const col = nodeColumn.get(n.id) ?? 0
    const list = columnNodes.get(col) ?? []
    list.push(n.id)
    columnNodes.set(col, list)
  }
  for (let pass = 0; pass < 5; pass++) {
    let moved = false
    for (const [, ids] of columnNodes) {
      ids.sort((a, b) => pos.get(a)!.y - pos.get(b)!.y || (a < b ? -1 : 1))
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1]!
        const curr = ids[i]!
        const minY = pos.get(prev)!.y + (heights.get(prev) ?? DEFAULT_NODE_HEIGHT) + LAYOUT_V_PAD
        if (pos.get(curr)!.y < minY) {
          const delta = minY - pos.get(curr)!.y
          pos.get(curr)!.y = minY
          for (const d of descendantsOf(curr)) {
            const dp = pos.get(d)
            if (dp) dp.y += delta
          }
          moved = true
        }
      }
    }
    if (!moved) break
  }

  return nodes.map((n) => {
    const p = pos.get(n.id)!
    return { ...n, position: { x: p.x, y: p.y } }
  })
}

/** 布局包围盒（画布 fitView 用；测试也用它做"不漏节点/无 NaN"断言）。 */
export function layoutBounds(
  nodes: readonly LayoutNodeInput[],
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const p = (n as { position?: { x: number; y: number } }).position
    if (!p) continue
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + LAYOUT_COL_WIDTH)
    maxY = Math.max(maxY, p.y + nodeHeight(n))
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export type { MemoryGraphEdge, MemoryGraphNode }
