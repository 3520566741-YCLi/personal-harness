// dsh-personal-workspace — 宿主半 · Memory Curator 的**承载**（V1.2-E4）
//
// 本文件只做三件事（引擎在 `memory-curator.mjs`，纯函数）：
//   ① **取数**：经 MemOS 公开 HTTP 的 traces 面（`listTraces`，实测页上限 50 —— 见 memory-source.js）；
//   ② **落盘**：把「上次运行结果 + 历史忽略键」写成**追加式 JSONL**（同 mirror.js 的纪律：
//      最后一行有效、损坏不毁全档、超限 compact；`DSH_PERSONAL_CURATOR_PATH` 供套件重定向到沙箱）；
//   ③ **调度**：用**官方** `ctx.timer.interval`（cordis-plugin-timer，随插件生命周期 effect 回收）
//      —— 不自造定时器、不自造 runtime（V1.2 章程：不创建第二套 Session/Task 真源）。
//
// 三条诚实纪律（每条都有反例断言）：
//   ① **取数失败 ≠ 没有建议**：上游不可达时**不落盘、不返回空报告**，如实回 `ok:false` + 原因；
//   ② **不静默降级**：宿主没有 `timer` 服务时，状态里如实报 `scheduler.enabled=false` + 原因，
//      绝不"悄悄变成手动"（用户以为在自动整理、其实没跑，是最坏的失败形态）；
//   ③ **路由不得越过裁定**：V-13 的「每轮新增上限 10」是硬闸 —— 路由把 `maxNew` 夹到 ≤10
//      并在响应里如实说明被夹过（不装作接受了更大的值）。

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { CURATOR_MAX_NEW, curateMemoryGraph } from './memory-curator.mjs'
import { HTTP_TIMEOUT_MS, TRACES_PAGE_MAX, listTraces, resolveBaseUrl } from './memory-source.js'

/** 状态路由（只读：返回上次运行结果 + 忽略键 + 调度器状态）。 */
export const CURATOR_PATH = '/personal-workspace/memory-curator'
/** 立即整理一次（POST）。 */
export const CURATOR_RUN_PATH = CURATOR_PATH + '/run'
/** 忽略若干建议（POST；只改**我们自己的**忽略清单，绝不写 MemOS）。 */
export const CURATOR_DISMISS_PATH = CURATOR_PATH + '/dismiss'

/**
 * 状态文件（Personal 自管目录，与镜像同级约定）。`DSH_PERSONAL_CURATOR_PATH` 让套件重定向到沙箱，
 * 否则测试会写用户真实状态（不可接受）。
 */
export const CURATOR_STATE_PATH =
  typeof process.env.DSH_PERSONAL_CURATOR_PATH === 'string' && process.env.DSH_PERSONAL_CURATOR_PATH.trim() !== ''
    ? process.env.DSH_PERSONAL_CURATOR_PATH.trim()
    : join(homedir(), '.dsh', 'personal-memory-curator.v1.jsonl')

/** 自动整理间隔（默认 30 分钟；`DSH_PERSONAL_CURATOR_INTERVAL_MS` 可覆盖，套件用短间隔）。 */
const intervalEnv = Number(process.env.DSH_PERSONAL_CURATOR_INTERVAL_MS)
export const CURATOR_INTERVAL_MS = Number.isFinite(intervalEnv) && intervalEnv >= 1000 ? Math.floor(intervalEnv) : 30 * 60 * 1000

/** 一次取多少条 trace（= 取数层实测页上限；写死更大值只会被上游体积闸拒掉）。 */
export const CURATOR_TRACE_LIMIT = TRACES_PAGE_MAX
/** 忽略键总量上限（超过按最旧丢弃；忽略清单不该无限膨胀）。 */
export const CURATOR_MAX_DISMISSED = 500
/** 单次忽略调用的键数上限（不信任客户端）。 */
export const CURATOR_MAX_DISMISS_PER_CALL = 200
/** 状态文件体积上限（超过则在下次写入时 compact 成最后一行）。 */
export const CURATOR_STATE_MAX_BYTES = 512 * 1024

/** 读状态：**最后一行有效**；缺失/损坏如实标注，绝不抛错给调用方。 */
export async function readCuratorState(statePath = CURATOR_STATE_PATH) {
  const empty = { dismissed: [], lastRun: null }
  let size = null
  try {
    const st = await stat(statePath)
    size = st.size
  } catch {
    return { ...empty, status: 'missing', reason: null, bytes: null, lines: 0, badLines: 0 }
  }
  let text = ''
  try {
    text = await readFile(statePath, 'utf8')
  } catch (e) {
    return { ...empty, status: 'corrupt', reason: `状态文件不可读：${e instanceof Error ? e.message : String(e)}`, bytes: size, lines: 0, badLines: 0 }
  }
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  let badLines = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed !== null && typeof parsed === 'object') {
        const dismissed = Array.isArray(parsed.dismissed) ? parsed.dismissed.filter((k) => typeof k === 'string' && k !== '') : []
        const lastRun = parsed.lastRun !== null && typeof parsed.lastRun === 'object' ? parsed.lastRun : null
        return { dismissed, lastRun, status: 'ok', reason: null, bytes: size, lines: lines.length, badLines }
      }
      badLines++
    } catch {
      badLines++
    }
  }
  return { ...empty, status: 'corrupt', reason: `状态文件没有可解析的完整行（共 ${lines.length} 行）`, bytes: size, lines: lines.length, badLines }
}

/** 写状态：读当前 → 合并补丁 → **追加一行完整快照**（历史行保留；超限则 compact 成一行）。 */
export async function appendCuratorState(patch, statePath = CURATOR_STATE_PATH) {
  const cur = await readCuratorState(statePath)
  const snapshot = {
    dismissed: patch.dismissed ?? cur.dismissed,
    lastRun: patch.lastRun !== undefined ? patch.lastRun : cur.lastRun,
    at: new Date().toISOString(),
  }
  const line = JSON.stringify(snapshot)
  const bytes = Buffer.byteLength(line, 'utf8')
  try {
    await mkdir(dirname(statePath), { recursive: true })
    let compacted = false
    const size = cur.bytes
    if (size !== null && size + bytes > CURATOR_STATE_MAX_BYTES) {
      await writeFile(statePath, line + '\n', 'utf8')
      compacted = true
    } else {
      await appendFile(statePath, line + '\n', 'utf8')
    }
    return { ok: true, bytes, compacted, snapshot }
  } catch (e) {
    return { ok: false, message: `状态写入失败：${e instanceof Error ? e.message : String(e)}`, bytes }
  }
}

/**
 * 整理一次：取数 → 引擎 → 落盘。
 *
 * 上游不可达 ⇒ `ok:false` + 原因，且**不落盘**（不留"跑过一次"的假记录）。
 * @returns {Promise<{ok:true, lastRun:object, fetched:number, total:number|null}
 *                  |{ok:false, reason:string, source:object}>}
 */
export async function runCuration(options = {}) {
  const {
    statePath = CURATOR_STATE_PATH,
    baseUrl = resolveBaseUrl(),
    fetchImpl = globalThis.fetch,
    timeoutMs = HTTP_TIMEOUT_MS,
    now,
    maxNew = CURATOR_MAX_NEW,
  } = options

  const state = await readCuratorState(statePath)
  const tr = await listTraces({ baseUrl, limit: CURATOR_TRACE_LIMIT, timeoutMs, fetchImpl })
  if (tr.status !== 'ok') {
    return { ok: false, reason: tr.reason, source: { endpoint: 'traces', baseUrl, limit: CURATOR_TRACE_LIMIT } }
  }
  const report = curateMemoryGraph(tr.traces, { now, maxNew, dismissed: state.dismissed })
  const lastRun = {
    at: report.at,
    atIso: new Date(report.at).toISOString(),
    fetched: tr.traces.length,
    total: tr.total,
    hasMore: tr.hasMore === true,
    report,
    stateStatus: state.status,
  }
  const written = await appendCuratorState({ lastRun }, statePath)
  if (written.ok !== true) {
    // 落盘失败也要把结果交回（并如实标注未落盘），不假装成功。
    return { ok: true, lastRun: { ...lastRun, persisted: false, persistError: written.message }, fetched: tr.traces.length, total: tr.total }
  }
  return { ok: true, lastRun: { ...lastRun, persisted: true }, fetched: tr.traces.length, total: tr.total }
}

/**
 * 用**官方** `ctx.timer.interval` 挂上自动整理。
 *
 * 没有 timer 服务 ⇒ 如实返回 `{enabled:false, reason}`（由路由透出给客户端），**不静默降级**。
 * 重入保护：上一轮没跑完就跳过本轮（避免慢上游把 tick 堆成队列）。
 */
export function scheduleCuration(deps) {
  const { timer, intervalMs = CURATOR_INTERVAL_MS, onTick, onError } = deps ?? {}
  if (timer === null || timer === undefined || typeof timer.interval !== 'function') {
    return { enabled: false, intervalMs: null, reason: '宿主未提供 timer 服务（ctx.timer.interval 不可用）⇒ 自动整理未启用' }
  }
  let running = false
  let ticks = 0
  const dispose = timer.interval(async () => {
    if (running) return
    running = true
    ticks++
    try {
      await onTick()
    } catch (e) {
      // 不吞：交给调用方记宿主日志（自动整理失败必须看得见）。
      if (typeof onError === 'function') onError(e)
    } finally {
      running = false
    }
  }, intervalMs)
  return { enabled: true, intervalMs, dispose, tickCount: () => ticks }
}

/**
 * HTTP handler 工厂：host 校验 / JSON 输出 / 请求体读取**都复用 index.js 的那一份**实现
 * （不复制"看起来一样"的信任判断 —— 两份必然漂移）。
 */
export function createCuratorHandlers(deps) {
  const { isTrustedHost, sendJson, readBody, schedulerStatus = () => ({ enabled: false, intervalMs: null, reason: '未接线' }), run = runCuration, statePath = CURATOR_STATE_PATH } = deps ?? {}

  const guard = (req, res, method) => {
    if (typeof isTrustedHost !== 'function' || isTrustedHost(req) !== true) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return false
    }
    if (req.method !== method) {
      sendJson(res, 405, { ok: false, message: `method not allowed（只接受 ${method}）` })
      return false
    }
    return true
  }

  /** GET：上次运行结果 + 忽略键 + 调度器状态（**只读**，不触发取数）。 */
  async function handleState(req, res) {
    if (!guard(req, res, 'GET')) return
    const state = await readCuratorState(statePath)
    sendJson(res, 200, {
      ok: true,
      scheduler: schedulerStatus(),
      state: {
        status: state.status, // ok / missing / corrupt（missing = 从未跑过，不是"跑过 0 条"）
        reason: state.reason,
        dismissed: state.dismissed.length,
        dismissedKeys: state.dismissed,
        lastRun: state.lastRun,
      },
    })
  }

  /** POST：立刻整理一次（`maxNew` 被 V-13 的 10 夹住，且如实说明夹过）。 */
  async function handleRun(req, res) {
    if (!guard(req, res, 'POST')) return
    let body = {}
    try {
      const raw = typeof readBody === 'function' ? await readBody(req) : ''
      if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object') body = parsed
      }
    } catch (e) {
      sendJson(res, 400, { ok: false, message: `请求体不是合法 JSON：${e instanceof Error ? e.message : String(e)}` })
      return
    }
    const asked = Number(body.maxNew)
    const clamped = Number.isFinite(asked) && asked > CURATOR_MAX_NEW
    const maxNew = Number.isFinite(asked) && asked > 0 ? Math.min(CURATOR_MAX_NEW, Math.floor(asked)) : CURATOR_MAX_NEW
    let out
    try {
      out = await run({ statePath, maxNew })
    } catch (e) {
      out = { ok: false, reason: `整理异常：${e instanceof Error ? e.message : String(e)}`, source: null }
    }
    if (out?.ok !== true) {
      // 200 + ok:false：这是**我们的**诚实失败（上游不可达等），不是 HTTP 层错误。
      sendJson(res, 200, { ok: false, reason: out?.reason ?? '未知原因', source: out?.source ?? null })
      return
    }
    sendJson(res, 200, { ok: true, lastRun: out.lastRun, budgetClamped: clamped, maxNewAllowed: CURATOR_MAX_NEW })
  }

  /** POST：忽略若干建议（只写我们自己的忽略清单；**不动 MemOS**）。 */
  async function handleDismiss(req, res) {
    if (!guard(req, res, 'POST')) return
    let body = {}
    try {
      const raw = typeof readBody === 'function' ? await readBody(req) : ''
      if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object') body = parsed
      }
    } catch (e) {
      sendJson(res, 400, { ok: false, message: `请求体不是合法 JSON：${e instanceof Error ? e.message : String(e)}` })
      return
    }
    const rawKeys = Array.isArray(body.keys) ? body.keys : []
    const keys = [...new Set(rawKeys.filter((k) => typeof k === 'string' && k.trim() !== '').map((k) => k.trim()))]
    if (keys.length === 0) {
      sendJson(res, 400, { ok: false, message: 'keys 不能为空（需要至少一个建议 key）' })
      return
    }
    if (keys.length > CURATOR_MAX_DISMISS_PER_CALL) {
      sendJson(res, 400, { ok: false, message: `单次忽略上限 ${CURATOR_MAX_DISMISS_PER_CALL} 个（收到 ${keys.length}）` })
      return
    }
    const cur = await readCuratorState(statePath)
    const merged = [...cur.dismissed.filter((k) => !keys.includes(k)), ...keys]
    const trimmed = merged.length > CURATOR_MAX_DISMISSED ? merged.slice(merged.length - CURATOR_MAX_DISMISSED) : merged
    const written = await appendCuratorState({ dismissed: trimmed, lastRun: cur.lastRun }, statePath)
    if (written.ok !== true) {
      sendJson(res, 200, { ok: false, reason: written.message })
      return
    }
    sendJson(res, 200, { ok: true, dismissed: trimmed.length, added: keys.length, trimmed: merged.length - trimmed.length })
  }

  return { handleState, handleRun, handleDismiss }
}
