// dsh-personal-workspace — 宿主半 · 记忆取数（V1.2-D Cross-session Memory 的检索缝）
//
// 缝（ADR-019 ①）：**复用 MemOS 的 HTTP 检索面**，不重写 Retriever、零补丁、不直读 `memos.db`。
//   ① 候选：`GET /api/v1/memory/search?q=&top=&agent=&sessionId=` → `{hits:[{tier,refId,refKind,score,snippet}]}`
//   ② 归属：`GET /api/v1/memory/trace?id=` → 完整暴露 `ownerWorkspaceId/ownerProfileId/sessionId/ts/summary`
//      **为什么必须 hydrate**：命中体**不含任何归属**（实测：`hits[0]` 顶层键只有 refId/refKind/score/snippet/tier），
//      而"跨项目串味"的根因正是 `owner_workspace_id` 只写不读 —— 检索谓词里 0 处用它。
//      所以项目隔离只能由**我们**在取到归属后做（ADR-019 ②）。
//   ③ 全局层计量：`GET /api/v1/diag/counts` → `{policies,worldModels,skills}`（当前三项皆 0 ⇒ 本层如实为空）。
//
// 降级纪律（ADR-019 ⑤ + ADR-017 ③「未知 ≠ 空集」）：
//   超时 / 非 2xx / JSON 坏 / 形状不符 / 归属取不到 ⇒ **一律不注入**并如实带出原因，
//   **绝不**用近似内容或旧缓存顶替。任何异常都不得外泄到装配路径 —— 注入失败可以没有记忆，但不能毁掉整轮对话。
//
// 规模纪律（ADR-019 ⑥ / 预检 §13）：per-turn 上界钉死 —— 候选 `topK`、hydrate 次数、注入字符三道闸；
//   hydrate 结果进程内缓存（按 refId），**禁止**每次 query 扫全部会话全文。

/** MemOS 运行时面（只读 GET）。可用 `DSH_PERSONAL_MEMOS_URL` 重定向（回归套件用它指向本地假服务）。 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:18801'

/** 单次 HTTP 请求超时：装配路径上最长能容忍多久。**故意很短** —— 注入是附加价值，不是对话的前置条件。 */
export const HTTP_TIMEOUT_MS = 1200

/** 整条取数链的总预算（候选 + 全部 hydrate 必须在此时限内跑完；超时则用已拿到的部分，不无限等）。 */
export const TOTAL_BUDGET_MS = 2500

/** 候选上界（§13：按需 N 条，绝不"取全量再筛"）。 */
export const TOPK_MAX = 24

/** hydrate 结果缓存条数上界（进程内；超出按插入顺序淘汰最旧）。 */
export const OWNER_CACHE_MAX = 256

/** 响应体读取上限：超过即判 `too-large` 并降级（防止异常大响应拖垮装配）。 */
export const MAX_BODY_BYTES = 4 * 1024 * 1024

/** 取数面地址。返回空串 ⇒ 调用方应视为不可用（不假装"没有记忆"）。 */
export function resolveBaseUrl(env = process.env) {
  const raw = typeof env?.DSH_PERSONAL_MEMOS_URL === 'string' ? env.DSH_PERSONAL_MEMOS_URL.trim() : ''
  const base = raw !== '' ? raw : DEFAULT_BASE_URL
  return base.replace(/\/+$/, '')
}

/** 一次 fetch + 超时 + 体积/JSON 校验。**不抛**：失败一律返回 `{ok:false, reason}`。 */
async function getJson(url, { timeoutMs, fetchImpl, signal }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  // 外部 signal（若有）与本地超时谁先来都算取消
  const onAbort = () => controller.abort()
  if (signal !== undefined && signal !== null) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener?.('abort', onAbort, { once: true })
  }
  try {
    const res = await fetchImpl(url, { method: 'GET', signal: controller.signal, headers: { accept: 'application/json' } })
    if (res === null || typeof res !== 'object' || typeof res.status !== 'number') {
      return { ok: false, reason: '响应对象形态异常' }
    }
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}` }
    const text = await res.text()
    if (typeof text !== 'string') return { ok: false, reason: '响应体不可读' }
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return { ok: false, reason: '响应体过大（>4MiB）' }
    let body
    try {
      body = JSON.parse(text)
    } catch {
      return { ok: false, reason: '响应不是合法 JSON' }
    }
    return { ok: true, body }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: controller.signal.aborted ? '超时或被取消' : `请求失败：${msg}` }
  } finally {
    clearTimeout(timer)
    if (signal !== undefined && signal !== null) signal.removeEventListener?.('abort', onAbort)
  }
}

/**
 * 全局层可用量（policies / world_model / skills 计数）。
 * 读不到 ⇒ `unavailable`（调用方据此**不注入**并说明，而不是当作"0 条"）。
 */
export async function probeGlobalLayer(options = {}) {
  const { baseUrl = resolveBaseUrl(), timeoutMs = HTTP_TIMEOUT_MS, fetchImpl = globalThis.fetch, signal } = options
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', reason: 'fetch 不可用（运行时形态变化）' }
  const r = await getJson(`${baseUrl}/api/v1/diag/counts`, { timeoutMs, fetchImpl, signal })
  if (!r.ok) return { status: 'unavailable', reason: `全局层计量不可读（${r.reason}）` }
  const b = r.body
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  if (b === null || typeof b !== 'object') return { status: 'unavailable', reason: '全局层计量响应形态异常' }
  return { status: 'ok', global: { policies: num(b.policies), worldModels: num(b.worldModels), skills: num(b.skills) } }
}

/**
 * 取候选（按相关性排序）。`query` 由调用方决定 —— 本层**不猜**检索词。
 * @returns {{status:'ok', hits:Array}|{status:'unavailable', reason:string}}
 */
export async function searchCandidates(query, options = {}) {
  const {
    baseUrl = resolveBaseUrl(),
    top = TOPK_MAX,
    agentKind,
    sessionId,
    timeoutMs = HTTP_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    signal,
  } = options
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', reason: 'fetch 不可用（运行时形态变化）' }
  const q = typeof query === 'string' ? query.trim() : ''
  if (q === '') return { status: 'unavailable', reason: '无检索词（调用方未提供）' }
  const cap = Math.max(1, Math.min(TOPK_MAX, Math.floor(top)))
  const params = new URLSearchParams({ q, top: String(cap) })
  if (typeof agentKind === 'string' && agentKind !== '') params.set('agent', agentKind)
  if (typeof sessionId === 'string' && sessionId !== '') params.set('sessionId', sessionId)
  const r = await getJson(`${baseUrl}/api/v1/memory/search?${params.toString()}`, { timeoutMs, fetchImpl, signal })
  if (!r.ok) return { status: 'unavailable', reason: `检索面不可用（${r.reason}）` }
  const raw = r.body?.hits
  if (!Array.isArray(raw)) return { status: 'unavailable', reason: '检索面响应缺少 hits 数组（形状变化）' }
  const hits = []
  for (const h of raw) {
    if (h === null || typeof h !== 'object') continue
    if (typeof h.refId !== 'string' || h.refId.trim() === '') continue
    hits.push({
      refId: h.refId.trim(),
      refKind: typeof h.refKind === 'string' ? h.refKind : '',
      score: typeof h.score === 'number' && Number.isFinite(h.score) ? h.score : 0,
      snippet: typeof h.snippet === 'string' ? h.snippet : '',
      tier: typeof h.tier === 'number' && Number.isFinite(h.tier) ? h.tier : undefined,
    })
    // 规模纪律由**我们**兜底，不依赖服务端守约（§13）：服务端若不认 `top` 就退回全量，
    //   而 hydrate 是**按条打网**的 —— 不在这里夹住，一次装配就能打出几十个请求。
    if (hits.length >= cap) break
  }
  return { status: 'ok', hits }
}

/**
 * 树（V1.2-E2）用的**枚举面**：`GET /api/v1/episodes?limit=&offset=&sessionId=` →
 * `{episodes:[…], limit, offset, total, nextOffset}`（实测：降序=最新在前，total=428）。
 *
 * **为什么树不用 `GET /api/v1/traces`**（实测依据，不是偏好）：
 *   traces 每条含 `agentText`/`agentThinking`/`toolCalls` 全文 ⇒ **10.3 MiB / 100 条**，
 *   而本层的单响应上限是 `MAX_BODY_BYTES`(4 MiB) ⇒ 连 100 条都读不进来（必然降级）。
 *   episodes 每条 ~840 B（`limit=200` ⇒ 171 KB），且字段恰好是树所需的全部：
 *   `id / sessionId / ownerWorkspaceId / ownerProfileId / ownerAgentKind / startedAt /
 *    turnCount / preview / status / tags`。
 *   ⇒ 同一份信息，体积差 ~130×；树的**来源指针**（sessionId + episodeId + ts）两边都有。
 *   注意：episodes 面**不提供 trace id** ⇒ 投影层据实记 `traceId: null`（绝不编造）。
 *
 * 降级纪律与检索面一致：超时 / 非 2xx / JSON 坏 / 形状不符 ⇒ `unavailable` + 原因，**不假装空集**。
 */
export const EPISODES_PAGE_MAX = 500

export async function listEpisodes(options = {}) {
  const {
    baseUrl = resolveBaseUrl(),
    limit = EPISODES_PAGE_MAX,
    offset = 0,
    sessionId,
    timeoutMs = HTTP_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    signal,
  } = options
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', reason: 'fetch 不可用（运行时形态变化）' }
  const n = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : EPISODES_PAGE_MAX
  const cap = Math.max(1, Math.min(EPISODES_PAGE_MAX, n))
  const off = Number.isFinite(Number(offset)) && Number(offset) > 0 ? Math.floor(Number(offset)) : 0
  const params = new URLSearchParams({ limit: String(cap), offset: String(off) })
  if (typeof sessionId === 'string' && sessionId !== '') params.set('sessionId', sessionId)
  const r = await getJson(`${baseUrl}/api/v1/episodes?${params.toString()}`, { timeoutMs, fetchImpl, signal })
  if (!r.ok) return { status: 'unavailable', reason: `episodes 枚举面不可用（${r.reason}）` }
  const raw = r.body?.episodes
  if (!Array.isArray(raw)) return { status: 'unavailable', reason: 'episodes 面响应缺少 episodes 数组（形状变化）' }
  const episodes = []
  for (const e of raw) {
    if (e === null || typeof e !== 'object') continue
    if (typeof e.id !== 'string' || e.id.trim() === '') continue
    episodes.push({
      id: e.id.trim(),
      sessionId: str(e.sessionId),
      ownerWorkspaceId: str(e.ownerWorkspaceId),
      ownerProfileId: str(e.ownerProfileId),
      ownerAgentKind: str(e.ownerAgentKind),
      startedAt: num(e.startedAt),
      turnCount: num(e.turnCount),
      preview: str(e.preview),
      status: str(e.status),
      tags: Array.isArray(e.tags) ? e.tags.filter((x) => typeof x === 'string') : [],
    })
    // 规模纪律由**我们**兜底，不依赖服务端守约（同 searchCandidates 的理由）
    if (episodes.length >= cap) break
  }
  const total = num(r.body?.total)
  const nextOffset = num(r.body?.nextOffset)
  return {
    status: 'ok',
    episodes,
    // 服务端声明的总数（null = 未声明 ⇒ 未知，不是 0）
    total: total === null ? null : total,
    nextOffset: nextOffset === null ? (episodes.length === cap ? off + cap : null) : nextOffset,
    hasMore: nextOffset !== null,
  }
}

/**
 * trace 枚举面（**V1.2-E4 Curator 的输入**：去重/连边/importance 需要正文与 tags，episodes 面没有）。
 *
 * 为什么页上限是 50（实测，不是猜）——2026-09-18 真机：
 *   `limit=20` → 1,815,454 B（20 条）／`limit=50` → 2,116,756 B（50 条）／`limit=100` → 9,727,267 B（100 条）。
 *   即单条体积波动极大（新记录 ~91KB，旧记录 ~10KB），而本层的 `MAX_BODY_BYTES` 是 4 MiB ⇒
 *   `limit=100` 会被**本层自己**如实拒掉。50 是实测能过闸的上界 ⇒ 定为页上限（`TRACES_PAGE_MAX`）。
 *
 * 只映射 Curator/投影真正要用的字段：**不带 `agentText` 进内存**（体积大且本层不用，见 ⑧ 零冗余）。
 * 降级纪律同 episodes 面：超时 / 非 2xx / JSON 坏 / 形状不符 ⇒ `unavailable` + 原因，**不假装空集**。
 */
export const TRACES_PAGE_MAX = 50

export async function listTraces(options = {}) {
  const {
    baseUrl = resolveBaseUrl(),
    limit = TRACES_PAGE_MAX,
    offset = 0,
    sessionId,
    timeoutMs = HTTP_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    signal,
  } = options
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', reason: 'fetch 不可用（运行时形态变化）' }
  const n = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : TRACES_PAGE_MAX
  const cap = Math.max(1, Math.min(TRACES_PAGE_MAX, n))
  const off = Number.isFinite(Number(offset)) && Number(offset) > 0 ? Math.floor(Number(offset)) : 0
  const params = new URLSearchParams({ limit: String(cap), offset: String(off) })
  if (typeof sessionId === 'string' && sessionId !== '') params.set('sessionId', sessionId)
  const r = await getJson(`${baseUrl}/api/v1/traces?${params.toString()}`, { timeoutMs, fetchImpl, signal })
  if (!r.ok) return { status: 'unavailable', reason: `traces 枚举面不可用（${r.reason}）` }
  const raw = r.body?.traces
  if (!Array.isArray(raw)) return { status: 'unavailable', reason: 'traces 面响应缺少 traces 数组（形状变化）' }
  const traces = []
  for (const t of raw) {
    if (t === null || typeof t !== 'object') continue
    if (typeof t.id !== 'string' || t.id.trim() === '') continue
    traces.push({
      id: t.id.trim(),
      episodeId: str(t.episodeId) ?? undefined,
      sessionId: str(t.sessionId) ?? undefined,
      ownerWorkspaceId: str(t.ownerWorkspaceId) ?? undefined,
      ownerProfileId: str(t.ownerProfileId) ?? undefined,
      ownerAgentKind: str(t.ownerAgentKind) ?? undefined,
      ts: num(t.ts) ?? undefined,
      turnId: num(t.turnId) ?? undefined,
      summary: str(t.summary) ?? undefined,
      userText: str(t.userText) ?? undefined,
      tags: Array.isArray(t.tags) ? t.tags.filter((x) => typeof x === 'string') : [],
      value: num(t.value) ?? undefined,
      alpha: num(t.alpha) ?? undefined,
      episodeStatus: str(t.episodeStatus) ?? undefined,
    })
    if (traces.length >= cap) break
  }
  const total = num(r.body?.total)
  const nextOffset = num(r.body?.nextOffset)
  return {
    status: 'ok',
    traces,
    // 服务端声明的总数（null = 未声明 ⇒ 未知，不是 0）
    total: total === null ? null : total,
    nextOffset: nextOffset === null ? (traces.length === cap ? off + cap : null) : nextOffset,
    hasMore: nextOffset !== null,
  }
}

function str(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 新建一个 hydrate 缓存（进程内；跨轮复用）。`owner === null` 也缓存 —— 同一个非 trace id 不必反复打网。 */
export function createOwnerCache() {
  return new Map()
}

/**
 * 按 id 回取归属。取不到 ⇒ `null`（调用方按「归属未知」处理：不注入、如实计数）。
 * 缓存命中即返回；超过上界按插入顺序淘汰最旧（Map 保序）。
 */
export async function hydrateOwner(refId, options = {}) {
  const {
    baseUrl = resolveBaseUrl(),
    timeoutMs = HTTP_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    cache = null,
    signal,
  } = options
  const id = typeof refId === 'string' ? refId.trim() : ''
  if (id === '') return null
  if (typeof fetchImpl !== 'function') return null
  if (cache instanceof Map) {
    const hit = cache.get(id)
    if (hit !== undefined) return hit
  }
  const r = await getJson(`${baseUrl}/api/v1/memory/trace?id=${encodeURIComponent(id)}`, { timeoutMs, fetchImpl, signal })
  let owner = null
  if (r.ok && r.body !== null && typeof r.body === 'object') {
    const b = r.body
    const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
    owner = {
      ownerAgentKind: str(b.ownerAgentKind),
      ownerProfileId: str(b.ownerProfileId),
      ownerWorkspaceId: str(b.ownerWorkspaceId),
      sessionId: str(b.sessionId),
      episodeId: str(b.episodeId),
      ts: typeof b.ts === 'number' && Number.isFinite(b.ts) ? b.ts : null,
      summary: str(b.summary),
    }
  }
  if (cache instanceof Map) {
    while (cache.size >= OWNER_CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
    cache.set(id, owner)
  }
  return owner
}

/**
 * 走完整条取数链，产出投影层的输入（`resolveMemoryContext` 的入参）。
 *
 * **预算纪律**：候选与 hydrate 都受 `TOTAL_BUDGET_MS` 总闸约束 ——
 *   超时后**不再开新的 hydrate**，用已拿到的部分继续（少注入几条 ≠ 注入错的）。
 *
 * @returns {Promise<object>} `ResolveMemoryInput`（`sourceStatus` 为 `unavailable` 时上层一律不注入）
 */
export async function collectMemoryInputs(input) {
  const {
    cwd,
    query,
    agentKind,
    sessionId,
    top = TOPK_MAX,
    cache = null,
    deadlineMs = TOTAL_BUDGET_MS,
    fetchImpl = globalThis.fetch,
    baseUrl = resolveBaseUrl(),
    timeoutMs = HTTP_TIMEOUT_MS,
  } = input ?? {}

  const startedAt = Date.now()
  const budgetLeft = () => deadlineMs - (Date.now() - startedAt)

  // 全局层计量与候选并行取：两者互不依赖，串行会白等一个 RTT。
  const [counts, search] = await Promise.all([
    probeGlobalLayer({ baseUrl, timeoutMs, fetchImpl }),
    searchCandidates(query, { baseUrl, top, agentKind, sessionId, timeoutMs, fetchImpl }),
  ])

  // 检索面不可达 ⇒ 如实上报（**不**退化成"没有相关记忆"）
  if (search.status !== 'ok') {
    return { sourceStatus: 'unavailable', sourceReason: search.reason, cwd, hits: [], global: emptyGlobal() }
  }

  // 全局层读不到时：用 0 表示"未知的计量"，并让投影层照实说 —— 但**不把"未知"说成"没有数据"**。
  //   投影层的 `globalLayerEmpty` 只看数值，所以这里用 countsStatus 单独记一笔留待上层说明。
  const global = counts.status === 'ok' ? counts.global : emptyGlobal()

  const hits = []
  for (const h of search.hits) {
    const left = budgetLeft()
    if (left <= 0) break // 总预算用尽：停止扩散，不再开新的 hydrate
    const owner = await hydrateOwner(h.refId, {
      baseUrl,
      fetchImpl,
      cache,
      timeoutMs: Math.min(timeoutMs, Math.max(1, left)),
    })
    hits.push({ ...h, owner })
  }

  return {
    sourceStatus: 'ok',
    cwd,
    hits,
    // 预算/时限用尽而**没来得及**做归属判定的候选条数（如实上报，不静默丢）。
    //   注意与"归属未知"区分：那是**问了但问不出**，这是**没问**。
    unhydrated: search.hits.length - hits.length,
    global,
    // 字段名直接对齐投影层 `ResolveMemoryInput`：计量不可读 ⇒ `unavailable`（未知 ≠ 空集）
    globalStatus: counts.status,
    globalReason: counts.status === 'ok' ? undefined : counts.reason,
  }
}

function emptyGlobal() {
  return { policies: 0, worldModels: 0, skills: 0 }
}
