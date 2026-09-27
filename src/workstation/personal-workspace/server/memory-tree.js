// dsh-personal-workspace — 宿主半 · 记忆树取数（V1.2-E2 · **只读**）
//
// 缝（E 沿用 V1.2-D 的纪律，ADR-019 ①）：**只经 MemOS 公开 HTTP 读** ——
//   不直读 `memos.db`、不写 MemOS、零补丁、不新增依赖（ADR-021 替代否决）。
//
// 数据面选择（**实测**，不是偏好）：树走 `GET /api/v1/episodes`（~840 B/条），
//   不走 `GET /api/v1/traces`（~108 KB/条，100 条即 10.3 MiB > 本仓 4 MiB 单响应上限）。
//   代价**如实记账**：episodes 面不提供 trace id ⇒ 投影层记 `traceId: null`（不编），
//   来源指针由 `sessionId + episodeId + ts` 承担（点回真实会话足够）。
//
// 纪律（每条都有对应断言）：
//   ① **只读**：本模块只有 GET 语义；E3 的写通道需用户裁定后才另接（E 冻结 §6）。
//   ② **未知 ≠ 空集**：取数失败 ⇒ `ok:false` + 原因；**绝不返回空树冒充"你没有记忆"**。
//   ③ **不静默截断**：`graph.truncation{budget,included,dropped}` + `source{total,returned}`。
//   ④ **零信任客户端**：查询参数只认白名单字段并钳制范围；`maxNodes` **不得**突破 E-3 裁定的 300。
//
// 范围（scope）：
//   · `recent`（默认）= 最近一批 turn 记录（供首屏总览；E-2 B 的首屏展开在客户端做）。
//   · `session`      = 单个会话的全部轮次（**懒展开**用：会话被 300 节点闸裁掉后可单独取回）。
//     ⚠️ 为什么不是 `workspace` 范围：MemOS 的 episodes 面**没有** workspace 过滤参数
//     （实测仅 `limit/offset/sessionId`）⇒ 不假装支持，宁可不提供。

import { EPISODES_PAGE_MAX, HTTP_TIMEOUT_MS, listEpisodes, probeGlobalLayer, resolveBaseUrl } from './memory-source.js'
import { DEFAULT_MAX_NODES, adaptEpisodes, projectMemoryGraph } from './memory-graph.mjs'

export const MEMORY_TREE_PATH = '/personal-workspace/memory/tree'

/** E-3 裁定：可见节点上限 = 300（常数，不是架构；要提高需先改裁定）。 */
export const MAX_TREE_NODES = 300

/** 树一次取多少 turn 记录（服务端上限 500；实测 428 条 ≈ 360 KB）。 */
export const TREE_FETCH_LIMIT = EPISODES_PAGE_MAX

/** scope 白名单（未知值 ⇒ 如实报错，不静默回落）。 */
export const TREE_SCOPES = ['recent', 'session']

/**
 * 取数 + 投影（纯组合，可注入 `fetchImpl` ⇒ 套件用假服务测，不用真机记忆库）。
 *
 * @param {{scope?:string, sessionId?:string, maxNodes?:number, workspaceLabels?:object,
 *          baseUrl?:string, timeoutMs?:number, fetchImpl?:Function}} options
 * @returns {Promise<{ok:true, graph:object, source:object}|{ok:false, reason:string, source:object}>}
 */
export async function buildMemoryTree(options = {}) {
  const {
    scope = 'recent',
    sessionId,
    maxNodes = DEFAULT_MAX_NODES,
    workspaceLabels,
    baseUrl = resolveBaseUrl(),
    timeoutMs = HTTP_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = options

  if (!TREE_SCOPES.includes(scope)) {
    return {
      ok: false,
      reason: `未知 scope：${String(scope)}（只接受 ${TREE_SCOPES.join(' / ')}）`,
      source: { scope: String(scope), accepted: TREE_SCOPES },
    }
  }
  if (scope === 'session' && (typeof sessionId !== 'string' || sessionId === '')) {
    return { ok: false, reason: 'scope=session 必须带 session 参数', source: { scope } }
  }

  // ④ 上限钳制：E-3 裁定 300 是**硬闸**，不接受更"灵活"的暗门。
  const asked = Math.floor(Number(maxNodes))
  const budget = Number.isFinite(asked) && asked > 0 ? Math.min(MAX_TREE_NODES, asked) : DEFAULT_MAX_NODES
  const clamped = Number.isFinite(asked) && asked > budget

  const ep = await listEpisodes({
    baseUrl,
    limit: TREE_FETCH_LIMIT,
    ...(scope === 'session' ? { sessionId } : {}),
    timeoutMs,
    fetchImpl,
  })
  // ② 取数失败：如实报错。**不**降级成空树 —— 那会把"记忆库读不到"说成"你没有记忆"。
  if (ep.status !== 'ok') {
    return {
      ok: false,
      reason: ep.reason,
      source: { scope, endpoint: 'episodes', sessionId: sessionId ?? null },
    }
  }

  // 全局层计量（policies/worldModels/skills）：**与树并行无关**，可读则带上真实数字，
  //   不可读 ⇒ 不传（投影层保持 null = 未知，而不是 0 = 空集）。
  const counts = await probeGlobalLayer({ baseUrl, timeoutMs, fetchImpl })
  const layerTotals = counts.status === 'ok' ? counts.global : undefined

  const graph = projectMemoryGraph(adaptEpisodes(ep.episodes), {
    maxNodes: budget,
    workspaceLabels,
    tracesTotal: ep.total,
    ...(layerTotals === undefined ? {} : { layerTotals }),
  })

  // 取数面本身是否被夹（服务端上限 500）：另记一笔，避免把"没取全"读成"上游只有这些"。
  const fetchTruncated = ep.total !== null && ep.episodes.length < ep.total && ep.episodes.length >= TREE_FETCH_LIMIT

  return {
    ok: true,
    graph,
    source: {
      scope,
      endpoint: 'episodes',
      sessionId: sessionId ?? null,
      // 本次取回条数 / 上游声明总数（null = 未声明 ⇒ 未知）
      returned: ep.episodes.length,
      total: ep.total,
      /** 还有更多可翻页（服务端给了 nextOffset）。 */
      hasMore: ep.hasMore === true,
      /** 取数面被服务端上限夹住（⇒ 图可能不是全集，与 300 节点闸是两回事）。 */
      fetchTruncated,
      /** `maxNodes` 请求值被 E-3 的 300 硬闸夹过。 */
      budgetClamped: clamped,
      budget,
      // 全局层计量是否读到了（unavailable ⇒ 树里那三层是"未知"，不是"空"）
      globalStatus: counts.status,
      globalReason: counts.status === 'ok' ? null : (counts.reason ?? null),
    },
  }
}

/**
 * HTTP handler 工厂：宿主半的 host 校验与 JSON 输出**只保留一份实现**（由 index.js 注入），
 * 本模块不复制一份"看起来一样"的信任判断（两份必然漂移）。
 *
 * @param {{isTrustedHost:(req:object)=>boolean, sendJson:(res:object,code:number,body:object)=>void,
 *          build?:Function}} deps
 */
export function createMemoryTreeHandler(deps) {
  const { isTrustedHost, sendJson, build = buildMemoryTree } = deps ?? {}
  return async function handleMemoryTree(req, res) {
    if (typeof isTrustedHost !== 'function' || isTrustedHost(req) !== true) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 GET；本路由只读）' })
      return
    }
    let url = null
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      url = null
    }
    const params = url === null ? new URLSearchParams() : url.searchParams
    const scope = params.get('scope') ?? 'recent'
    const sessionId = params.get('session') ?? undefined
    const maxNodesRaw = params.get('maxNodes')
    const maxNodes = maxNodesRaw === null ? undefined : Number(maxNodesRaw)

    let out
    try {
      out = await build({ scope, sessionId, maxNodes })
    } catch (e) {
      // 投影/取数里的意外异常**不得**外泄成 500 空体：如实回一个可读原因（unknown ≠ empty）。
      out = { ok: false, reason: `记忆树取数异常：${e instanceof Error ? e.message : String(e)}`, source: { scope } }
    }
    if (out?.ok !== true) {
      // 200 + ok:false：这是**我们的**诚实的"取不到"，不是 HTTP 层错误（客户端据 ok 字段判断）。
      sendJson(res, 200, { ok: false, reason: out?.reason ?? '未知原因', source: out?.source ?? null })
      return
    }
    sendJson(res, 200, { ok: true, graph: out.graph, source: out.source })
  }
}
