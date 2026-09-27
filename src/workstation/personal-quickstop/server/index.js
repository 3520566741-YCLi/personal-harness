// dsh-personal-quickstop — 宿主（server）半：中断投影的**唯一写入方** + 读取契约（V1.2-I 阶段 I-A）
//
// 为什么这半边必须是宿主：浏览器层没有文件系统能力，而 I12 明令「紫色未读要能跨重启仍在」
//   ⇒ 中断投影必须真落盘（`~/.dsh/personal-interrupts.v1.jsonl`）。
//
// 纪律（逐条继承本仓已踩过的坑）：
//   ① `inject = ['webServer']` 必须**在代码里**声明：V1.2-A 的真机缺陷就是缺声明 ⇒ loader 不等
//      webServer 就绪就 apply ⇒ `ctx.get('webServer')` 取不到 ⇒ 路由从未挂载（真机必然失败）。
//      故本文件**绝不静默 return**：服务缺失一律写宿主日志并抛错。
//      其余五个服务（sessions / agents / jobs / subagents / sessionController）**故意不写进 inject**：
//      官方原文（`dsh-tool-cordis/lib/index.js:8465-8467`）——
//        "Read an optional Service with `ctx.get('serviceName')` by default and handle undefined.
//         Declare inject: ['serviceName'] … only when the Service is a hard dependency and the Plugin
//         must enter waiting until Cordis reactivates it after the Service appears."
//      它们是**可选**依赖（缺了只是"这类停不了"，路由本身仍要给客户端如实答案），
//      故按官方口径用 `ctx.get(...)` 读并在 host-adapter 里逐项记账（missing ⇒ 结论里如实列出 unwired）。
//      反过来若把它们写成 inject（= 硬依赖），任一服务缺席就会让整个插件**永不 apply** ⇒
//      连 `/state`、`/read` 一起挂掉（比"少一个能力"严重得多）。
//   ② 自己注册的路由**不过**官方 /api 的鉴权 fence ⇒ Host 头白名单必须自己收口（照 personal-workspace 做法）。
//   ③ 只暴露最小面，且**没接线就如实拒答**：
//      `GET state`（读投影）+ `POST read`（read-to-clear）已完整可用；
//      `POST plan` 在发现面未接线时 501 `discovery-not-wired`；
//      `POST run` 在编排适配器未接线时 501 `orchestration-not-wired`。
//      给出的接口**绝不假装跑通**（宁可 501，也不返回"看起来成功"的空结果）。
//   ④ 请求体大小上限 + 字段白名单 + sourceId 长度上限：不信任客户端。

import { dirname, join } from 'node:path'

import { INTERRUPT_PATH, INTERRUPT_SOURCES, markInterruptRead, readInterruptState } from './interrupt-store.mjs'
import { createCheckpointStore, defaultCheckpointDir } from './checkpoint-store.mjs'
import { buildResumeInstruction, buildStopPlan, resumeBarTitle } from './stop-plan.mjs'
// I-D 的两层：host-adapter = 唯一接触 `ctx` 的地方；orchestrator = 已套件验过的九步编排。
import { createQuickStopHostDeps } from './host-adapter.mjs'
import { createStopOrchestrator } from './orchestrator.mjs'
// 路由常量的**唯一 owner** 是 `./routes.mjs`（零依赖）—— 客户端半必须能 import 同一份常量
// 而又不能把本文件的 node:* 依赖图带进浏览器 bundle（见 routes.mjs 文件头实测记录）。
import {
  QUICKSTOP_PLAN_PATH,
  QUICKSTOP_PREFIX,
  QUICKSTOP_READ_PATH,
  QUICKSTOP_RESUME_PATH,
  QUICKSTOP_RUN_PATH,
  QUICKSTOP_STATE_PATH,
} from './routes.mjs'

export const name = 'dsh-personal-quickstop'

/** 宿主侧服务依赖（缺了就别 apply —— 见文件头 ①）。 */
export const inject = ['webServer']

/** 路由（对本文件的消费者而言导出面**不变**；定义处见 `./routes.mjs`）。 */
export { QUICKSTOP_PREFIX, QUICKSTOP_STATE_PATH, QUICKSTOP_READ_PATH, QUICKSTOP_PLAN_PATH, QUICKSTOP_RUN_PATH, QUICKSTOP_RESUME_PATH }

const MAX_BODY_BYTES = 64 * 1024
const MAX_SOURCE_ID_LENGTH = 200

/**
 * **能续接的源**只有 `session` 一个 —— 这不是保守，是官方产物里查证得到的边界：
 * 把内容送回一个"源"要有一个能接收内容的官方原语，而四类源里只有会话有
 * （`sessionController.prompt`，出处见 `host-adapter.mjs` 的 `HOST_CALLS.resumePrompt`）。
 * task / subagent / background 的续接点可以**保存与展示**（I5 落盘 + 续接条），但**投不回去**
 * ⇒ 对它们 `/resume` 必须 501 并说明原因，绝不 200 假称续接成功。
 *
 * 为什么不把这份名单与 `INTERRUPT_SOURCES` 合并：两者是**不同的口径** ——
 * 「哪些源会被中断」（`INTERRUPT_SOURCES`，四类）≠「哪些源能接回来」（此处，一类）。
 * 合并了就会重演同一个坑：把"能记录"当成"能恢复"。
 */
export const RESUMABLE_SOURCES = Object.freeze(['session'])

/** `accepted` 的含义（照实转述，不许把"受理"写成"完成"）。 */
export const ACCEPTED_MEANS_FALLBACK = '官方已受理这一轮（受理 ≠ Agent 已经跑完，真机是否接着跑仍未验证）'

/** 本机回环（真机上 DSH Desktop 就服务在 127.0.0.1）。 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/** Host 头是否可信（去掉端口后比对；`extra` 是额外精确白名单）。 */
export function isTrustedHost(req, extra = []) {
  const raw = String(req?.headers?.host ?? '').toLowerCase()
  const hostname = raw.replace(/:\d+$/, '')
  if (LOOPBACK_HOSTS.has(hostname)) return true
  return extra.some((entry) => {
    const value = String(entry ?? '').toLowerCase()
    return value !== '' && (value === hostname || value === raw)
  })
}

/** TEST SAFETY 作用域的形状校验（形状不对一律 400，不做"猜测性宽容"）。 */
export function isValidScope(scope) {
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) return false
  if (scope.mode === 'all') return scope.sessionIds === undefined && scope.taskIds === undefined
  if (scope.mode !== 'test') return false
  const okList = (value) => value === undefined || (Array.isArray(value) && value.every((id) => typeof id === 'string' && id !== ''))
  return okList(scope.sessionIds) && okList(scope.taskIds)
}

function sendJson(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

/** 取请求体：既支持真实流（node http），也支持调用方直接给的字符串/对象（便于自测与编排层复用）。 */
function readJsonBody(req) {
  if (req?.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (req.body.trim() === '') return {}
      return JSON.parse(req.body)
    }
    if (typeof req.body === 'object') return req.body
  }
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0
    const chunks = []
    req?.on?.('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejectPromise(new Error(`request body too large (> ${MAX_BODY_BYTES} bytes)`))
        return
      }
      chunks.push(chunk)
    })
    req?.on?.('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') { resolvePromise({}); return }
      try { resolvePromise(JSON.parse(text)) } catch (error) { rejectPromise(error) }
    })
    req?.on?.('error', rejectPromise)
  })
}

/**
 * 续接点落盘目录的**默认推导**：跟着中断投影一起走。
 *   · 套件把 `storePath` 指到 tmp ⇒ 续接点也落在 tmp（套件里**绝不**写真实家目录）。
 *   · 真机不传 `storePath` ⇒ 走 `~/.dsh/personal-checkpoints`（`defaultCheckpointDir()`）。
 * 为什么要"跟着走"而不是各自默认：两者是同一件事的两半（谁被停了 / 停了之后怎么接上），
 * 分居两处会出现"投影在 tmp、续接点在真实家目录"这种只有跑起来才发现的错配。
 */
export function defaultCheckpointDirFor(storePath) {
  if (typeof storePath !== 'string' || storePath === '') return defaultCheckpointDir()
  return join(dirname(storePath), 'personal-checkpoints')
}

/**
 * 构造路由处理器（真机由 webServer 调用；套件用响应记录器调用**同一个**函数）。
 * @param {{storePath?: string, allowedHosts?: string[], discoverSnapshot?: () => Promise<object>}} deps
 *   `discoverSnapshot` 是 I-D 的接缝：它从官方 sessions / jobs / subagents / 任务账本取**只读快照**。
 *   **未接线时 `/plan` 一律 501 如实拒答** —— 绝不用空快照冒充「当前没有正在运行的工作」（未知 ≠ 0）。
 */
export function createQuickStopHandlers(deps = {}) {
  const storePath = deps.storePath ?? INTERRUPT_PATH
  const allowedHosts = deps.allowedHosts ?? []
  const discoverSnapshot = deps.discoverSnapshot
  const orchestrate = deps.orchestrate
  // I13 的两个注入面：`latestCheckpoint`（读盘上续接点）+ `resume`（官方投递原语）。
  // 两者都**默认缺席** ⇒ 未接线时如实 501，绝不返回"看起来续接成功"的结果。
  const latestCheckpoint = deps.latestCheckpoint
  const resume = deps.resume

  async function handlePlan(req, res) {
    if (!isTrustedHost(req, allowedHosts)) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req?.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 POST）' })
      return
    }
    if (typeof discoverSnapshot !== 'function') {
      sendJson(res, 501, {
        ok: false,
        reason: 'discovery-not-wired',
        message: '宿主发现面未接线（V1.2-I 阶段 I-D）：sessions / jobs / subagents / 任务账本的取数服务尚未接入，无法如实统计活动工作',
      })
      return
    }
    try {
      const snapshot = await discoverSnapshot()
      const plan = buildStopPlan(snapshot)
      sendJson(res, 200, { ok: true, plan })
    } catch (error) {
      // 取数失败必须报错，**不**返回 hasWork:false 冒充"没有工作在跑"。
      sendJson(res, 500, { ok: false, message: `发现活动工作失败：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  /**
   * I-D 编排入口。**没接线就 501**（`orchestration-not-wired`），绝不返回"看起来成功"的空结果。
   * 接线后 `deps.orchestrate` 由 I-D 提供（内部用 `createStopOrchestrator` 绑官方原语）；
   * 本 handler 只做：Host/方法校验 → 作用域校验 → 调用 → **原样透传** `{ok, stages, summary, unwired, notStopped, skippedOutOfScope}`。
   * HTTP 状态码口径：请求被正确执行就用 200（哪怕 `ok:false`）—— 因为**结果里可能有 ⚠ 明细**，
   * 必须让 UI 拿到完整汇总；只有"未接线/抛错"才用 501/500。
   */
  async function handleRun(req, res) {
    if (!isTrustedHost(req, allowedHosts)) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req?.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 POST）' })
      return
    }
    if (typeof orchestrate !== 'function') {
      sendJson(res, 501, {
        ok: false,
        reason: 'orchestration-not-wired',
        message: '真编排未接线（V1.2-I 阶段 I-D）：官方取消/停止原语（session / task / subagent / background）尚未接入，无法执行快速停止',
      })
      return
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, message: `请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}` })
      return
    }
    const scope = body?.scope
    if (scope !== undefined && !isValidScope(scope)) {
      sendJson(res, 400, {
        ok: false,
        message: "scope 必须是 {mode:'all'} 或 {mode:'test', sessionIds?: string[], taskIds?: string[]}",
      })
      return
    }
    try {
      const result = await orchestrate(scope === undefined ? {} : { scope })
      sendJson(res, 200, result ?? { ok: false, message: '编排未返回结果' })
    } catch (error) {
      sendJson(res, 500, { ok: false, message: `快速停止执行失败：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  async function handleState(req, res) {
    if (!isTrustedHost(req, allowedHosts)) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req?.method !== 'GET') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 GET；本路由只读）' })
      return
    }
    try {
      const state = await readInterruptState(storePath)
      sendJson(res, 200, {
        ok: true,
        schemaVersion: state.schemaVersion,
        exists: state.exists,
        counts: state.counts,
        records: state.records,
        problems: state.problems,
      })
    } catch (error) {
      // 读失败必须报错到客户端，**不**返回空 counts 冒充"没有中断"（未知 ≠ 0）。
      sendJson(res, 500, { ok: false, message: `读取中断投影失败：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  async function handleRead(req, res) {
    if (!isTrustedHost(req, allowedHosts)) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req?.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 POST）' })
      return
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, message: `请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}` })
      return
    }
    const source = typeof body?.source === 'string' ? body.source : ''
    const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : ''
    if (!INTERRUPT_SOURCES.includes(source) || sourceId === '' || sourceId.length > MAX_SOURCE_ID_LENGTH) {
      sendJson(res, 400, {
        ok: false,
        message: `source 必须是 ${INTERRUPT_SOURCES.join('|')}，sourceId 必须是非空字符串（≤ ${MAX_SOURCE_ID_LENGTH} 字符）`,
      })
      return
    }
    try {
      const result = await markInterruptRead(storePath, { source, sourceId })
      if (result.ok !== true) {
        sendJson(res, 404, { ok: false, reason: result.reason ?? 'unknown', message: '该源没有被 Quick Stop 中断的记录' })
        return
      }
      const state = await readInterruptState(storePath)
      sendJson(res, 200, { ok: true, counts: state.counts })
    } catch (error) {
      sendJson(res, 500, { ok: false, message: `写入已读事件失败：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  /**
   * I13 续接入口（需求原文 G13「RESUME EXPERIENCE」）。
   *
   * 全流程**只从盘上那条续接点派生**（`latestCheckpointFor`）：
   *   ① 校验 `{source, sourceId}`（与读取面同款白名单/长度上限，不信任客户端）；
   *   ② **先判"这个源能不能续接"**：只有 `session` 有官方投递原语（见 `RESUMABLE_SOURCES`），
   *      其余源一律 501 —— 顺序不能反（反了会把"有内容但没原语"说成"没内容"，把用户支去翻盘）；
   *   ③ 从盘上按源取**最新**续接点 —— 取不到就 **404 `no-checkpoint`**（绝不拿"当前内存里那份"顶替，
   *      也绝不拿别的会话的续接点顶替：那是"接错线"，比接不上更糟）；
   *   ④ 用 `buildResumeInstruction`（文案唯一 owner，纯函数）算出要投回的文本；
   *   ⑤ 交 `deps.resume({sessionId, text})` —— 由 host-adapter 经**官方原语**投递。
   *
   * 状态码口径（每一条都对应一个真实失败面，不合并成"出错了"）：
   *   · 200 官方受理（`accepted:true`）         —— ⚠ 受理 ≠ Agent 跑完，文案里必须说清；
   *   · 404 `no-checkpoint:*`                  —— 盘上真没有可续接的内容（含"索引指向的文件读不回来"）；
   *   · 501 `resume-unwired:*`                 —— 该源没有官方投递原语 / 投递面未接线；
   *   · 502                                       —— 原语在但没受理、或抛错（把真原因带出去）。
   * 客户端拿不到 2xx 一律当失败显示，**绝不**显示"已续接"。
   */
  async function handleResume(req, res) {
    if (!isTrustedHost(req, allowedHosts)) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req?.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 POST）' })
      return
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      sendJson(res, 400, { ok: false, message: `请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}` })
      return
    }
    const source = typeof body?.source === 'string' ? body.source : ''
    const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : ''
    if (!INTERRUPT_SOURCES.includes(source) || sourceId === '' || sourceId.length > MAX_SOURCE_ID_LENGTH) {
      sendJson(res, 400, {
        ok: false,
        message: `source 必须是 ${INTERRUPT_SOURCES.join('|')}，sourceId 必须是非空字符串（≤ ${MAX_SOURCE_ID_LENGTH} 字符）`,
      })
      return
    }
    // ⚠ 顺序很重要：**先判"这个源到底能不能续接"，再判"盘上有没有续接点"**。
    // 反过来会出现一句不实的话：某任务其实**有**续接点、只是官方没有"把内容送回该任务"的原语，
    // 却报 404「盘上没有续接点」—— 用户会去翻盘、找不到原因。先把能力缺口说清楚。
    if (!RESUMABLE_SOURCES.includes(source)) {
      sendJson(res, 501, {
        ok: false,
        reason: `resume-unwired:no-resume-primitive-for-${source}`,
        message: `官方运行时没有"把内容送回${source}"的原语（见 host-adapter 的 HOST_CALLS 台账）：`
          + `${source} 的续接点可以保存和展示，但**投递回该源**无官方接口 ⇒ 本次没有投递任何内容，也不假称已续接`,
        resumeSupported: false,
      })
      return
    }
    if (typeof latestCheckpoint !== 'function') {
      sendJson(res, 501, {
        ok: false,
        reason: 'resume-not-wired',
        message: '续接点读取面未接线（V1.2-I 阶段 I5/I13）：无法从盘上取回该源的续接点，本次没有向会话投递任何内容',
      })
      return
    }
    let latest
    try {
      latest = await latestCheckpoint({ source, sourceId })
    } catch (error) {
      sendJson(res, 500, { ok: false, message: `读取续接点失败：${error instanceof Error ? error.message : String(error)}` })
      return
    }
    if (latest?.ok !== true) {
      sendJson(res, 404, {
        ok: false,
        reason: `no-checkpoint:${latest?.reason ?? 'unknown'}`,
        message: '盘上没有这个源的续接点 ⇒ 没有可投回会话的内容（不做"空续接"，也不拿别的源的顶上）',
      })
      return
    }
    if (typeof resume !== 'function') {
      sendJson(res, 501, {
        ok: false,
        reason: 'resume-not-wired',
        message: '续接投递面未接线（V1.2-I 阶段 I13）：官方投递原语（sessionController.prompt）尚未接入，本次没有向会话投递任何内容',
      })
      return
    }
    const text = buildResumeInstruction({
      checkpoint: latest.checkpoint,
      stoppedAt: latest.at ?? null,
      missingFields: latest.missingFields ?? [],
      incomplete: latest.incomplete === true,
      sourceId,
    })
    let result
    try {
      result = await resume({ sessionId: sourceId, text })
    } catch (error) {
      sendJson(res, 502, { ok: false, reason: `resume-failed:${error instanceof Error ? error.message : String(error)}`, message: '投递续接内容时抛错，会话没有收到续接点' })
      return
    }
    if (result?.ok !== true) {
      // 两类失败必须分开报，否则真机排查时会把"没接线"误读成"投递被拒"：
      //   · `resume-unwired:*` = 官方原语本身不在（装配问题）⇒ 501；
      //   · 其余（已调用但没受理 / 抛错）= 运行时拒绝（模型不可用、会话忙死等）⇒ 502。
      const unwired = typeof result?.reason === 'string' && result.reason.startsWith('resume-unwired')
      sendJson(res, unwired ? 501 : 502, {
        ok: false,
        reason: result?.reason ?? 'resume-not-accepted',
        message: result?.detail ?? '官方投递原语没有受理这次续接（不重试、不假装成功）',
        mode: result?.mode ?? null,
      })
      return
    }
    sendJson(res, 200, {
      ok: true,
      accepted: true,
      mode: result.mode ?? null,
      acceptedMeans: result.detail ?? ACCEPTED_MEANS_FALLBACK,
      title: resumeBarTitle(latest.at ?? null),
      checkpointPath: latest.path ?? null,
      stoppedAt: latest.at ?? null,
      incomplete: latest.incomplete === true,
      missingFields: latest.missingFields ?? [],
      text,
    })
  }

  return { state: handleState, read: handleRead, plan: handlePlan, run: handleRun, resume: handleResume, storePath }
}

/**
 * 宿主插件入口。服务缺失时**抛错**（不静默），保证真机接线问题第一时间可见。
 *
 * `options` 是**可选**的装配参数（loader 只传 `ctx`，故真机走默认值）：
 * 套件用 `{ storePath, hostDeps }` 把存储指到 tmp、把宿主面换成替身 —— 这是"同一份 handler、
 * 同一份装配代码"能被真跑的前提，不是给测试开后门（真机路径不接受任何请求级参数）。
 */
export function apply(ctx, options = {}) {
  const webServer = typeof ctx?.get === 'function' ? ctx.get('webServer') : ctx?.webServer
  if (!webServer || typeof webServer.register !== 'function') {
    throw new Error('[dsh-personal-quickstop] webServer 服务不可用（检查 package 的 inject 声明与加载顺序）')
  }
  // I-D 接线：发现面（只读取数）+ 编排面（九步流程）都绑到**同一个** adapter 实例上，
  // 于是 `/plan` 与 `/run` 用的是同一份口径（不会出现"计划说 3 个、执行却按另一份清单停"）。
  //
  // I5 落盘：把自建 checkpoint store 作为**默认**注入面接进来（官方无交接槽，见侦查 §Q6）。
  // 落盘目录默认与中断投影**同目录**（`<storePath 所在目录>/personal-checkpoints`）——
  // 这样"投影"与"续接点"要么一起在真机 `~/.dsh`、要么一起在套件的 tmp，不会一个写 tmp 一个写家目录。
  // 注入面的形状是**一个函数**（host-adapter 的契约 `deps.checkpointStore({source, checkpoint})`）；
  // `createCheckpointStore` 返回的组合对象里其余读能力（read/list/latest）留给续接面（I13）按需取用，
  // 宿主这一层一次只拿它真正要用的那个写入口。
  const checkpointStore = options.hostDeps?.checkpointStore
    ?? createCheckpointStore({ dir: options.checkpointDir ?? defaultCheckpointDirFor(options.storePath) }).write
  // I13 的**读**那一半（I5 只接了写）：续接条要按源取回盘上最新那条续接点。
  // 读与写必须是**同一个目录**，否则会出现"停的时候写这儿、续的时候读那儿"——静默接不上。
  const checkpointRead = options.hostDeps?.latestCheckpoint
    ?? createCheckpointStore({ dir: options.checkpointDir ?? defaultCheckpointDirFor(options.storePath) }).latest
  const { adapter, deps: hostDeps, resume: resumeBinding } = createQuickStopHostDeps(ctx, { ...(options.hostDeps ?? {}), checkpointStore })
  const handlers = createQuickStopHandlers({
    storePath: options.storePath,
    allowedHosts: options.allowedHosts,
    discoverSnapshot: () => adapter.discover(),
    // I13：读盘上续接点（I5 落盘 + `latestCheckpointFor` 已有能力，此处只是接线）。
    latestCheckpoint: checkpointRead,
    // I13：官方投递原语（host-adapter 的 ⑥ resume ⇒ `sessionController.prompt`，出处见 HOST_CALLS）。
    resume: resumeBinding,
    orchestrate: async (request = {}) => {
      const orchestrator = createStopOrchestrator({
        ...hostDeps,
        storePath: options.storePath,
        // 作用域优先级：请求体声明（TEST SAFETY 用）> 装配期默认（hostDeps.scope）> 全部。
        scope: request.scope ?? hostDeps.scope ?? { mode: 'all' },
      })
      return orchestrator.run()
    },
  })
  const status = adapter.status()
  ctx.logger?.info?.(
    '[dsh-personal-quickstop] 路由已挂载（state/read/plan/run/resume，Host 白名单收口）；'
    + `宿主面服务：${JSON.stringify(status.services)}`,
  )
  if (status.unwired.length > 0) {
    // 如实把"这次真机做不到什么"写进宿主日志 —— 真机排查时不用猜。
    ctx.logger?.warn?.(
      '[dsh-personal-quickstop] 尚未接线/不可用的能力：' + status.unwired.join('；'),
    )
  }
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: QUICKSTOP_STATE_PATH, handler: handlers.state }),
    'personal-quickstop: interrupt projection state',
  )
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: QUICKSTOP_READ_PATH, handler: handlers.read }),
    'personal-quickstop: read-to-clear',
  )
  // 四条路由：前两条（state/read）是投影读写；后两条（plan/run）由上面的 adapter 供数。
  // 若某类源真取不到，`/plan` 会如实列出 `unavailableSources`（**不**读成 0），`/run` 会把该类记为未停。
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: QUICKSTOP_PLAN_PATH, handler: handlers.plan }),
    'personal-quickstop: stop plan (discovery seam)',
  )
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: QUICKSTOP_RUN_PATH, handler: handlers.run }),
    'personal-quickstop: orchestration entry (adapter seam)',
  )
  // 第五条路由（I13）：续接条上的 `[继续]`。它是**写会话**的动作（不同于前四条的只读/只落盘），
  // 走的是官方原语（`sessionController.prompt`），故单独一条 effect、单独一条日志，真机可见。
  ctx.effect(
    () => webServer.register({ kind: 'exact', path: QUICKSTOP_RESUME_PATH, handler: handlers.resume }),
    'personal-quickstop: resume entry (official prompt primitive)',
  )
}

export default { name, inject, apply }
