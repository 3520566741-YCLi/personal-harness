// dsh-personal-workspace — 宿主半 · Memory Curator **纯引擎**（V1.2-E4）
//
// 裁定依据（docs/V1_2_DECISIONS_VERDICTS.md）：
//   · **V-12**（E-1/E-2/E-3）：E 的入口/首屏/上限（节点 300）已定；
//   · **V-13**（E-5 A）：Curator **不自动 merge**、每轮新增上限 **10**、**自动调度**。
//
// 本文件是**纯函数引擎**，只做一件事：读入实测形状的记忆记录，产出**建议**（`CurationSuggestion[]`）。
// 为什么只能是"建议"（审计结论，不是保守）：
//   ① MemOS 公开 HTTP 的写通道实测只有 `PATCH /api/v1/traces/:id`（仅 summary/userText/agentText/tags）
//      与若干删除面 —— **没有任何"关系/边/importance/合并"路由** ⇒ 连边与合并**无处可写**；
//   ② V-13 明令**不自动 merge** ⇒ 人工确认前不得改动任何真源。
//   因此本引擎**不导出任何写/合并能力**（套件 ⑥3 用导出面反证这一点），建议的落地属于 E3 人类控制面。
//
// 六条纪律（每条都有实测依据）：
//   ① **去重的证据是"规范化后完全相同"**，不做"相似度打分"（那会把猜测写成证据）；
//   ② **连边只看跨会话**：同会话相邻轮次已有 `sequence` 边（E1 投影层），重复建议是噪音；
//   ③ **不按价值排序**：真机 `value`/`alpha` 实测全 0 ⇒ 不进公式（照 E1 纪律 ⑤），basis 仍如实带出原值；
//   ④ **上限硬闸 + 不静默截断**：只出 N 条，但 `deferred` 如实上报（可审计"还剩多少没出"）；
//   ⑤ **未知 ≠ 0**：无正文 / 无时间戳的记录**不参与对应建议**并计入 `skipped`，绝不补默认值；
//   ⑥ **纯函数 / 确定性 / 零 IO**：同输入必同输出（含顺序）；不改调用方对象；不读盘不打网。

/** 每轮新增建议上限（V-13 裁定 = 10）。 */
export const CURATOR_MAX_NEW = 10
/** 正文（规范化后）短于此长度不参与去重 —— 太短的重复不构成"同一件事"的证据。 */
export const CURATOR_MIN_TEXT_CHARS = 12
/** 连边的时间邻近阈值（跨会话 30 分钟内才算"同一段工作"）。 */
export const CURATOR_LINK_MAX_GAP_MS = 30 * 60 * 1000
/** 连边要求的共同工具标签数下限（实测 tags 是工具名集合）。 */
export const CURATOR_LINK_MIN_SHARED_TAGS = 2

/** Curator 的输入记录（结构上兼容投影层的 `RawTrace`；本引擎不 import 投影层，保持独立可测）。 */
export interface CuratorRecord {
  id: string
  episodeId?: string
  sessionId?: string
  ownerWorkspaceId?: string
  ts?: number
  turnId?: number
  summary?: string
  userText?: string
  tags?: readonly string[]
  value?: number
  alpha?: number
}

export type SuggestionKind = 'duplicate-merge' | 'link' | 'importance'

export interface DuplicateMergeSuggestion {
  key: string
  kind: 'duplicate-merge'
  /** 建议合并的记录（升序 = 确定性；第一个为主记录）。 */
  recordIds: string[]
  basis: { normalizedChars: number; sharedTags: string[]; exact: true }
}

export interface LinkSuggestion {
  key: string
  kind: 'link'
  fromRecordId: string
  toRecordId: string
  basis: { sharedTags: string[]; gapMs: number; crossSession: true }
}

export interface ImportanceSuggestion {
  key: string
  kind: 'importance'
  recordId: string
  /** 0–100 的**启发式**分值（公式见本文件头 ③：权重是我们定的，不是上游事实）。 */
  score: number
  basis: { textChars: number; tagCount: number; turnIndex: number; recencyRank: number; value: number | null; alpha: number | null }
}

export type CurationSuggestion = DuplicateMergeSuggestion | LinkSuggestion | ImportanceSuggestion

export interface CurationReport {
  at: number
  suggestions: CurationSuggestion[]
  stats: { records: number; textful: number; ranked: number; duplicateGroups: number; linkPairs: number; importanceScored: number }
  /** 规模纪律：候选总数、出场数、未出场数（不静默截断）。 */
  budget: { maxNew: number; candidates: number; emitted: number; deferred: number }
  /** 未参与对应建议的原因与条数（未知 ≠ 0）。 */
  skipped: { reason: 'no-text' | 'text-too-short' | 'no-ts'; count: number }[]
  /** 本轮被历史 dismissed 键挡下的候选数。 */
  dismissedApplied: number
}

/** 发牌顺序（每轮每类各出 1；类内按各自的确定性排序）。 */
const EMIT_ORDER: SuggestionKind[] = ['duplicate-merge', 'link', 'importance']

/** 规范化：折叠空白 + 去首尾 + 统一小写（大小写/空白差异不算"两件事"）。 */
function normalizeText(s: string): string {
  return s.replace(/\s+/gu, ' ').trim().toLowerCase()
}

/** 记录的正文 = summary + userText（都为空 ⇒ 无正文，返回 ''）。 */
function bodyOf(r: CuratorRecord): string {
  const parts: string[] = []
  if (typeof r.summary === 'string' && r.summary.trim() !== '') parts.push(r.summary.trim())
  if (typeof r.userText === 'string' && r.userText.trim() !== '') parts.push(r.userText.trim())
  return parts.join('\n')
}

/** 密集序（同值同序 ⇒ 同一记录的相同输入必得同一分值，确定性靠它）。 */
function denseRank(values: readonly number[]): Map<number, number> {
  const uniq = [...new Set(values)].sort((a, b) => a - b)
  const m = new Map<number, number>()
  uniq.forEach((v, i) => m.set(v, uniq.length <= 1 ? 1 : i / (uniq.length - 1)))
  return m
}

/**
 * 产出记忆整理建议（纯函数；**不改动任何真源**）。
 *
 * @param records 实测形状的记录（通常来自 `listTraces`；顺序不影响输出）
 * @param options `now` 时间戳（测试注入）、`maxNew` 每轮上限（默认 V-13 的 10）、`dismissed` 历史忽略的 key
 */
export function curateMemoryGraph(
  records: readonly CuratorRecord[],
  options: { now?: number; maxNew?: number; dismissed?: readonly string[] } = {},
): CurationReport {
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const maxNew = Number.isFinite(options.maxNew) && Number(options.maxNew) > 0 ? Math.floor(Number(options.maxNew)) : CURATOR_MAX_NEW
  const dismissed = new Set((options.dismissed ?? []).filter((k) => typeof k === 'string' && k !== ''))

  const valid = records.filter((r): r is CuratorRecord => r !== null && typeof r === 'object' && typeof r.id === 'string' && r.id !== '')
  const hasTs = (r: CuratorRecord): r is CuratorRecord & { ts: number } => typeof r.ts === 'number' && Number.isFinite(r.ts)

  const texts = new Map<string, { body: string; normalizedChars: number; tagList: string[] }>()
  let noText = 0
  let tooShort = 0
  for (const r of valid) {
    const body = bodyOf(r)
    if (body === '') {
      noText++
      continue
    }
    const norm = normalizeText(body)
    if (norm.length < CURATOR_MIN_TEXT_CHARS) {
      tooShort++
      continue
    }
    texts.set(r.id, { body: norm, normalizedChars: norm.length, tagList: [...new Set((r.tags ?? []).filter((t) => typeof t === 'string' && t !== ''))].sort() })
  }
  const noTs = valid.filter((r) => !hasTs(r)).length

  /** ① 去重：规范化正文完全相同（含大小写/空白归一），证据就是"逐字相同"。 */
  const byText = new Map<string, string[]>()
  for (const r of valid) {
    const t = texts.get(r.id)
    if (t === undefined) continue
    const bucket = byText.get(t.body)
    if (bucket === undefined) byText.set(t.body, [r.id])
    else bucket.push(r.id)
  }
  const dupCandidates: DuplicateMergeSuggestion[] = []
  for (const [body, idsRaw] of byText) {
    if (idsRaw.length < 2) continue
    const ids = [...idsRaw].sort()
    const tagSets = ids.map((id) => new Set(texts.get(id)!.tagList))
    const sharedTags = [...tagSets[0]].filter((t) => tagSets.every((s) => s.has(t))).sort()
    dupCandidates.push({
      key: `dup:${ids.join('+')}`,
      kind: 'duplicate-merge',
      recordIds: ids,
      basis: { normalizedChars: body.length, sharedTags, exact: true },
    })
  }
  dupCandidates.sort((a, b) => a.key.localeCompare(b.key))

  const ranked = valid.filter(hasTs)
  const recency = denseRank(ranked.map((r) => r.ts))
  const turnIndexByTs = new Map<string, Map<number, number>>()
  for (const r of ranked) {
    const sid = r.sessionId ?? ''
    const per = turnIndexByTs.get(sid) ?? new Map<number, number>()
    if (per.size === 0) turnIndexByTs.set(sid, per)
    per.set(r.ts, 0)
  }
  for (const [sid, per] of turnIndexByTs) turnIndexByTs.set(sid, denseRank([...per.keys()]))

  /** ③ importance：启发式分值（权重是**我们定的**，因此 basis 必须带出全部原始输入）。 */
  const impCandidates: ImportanceSuggestion[] = []
  for (const r of ranked) {
    const t = texts.get(r.id)
    if (t === undefined) continue
    const tagCount = t.tagList.length
    const turnIndex = turnIndexByTs.get(r.sessionId ?? '')?.get(r.ts) ?? 1
    const recencyRank = recency.get(r.ts) ?? 1
    const score =
      Math.round(
        100 *
          (0.35 * (Math.min(t.normalizedChars, 2000) / 2000) +
            0.25 * (Math.min(tagCount, 8) / 8) +
            0.2 * turnIndex +
            0.2 * recencyRank),
      )
    impCandidates.push({
      key: `imp:${r.id}`,
      kind: 'importance',
      recordId: r.id,
      score,
      // ④ value/alpha **不进公式**（真机实测全 0；照 E1 纪律 ⑤ 不按价值排序），但如实带出原值供审计。
      basis: { textChars: t.normalizedChars, tagCount, turnIndex, recencyRank, value: typeof r.value === 'number' ? r.value : null, alpha: typeof r.alpha === 'number' ? r.alpha : null },
    })
  }
  impCandidates.sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key))

  /** ② 连边：**跨会话** + 共享 ≥2 工具标签 + 时间邻近（同会话已有 sequence 边，不再重复建议）。 */
  const linkCandidates: LinkSuggestion[] = []
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const a = ranked[i]
      const b = ranked[j]
      if ((a.sessionId ?? '') === (b.sessionId ?? '')) continue
      const ta = texts.get(a.id)?.tagList ?? []
      const tb = new Set(texts.get(b.id)?.tagList ?? [])
      const sharedTags = ta.filter((t) => tb.has(t)).sort()
      if (sharedTags.length < CURATOR_LINK_MIN_SHARED_TAGS) continue
      const gapMs = Math.abs(a.ts - b.ts)
      if (gapMs > CURATOR_LINK_MAX_GAP_MS) continue
      const from = a.id < b.id ? a.id : b.id
      const to = a.id < b.id ? b.id : a.id
      linkCandidates.push({
        key: `link:${from}>${to}`,
        kind: 'link',
        fromRecordId: from,
        toRecordId: to,
        basis: { sharedTags, gapMs, crossSession: true },
      })
    }
  }
  linkCandidates.sort((a, b) => a.key.localeCompare(b.key))

  /** ④ 上限硬闸：按类别**轮转发牌**取 N 条，其余如实记入 deferred。
   *
   * 为什么是轮转而不是全局排序（真机实测逼出来的）：真机 50 条记录产生
   * `1 dup + 1125 link + 50 importance` 个候选 —— 若按"优先级全局排序"取前 10，
   * **importance 会把 10 个名额全吃光**（它每类基数最大），`link` 永远排在 deferred 里，
   * 于是"连边"这个 Curator 的核心能力一次也不会出现在用户眼前。
   * 轮转（每轮每类各出 1，顺序 duplicate-merge → link → importance）保证三类**都有机会**，
   * 仍然严格 ≤ N，且确定性不变（顺序固定 + 类内已排序）。
   */
  const available: Record<SuggestionKind, CurationSuggestion[]> = {
    'duplicate-merge': dupCandidates.filter((s) => !dismissed.has(s.key)),
    importance: impCandidates.filter((s) => !dismissed.has(s.key)),
    link: linkCandidates.filter((s) => !dismissed.has(s.key)),
  }
  const dismissedApplied =
    dupCandidates.filter((s) => dismissed.has(s.key)).length +
    impCandidates.filter((s) => dismissed.has(s.key)).length +
    linkCandidates.filter((s) => dismissed.has(s.key)).length
  const candidates = available['duplicate-merge'].length + available.importance.length + available.link.length

  const cursors: Record<SuggestionKind, number> = { 'duplicate-merge': 0, importance: 0, link: 0 }
  const suggestions: CurationSuggestion[] = []
  for (;;) {
    let advanced = false
    for (const k of EMIT_ORDER) {
      if (suggestions.length >= maxNew) break
      const list = available[k]
      if (cursors[k] < list.length) {
        suggestions.push(list[cursors[k]])
        cursors[k]++
        advanced = true
      }
    }
    if (advanced !== true || suggestions.length >= maxNew) break
  }

  const skipped: CurationReport['skipped'] = []
  if (noText > 0) skipped.push({ reason: 'no-text', count: noText })
  if (tooShort > 0) skipped.push({ reason: 'text-too-short', count: tooShort })
  if (noTs > 0) skipped.push({ reason: 'no-ts', count: noTs })

  return {
    at: now,
    suggestions,
    stats: {
      records: valid.length,
      textful: texts.size,
      ranked: ranked.length,
      duplicateGroups: dupCandidates.length,
      linkPairs: linkCandidates.length,
      importanceScored: impCandidates.length,
    },
    budget: { maxNew, candidates, emitted: suggestions.length, deferred: candidates - suggestions.length },
    skipped,
    dismissedApplied,
  }
}
