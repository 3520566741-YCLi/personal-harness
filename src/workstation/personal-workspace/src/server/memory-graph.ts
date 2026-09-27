// dsh-personal-workspace — V1.2-E · Memory Tree 投影层（纯函数，零 IO）
//
// 契约来源：`docs/V1_2_E_PREFLIGHT_AUDIT.md`（实测）+ `docs/DECISIONS.md` ADR-021。
//
// 本层只做一件事：把 MemOS **实测形状**的 traces/episodes 响应，投影成
// `{nodes, edges}`（形状对齐 ThoughtDAG 的 React Flow 形状，便于复用其分层布局算法）。
//
// 八条硬纪律（每条都有实测依据，改动前先读预检）：
//   ① **episode:trace 合并为单个 `turn` 节点**：若按"episode 是一层"去画，会得到一整层平行重复节点。
//      但"1:1"这个**事实**必须由数据算出、且只声明能证的部分（见 `episodeAliasFactOf`）：最初实测 424:424；
//      2026-09-18 复测两面 total 同为 479，而 `/api/v1/diag/counts` 报 traces=437 / episodes=478 ——
//      两个计数口径不互证 ⇒ 本层改为 traces 面双射校验（反例判 false）、episodes 面判 null（未知）。
//   ② **真层级只有三层**：workspace(`ownerWorkspaceId`) → session(`sessionId`) → turn。
//      层级边 = `contains`（workspace→session、session→**首轮**）；
//      同会话内按 `ts` 升序的轮次续接 = `sequence`（轮 i → 轮 i+1），**同样参与分层**
//      （若把续接当并列分支，27 轮会话会摊成 27 列 —— 那是上游"同问多答"的语义，不是时序续接）。
//   ③ **不生成空品类占位**：`policies`/`world-models`/`skills` 实测 total=0 ⇒ 不造节点、
//      不写"暂无数据"。但必须**区分「上游确实 0 条」与「未取到（未知）」**（null ≠ 0）。
//   ④ **不把 tags 当主题**：实测 tags 是工具名集合（bash/git/read/…）⇒ 字段名就叫
//      `toolTags`，图上没有 Topics 节点；语义层如实标注 unavailable。
//   ⑤ **不按价值排序**：实测 `value`/`alpha` 全为 0 ⇒ `rankable.byValue` 由**数据算出**
//      （不是写死）：全 0 即 false，并给出理由。能排的只有时间/轮次顺序。
//   ⑥ **规模纪律硬闸**：节点总数上限（默认 300，预检 §21）⇒ 只纳入**最近**的轮次，
//      并如实上报 `total / included / dropped`（不静默截断）。
//   ⑦ **来源指针**：每个 turn 节点带 `sourceRef`（sessionId/episodeId/traceId/turnId/ts）
//      ⇒ 点击可回到**真实会话 + 真实轮次**（复用 V1.2-D 的 hydrate 面）。
//   ⑧ **零 IO / 纯函数 / 确定性**：同输入必同输出；不改调用方对象；不猜、不编、不补。

/** MemOS 取数面的实测字段（未列出的字段本层不读、不信任）。
 *
 * `idKind` 由**调用方**如实声明本批记录的 id 是哪一个面的（默认 `'trace'`，保持 E1 行为不变）：
 *   · `'trace'` ⇒ `id` 是 trace id（`tr_…`），`episodeId` 由记录自带；
 *   · `'episode'` ⇒ `id` 是 episode id（`ep_…`），**该面不提供 trace id** ⇒ 投影层记
 *     `traceId: null`（episode:trace 1:1 是上游事实，但我们手上没有那个 id —— 不编）。
 * 为什么需要这个字段（实测）：`GET /api/v1/traces` 单条 ~108 KB（含 agentText/toolCalls 全文），
 * 100 条 = 10.3 MiB 已超本仓单响应上限；而 `GET /api/v1/episodes` 单条 ~840 B 且字段足够画树。
 * ⇒ 树走 episodes 面（体积差 ~130×），但**绝不**把 episode id 塞进叫 traceId 的字段里。
 */
export interface RawTrace {
  id: string
  idKind?: 'trace' | 'episode'
  episodeId?: string
  sessionId?: string
  ownerWorkspaceId?: string
  ownerProfileId?: string
  ownerAgentKind?: string
  ts?: number
  turnId?: number
  summary?: string
  userText?: string
  tags?: readonly string[]
  value?: number
  alpha?: number
  episodeStatus?: string
}

export interface MemoryGraphOptions {
  /** 节点总数上限（含 workspace/session 节点）。 */
  maxNodes?: number
  /** 节点标签（summary）截断长度。 */
  maxLabelChars?: number
  /** 我们自己的层提供的工作区显示名；**没有就不编**（label 回落到 id 片段并标 derived）。 */
  workspaceLabels?: Record<string, string>
  /** 上游其它三层的 total：number = 已取到的真实计量（0 = 确实为空）；null/缺省 = 未取到（未知）。 */
  layerTotals?: { policies?: number | null; worldModels?: number | null; skills?: number | null }
  /**
   * 上游声明的 turn 记录总数（`total` 字段）；缺省 = 未知（null，**不是** 0）。
   * 因为 episode:trace = 1:1 是上游事实（实测两面同为 428），这个计数在 traces 面与
   * episodes 面**是同一个数** ⇒ 两个取数面共用此字段，语义为"turn 记录总数"。
   */
  tracesTotal?: number | null
}

export type MemoryNodeKind = 'workspace' | 'session' | 'turn'

export interface MemoryGraphNode {
  id: string
  type: MemoryNodeKind
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface MemoryGraphEdge {
  id: string
  source: string
  target: string
  type: 'smoothstep'
  /**
   * `contains` = 层级归属（workspace→session、session→**首轮**）；
   * `sequence` = **同一会话内的轮次续接**（轮 i → 轮 i+1）。
   *
   * 两者**都参与分层**（否则 27 轮会话会被画成 27 个并列分支 —— 那是"同一问题的多个候选答案"
   * 的上游语义，不是"时序续接"）。见 `src/client/memory-layout.ts` 的 continuation 说明。
   */
  data: { kind: 'contains' | 'sequence' }
}

export interface MemoryGraphStats {
  /** 调用方交进来的记录条数（含不可用记录）。 */
  inputCount: number
  /** 真正参与投影的条数。 */
  tracesIn: number
  /** 缺 `sessionId` ⇒ **不猜归属**，逐条计入此处（不静默丢）。 */
  ungrouped: number
  tracesTotal: number | null
  sessions: number
  workspaces: number
  nodesByKind: Record<MemoryNodeKind, number>
  edgesByKind: { contains: number; sequence: number }
}

export interface MemoryGraph {
  nodes: MemoryGraphNode[]
  edges: MemoryGraphEdge[]
  stats: MemoryGraphStats
  /** 上游四层的真实状态：0 = 实测为空；null = 未取到（未知，**不是**"没有"）。 */
  layers: {
    traces: { total: number | null; fetched: number }
    policies: number | null
    worldModels: number | null
    skills: number | null
  }
  /** 语义层可用性（如实标注，不假装有主题）。 */
  semanticLayers: { topics: 'unavailable'; reason: string }
  /** 排序能力：由数据算出，不在数据上撒谎。 */
  rankable: { byValue: boolean; reason: string }
  /** 规模纪律：不静默截断。 */
  truncation: { budget: number; included: number; dropped: number; byRecency: boolean }
  /**
   * 本批记录的身份来源（如实标注，供 UI/测试引用）：
   *   `'trace'` = 每条 `id` 是 trace id（`sourceRef.traceId` 有值）；
   *   `'episode'` = 是 episode id（`sourceRef.episodeId` 有值、`traceId` 为 null）；
   *   `'mixed'` = 两种混入（调用方接线异常，如实报出而不是挑一种假装统一）。
   */
  recordIds: { kind: 'trace' | 'episode' | 'mixed' }
  /** ⑨ `episode ≡ turn` 的可证事实与依据（`holds: null` = 本层面无法验证，**不是**"不成立"）。 */
  episodeAlias: EpisodeAliasFact
  /** 形状事实（供画布/测试引用）。 */
  shape: { episodeTraceIsOneToOne: boolean | null; hierarchy: readonly string[] }
}

export const DEFAULT_MAX_NODES = 300
export const DEFAULT_MAX_LABEL_CHARS = 200

/** `GET /api/v1/episodes` 的实测字段（树用；同一份信息比 traces 面小 ~130×）。 */
export interface RawEpisode {
  id: string
  sessionId?: string | null
  ownerWorkspaceId?: string | null
  ownerProfileId?: string | null
  ownerAgentKind?: string | null
  startedAt?: number | null
  turnCount?: number | null
  preview?: string | null
  status?: string | null
  tags?: readonly string[] | null
}

/**
 * episodes 面 → 投影输入。**只映射实测存在的字段**，不补默认值、不编 trace id：
 *   · `id` → `id` 并声明 `idKind: 'episode'`（`episodeId` 等于它自己，见投影内的处理）；
 *   · `startedAt` → `ts`；`preview` → `summary`（`labelSource` 优先取 summary）；
 *   · `status` → `episodeStatus`；`tags` 原样带上（字段名 `toolTags` 已如实体现其工具名语义）。
 * 记录缺 id / 缺 sessionId 时交给投影层按「不可用 / ungrouped」如实计数（本函数不预筛）。
 */
export function adaptEpisodes(episodes: readonly RawEpisode[] | null | undefined): RawTrace[] {
  const out: RawTrace[] = []
  for (const e of episodes ?? []) {
    if (!e || typeof e.id !== 'string' || e.id === '') continue
    out.push({
      id: e.id,
      idKind: 'episode',
      sessionId: typeof e.sessionId === 'string' && e.sessionId !== '' ? e.sessionId : undefined,
      ownerWorkspaceId:
        typeof e.ownerWorkspaceId === 'string' && e.ownerWorkspaceId !== '' ? e.ownerWorkspaceId : undefined,
      ownerProfileId: typeof e.ownerProfileId === 'string' && e.ownerProfileId !== '' ? e.ownerProfileId : undefined,
      ownerAgentKind:
        typeof e.ownerAgentKind === 'string' && e.ownerAgentKind !== '' ? e.ownerAgentKind : undefined,
      ts: typeof e.startedAt === 'number' && Number.isFinite(e.startedAt) ? e.startedAt : undefined,
      summary: typeof e.preview === 'string' ? e.preview : undefined,
      episodeStatus: typeof e.status === 'string' ? e.status : undefined,
      tags: Array.isArray(e.tags) ? e.tags.filter((x): x is string => typeof x === 'string') : undefined,
    })
  }
  return out
}

const TOPICS_UNAVAILABLE_REASON =
  '实测 tags 为工具名集合（bash/git/read/shell 等），非主题标签；本机无主题真源，故不生成 Topics 节点'

function clampLabel(text: string, max: number): { label: string; truncated: boolean } {
  const s = String(text ?? '')
  if (s.length <= max) return { label: s, truncated: false }
  return { label: s.slice(0, max), truncated: true }
}

/** 第一行非空文本（summary 优先，回落 userText 首行）；无则返回空串 —— 不编造。 */
function labelSource(t: RawTrace): string {
  const summary = (t.summary ?? '').trim()
  if (summary !== '') return summary
  const user = (t.userText ?? '').trim()
  if (user === '') return ''
  return user.split('\n')[0]!.trim()
}

function shortId(id: string, n = 8): string {
  const s = String(id ?? '')
  return s.length <= n ? s : s.slice(-n)
}

function tsOf(t: RawTrace): number {
  const v = Number(t.ts)
  return Number.isFinite(v) ? v : 0
}

/** 记录身份如实拆分：episodes 面只有 episode id；traces 面只有 trace id（+记录自带 episodeId）。 */
function identityOf(t: RawTrace): { traceId: string | null; episodeId: string | null } {
  if (t.idKind === 'episode') return { traceId: null, episodeId: t.id }
  return { traceId: t.id, episodeId: t.episodeId ?? null }
}

/** ⑨ `episode ≡ turn` 的**依据**（能证则证、不能证就如实说未知）。 */
export type EpisodeAliasBasis =
  /** traces 面：每条都自带 episodeId 且互不重复 ⇒ 本层可证双射。 */
  | 'traces-face-bijection'
  /** traces 面：有记录缺 episodeId ⇒ 无从判断（未知）。 */
  | 'traces-face-missing-episode-id'
  /** episodes 面：记录只带 episode id，**不含 trace id** ⇒ 本层结构上无法验证。 */
  | 'episodes-face-unverifiable'
  /** 两面混入（调用方接线异常）⇒ 不挑一种假装统一。 */
  | 'mixed-face-unverifiable'
  /** 空输入：没有可验证的记录。 */
  | 'no-records'

export interface EpisodeAliasFact {
  /** `true` = 本层已证；`false` = 已证**不成立**（有反例）；`null` = 未知（**不是**"不成立"）。 */
  holds: boolean | null
  basis: EpisodeAliasBasis
  records: number
  withEpisodeId: number
  distinctEpisodeIds: number
  /** 反例证据：被多条记录共用的 episodeId（升序，最多列 8 个）。 */
  duplicateEpisodeIds: readonly string[]
}

/**
 * ⑨ 算出 `episode ≡ turn` 的可证部分（**绝不在数据上撒谎**）。
 *
 * 为什么不写死 `true`：2026-09-18 真机复测，`/api/v1/traces` 与 `/api/v1/episodes` 两面 total 同为 479，
 * 但 `/api/v1/diag/counts` 报 `traces=437 / episodes=478` —— 同一系统的两个计数口径并不互证 1:1。
 * 既然计量不足以证明，就只声明结构上能证的那部分：traces 面可做双射校验（并给出反例），
 * episodes 面则根本没有 trace id 可校验 ⇒ `null`。
 */
export function episodeAliasFactOf(records: readonly RawTrace[]): EpisodeAliasFact {
  const kinds = new Set(records.map((t) => (t.idKind === 'episode' ? 'episode' : 'trace')))
  const seen = new Map<string, number>()
  for (const t of records) {
    const ep = identityOf(t).episodeId
    if (ep === null || ep === '') continue
    seen.set(ep, (seen.get(ep) ?? 0) + 1)
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort()
  const withEpisodeId = [...seen.values()].reduce((a, c) => a + c, 0)
  const base = {
    records: records.length,
    withEpisodeId,
    distinctEpisodeIds: seen.size,
    duplicateEpisodeIds: duplicates.slice(0, 8),
  }
  if (records.length === 0) return { ...base, holds: null, basis: 'no-records' }
  if (kinds.has('episode')) {
    return kinds.size > 1
      ? { ...base, holds: null, basis: 'mixed-face-unverifiable' }
      : { ...base, holds: null, basis: 'episodes-face-unverifiable' }
  }
  if (duplicates.length > 0) return { ...base, holds: false, basis: 'traces-face-bijection' }
  if (withEpisodeId !== records.length) return { ...base, holds: null, basis: 'traces-face-missing-episode-id' }
  return { ...base, holds: true, basis: 'traces-face-bijection' }
}

/**
 * 投影：MemOS traces → 记忆树 `{nodes, edges}`。
 *
 * 输入 traces 的**取回范围由调用方决定**（分页由取数层负责）；本函数只按规模闸裁剪。
 */
export function projectMemoryGraph(
  traces: readonly RawTrace[],
  options: MemoryGraphOptions = {},
): MemoryGraph {
  const budget = Math.max(1, Math.floor(options.maxNodes ?? DEFAULT_MAX_NODES))
  const maxLabel = Math.max(1, Math.floor(options.maxLabelChars ?? DEFAULT_MAX_LABEL_CHARS))
  const labels = options.workspaceLabels ?? {}
  const lt = options.layerTotals ?? {}
  const tracesTotal = options.tracesTotal ?? null

  // 只信任带 id 的记录；缺失分组键的记录**不猜归属**，如实计入 ungrouped。
  const usable: RawTrace[] = []
  let inputCount = 0
  let ungrouped = 0
  for (const t of traces ?? []) {
    if (!t || typeof t.id !== 'string' || t.id === '') continue
    inputCount++
    if (typeof t.sessionId !== 'string' || t.sessionId === '') {
      ungrouped++
      continue
    }
    usable.push(t)
  }

  // 规模闸：按 ts 降序取最近的轮次（确定性：ts 相同时按 id 升序，保证同输入同输出）。
  const byRecency = [...usable].sort((a, b) => tsOf(b) - tsOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const chosen: RawTrace[] = []
  const sessionIds = new Set<string>()
  const workspaceIds = new Set<string>()
  const countNodes = () => chosen.length + sessionIds.size + workspaceIds.size
  for (const t of byRecency) {
    const wsId = typeof t.ownerWorkspaceId === 'string' && t.ownerWorkspaceId !== '' ? t.ownerWorkspaceId : 'unknown'
    const nextSessions = new Set(sessionIds)
    nextSessions.add(t.sessionId!)
    const nextWorkspaces = new Set(workspaceIds)
    nextWorkspaces.add(wsId)
    const prospective = chosen.length + 1 + nextSessions.size + nextWorkspaces.size
    if (prospective > budget) break
    chosen.push(t)
    sessionIds.add(t.sessionId!)
    workspaceIds.add(wsId)
  }

  // 反向回正序（旧 → 新），使节点顺序与时间一致、便于肉眼核对。
  chosen.sort((a, b) => tsOf(a) - tsOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const nodes: MemoryGraphNode[] = []
  const edges: MemoryGraphEdge[] = []
  const nodesByKind: Record<MemoryNodeKind, number> = { workspace: 0, session: 0, turn: 0 }
  const edgesByKind = { contains: 0, sequence: 0 }

  // ⑨ 先算出 alias 事实，再由它标注每个 turn 节点与图级 shape（单一真源，避免两处各写一个值）。
  const episodeAlias = episodeAliasFactOf(chosen)

  // workspace 节点
  const wsStat = new Map<string, { sessions: Set<string>; turns: number; firstTs: number; lastTs: number }>()
  const seStat = new Map<string, { ws: string; turns: RawTrace[] }>()
  for (const t of chosen) {
    const wsId = typeof t.ownerWorkspaceId === 'string' && t.ownerWorkspaceId !== '' ? t.ownerWorkspaceId : 'unknown'
    const w = wsStat.get(wsId) ?? { sessions: new Set<string>(), turns: 0, firstTs: Infinity, lastTs: -Infinity }
    w.sessions.add(t.sessionId!)
    w.turns++
    w.firstTs = Math.min(w.firstTs, tsOf(t))
    w.lastTs = Math.max(w.lastTs, tsOf(t))
    wsStat.set(wsId, w)
    const s = seStat.get(t.sessionId!) ?? { ws: wsId, turns: [] }
    s.turns.push(t)
    seStat.set(t.sessionId!, s)
  }

  const wsNodeId = (wsId: string) => `ws:${wsId}`
  const seNodeId = (sid: string) => `se:${sid}`
  const trNodeId = (tid: string) => `tr:${tid}`

  for (const wsId of [...wsStat.keys()].sort()) {
    const w = wsStat.get(wsId)!
    const named = typeof labels[wsId] === 'string' && labels[wsId] !== ''
    nodes.push({
      id: wsNodeId(wsId),
      type: 'workspace',
      position: { x: 0, y: 0 },
      data: {
        kind: 'workspace',
        workspaceId: wsId,
        label: named ? labels[wsId] : `工作区 ${shortId(wsId)}`,
        labelDerived: !named,
        sessionCount: w.sessions.size,
        turnCount: w.turns,
        firstTs: Number.isFinite(w.firstTs) ? w.firstTs : null,
        lastTs: Number.isFinite(w.lastTs) ? w.lastTs : null,
      },
    })
    nodesByKind.workspace++
  }

  for (const sid of [...seStat.keys()].sort()) {
    const s = seStat.get(sid)!
    const turns = [...s.turns].sort((a, b) => tsOf(a) - tsOf(b) || a.id.localeCompare(b.id))
    const profiles = [...new Set(turns.map((t) => t.ownerProfileId).filter((p): p is string => !!p))].sort()
    nodes.push({
      id: seNodeId(sid),
      type: 'session',
      position: { x: 0, y: 0 },
      data: {
        kind: 'session',
        sessionId: sid,
        workspaceId: s.ws,
        label: `会话 ${shortId(sid)}`,
        labelDerived: true,
        turnCount: turns.length,
        firstTs: tsOf(turns[0]!),
        lastTs: tsOf(turns[turns.length - 1]!),
        ownerProfileIds: profiles,
        statuses: [...new Set(turns.map((t) => t.episodeStatus).filter((x): x is string => !!x))].sort(),
      },
    })
    nodesByKind.session++
    edges.push({
      id: `e:${wsNodeId(s.ws)}->${seNodeId(sid)}`,
      source: wsNodeId(s.ws),
      target: seNodeId(sid),
      type: 'smoothstep',
      data: { kind: 'contains' },
    })
    edgesByKind.contains++

    let prev: RawTrace | null = null
    for (let turnIndex = 0; turnIndex < turns.length; turnIndex++) {
      const t = turns[turnIndex]!
      const src = labelSource(t)
      const { label, truncated } = clampLabel(src, maxLabel)
      // 身份如实：episodes 面只有 episode id（trace id 未知 ⇒ null），traces 面反之。
      const ep = identityOf(t)
      nodes.push({
        id: trNodeId(t.id),
        type: 'turn',
        position: { x: 0, y: 0 },
        data: {
          kind: 'turn',
          recordId: t.id,
          traceId: ep.traceId,
          episodeId: ep.episodeId,
          traceIdKnown: ep.traceId !== null,
          // ① episode:trace = 1:1 ⇒ episode 不是上层，只作为来源指针保留（不另建节点）。
          // ⑨ 该标注**由数据算出**（`episodeAliasFactOf`）：可证为 true、有反例为 false、无法验证为 null。
          episodeIsTurnAlias: episodeAlias.holds,
          sessionId: sid,
          workspaceId: s.ws,
          turnId: t.turnId ?? null,
          ts: tsOf(t),
          label,
          labelDerived: false,
          labelLost: src === '',
          labelTruncated: truncated,
          episodeStatus: t.episodeStatus ?? null,
          ownerProfileId: t.ownerProfileId ?? null,
          ownerAgentKind: t.ownerAgentKind ?? null,
          // ④ tags 是**工具名**集合，字段名如实体现，图上不生成 Topics 节点。
          toolTags: [...(t.tags ?? [])].map((x) => String(x)).sort(),
          value: Number.isFinite(Number(t.value)) ? Number(t.value) : null,
          alpha: Number.isFinite(Number(t.alpha)) ? Number(t.alpha) : null,
          sourceRef: {
            sessionId: sid,
            episodeId: ep.episodeId,
            traceId: ep.traceId,
            turnId: t.turnId ?? null,
            ts: tsOf(t),
          },
        },
      })
      nodesByKind.turn++
      if (prev === null) {
        // 首轮：会话**归属**边（结构与时间同时成立，用 contains）
        edges.push({
          id: `e:${seNodeId(sid)}->${trNodeId(t.id)}`,
          source: seNodeId(sid),
          target: trNodeId(t.id),
          type: 'smoothstep',
          data: { kind: 'contains' },
        })
        edgesByKind.contains++
      } else {
        // 后续轮次：**续接**边（轮 i → 轮 i+1）；语义上是时序链，但同样决定分层
        edges.push({
          id: `e:${trNodeId(prev.id)}~>${trNodeId(t.id)}`,
          source: trNodeId(prev.id),
          target: trNodeId(t.id),
          type: 'smoothstep',
          data: { kind: 'sequence' },
        })
        edgesByKind.sequence++
      }
      prev = t
    }
  }

  // ⑤ 排序能力**由数据算出**：全 0 ⇒ 不能说"可按重要性排序"。
  const values = chosen.map((t) => Number.isFinite(Number(t.value)) ? Number(t.value) : 0)
  const alphas = chosen.map((t) => Number.isFinite(Number(t.alpha)) ? Number(t.alpha) : 0)
  const byValue = values.some((v) => v !== 0) || alphas.some((v) => v !== 0)

  // 记录身份来源：全 trace / 全 episode / 混入（如实报，不挑一种假装统一）。
  const idKinds = new Set(chosen.map((t) => t.idKind === 'episode' ? 'episode' : 'trace'))
  const recordKind: 'trace' | 'episode' | 'mixed' =
    idKinds.size === 0 ? 'trace' : idKinds.size > 1 ? 'mixed' : (idKinds.values().next().value as 'trace' | 'episode')

  return {
    nodes,
    edges,
    stats: {
      inputCount,
      tracesIn: usable.length,
      ungrouped,
      tracesTotal,
      sessions: seStat.size,
      workspaces: wsStat.size,
      nodesByKind,
      edgesByKind,
    },
    layers: {
      traces: { total: tracesTotal, fetched: chosen.length },
      // ③ number = 已取到的真实计量（0 = 确实为空）；null = 未取到（未知）。
      policies: lt.policies === undefined ? null : lt.policies,
      worldModels: lt.worldModels === undefined ? null : lt.worldModels,
      skills: lt.skills === undefined ? null : lt.skills,
    },
    semanticLayers: { topics: 'unavailable', reason: TOPICS_UNAVAILABLE_REASON },
    rankable: {
      byValue,
      reason: byValue
        ? '上游存在非零 value/alpha，可按价值排序'
        : '实测本批 value/alpha 全为 0（上游 reward/value 断链）⇒ 只能按时间与轮次顺序排，不得按"重要性"排',
    },
    truncation: {
      budget,
      included: chosen.length,
      dropped: Math.max(0, usable.length - chosen.length),
      byRecency: true,
    },
    recordIds: { kind: recordKind },
    episodeAlias,
    shape: {
      episodeTraceIsOneToOne: episodeAlias.holds,
      hierarchy: ['workspace(ownerWorkspaceId)', 'session(sessionId)', 'turn(trace≡episode)'],
    },
  }
}
