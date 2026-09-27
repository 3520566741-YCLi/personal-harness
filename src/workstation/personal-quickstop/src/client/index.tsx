// dsh-personal-quickstop — client entry（V1.2-I 阶段 I-B）
//
// 形状与既有两个真实客户端入口一致（`port/restart-btn/client.js` 手写 ModuleLoader 半、
// `personal-sidebar/src/client/index.tsx` 插槽占位）：
//   · `inject: ['slots']` —— 座位服务必须先声明才可读（本仓既有约定）。
//   · `ctx.slots.inject(座位名, () => ctx.slots.register(opts, 组件))` —— 等座位所有者上屏后再占位。
//   · 整个占位用 `ctx.effect(...)` 包起来 ⇒ 插件卸载时座位随之释放（不留孤儿 pill）。
//
// 座位：`conversation.session.header.utilities`（kind=list，scope=session，升序）。
//   座位文档原文（`@deepseek-ai/dsh-cordis-client-runner/lib/client.js`，
//   `conversation.session.header.utilities` 条目）：summary = "Right-aligned Session
//   utilities in ascending order."；`order` 的 doc = "Position among the entries,
//   ascending (default 0)."。
//   既有占位者：`session-log-download`（官方「Session 日志」）与 `quick-restart`
//   （第三方「快速重启」）都取默认 order 0 ⇒ 我们取 **-1** 即落在两者**左侧**，
//   正是 I1 原文的布局 `[快速停止][快速重启][Session 日志]`。
//
// ══════════════════════════════════════════════════════════════════════════════
// 诚实边界（I-B 必须写死在代码里，见 docs/V1_2_I_B_ACCEPTANCE_REPORT.md §未完成）：
//
//   ① `/plan` **已接线**（宿主侧实现，I-A2）：发现面未接线时如实返回 **501**
//      `{ok:false, reason:'discovery-not-wired', message:…}`。客户端把服务端 `message` +
//      状态码**原样**呈给用户 —— 501 **不等于**"没有正在运行的工作"。
//   ② `/run` **路由已注册**（宿主侧 handler 已存在），但真编排尚未接线（属 I-D：官方
//      cancel/stop 原语与真机取数）⇒ apply() 当前的 handler 如实返回 **501
//      `orchestration-not-wired`**，客户端原样把服务端 `message` + 状态码呈给用户。
//      501 **不等于**"没有正在运行的工作"，更不等于"已停止"。旧版宿主（未注册该路径）则
//      是 404 空体，同样如实显示未接线。
//      接线后：200 + `{ok, noWork, summary, message, unwired, notStopped}` —— **200 也可能是
//      `ok:false`**（请求被正确执行但没全停掉），此时 `summaryViewFrom` 抑制引擎的"完成"类
//      断言并显示宿主的实话，**绝不**渲染成「已停止 / 快速停止完成」之类假成功。
//   ③ 本文件**不执行**任何停止动作，也不断言任何"已经停止"的事实：它只把宿主返回的
//      `plan`（只读审计）与 `summary`（结果）渲染出来。谁被停、停成功没 = 宿主/编排层的话。
//   ④ 请求契约（两侧共用的路径常量来自 `../../server/routes.mjs`，**不在此处硬写字符串**）：
//        POST <QUICKSTOP_PLAN_PATH>  → 200 { ok: true, plan: <buildStopPlan() 输出> }
//                                    → 501 { ok:false, reason:'discovery-not-wired', message }（未接线）
//        POST <QUICKSTOP_RUN_PATH>   → 200 { ok: true|false, summary?, noWork?, message?, unwired?, notStopped? }
//                                    → 501 { ok:false, reason:'orchestration-not-wired', message }（未接线）
//      非 2xx 一律当失败；2xx 的 `ok` 由 `summaryViewFrom` 按语义处理（见上）。
//   ⑤ 文案**不在这里**：全部来自 `../../server/stop-plan.mjs`（纯引擎、零 IO、唯一 owner）。
// ══════════════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { QUICKSTOP_PLAN_PATH, QUICKSTOP_RESUME_PATH, QUICKSTOP_RUN_PATH, QUICKSTOP_STATE_PATH } from '../../server/routes.mjs'
import { QUICK_STOP_TEXTS, RESUME_TEXTS, resumeBarTitle, resumeSummaryLines } from '../../server/stop-plan.mjs'
import { QuickStopDialog, QuickStopPill, QuickStopSummary, ResumeBar } from './quick-stop-ui'

/** 座位名（list 座位；与官方 slot key 逐字一致）。 */
export const HEADER_UTILITIES_SLOT = 'conversation.session.header.utilities'
/** 我们的 cell key（新 id ⇒ 在既有条目旁新增一格；复用既有 id 会替换掉对方）。 */
export const SEAT_ID = 'quick-stop'
/** 升序座位取负值 ⇒ 落在默认 0 的「快速重启 / Session 日志」左侧（I1）。 */
export const SEAT_ORDER = -1

/** 宿主路由（唯一 owner = `server/routes.mjs`，此处只 re-export 便于消费方引用）。 */
export { QUICKSTOP_PLAN_PATH, QUICKSTOP_RUN_PATH, QUICKSTOP_RESUME_PATH, QUICKSTOP_STATE_PATH }

/** 未接线的**如实**说法：404（run 路由尚不存在）时 UI 用它交代真实原因。 */
export const NOT_WIRED_LABEL = '宿主编排尚未接线（V1.2-I 阶段 I-D）'
/** 501（宿主发现面未接线）且服务端没给 message 时的兜底说法。 */
export const DISCOVERY_NOT_WIRED_LABEL = '宿主发现面未接线（V1.2-I 阶段 I-D）'

/** `buildStopPlan()` 的客户端视图（宿主为准，这里只声明形状）。 */
export interface QuickStopPlanLike {
  hasWork?: boolean
  counts?: Record<string, number>
  dialog?: {
    title?: string
    countLines?: string[]
    note?: string
    cancelLabel?: string
    confirmLabel?: string
  }
}

/** `createStopFlow().summary()` 的客户端视图。 */
export interface QuickStopSummaryLike {
  ok?: boolean
  lines?: string[]
}

/**
 * `POST /run` 的**真**响应形状（owner = `server/orchestrator.mjs` 的 `run()` 返回值）。
 * 关键：**HTTP 200 也可能是 `ok:false`**（宿主口径：请求被正确执行就用 200，好让 UI 拿到
 * 完整 ⚠ 明细）；`unwired` / `notStopped` 非空时 `ok` 一定是 false。
 */
export interface QuickStopRunResultLike {
  ok?: boolean
  noWork?: boolean
  reason?: string
  message?: string
  summary?: QuickStopSummaryLike | null
  unwired?: unknown[]
  notStopped?: unknown[]
  skippedOutOfScope?: unknown[]
}

/**
 * `/state` 里一条**中断记录**的客户端视图（owner = `server/interrupt-store.mjs` 的 `project()`）。
 * 注意 `checkpoint` 是**停止那一刻**内联进事件里的那份；续接动作的真源是**盘上**那份
 * （`/resume` 时由宿主重新读），UI 只用它做摘要展示 —— 两者不一致时以盘上为准。
 */
export interface InterruptRecordLike {
  source?: string
  sourceId?: string
  stoppedAt?: string | null
  forced?: boolean
  interrupted?: boolean
  unread?: boolean
  stopReason?: string
  checkpointIncomplete?: boolean
  checkpoint?: Record<string, unknown> | null
  /** `/state` 的记录**不带**这个字段（只有 checkpoint-store 读回时有）；有就用，没有就不编。 */
  missingFields?: string[]
}

export interface QuickStopStateLike {
  ok?: boolean
  records?: InterruptRecordLike[]
  counts?: Record<string, unknown>
}

/** `POST /resume` 的**真**响应形状（owner = `server/index.js` 的 `handleResume`）。 */
export interface QuickStopResumeResultLike {
  ok?: boolean
  accepted?: boolean
  mode?: string | null
  message?: string
  reason?: string
  acceptedMeans?: string
  checkpointPath?: string | null
  stoppedAt?: string | null
  incomplete?: boolean
  missingFields?: string[]
  text?: string
}

/** 可注入的传输层：渲染套件注入假 io 验 UI，真机走默认 HTTP io。 */
export interface QuickStopIo {
  plan: () => Promise<QuickStopPlanLike | null>
  run: () => Promise<QuickStopRunResultLike>
  /** I13：读该会话的中断记录（真机 = `GET <QUICKSTOP_STATE_PATH>`）。 */
  state: (sessionId: string) => Promise<QuickStopStateLike>
  /** I13：把续接点投回该会话（真机 = `POST <QUICKSTOP_RESUME_PATH>`）。 */
  resume: (sessionId: string) => Promise<QuickStopResumeResultLike>
}

/**
 * 停止流程**只**需要 `plan`/`run`；续接面的 io 走 `QuickStopActionDeps.resume` 自己的注入点
 * （两条链路各有各的失败语义，见 I13 段注释）。故座位这里只强制要求前两个 —— 类型上写清
 * "谁需要哪些"，免得后来者以为停止流程也依赖续接的端点。
 */
export type QuickStopStopIo = Pick<QuickStopIo, 'plan' | 'run'>

/**
 * 运行结果 → **结果卡要显示的行**（纯函数，可被套件直接钉死）。
 *
 * 四条规则，都是"不许假成功"的直接后果：
 *  ① `noWork:true`（宿主判定没有活动工作）⇒ 只显示宿主给的那句原文（`QUICK_STOP_TEXTS.noWork`），
 *     **不摆 ✓ 计数**（没有工作就没有"已保存 N 个"这回事）。
 *  ② `ok === true` ⇒ 原样显示引擎的 `summary.lines`（title + ✓ 四行 + note + 可能的 ⚠ 行）。
 *  ③ `ok === false` ⇒ **抑制引擎的"完成"类断言**（`doneTitle` / `doneNote`），
 *     并把宿主自己的实话（`message`）以 ⚠ 行放在最前；✓ 计数与 ⚠ 明细原样保留。
 *     `doneTitle` / `doneNote` 是**引用** stop-plan.mjs 的常量比对，不是在这里重写文案。
 *  ④ 既没有 summary、也没有 message（或抑制后什么也不剩）⇒ 返回 null
 *     （调用方走 error 态：宁可说"没有可显示的结果"，也不摆一张空卡片冒充结果）。
 *
 * 关于 ③ 的抑制：**根因已在引擎侧根治**（`stop-plan.mjs` 的 `summary(detail, verdict)`
 * 把 `doneTitle`/`doneNote` 变成**条件行**，只在真的 ok 时才进 lines；且 `ok` 是与门
 * `selfOk && verdict.ok`，撒谎的 verdict 洗不白本层自己判出的 ⚠）。
 * 本函数保留这段过滤是**防御纵深**，不是唯一防线 —— 保留的真实理由：
 *   · 宿主半与客户端半是**两个独立构建的产物**（宿主装机、客户端 bundle），存在**版本偏斜**：
 *     客户端可能收到**另一个引擎修订版**的 `lines`，此时"生产者已经不撒谎"不成立；
 *   · 代价是 3 行、且按**同一常量引用**比对，不复制文案、不会与引擎文案漂移；
 *   · 它是**纯函数**，可被套件直接钉死（见 ⑬ 断言表）。
 * 诚实边界：正因为有这层过滤，**本套件 ⑦ 的断言无法发现引擎回退**（过滤会把它盖住）。
 * 引擎契约由引擎 owner 自己的套件钉死；本代理另行用真引擎探针独立复核过一次
 * （`force()` + 撒谎 verdict ⇒ ok 仍为 false；三种 ⚠ 触发器下 lines 均无完成断言）。
 */
export function summaryViewFrom(result: QuickStopRunResultLike | null): QuickStopSummaryLike | null {
  if (result === null || result === undefined) return null
  const message = typeof result.message === 'string' && result.message.trim() !== '' ? result.message : null
  if (result.noWork === true) {
    const lines = message === null ? [] : [message]
    return lines.length === 0 ? null : { ok: true, lines }
  }
  const summary = result.summary ?? null
  if (summary === null) return null
  const engineLines = (summary.lines ?? []).filter((line) => typeof line === 'string')
  if (result.ok === true) return engineLines.length === 0 ? null : { ok: true, lines: engineLines }
  const factual = engineLines.filter(
    (line) => line !== QUICK_STOP_TEXTS.doneTitle && line !== QUICK_STOP_TEXTS.doneNote,
  )
  // '⚠' 只是着色标记（与引擎自己 ⚠ 行的写法一致），文字本身仍全部来自宿主/引擎。
  const head = message === null ? [] : [message.startsWith('⚠') ? message : `⚠ ${message}`]
  const lines = [...head, ...factual]
  return lines.length === 0 ? null : { ok: false, lines }
}

/** HTTP 非 2xx —— 带状态码 + 服务端原话，便于 UI 说清"哪一步、什么码、宿主怎么说"。 */
export class HttpFailure extends Error {
  status: number
  path: string
  /** 服务端响应体里的 `message`（有就原样带上；没有则 null —— 不编造）。 */
  serverMessage: string | null
  constructor(status: number, path: string, serverMessage: string | null = null) {
    super(`HTTP ${status}（${path}）`)
    this.name = 'HttpFailure'
    this.status = status
    this.path = path
    this.serverMessage = serverMessage
  }
}

/**
 * 失败 → **如实**文案。层级（越具体越优先）：
 *   ① 服务端给了 `message` ⇒ 原话 + 状态码（501 的"发现面未接线"就靠这条如实上屏）；
 *   ② 404 ⇒「宿主编排尚未接线（V1.2-I 阶段 I-D）：HTTP 404」（run 路由目前不存在）；
 *   ③ 501 ⇒「宿主发现面未接线（V1.2-I 阶段 I-D）：HTTP 501」（服务端没给 message 时）；
 *   ④ 其它 ⇒ `<步骤>失败：HTTP <码>` 或网络错误原文。
 * **任何分支都不会**变成"没有正在运行的工作"，也不会变成"已停止"。
 */
export function describeFailure(step: string, error: unknown): string {
  if (error instanceof HttpFailure) {
    if (typeof error.serverMessage === 'string' && error.serverMessage.trim() !== '') {
      return `${error.serverMessage}（HTTP ${error.status}）`
    }
    if (error.status === 404) return `${NOT_WIRED_LABEL}：HTTP 404`
    if (error.status === 501) return `${DISCOVERY_NOT_WIRED_LABEL}：HTTP 501`
    return `${step}失败：HTTP ${error.status}`
  }
  const status = typeof (error as { status?: unknown } | null)?.status === 'number'
    ? (error as { status: number }).status
    : null
  if (status !== null) return `${step}失败：HTTP ${status}`
  const message = error instanceof Error ? error.message : String(error)
  return `${step}失败：${message.trim() === '' ? '未知错误' : message}`
}

export interface HttpIoDeps {
  /** 注入点（真机不传；套件用它装一个记录器/失败器，绝不假装端点存在）。 */
  fetch?: typeof fetch
  planPath?: string
  runPath?: string
  statePath?: string
  resumePath?: string
}

/**
 * 默认 HTTP io。`fetch` **每次请求时**重新解析 ⇒ 晚注入（jsdom 里 stub）也生效；
 * 环境没有 fetch 就如实抛错，不静默返回空计划。
 * 非 2xx 时**尽力**读出服务端 `message`（501 的"发现面未接线"必须原样上屏）；
 * 读不出也照常抛 HttpFailure（状态码本身已是事实）。
 */
export function createHttpIo(deps: HttpIoDeps = {}): QuickStopIo {
  const planPath = deps.planPath ?? QUICKSTOP_PLAN_PATH
  const runPath = deps.runPath ?? QUICKSTOP_RUN_PATH
  const statePath = deps.statePath ?? QUICKSTOP_STATE_PATH
  const resumePath = deps.resumePath ?? QUICKSTOP_RESUME_PATH
  const doFetchOf = (): typeof fetch => {
    const doFetch = deps.fetch ?? (typeof fetch === 'function' ? fetch : null)
    if (doFetch === null) throw new Error('当前环境没有 fetch（无法请求宿主）')
    return doFetch
  }
  const parseJson = async (res: Response): Promise<Record<string, unknown> | null> => {
    try {
      const parsed: unknown = await res.json()
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null // 响应体不是 JSON ⇒ 如实当"没有可引用的话"，不编造
    }
  }
  /** 非 2xx ⇒ 带状态码 + 服务端原话抛错（501 的"未接线"必须能原样上屏）。 */
  const failFrom = async (res: Response, path: string): Promise<never> => {
    const body = await parseJson(res)
    const message = typeof body?.message === 'string' ? body.message : null
    throw new HttpFailure(res.status, path, message)
  }
  const bodyOf = async (res: Response, path: string): Promise<Record<string, unknown>> => {
    const body = await parseJson(res)
    if (body === null) throw new Error(`${path} 的响应体不是 JSON 对象`)
    return body
  }
  const post = async (path: string): Promise<Record<string, unknown>> => {
    const res = await doFetchOf()(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    if (res.ok !== true) await failFrom(res, path)
    const body = await bodyOf(res, path)
    // 注意：**这里不检查 `ok`**。宿主的 `POST /run` 在"被正确执行但没全停掉"时
    // 是 `200 + ok:false`（见 server/index.js 的 handleRun：`sendJson(res, 200, result)`），
    // 客户端若把 200+ok:false 当失败抛出，就会丢掉宿主给的 ⚠ 明细。ok 的语义由各调用点判定。
    return body
  }
  return {
    plan: async () => {
      const body = await post(planPath)
      if (body.ok !== true) {
        const message = typeof body.message === 'string' && body.message.trim() !== '' ? body.message : null
        throw new Error(message ?? `${planPath} 返回了非成功响应（ok !== true）`)
      }
      // `ok:true` 却没给 plan = 契约违规 ⇒ 报错（**不**退化成 null 让 UI 去说"没有工作"）。
      if (body.plan === null || body.plan === undefined) throw new Error(`${planPath} 成功响应里没有 plan（契约违规）`)
      return body.plan as QuickStopPlanLike
    },
    run: async () => {
      const body = (await post(runPath)) as QuickStopRunResultLike
      // 只要有一项能如实上屏（引擎 summary / "没有工作" / 宿主的 message）就接受；
      // 200 但什么都没有 = 契约违规 ⇒ 报错，**不**编一个"已停止"。
      const renderable =
        body.noWork === true ||
        (body.summary !== null && body.summary !== undefined) ||
        (typeof body.message === 'string' && body.message.trim() !== '')
      if (!renderable) throw new Error(`${runPath} 成功响应里既没有 summary 也没有 message（契约违规）`)
      return body
    },
    /**
     * I13 读：该会话的中断记录（`GET <statePath>`，只读路由）。
     * `ok:true` 却没给 `records` 数组 ⇒ **报错**：契约违规不能退化成"没有记录"
     * （那会让续接条消失，等于把"未知"说成"没被中断过"）。
     */
    state: async () => {
      const res = await doFetchOf()(statePath, { method: 'GET' })
      if (res.ok !== true) await failFrom(res, statePath)
      const body = await bodyOf(res, statePath)
      if (body.ok !== true) {
        const message = typeof body.message === 'string' && body.message.trim() !== '' ? body.message : null
        throw new Error(message ?? `${statePath} 返回了非成功响应（ok !== true）`)
      }
      if (!Array.isArray(body.records)) throw new Error(`${statePath} 成功响应里没有 records 数组（契约违规）`)
      return body as QuickStopStateLike
    },
    /**
     * I13 写：把续接点投回该会话（`POST <resumePath>`）。
     * **只有 2xx 且 `ok:true && accepted:true` 才算投递成功**；`accepted` 只代表官方受理了这一轮，
     * 不等于 Agent 跑起来了 —— 这层含义由 `RESUME_TEXTS.acceptedNote` 在 UI 上说清。
     */
    resume: async (sessionId: string) => {
      const res = await doFetchOf()(resumePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'session', sourceId: sessionId }),
      })
      if (res.ok !== true) await failFrom(res, resumePath)
      const body = (await bodyOf(res, resumePath)) as QuickStopResumeResultLike
      if (body.ok !== true || body.accepted !== true) {
        const message = typeof body.message === 'string' && body.message.trim() !== '' ? body.message : null
        throw new Error(message ?? `${resumePath} 成功响应里 ok/accepted 不为 true（契约违规）`)
      }
      return body
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// I13 续接面（需求原文 G13「RESUME EXPERIENCE」，`docs/V1_2_I_H_REQUIREMENTS.md:494-520`）
//
// 两个来源必须是**不同**的东西，混了就会接错线：
//   · **摘要**（上次停在 / 已完成 / 下一步）来自 `/state` 的记录 —— 那是"停止那一刻"内联的快照，
//     用来渲染续接条；
//   · **投进会话的续接指令**由**宿主在 `/resume` 时重新从盘上读**那条续接点算出
//     （见 `server/index.js` 的 `handleResume` ⇒ `latestCheckpointFor` ⇒ `buildResumeInstruction`）。
//     本层**不**把自己手里那份摘要当命令投出去 —— 否则"盘上那份"与"投出去那份"可以不一致。
//
// 诚实边界（本阶段必须写死在代码里）：
//   ① 拿不到 `sessionId` ⇒ **不发任何请求**、不渲染续接条（未知即不猜，也不误伤别的会话）。
//   ② `/state` 读失败 ⇒ 显示"中断记录读取失败 + 真原因"，**不**显示续接条、**不**给可点的
//      `[继续]`（连有没有续接点都不知道，点了只会浪费一次失败往返）。未知 ≠ 0，也 ≠ 没被中断过。
//   ③ `accepted:true` 只代表**官方受理了这一轮**，不代表 Agent 接着跑了 ——
//      `RESUME_TEXTS.acceptedNote` 逐字说清；受理后按钮置灰（防重复投递），失败则**回到可点**（允许重试）。
//   ④ 非会话源（task / subagent / background）宿主一律 501 ⇒ 客户端原样把服务端 `message` 上屏，
//      绝不显示任何成功字样。
// ══════════════════════════════════════════════════════════════════════════════

/** 「读取中断记录」这一步的名字（失败文案的 `<步骤>` 段）。 */
export const RESUME_STATE_STEP = '读取中断记录'

/**
 * 从 `/state` 的响应里挑出**这个会话**的那条中断记录（纯函数）。
 *
 * 三条硬规则，每条都对应一种"接错线"：
 *   ① 只认 `source === 'session'` —— task / subagent / background 的源即使 id 恰好相同也**不认**
 *      （它们的续接点投不回去，见 `server/index.js` 的 `RESUMABLE_SOURCES`）；
 *   ② `sourceId` 必须**精确相等** —— 绝不做前缀/模糊匹配（那会把别的会话的续接点显示到本会话头上）；
 *   ③ 同一会话被停过多次 ⇒ 取**最后**一条（`/state` 的记录已是"每 key 最新一条"，但套件与真实
 *      响应都不保证顺序，故此处显式取末位，不依赖上游顺序）。
 * 拿不到 `sessionId` ⇒ null（不是"随便给一条"）。
 */
export function pickResumeRecord(state: QuickStopStateLike | null, sessionId: string | null): InterruptRecordLike | null {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const records = Array.isArray(state?.records) ? state.records : []
  const mine = records.filter((row) => row?.source === 'session' && row?.sourceId === sessionId)
  return mine.length === 0 ? null : mine[mine.length - 1]
}

/** 续接条的视图模型（由 {@link resumeBarViewFrom} 产出，`ResumeBar` 只负责画）。 */
export interface ResumeBarView {
  title: string
  lines: string[]
  note: string | null
  tone: 'info' | 'warn' | 'error'
  /** 是否渲染 `[继续]`（**只有**"连记录都读不到"时为 false —— 那时不知道有没有续接点）。 */
  canResume: boolean
  /** 已受理（`[继续]` 要**置灰但不消失**：用户得看得见"我刚点过、它受理了"）。 */
  accepted: boolean
  busy: boolean
}

/**
 * 续接条的**纯视图模型**（无 React、无 IO ⇒ 可被套件逐分支钉死）。
 *
 * 优先级（前面命中就不看后面）：读失败 > 投递失败 > 已受理 > 续接点不完整 > 没有续接点内容 > 无提示。
 * 为什么"读失败"能盖过一切：此时我们对"有没有被中断过"一无所知，任何基于记录的话都是编的。
 * 为什么"没有续接点内容"还**给**按钮：续接点的真源是**盘上**那份，`/state` 里的 `checkpoint`
 * 只是停止那一刻的快照 —— 盘上有而快照没有是真会发生的事（这正是 `handleResume` 重新读盘的理由）。
 * UI 不替它下结论：显示诚实提示，让用户点一次去问真源。
 *
 * @param {{sessionId?: string | null, record?: InterruptRecordLike | null, readError?: string | null,
 *          busy?: boolean, accepted?: boolean, error?: string | null}} input
 */
export function resumeBarViewFrom(input: {
  sessionId?: string | null
  record?: InterruptRecordLike | null
  readError?: string | null
  busy?: boolean
  accepted?: boolean
  error?: string | null
}): ResumeBarView | null {
  const sessionId = input?.sessionId
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const busy = input?.busy === true
  const readError = typeof input?.readError === 'string' && input.readError !== '' ? input.readError : null
  if (readError !== null) {
    return {
      title: RESUME_TEXTS.readFailedTitle, lines: [], note: readError,
      tone: 'error', canResume: false, accepted: false, busy,
    }
  }
  const record = input?.record ?? null
  if (record === null) return null
  const failure = typeof input?.error === 'string' && input.error !== '' ? input.error : null
  const accepted = input?.accepted === true
  const fields = Array.isArray(record.missingFields) && record.missingFields.length > 0
    ? record.missingFields.join('、')
    : RESUME_TEXTS.missingFieldsUnknown
  let note: string | null = null
  let tone: ResumeBarView['tone'] = 'info'
  if (failure !== null) {
    // ⚠ 只是着色标记（与引擎/宿主自己 ⚠ 行的写法一致），文字本身全部来自服务端或错误原文。
    note = `⚠ ${failure}`
    tone = 'error'
  } else if (accepted) {
    note = RESUME_TEXTS.acceptedNote
  } else if (record.checkpointIncomplete === true) {
    note = RESUME_TEXTS.incompleteNote.replace('{fields}', fields)
    tone = 'warn'
  } else if (record.checkpoint === null || record.checkpoint === undefined) {
    note = RESUME_TEXTS.noCheckpointNote
    tone = 'warn'
  }
  return {
    title: resumeBarTitle(record.stoppedAt ?? null),
    lines: resumeSummaryLines(record.checkpoint ?? null),
    note,
    tone,
    // 有记录就给按钮：连"盘上有没有续接点"这件事都不该由 UI 替真源下结论（见上）。
    canResume: true,
    // 受理后**留着按钮但置灰**（同一条续接点不重复投递，同时让用户看见这次点生效了）；
    // 失败/未受理 ⇒ `accepted:false` ⇒ 按钮回到可点（允许重试，不假装已经做过）。
    accepted,
    busy,
  }
}

/**
 * 失败 → **如实**文案（续接面专用）。层级与 `describeFailure` 同款：服务端原话优先，
 * 其次状态码，最后才是网络错误原文。**任何分支都不会**变成"已续接 / 续接完成"。
 */
export function describeResumeFailure(step: string, error: unknown): string {
  if (error instanceof HttpFailure) {
    if (typeof error.serverMessage === 'string' && error.serverMessage.trim() !== '') {
      return `${error.serverMessage}（HTTP ${error.status}）`
    }
    return `${step}失败：HTTP ${error.status}`
  }
  const message = error instanceof Error ? error.message : String(error)
  return `${step}失败：${message.trim() === '' ? '未知错误' : message}`
}

export interface ResumeBarDeps {
  /** 读中断记录（缺省 = 真 HTTP `GET /state`）。 */
  loadState?: (sessionId: string) => Promise<QuickStopStateLike>
  /** 投回续接点（缺省 = 真 HTTP `POST /resume`）。 */
  sendResume?: (sessionId: string) => Promise<QuickStopResumeResultLike>
}

/**
 * 装出**座位里的那段续接逻辑**（读记录 + 点 `[继续]`）并返回一个组件。
 *
 * 与 `createQuickStopAction` 分开的理由：续接是**独立入口**（需求 G13 的"打开 interrupted
 * Session 就提示"，与停止流程无关），把它的状态机塞进停止的状态机里会让两件事互相纠缠 ——
 * 而且"读不到记录"与"停止没成功"是两条完全不同的失败路径，分开才好各自诚实。
 * `createQuickStopAction` 内部把两者拼到同一个座位里（pill 在前、续接条在后）。
 *
 * @param {ResumeBarDeps} deps
 */
export function createResumeBar(deps: ResumeBarDeps = {}) {
  const http = createHttpIo()
  const loadState = deps.loadState ?? http.state
  const sendResume = deps.sendResume ?? http.resume
  return function QuickStopResumeBar(props: { sessionId?: string | null } = {}): ReactNode {
    const sessionId = typeof props?.sessionId === 'string' && props.sessionId !== '' ? props.sessionId : null
    const [record, setRecord] = useState<InterruptRecordLike | null>(null)
    const [readError, setReadError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [accepted, setAccepted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      // 拿不到 sessionId ⇒ 一次请求都不发（未知即不猜；也别去问一个不属于本会话的续接点）。
      if (sessionId === null) {
        setRecord(null)
        setReadError(null)
        return undefined
      }
      let live = true
      setAccepted(false)
      setError(null)
      void (async () => {
        try {
          const state = await loadState(sessionId)
          if (!live) return
          setRecord(pickResumeRecord(state, sessionId))
          setReadError(null)
        } catch (failure) {
          if (!live) return
          // 读不到 ⇒ **不**渲染续接条（宁可不显示，也不显示一条编的），只留"读不到"这件事。
          setRecord(null)
          setReadError(describeResumeFailure(RESUME_STATE_STEP, failure))
        }
      })()
      return () => { live = false }
    }, [sessionId, loadState])

    const onResume = useCallback((): void => {
      if (sessionId === null || busy) return
      setBusy(true)
      setError(null)
      void (async () => {
        try {
          await sendResume(sessionId)
          setAccepted(true)
        } catch (failure) {
          setError(describeResumeFailure(RESUME_TEXTS.continueLabel, failure))
        } finally {
          setBusy(false)
        }
      })()
    }, [sessionId, busy, sendResume])

    const view = resumeBarViewFrom({ sessionId, record, readError, busy, accepted, error })
    return <ResumeBar view={view} onResume={onResume} />
  }
}

type Phase = 'idle' | 'planning' | 'confirm' | 'running' | 'summary' | 'error'

export interface QuickStopActionDeps {
  /** 注入 io（套件用）。缺省 = 真 HTTP（本阶段会 404，UI 如实显示）。 */
  io?: QuickStopStopIo
  /** I13 续接面的注入点（套件用）。缺省 = 真 HTTP（`GET /state` + `POST /resume`）。 */
  resume?: ResumeBarDeps
}

/**
 * 状态机：idle →(点 pill) planning →(拿到只读计划) confirm →(确认) running →(拿到结果) summary。
 * 任何一步失败 → `error` 态：**只显示错误原文**，不显示"已停止"、也不把未知当"没有工作"。
 *
 * I13 追加：同一个座位里再挂一段**独立**的续接条（自己的状态、自己的请求、自己的失败路径）。
 * DOM 顺序刻意是 `[快速停止] 在**前**、续接条在**后**` —— I1 定的是 pill 的座位位置
 * （`[快速停止][快速重启][Session 日志]` 同一行升序 -1），续接条是**提示区**，不许把 pill 挤走。
 */
export function createQuickStopAction(deps: QuickStopActionDeps = {}) {
  const io: QuickStopStopIo = deps.io ?? createHttpIo()
  const ResumeBarSeat = createResumeBar(deps.resume ?? {})
  return function QuickStopAction(props: { sessionId?: string | null } = {}): ReactNode {
    const [phase, setPhase] = useState<Phase>('idle')
    const [plan, setPlan] = useState<QuickStopPlanLike | null>(null)
    const [summary, setSummary] = useState<QuickStopSummaryLike | null>(null)
    const [error, setError] = useState<string | null>(null)
    const busy = phase === 'planning' || phase === 'running'

    const requestPlan = useCallback(async (): Promise<void> => {
      setError(null)
      setSummary(null)
      setPlan(null)
      setPhase('planning')
      try {
        const next = await io.plan()
        // 空计划 = 契约违规：宁可报错，也不让 UI 停在"只有标题的空确认框"或去说"没有工作"。
        if (next === null || next === undefined) throw new Error('宿主没有返回停止计划（plan 为空）')
        setPlan(next)
        setPhase('confirm')
      } catch (failure) {
        // 计划拿不到 ⇒ 我们对"有没有在跑的工作"**一无所知**。绝不当成"没有工作"。
        setPlan(null)
        setError(describeFailure('获取停止计划', failure))
        setPhase('error')
      }
    }, [io])

    const requestRun = useCallback(async (): Promise<void> => {
      setError(null)
      setPhase('running')
      try {
        const result = await io.run()
        // `ok:false` 带着 summary（例如"停不掉"）**不是**传输错误：宿主确实跑完了编排、
        // 并给了实话，所以走结果卡；`summaryViewFrom` 会抑制引擎的"完成"类断言。
        const view = summaryViewFrom(result)
        if (view === null) {
          const message = typeof result?.message === 'string' && result.message.trim() !== ''
            ? result.message
            : '宿主没有返回可显示的停止结果（summary 与 message 都为空）'
          throw new Error(message)
        }
        setSummary(view)
        setPhase('summary')
      } catch (failure) {
        // 停止没成功 ⇒ 不显示结果卡；保留刚才的只读计划（仍可重试或取消）。
        setSummary(null)
        // 步骤名刻意不写成需求文案本身（"快速停止"是 pill 标签，唯一 owner = stop-plan.mjs）：
        // 代码区的任何字符串都不得包含 QUICK_STOP_TEXTS 的句子（套件 ⑨ 用去注释后的真源码钉死）。
        setError(describeFailure('停止流程', failure))
        setPhase('error')
      }
    }, [io])

    const cancel = useCallback((): void => {
      setPlan(null)
      setSummary(null)
      setError(null)
      setPhase('idle')
    }, [])

    return (
      <>
        <QuickStopPill onClick={() => { void requestPlan() }} disabled={busy} />
        {phase === 'confirm' || phase === 'error' ? (
          <QuickStopDialog
            plan={plan}
            busy={busy}
            error={error}
            onConfirm={() => { void requestRun() }}
            onCancel={cancel}
          />
        ) : null}
        {phase === 'summary' && summary !== null ? (
          <QuickStopSummary summary={summary} onDismiss={cancel} />
        ) : null}
        <ResumeBarSeat sessionId={props?.sessionId} />
      </>
    )
  }
}

/** 套件用：真默认 io + 真插件座位注册出来的那个组件（与真机同一份）。 */
export const QuickStopAction = createQuickStopAction()

// Loose host typing（照 personal-sidebar / personal-hud 的既有写法）：宿主能力缺失时降级，
// 而不是在客户端启动期抛错。
type LooseCtx = {
  effect?: (fn: () => unknown, label?: string) => unknown
  slots?: {
    inject: (name: string, cb: () => unknown, label?: string) => unknown
    register: (opts: Record<string, unknown>, component: unknown) => () => void
  }
}

export function apply(ctx: LooseCtx): void {
  // Never throw during client boot.
  try {
    const slots = ctx?.slots
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
      console.warn('[dsh-personal-quickstop] slots 服务不可用：不占座（官方 UI 照常）')
      return
    }
    const occupy = (): unknown =>
      slots.inject(
        HEADER_UTILITIES_SLOT,
        () => slots.register({ name: HEADER_UTILITIES_SLOT, id: SEAT_ID, order: SEAT_ORDER }, QuickStopAction),
        'dsh-personal-quickstop: 会话头工具区',
      )
    if (typeof ctx.effect === 'function') ctx.effect(occupy, 'dsh-personal-quickstop: header utilities')
    else occupy()
  } catch (error) {
    console.warn('[dsh-personal-quickstop] apply aborted:', error)
  }
}

export const name = 'dsh-personal-quickstop'
export const inject = ['slots']

const plugin = { name, inject, apply }
export default plugin
