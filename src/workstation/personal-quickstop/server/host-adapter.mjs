// dsh-personal-quickstop — 宿主绑定层（V1.2-I 阶段 I-D 的 `ctx` **唯一**接触点）
//
// 本文件的职责是**薄**：把官方运行时的真实服务面绑成 `createStopOrchestrator` 要的
// `{discover, handoff, persist, stop, verify}`，并**如实**报告哪一处没接线。
// 所有"什么算在跑"的判定都在 `discovery.mjs`（纯函数，可断言）；本文件不做判断，只搬数据。
//
// 三条写死的纪律（继承仓库既有约定）：
//   ① **不许假成功**：服务缺失 / 原语不存在 / owner 取不到 ⇒ 返回**明确的失败原因**，
//      让编排层记进 `unwired` / `notStopped` / `checkpointIncomplete`；**绝不**返回"看起来成功的空结果"。
//   ② **未知 ≠ 0**：任何一类取不到 ⇒ 进 `unavailableSources`（`discovery.mjs` 组装），
//      并让发现面继续去取**其它三类**（部分失败要比整体放弃更有用，但必须如实标出缺口）。
//   ③ **三个停止原语都是 fire-and-return**：调用返回**不是**终态。故 `verify` 只用可观测量，
//      并且**写明证据强弱** —— 尤其子代理 `activity === 'inactive'` 是**弱**证据
//      （也可能是"从未有过 driver"），不许当成"是我们停掉的"。
//
// ⚠️⚠️ **本文件里的宿主调用全部【未真机验证】**（本阶段 `dsh-personal-quickstop` 尚未装机，
// 见 `docs/V1_2_I_D_HOST_PROBE.md` §五·坑 2）：
//   · `ctx.get('…')` 能否拿到服务、服务方法是否存在、参数形状是否被 codec 接受 —— **都没有跑过**。
//   · 已验证的只有**契约层**（类型声明与 `invocation:{kind:'direct'}` 描述符，出处见 `HOST_CALLS`）。
//   · 装机后必须用 **dedicated test Session + dummy bash 作业**真机复验（实施计划 §五 TEST SAFETY），
//     本文件不做任何"已验证"的声明。

import {
  buildDiscoverySnapshot,
  buildHandoffInstruction,
  collectTextFromPage,
  judgeHandoff,
  mapSubagentResults,
  reasonForMissingService,
} from './discovery.mjs'
import { readTaskLedger as readTaskLedgerFile } from './task-source.mjs'

/** 官方服务 key —— 必须**同时**写进包内 `export const inject = [...]`，否则 `ctx.get` 拿不到。 */
export const QUICKSTOP_HOST_INJECT = Object.freeze([
  'webServer',
  'sessions',
  'agents',
  'jobs',
  'subagents',
  'sessionController',
])

/**
 * 每一条宿主调用的**出处台账**（审计用；也是"有出处的事实 vs 未真机验证"的分界记录）。
 * `verified` 只表示**契约层**有出处，**不**表示运行时跑通过。
 */
export const HOST_CALLS = Object.freeze({
  sessionList: {
    service: 'sessionController',
    method: 'list',
    call: 'ctx.sessionController.list({}, undefined)',
    source: '$C:2111（@Remote(\'list\')，描述 "Read all visible Session rows without resuming an Agent."）；'
      + '实现 $APP/dsh-api-session-controller/lib/types/list.js:165；返回信封 SessionListValue={items}（typert.host.js:1696）',
    verified: 'contract-only',
  },
  sessionCancel: {
    service: 'sessionController',
    method: 'cancel',
    call: 'ctx.sessionController.cancel({ sessionId })',
    source: '$C:2226；宿主可直调已证 $APP/dsh-api-session-controller/lib/typert.host.js:741-749'
      + '（service:sessionController + invocation:{kind:\'direct\'}）；实现 lib/index.js:826-837 → agent.cancel({kind:\'user\'},{keepInbox:true})',
    verified: 'contract-only',
  },
  sessionPrompt: {
    service: 'sessionController',
    method: 'prompt',
    call: 'ctx.sessionController.prompt({ requestId, sessionId, mode: \'steer\', content: [...] }, AbortSignal)',
    source: '$C:2196（@Remote(\'prompt\')，"Admit one prompt after explicitly resuming its Session."）；'
      + 'SessionPromptRequest 形状 $C:7044；SessionPromptValue={accepted:true} $C:7048',
    verified: 'contract-only',
    inference: '宿主可否直调**是推断**（同服务同族的 cancel 已证 direct），未真机验证',
  },
  sessionPage: {
    service: 'sessionController',
    method: 'page',
    call: 'ctx.sessionController.page({ address: {kind:\'session\', sessionId}, throughSeq: -1, maxMessages: 20 }, undefined)',
    source: '$C:2233 区块（@Remote(\'page\')，"Read one cold-safe, message-aligned Session history page."）；'
      + 'throughSeq 传 -1 ⇒ 读到最新，实现 $APP/dsh-api-session-controller/lib/index.js:1212；'
      + 'SessionPageRequest $C:6996；SessionPage={records, hasMore} $C:6992',
    verified: 'contract-only',
  },
  agentStatus: {
    service: 'agents',
    method: 'get',
    call: 'ctx.agents.get(sessionId)?.status',
    source: '$C:291（agents 服务）；AgentStatus=\'idle\'|\'running\' $C:5452；'
      + '官方自己就是这么判 running 的：lib/types/list.js:154',
    verified: 'contract-only',
  },
  agentCancel: {
    service: 'agents',
    method: 'get(id).cancel',
    call: 'ctx.agents.get(id)?.cancel({ kind: \'user\' }, { keepInbox: true })',
    source: '$APP/dsh-agent-loop/lib/index.js:410-416；Agent 完整声明 $APP/dsh-api-session-controller/lib/typert.host.js:1260',
    verified: 'contract-only',
  },
  agentWhenIdle: {
    service: 'agents',
    method: 'get(id).whenIdle',
    call: 'await ctx.agents.get(id)?.whenIdle()',
    source: '$APP/dsh-agent-loop/lib/index.js:465-470',
    verified: 'contract-only',
    inference: 'whenIdle() **没有超时参数** ⇒ 本层只用"轮询 status === \'idle\' + 上界"这条可上界的路，'
      + 'whenIdle() 仅作为可选注入点（deps.waitForIdle），避免不可上界的等待',
  },
  subagentListDescendants: {
    service: 'subagents',
    method: 'listDescendants',
    call: 'ctx.subagents.listDescendants(rootSessionId, undefined)',
    source: '$C:3642；实现 $APP/dsh-subagent/lib/index.js:1941-1955（含 parentId/depth）；'
      + 'activity 填充 index.js:2021(live→running) / :2080,2090,2122(cold/无注册表→inactive)；类型 $C:7425/$C:7441',
    verified: 'contract-only',
  },
  subagentListChildren: {
    service: 'subagents',
    method: 'listChildren',
    call: 'ctx.subagents.listChildren(parentSessionId, undefined)',
    source: '$C:3629；实现 $APP/dsh-subagent/lib/index.js:1924-1927',
    verified: 'contract-only',
  },
  subagentInterruptByParent: {
    service: 'subagents',
    method: 'interruptByParent',
    call: 'ctx.subagents.interruptByParent(childId, parentId, \'continuable\')',
    source: '$C:3681；宿主可直调已证 $APP/dsh-subagent/lib/typert.host.js:60-104'
      + '（service:subagents + invocation:{kind:\'direct\'}）；实现 lib/index.js:2932-2947；'
      + 'fire-and-return 语义 index.js:1149-1152 JSDoc',
    verified: 'contract-only',
  },
  jobsList: {
    service: 'jobs',
    method: 'list',
    call: 'ctx.jobs.list(ownerAgent)',
    source: '$C:1616；实现 $APP/dsh-jobs-local/lib/index.js:178-181（仅 caller 自己 + unowned）；'
      + '授权位 assertAccess index.js:313-315',
    verified: 'contract-only',
    boundary: '按 caller 过滤 ⇒ **无法枚举全部作业**，见 discovery.mjs 的 JOBS_PARTIAL_REASON',
  },
  jobsKill: {
    service: 'jobs',
    method: 'kill',
    call: 'ctx.jobs.kill(jobId, ownerAgent, reason)',
    source: '$C:1649；实现 $APP/dsh-jobs-local/lib/index.js:197-209（置 stopping 后立刻返回 requested）；'
      + '真机先例（已装机第三方插件）$HOME/.dsh/profiles/desktop/node_modules/dsh-better-sidebar/lib/index.js:3051-3065',
    verified: 'contract-only',
  },
  jobsGet: {
    service: 'jobs',
    method: 'get',
    call: 'ctx.jobs.get(jobId, ownerAgent)',
    source: '$C:1625；终态词表 isTerminal $APP/dsh-jobs-local/lib/index.js:79-81',
    verified: 'contract-only',
  },
  sessionsFlush: {
    service: 'sessions',
    method: 'flush',
    call: 'ctx.sessions.get(id) → ctx.sessions.flush(liveSession)',
    source: '$C:2957（"Dispatch the awaited session/flush durability checkpoint"）；'
      + '真签名 @deepseek-ai/dsh-session/lib/index.js:1738-1768（"THE flush entry point"）+ '
      + 'get(id) 取活句柄 :1779-1781；官方调用点 dsh-acp/lib/index.js:972',
    verified: 'contract-only',
    note: '官方只有 **durability 屏障**，没有可写的交接槽 ⇒ 本层不做交接（见 docs/V1_2_I_D_HOST_PROBE.md §Q6）。'
      + '**收 live session 对象**（不是 id），返回 `true` = 至少一个 durability listener 参与；`false` = 没人参与 ⇒ 屏障未发生（本层分四态如实回报）。'
      + '用途：G7 里 cancel **之前**的屏障（host-adapter `durabilityBarrier`）。',
  },
  /**
   * I13 的**续接投递原语** —— 这就是"把内容送回会话"的官方手段，出处逐条核过（不再靠推断）：
   *   · 声明与 JSDoc `$APP/dsh-api-session-controller/lib/typert.host.js:1210-1213`
   *     （`@Remote('prompt') prompt(request: SessionPromptRequest, signal): Promise<SessionPromptValue>`；
   *      summary 原文 "Admit one prompt after explicitly resuming its Session."）；
   *   · 请求形状同文件 `:1743-1745`：`{requestId, sessionId, mode:'queue'|'steer', content: readonly PromptContentPart[]}`
   *     （`PromptContentPart` = `{type:'text', text}` | `{type:'image',…}`，`:1531-1532`）；返回值 `{accepted:true}` `:1747-1749`；
   *   · 实现 `$APP/dsh-api-session-controller/lib/index.js:731-767`：`mode==='steer' ? agent.steer(msg) : agent.followup(msg)`；
   *   · **冷/已停会话不用我们先行复位**：`resolveAgent` 的实现在
   *     `$APP/dsh-api-session-controller/lib/types/agent.js:197-206`，JSDoc 原文
   *     "Resolve **or resume** one ordinary Session, deduplicating concurrent resumes."，
   *     `resolve()` `:207-240` 在非 live 时走 `this.resume(...)` → `observeSession()` 读回持久会话日志再建 Agent；
   *   · `followup` = 唤醒一轮：`$APP/dsh-agent-loop/lib/index.js:397-408`
   *     （`send(message,'next-turn',true)` / `wakeup ⇒ wakeDriver`）；
   *   · **为什么用 `queue` 而不是 `steer`**：官方客户端自己的规则就是
   *     `resolve(running, …)`「`if (!running || !steeringAvailable) return "queue"`」
   *     `$APP/dsh-client-ui-conversation/lib/client.js:13254-13258` ⇒ 会话不在跑时提交一律 queue。
   *   · **`signal` 不是可选的**：官方**本地面** `prompt(request, signal)` 的第一个动作就是
   *     `signal.throwIfAborted()`（`$APP/dsh-api-session-controller/lib/types/index.js:370`，同文件
   *     `:369-372`）。2026-09-18 真机实测：传 `undefined` ⇒ `TypeError: Cannot read properties of
   *     undefined (reading 'throwIfAborted')` ⇒ `[继续]` 直接 502。所以本层一律传真 `AbortSignal`
   *     （`promptSignal()`）。同文件里只有 `openWorkspacePath`（:336）有同样的无条件要求，
   *     而本层不用它 —— 这是这两条调用面收敛的依据。
   */
  resumePrompt: {
    service: 'sessionController',
    method: 'prompt',
    call: 'ctx.sessionController.prompt({ requestId, sessionId, mode: \'queue\', content: [{ type: \'text\', text }] }, AbortSignal)',
    source: '$C:2196（@Remote(\'prompt\')）；SessionPromptRequest $C:7044；SessionPromptValue={accepted:true} $C:7048；'
      + '实现 $APP/dsh-api-session-controller/lib/index.js:731-767；'
      + 'resolve-or-resume $APP/dsh-api-session-controller/lib/types/agent.js:197-240；'
      + 'queue→followup→唤醒 $APP/dsh-agent-loop/lib/index.js:397-408；'
      + 'queue 的官方口径 $APP/dsh-client-ui-conversation/lib/client.js:13254',
    verified: 'contract-only',
    // 与 sessionPrompt（G5 交接用的 steer）**同一原语、不同 mode**：交接要打断当前步去看它写检查点，
    // 续接是"人不在跑"时提交新一轮 ⇒ 语义不同，别混用（混淆会让续接内容被当成"边跑边插话"）。
    note: '返回 `{accepted:true}` **只代表官方受理了这一次投递**（JSDoc 原文 acknowledgement that the Agent accepted the prompt），'
      + '不代表 Agent 已经跑完、甚至不代表它已经开始跑 ⇒ 本层如实返回 `acceptedMeans`，UI 不许写成"已续接完成"。',
  },
})

/** `deps.stopTimeoutMs` 的默认上界：与引擎宽限期同量级（引擎默认 20s，`stop-plan.mjs:21`）。 */
export const DEFAULT_OBSERVE_TIMEOUT_MS = 20_000
/**
 * 发现面**单次**宿主调用的上界（`deps.discoverCallTimeoutMs`）。
 *
 * 为什么必须有：2026-09-18 真机实测，`POST /api/personal/quickstop/plan` 在 6s 与 120s 两次
 * 超时里都**拿不到响应**，且把会话放到空闲后再试仍然挂 ⇒ 不是"被自己这一轮挡住"，是官方原语
 * 里存在**永不 settle** 的调用。`handlePlan` 只做 discover → `buildStopPlan`（纯函数），
 * 所以挂点必在 discovery；而 discovery 原先对每个源**逐个串行 await 且没有任何上界** ⇒
 * 一个卡住的调用就能把"紧急停止"的第一步整条堵死（本仓 G8：不许有上界缺失）。
 *
 * 取值理由：官方原语正常都是 ms 级；8s 已远超正常波动，又能让 4 个源的**最坏**耗时留在
 * 用户还能等的量级。超时**不等于**"这一类没有数据"，所以原因一律写成 `*-timeout:`（未知 ≠ 0）。
 */
export const DEFAULT_DISCOVER_CALL_TIMEOUT_MS = 5_000
/**
 * 发现面**每个源**的总预算（`deps.discoverSourceBudgetMs`）：该源从第一次调用开始的**墙钟跨度**。
 *
 * 为什么光有单次上界不够：子代理/作业按会话展开，只有单次上界时最坏是 `ceil(n/并发) × 上界`。
 * 并行展开后还剩"会话特别多"这一档 ⇒ 预算用尽就**停止继续展开**，并把"剩下的会话没被清点"
 * 如实写进 `unavailableSources`：宁可报"这一类没查完"，也不许报"这一类确实 0 个"。
 */
export const DEFAULT_DISCOVER_SOURCE_BUDGET_MS = 10_000
/**
 * 官方 `prompt(request, signal)` 的调用信号上界。
 *
 * 为什么必须给**真信号**：官方本地面 `prompt` 的第一件事就是 `signal.throwIfAborted()`
 * （`$APP/dsh-api-session-controller/lib/types/index.js:370`）—— 传 `undefined` 直接 TypeError。
 * 2026-09-18 真机就是这么 502 的（`[继续]` 完全不可用），而套件当时用的是**只接一个参数**的
 * 宽替身，于是真机红、套件绿。现在替身照官方契约忠实，两侧一起钉住。
 *
 * 为什么给**有上界**的真信号而不是"永不 abort 的空信号"：本仓 G8 —— 不许有上界缺失。
 * 投递（admission）正常是 ms 级；这里给到与观察上界同量级，超时后官方会以
 * `gateway/cancelled` 结束，本层如实把它记成失败原因，而不是永远挂着。
 */
export const DEFAULT_PROMPT_SIGNAL_TIMEOUT_MS = 30_000
/**
 * 造一个官方 `prompt` 能接受的调用信号。
 * @param {number} [timeoutMs] 上界；默认 {@link DEFAULT_PROMPT_SIGNAL_TIMEOUT_MS}。
 */
function promptSignal(timeoutMs = DEFAULT_PROMPT_SIGNAL_TIMEOUT_MS) {
  return AbortSignal.timeout(timeoutMs)
}
/**
 * 展开时的并发上界（按会话展开的两类源）：封顶是为了不在几百个会话时一次打出几百个宿主调用。
 */
export const DISCOVER_EXPANSION_CONCURRENCY = 8
/**
 * I13 续接投递用的 prompt mode。
 *
 * 为什么写死在常量里：它是**一个官方口径**（"非 running 的会话一律 queue"，
 * 出处见 `HOST_CALLS.resumePrompt`），不是随手挑的字面量 —— 让套件能钉住它、
 * 也让将来想改成 `steer` 的人必须先读到这里的原因。
 */
export const RESUME_PROMPT_MODE = 'queue'
/** `accepted` 的**真实**含义（宿主与 UI 共用同一句，避免两处各说一套）。 */
export const ACCEPTED_MEANS = 'accepted 只代表官方已受理这一轮投递（Agent 收下了续接点），'
  + '不代表它已经跑完或已经开始跑；本层未真机验证。'
/** 轮询间隔（可观测量的采样周期）。 */
export const DEFAULT_POLL_MS = 50

/**
 * 停止原语 → 可观测量 的映射（`verify` 用），把"证据强弱"写死在数据里而不是散在判断里。
 * **导出**是为了让套件能直接钉死"子代理 inactive 只能是弱证据"这条边界
 * （它同时也是需求/实施计划明令写清的一条：不许把 `inactive` 当成"是我们停掉的"证据）。
 */
export function observableSpecForKind(kind) {
  if (kind === 'session') return { observable: "agents.get(id)?.status === 'idle'", strength: 'strong' }
  if (kind === 'background') return { observable: 'jobs.get(id, owner).status ∈ {completed,killed,failed}', strength: 'strong' }
  if (kind === 'subagent') {
    return {
      observable: "subagents.listDescendants(...) 的 activity === 'inactive'",
      strength: 'weak',
      // 这一条是需求/实施计划明令写清的，放在数据里，免得被某个后来者"顺手"当成强证据。
      caveat: "inactive 也可能是「从未有过 driver」（dsh-subagent/lib/types/control.js:53 的派生；"
        + '无 Agent 注册表时每行都是 inactive）⇒ **不能单独当作"是我们停掉的"证据**',
    }
  }
  if (kind === 'task') {
    return {
      observable: null,
      strength: 'none',
      caveat: '任务看板**没有**停止原语（无 cordis 服务面，见 docs/V1_2_I_D_HOST_PROBE.md §4.6）⇒ 无法验证"任务已停"',
    }
  }
  return { observable: null, strength: 'none', caveat: '未知源类别' }
}

/** 安全取服务：`ctx.get` 不存在就返回 `undefined`（并让调用方如实记账，不抛在取服务这一步上）。 */
function serviceOf(ctx, key) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(key) : undefined
  } catch {
    return undefined
  }
}

/** 需要 `await` 的结果与同步结果都吃（官方这面同步/异步混着，`list` 是 async，`kill` 是同步）。 */
async function settle(value) {
  return value
}

function describeError(error) {
  if (error === null || error === undefined) return 'unknown'
  if (typeof error === 'string') return error
  const code = error?.code ?? error?.name
  const message = typeof error?.message === 'string' ? error.message : String(error)
  return code === undefined ? message : `${code}: ${message}`
}

/**
 * 有**并发上界**的 map（与输入同序）。
 *
 * 为什么需要：子代理/作业两类是**按会话展开**的，一次一个会话。串行展开的代价是
 * `n × 单次上界`——真机上 18 个会话里有 1 个调用卡住，整条 `/plan` 就跟着卡（2026-09-18 实测）。
 * 并行展开把"总耗时"与 n 解耦（最坏 ≈ 单次上界），但并发数要封顶：几百个会话时不该一次
 * 朝宿主打出几百个调用。
 *
 * @template T
 * @template R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} run
 * @returns {Promise<R[]>}
 */
async function mapLimited(items, limit, run) {
  const results = new Array(items.length)
  const workerCount = Math.max(1, Math.min(limit, items.length))
  let cursor = 0
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await run(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 造一次"取数尝试"的记录（成功/失败都留痕）——**部分失败不许拖垮其它三类**。
 * @returns {{ok: boolean, value?: any, reason?: string}}
 */
async function attempt(label, fn) {
  try {
    const value = await fn()
    return { ok: true, value, label }
  } catch (error) {
    return { ok: false, reason: `${label}-failed:${describeError(error)}`, label }
  }
}

/**
 * 带**时间上界**的 `attempt`：官方原语合约上不保证有界，真机上确实观测到永不 settle 的调用
 * （见 `DEFAULT_DISCOVER_CALL_TIMEOUT_MS` 的原因）。超时在这里被**翻译成一次如实的失败**，
 * 于是它照原样进 `unavailableSources` —— 既不会伪装成 0，也不会把 `/plan` 整条拖死。
 *
 * @param {string} label 点名"哪一次调用"（真机排查靠它，不许只写"发现失败"）
 * @param {() => any} fn
 * @param {number} timeoutMs
 * @returns {Promise<{ok: boolean, value?: any, reason?: string, label: string, timedOut?: boolean}>}
 */
async function attemptBounded(label, fn, timeoutMs) {
  let timer = null
  const result = await attempt(label, () => Promise.race([
    Promise.resolve().then(fn),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`discover-timeout:${timeoutMs}ms`)), timeoutMs)
    }),
  ]))
  if (timer !== null) clearTimeout(timer)
  return result.ok ? result : { ...result, timedOut: String(result.reason).includes('discover-timeout') }
}

/**
 * 创建宿主绑定（`ctx` 的唯一接触点）。
 *
 * @param {object} deps
 * @param {object} deps.ctx              宿主插件上下文（**唯一**必需项）
 * @param {object} [deps.scope]          TEST SAFETY 作用域（`{mode:'all'}` / `{mode:'test', sessionIds, taskIds}`）
 * @param {number} [deps.observeTimeoutMs] 可观测量轮询上界（默认 20s，与引擎宽限期同量级）
 * @param {number} [deps.pollMs]
 * @param {() => number} [deps.now]
 * @param {(agent: object) => Promise<void>} [deps.waitForIdle]  可选：换掉轮询（**注意** `whenIdle()` 不可上界）
 * @param {(input: object) => Promise<{ok: boolean, path?: string}>} [deps.checkpointStore] 可选：I5 落盘后端
 * @param {() => string} [deps.requestId]  prompt 的 requestId 生成器（默认时间戳 + 随机）
 * @param {(ms: number) => Promise<void>} [deps.sleep]  注入睡眠（套件用；真机默认 setTimeout）
 * @returns {{discover, handoff, persist, stop, verify, status, bindings}}
 */
export function createHostBindings(deps = {}) {
  const ctx = deps.ctx
  if (ctx === undefined || ctx === null) {
    // 没 ctx 就碰不到任何官方面 ⇒ 立刻如实失败，不要造一个"空但成功"的发现面。
    throw new Error('[dsh-personal-quickstop] createHostBindings 需要宿主 ctx（本层是唯一的 ctx 接触点）')
  }
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const observeTimeoutMs = Number.isFinite(deps.observeTimeoutMs) && deps.observeTimeoutMs > 0
    ? deps.observeTimeoutMs
    : DEFAULT_OBSERVE_TIMEOUT_MS
  const pollMs = Number.isFinite(deps.pollMs) && deps.pollMs > 0 ? deps.pollMs : DEFAULT_POLL_MS
  const sleep = typeof deps.sleep === 'function'
    ? deps.sleep
    : (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
  const discoverCallTimeoutMs = Number.isFinite(deps.discoverCallTimeoutMs) && deps.discoverCallTimeoutMs > 0
    ? deps.discoverCallTimeoutMs
    : DEFAULT_DISCOVER_CALL_TIMEOUT_MS
  const discoverSourceBudgetMs = Number.isFinite(deps.discoverSourceBudgetMs) && deps.discoverSourceBudgetMs > 0
    ? deps.discoverSourceBudgetMs
    : DEFAULT_DISCOVER_SOURCE_BUDGET_MS
  const requestId = typeof deps.requestId === 'function'
    ? deps.requestId
    : () => `quickstop-${now()}-${Math.random().toString(36).slice(2, 10)}`
  const scope = deps.scope ?? { mode: 'all' }
  const scopedSessionIds = scope?.mode === 'test' && Array.isArray(scope.sessionIds) ? scope.sessionIds : null

  /**
   * 任务账本读取器（**D1 用户裁定 = (b) 直读账本文件**，见 `docs/V1_2_I_PENDING_DECISIONS.md`）。
   *
   * 默认**开启**（真机要生效），三条注入面供套件使用：
   *   · `deps.readTaskLedger` 给了函数 ⇒ 用它的（套件替身）；
   *   · `deps.readTaskLedger === null` ⇒ **显式关掉**（需要复现"未接线"那一态的套件用）；
   *   · `deps.taskLedgerPath` ⇒ 换掉默认路径（套件指向 tmp，**绝不**读真机账本）。
   * `deps.taskLedger` + `deps.tasksAttempted` 仍是最上层的手工覆盖（在下面 `discover()` 里优先）。
   *
   * 读失败**不抛**：失败原因会原样进 `unavailableSources.reason`（未知 ≠ 0）。
   */
  const taskLedgerReader = deps.readTaskLedger === null
    ? null
    : (typeof deps.readTaskLedger === 'function'
      ? deps.readTaskLedger
      : () => readTaskLedgerFile(deps.taskLedgerPath === undefined ? {} : { path: deps.taskLedgerPath }))

  /** 本次装配时**探测到**的服务可用性（结果会进 `status()`，供宿主日志与验收报告引用）。 */
  const serviceState = {}
  for (const key of QUICKSTOP_HOST_INJECT) {
    const service = serviceOf(ctx, key)
    serviceState[key] = service === undefined || service === null ? 'missing' : 'mounted'
  }

  /** 轮询直到 `predicate` 为真、或超时、或 `predicate` 抛错。**有上界**是硬要求（G8）。 */
  async function pollUntil(predicate) {
    const deadline = now() + observeTimeoutMs
    for (;;) {
      let verdict
      try {
        verdict = await predicate()
      } catch (error) {
        return { ok: false, reason: `observable-error:${describeError(error)}` }
      }
      if (verdict === true) return { ok: true, timedOut: false }
      if (now() >= deadline) return { ok: false, timedOut: true, reason: 'observe-timeout' }
      await sleep(pollMs)
    }
  }

  // ── ① discover ────────────────────────────────────────────────────────────
  /**
   * 清点范围只在第一次发现时记一条宿主日志：跳过冷会话是**有意的口径**（见 `discoverDetailed` 里
   * 的实测理由），但"有意的"不等于"可以不说的" —— 不记下来就是静默少查，正是本仓最忌讳的那类。
   */
  let expansionScopeLogged = false
  const logExpansionScopeOnce = (rootCount, skippedCount) => {
    if (expansionScopeLogged) return
    expansionScopeLogged = true
    ctx.logger?.info?.(
      `[dsh-personal-quickstop] 清点范围：只展开 running 会话（${rootCount} 个）；跳过 ${skippedCount} 个冷会话`
      + '（冷会话没有在跑的 Agent ⇒ 不属于"活动工作"；正在跑的子会话本身也以 running 出现，故不会漏根）',
    )
  }

  /**
   * 取只读快照。**任何一类取不到都不中断其它三类**（部分结果 + 如实声明缺口 > 整体放弃），
   * 但缺口一定会进 `unavailableSources`。
   */
  async function discover() {
    return (await discoverDetailed()).snapshot
  }

  /**
   * 同 `discover`，但把**审计信息**一并交出来（映射前后的行、被排除的行、诊断行、去重、理由）。
   * 为什么不把这些塞进快照：快照是给引擎吃的契约面，多塞字段会污染它；
   * 审计面是给宿主日志与验收报告用的，两者分开才不会互相漂移。
   */
  async function discoverDetailed() {
    // 按源名归集"为什么这一类不可信"的最具体理由（越具体越能在真机定位）。
    const unavailableReason = new Map()
    const markUnavailable = (name, reason) => {
      if (!unavailableReason.has(name)) unavailableReason.set(name, reason)
    }
    // "第一个原因"通常最具体（超时/服务缺失），但**预算耗尽**是一条**额外**事实（"剩下的没清点"），
    // 不能被前一条挤掉 —— 真机排查时这两种信息都要看到，所以这里是**追加**而不是覆盖。
    const noteUnavailable = (name, note) => {
      const previous = unavailableReason.get(name)
      if (previous === undefined) unavailableReason.set(name, note)
      else if (!previous.includes(note)) unavailableReason.set(name, `${previous}；另：${note}`)
    }

    // 每个源的**墙钟跨度**（源总预算用）：从该源第一次调用开始算，而不是把并发调用的耗时相加
    // （相加会把并发算成串行，健康路径也会误判超预算）。用真实墙钟：它度量的是"用户还要等多久"，
    // 不该被套件注入的假时钟影响（假时钟只服务于重试/宽限期的逻辑判据）。
    const sourceStartedAt = new Map()
    const budgetLeft = (name) => {
      const startedAt = sourceStartedAt.get(name)
      if (startedAt === undefined) return discoverSourceBudgetMs
      return discoverSourceBudgetMs - (Date.now() - startedAt)
    }
    const budgetReason = (name) => `discover-source-budget-exhausted:${discoverSourceBudgetMs}ms`
      + `（${name} 累计耗时已超预算 ⇒ 停止继续展开；剩下的会话没被清点：这是"没查完"，**不是**"确实没有"）`

    /**
     * 预算内跑一次带界调用；**不在这里打标记**（标记由后面有序的装配段统一做，保证
     * "先出现的具体原因"可复现，不受并发完成顺序影响）。预算已耗尽 ⇒ **不再调用**。
     * 单次上界取 `min(上界, 剩余预算)`，保证一次调用不会把预算整段冲过去。
     */
    async function runBounded(sourceName, label, fn) {
      const left = budgetLeft(sourceName)
      if (left <= 0) return { ok: false, reason: budgetReason(sourceName), budgetExhausted: true, label }
      if (!sourceStartedAt.has(sourceName)) sourceStartedAt.set(sourceName, Date.now())
      return attemptBounded(label, fn, Math.min(discoverCallTimeoutMs, left))
    }

    // 会话：`sessionController.list({}, undefined)`（live + 冷，带 running 位）。
    const sessionController = serviceOf(ctx, 'sessionController')
    let sessionList = null
    if (sessionController === undefined || typeof sessionController.list !== 'function') {
      markUnavailable('sessions', reasonForMissingService('sessionController'))
    } else {
      const outcome = await runBounded('sessions', 'session-list', () => sessionController.list({}, undefined))
      if (outcome.ok) sessionList = outcome.value
      else markUnavailable('sessions', outcome.reason)
    }

    // 子代理 / 作业：按**跑着的会话**展开（活动位判定与本仓其它层同一口径：`running === true`，
    // 见 `discovery.mjs:116-117` 与引擎 `discoverActiveWork`）。
    //
    // 为什么不是"每个会话都展开"——**真机实测（2026-09-18，官方 RPC 直测）**：
    //   本机 `session/list` 返回 **974** 个会话，其中 `running === true` 的只有 **1** 个；
    //   而 `subagents/list` 每次调用实测 ~0.55s ⇒ 逐个展开 974 个会话 ≈ **9 分钟**。
    //   这就是"`/plan` 挂住"的真因：不是某个调用永不 settle，是**规模**（个别调用还会偶发 6s+ 抖动）。
    // 为什么这样做不丢目标（与需求原文 G5"所有仍然有 AI / Agent reasoning context 的**活动工作**"一致）：
    //   · 冷会话没有在跑的 Agent ⇒ 它的子代理/作业不属于"活动工作"；
    //   · **正在跑的**子会话本身就以 `running === true` 出现在同一份清单里（实测子代理会话确实在列），
    //     所以子代理树的根不会因为"父会话冷"而被漏掉。
    // 其余安全网仍然在：单次调用上界 + 并发封顶 + 每源墙钟预算（见 `runBounded` / `mapLimited`）。
    const sessionRows = Array.isArray(sessionList?.items) ? sessionList.items : []
    const expansionRootIds = scopedSessionIds ?? sessionRows
      .filter((row) => row?.running === true)
      .map((row) => row?.sessionId)
    const rootIds = expansionRootIds.filter((id) => typeof id === 'string' && id !== '')
    /** 被**故意**跳过的冷会话数（如实记进宿主日志；不是静默少查）。 */
    const skippedColdSessions = scopedSessionIds !== null
      ? 0
      : sessionRows.length - rootIds.length
    if (skippedColdSessions > 0) {
      logExpansionScopeOnce(rootIds.length, skippedColdSessions)
    }

    const subagentResults = []
    const jobsByOwner = []
    const agents = serviceOf(ctx, 'agents')
    const subagents = serviceOf(ctx, 'subagents')
    const jobs = serviceOf(ctx, 'jobs')

    const subagentLister = subagents === undefined
      ? null
      : (typeof subagents.listDescendants === 'function'
        ? { label: 'subagent-descendants', call: (id) => subagents.listDescendants(id, undefined) }
        : (typeof subagents.listChildren === 'function'
          ? { label: 'subagent-children', call: (id) => subagents.listChildren(id, undefined) }
          : null))
    if (subagentLister === null) markUnavailable('subagents', reasonForMissingService('subagents'))

    const jobsReadable = jobs !== undefined && typeof jobs.list === 'function'
      && agents !== undefined && typeof agents.get === 'function'
    if (jobs === undefined || typeof jobs.list !== 'function') {
      markUnavailable('jobs', reasonForMissingService('jobs'))
    } else if (agents === undefined || typeof agents.get !== 'function') {
      // 没有 agents 就拿不到授权 caller ⇒ 作业一个都读不到（授权位，坑 5）。
      markUnavailable('jobs', reasonForMissingService('agents'))
    }

    if (rootIds.length === 0) {
      if (sessionList === null) {
        // 会话面**没取到**（服务缺失 / 超时 / 报错）⇒ 派生面既没有锚点、也无从判断 ⇒ 如实标"这次没清点"。
        markUnavailable('subagents', 'no-session-list-to-expand（会话清单未取到 ⇒ 没有展开锚点，这一类这次没被清点）')
        markUnavailable('jobs', 'no-session-list-to-expand（会话清单未取到 ⇒ 没有展开锚点，这一类这次没被清点）')
      } else {
        // 会话面读到了、但一个 root 都没有 ⇒ 没有展开锚点，两会话派生面只能如实标"这次没取到"。
        markUnavailable('subagents', 'no-known-session-root-to-expand（没有可展开的会话锚点）')
        markUnavailable('jobs', 'no-known-session-root-to-expand（没有可展开的会话锚点）')
      }
    }

    // 展开两类"按会话"的源：**并行**（并发封顶），完事后再**按 rootIds 顺序**装配 ——
    // 这样"先出现的具体原因"与结果顺序都可复现，不随并发完成顺序漂移。
    const expansions = await mapLimited(rootIds, DISCOVER_EXPANSION_CONCURRENCY, async (sessionId) => {
      const row = { sessionId, entries: undefined, subagentsReason: undefined, subagentsBudgetExhausted: false, ownerReachable: undefined, jobs: undefined, jobsReason: undefined }
      if (subagentLister !== null) {
        const outcome = await runBounded('subagents', `${subagentLister.label}(${sessionId})`, () => subagentLister.call(sessionId))
        if (outcome.ok) row.entries = outcome.value
        else {
          row.subagentsReason = outcome.reason
          row.subagentsBudgetExhausted = outcome.budgetExhausted === true
        }
      }
      if (jobsReadable) {
        const agent = agents.get(sessionId)
        if (agent === undefined) {
          // owner 不在 live 注册表 ⇒ 拿不到授权 caller ⇒ 这一类**不可枚举**，不是"0 个作业"。
          row.ownerReachable = false
        } else {
          row.ownerReachable = true
          const outcome = await runBounded('jobs', `jobs-list(${sessionId})`, () => jobs.list(agent))
          if (outcome.ok) row.jobs = outcome.value
          else row.jobsReason = outcome.reason
        }
      }
      return row
    })

    for (const row of expansions) {
      if (subagentLister !== null) {
        // 预算耗尽 / 超时 ⇒ **不 push 空数组**，否则下游会把"没清点"读成"这里没有子代理"。
        if (row.entries !== undefined) subagentResults.push({ parentSessionId: row.sessionId, entries: row.entries })
        else if (row.subagentsReason !== undefined) {
          if (row.subagentsBudgetExhausted) noteUnavailable('subagents', row.subagentsReason)
          else markUnavailable('subagents', row.subagentsReason)
        }
      }

      if (jobsReadable) {
        if (row.ownerReachable === false) {
          jobsByOwner.push({ sessionId: row.sessionId, ownerReachable: false, jobs: undefined })
          markUnavailable('jobs', `job-owner-agent-absent:${row.sessionId}（owner 不在 live 注册表 ⇒ 拿不到授权 caller，该会话的作业不可枚举也不可 kill）`)
        } else {
          if (row.jobsReason !== undefined) markUnavailable('jobs', row.jobsReason)
          jobsByOwner.push({ sessionId: row.sessionId, ownerReachable: true, jobs: row.jobs })
        }
      }
    }

    // ── 任务：直读第三方账本文件（**D1 用户裁定 = (b)**）──────────────────────
    // 手工覆盖优先（套件/上层可以塞 `deps.taskLedger` + `deps.tasksAttempted`）；否则真去读一次。
    // 读**失败**时：把真实原因放进 `tasksReason`（**不是** 0 个任务）—— 于是 `/plan` 会如实报
    // "任务一路无法清点"，而不是给出一个看起来干净的空清单（这是本仓最忌讳的假成功）。
    let taskLedger = deps.taskLedger
    let tasksAttempted = deps.tasksAttempted === true
    let tasksReason = deps.tasksUnavailableReason
    if (!tasksAttempted && taskLedgerReader !== null) {
      // 同一层上界（读文件照理是 ms 级，但"照理"不是保证 —— 这里也不许没有上界）。
      const outcome = await attemptBounded('read-task-ledger', () => taskLedgerReader(), discoverCallTimeoutMs)
      if (outcome.ok && outcome.value?.ok === true) {
        taskLedger = outcome.value.ledger
        tasksAttempted = true
      } else {
        // 两种情况都必须区分开：读取器自己说失败（带 reason），还是调用它时抛了（reason 来自 attempt）。
        tasksReason = outcome.ok === true
          ? String(outcome.value?.reason ?? 'task-ledger-read-failed')
          : `task-ledger-read-threw:${outcome.reason}`
      }
    }

    const { snapshot, audit } = buildDiscoverySnapshot(
      {
        sessionList: sessionList ?? undefined,
        subagentResults: subagentResults.length > 0 ? subagentResults : undefined,
        // 闸门是"**有没有锚点可枚举**"，不是"枚举结果非空"：
        // rootIds === 0 ⇒ 这一面这次**没真的取过**（与"取过但确实是 0 个"是两回事，
        // 后者会带着 byOwner 的空结果进来，从而只报部分不可信而不是"没取到"）。
        jobInput: (rootIds.length > 0 && jobs !== undefined && typeof jobs.list === 'function')
          ? { byOwner: jobsByOwner }
          : undefined,
        // 任务：见上方直读账本的分支；`tasksAttempted` 为假时本字段被忽略、一律声明不可用。
        taskLedger,
      },
      {
        tasksAttempted,
        ...(typeof tasksReason === 'string' ? { tasksReason } : {}),
        jobsComplete: false,
        extraUnavailable: [...unavailableReason.entries()].map(([name, reason]) => ({ name, reason })),
      },
    )
    // 四类之外的名字一个都不许凭空出现（`buildDiscoverySnapshot` 已做词表校验）；
    // 这里只把审计面与本次探测到的服务状态一起交出去，供宿主日志与验收报告直接引用。
    return { snapshot, audit, services: { ...serviceState } }
  }

  // ── ② handoff（G5 / I5） ──────────────────────────────────────────────────
  /**
   * 把 G5 交接指令**投递**给会话，再用**可观测量**与**读回内容**判定是否真的交接完成。
   *
   * 关键诚实点（三条，缺一条就是吹）：
   *   · `prompt` 回 `{accepted:true}` **只算投递成功**，不算交接成功。
   *   · "已交接"必须来自：驱动静下来（`agents.get(id)?.status === 'idle'`，**有上界**的轮询）
   *     + 读回内容里 11 个键**都在**（`judgeHandoff` 的纯判定）。
   *   · 任务 / 后台作业**没有** reasoning context（需求原文：交接针对"仍然有 AI / Agent
   *     reasoning context 的活动工作"）⇒ 对它们**不投递**、也不假造 checkpoint，直接如实 `ok:false`。
   *
   * 【未真机验证】`prompt` / `page` 的宿主直调与参数形状都只有契约层出处（见 `HOST_CALLS`）。
   */
  async function handoff(source) {
    const kind = source?.kind
    if (kind === 'task' || kind === 'background') {
      return {
        ok: false,
        reason: kind === 'task' ? 'handoff-not-applicable:task' : 'handoff-not-applicable:background',
        detail: '需求 G5 的交接针对"仍然有 AI / Agent reasoning context 的活动工作"；任务与后台作业没有对话上下文 ⇒ 不投递、不假造 checkpoint',
        checkpoint: null,
      }
    }
    const sessionController = serviceOf(ctx, 'sessionController')
    if (sessionController === undefined || typeof sessionController.prompt !== 'function') {
      return { ok: false, reason: 'handoff-unwired:sessionController.prompt', checkpoint: null }
    }
    const sessionId = source?.id
    const content = [{ type: 'text', text: buildHandoffInstruction() }]
    let promptAccepted = false
    let promptError = null
    try {
      const value = await settle(sessionController.prompt(
        { requestId: requestId(), sessionId, mode: 'steer', content },
        promptSignal(),
      ))
      promptAccepted = value?.accepted === true
    } catch (error) {
      promptError = describeError(error)
    }

    // 投递失败就没有"等静止"的意义 —— 直接如实回未完成。
    if (promptError !== null || promptAccepted !== true) {
      return judgeHandoff({ promptAccepted, promptError, agentState: 'unknown', page: null })
    }

    // 可观测量：驱动是否已静。轮询**有上界**（G8：不能让 Quick Stop 永远卡住）。
    const idle = typeof deps.waitForIdle === 'function'
      ? await waitWithBound(deps.waitForIdle, sessionId)
      : await pollUntil(() => {
        const agent = serviceOf(ctx, 'agents')?.get?.(sessionId)
        return agent !== undefined && agent.status === 'idle'
      })

    let page = null
    let pageError = null
    if (typeof sessionController.page === 'function') {
      try {
        page = await settle(sessionController.page(
          { address: { kind: 'session', sessionId }, throughSeq: -1, maxMessages: 20 },
          undefined,
        ))
      } catch (error) {
        pageError = describeError(error)
      }
    } else {
      pageError = 'session-controller-page-missing'
    }

    const verdict = judgeHandoff({
      promptAccepted,
      promptError,
      // 有界等待结束后**再读一次真实注册表状态**（不是拿"等成功了"去推断"它静了"）。
      agentState: observedAgentState(sessionId),
      idleTimedOut: idle.timedOut === true,
      page,
      pageError,
    })
    // 读回的原始文本一并带出（审计与 UI"我们读到了什么"），但**不**把它当 checkpoint 本身。
    return {
      ...verdict,
      detail: verdict.ok === true
        ? null
        : `交接未完成（${verdict.reason}）`,
      readbackTextPreview: collectTextFromPage(page ?? null).text.slice(0, 400),
    }
  }

  /** `agents.get(id)?.status` 的**可观测量**读数（`'idle'` / `'running'` / `'unknown'`）。 */
  function observedAgentState(sessionId) {
    const agent = serviceOf(ctx, 'agents')?.get?.(sessionId)
    if (agent === undefined || agent === null) return 'unknown'
    if (agent.status === 'idle') return 'idle'
    if (agent.status === 'running') return 'running'
    return 'unknown'
  }

  /** `waitForIdle` 注入点也必须有上界 ⇒ 用 `Promise.race` 包一层（不依赖它自己守时）。 */
  async function waitWithBound(waitForIdle, sessionId) {
    const agent = serviceOf(ctx, 'agents')?.get?.(sessionId)
    if (agent === undefined) return { ok: false, timedOut: false, reason: 'agent-not-in-registry' }
    for (;;) {
      const settled = await Promise.race([
        Promise.resolve(waitForIdle(agent)).then(() => ({ done: true }), (error) => ({ done: false, error })),
        sleep(observeTimeoutMs).then(() => ({ timeout: true })),
      ])
      if (settled?.timeout === true) return { ok: false, timedOut: true, reason: 'observe-timeout' }
      if (settled?.done === false) return { ok: false, timedOut: false, reason: `wait-for-idle-failed:${describeError(settled.error)}` }
      if (agent.status === 'idle') return { ok: true, timedOut: false }
      // whenIdle 解析了但注册表里还不是 idle（例如另一轮已被唤醒）⇒ 继续等，仍有全局上界。
      return { ok: false, timedOut: false, reason: 'wait-for-idle-resolved-but-not-idle' }
    }
  }

  // ── ③ persist（I5 落盘） ──────────────────────────────────────────────────
  /**
   * 交接内容落盘。**官方没有可写的交接槽**（`docs/V1_2_I_D_HOST_PROBE.md` §Q6：
   * `grep handoff|handover` → 0 命中；`checkpoint` 5 处全是 flush/compaction 语义；
   * `dsh-session-checkpoint-policy` 全文 78 行自身无状态）⇒ 由 **我们自建**（I5）：
   * `server/checkpoint-store.mjs`（真文件 + 索引 + 写完必回读；套件 `smoke-v12i-checkpoint-store.mjs`）。
   *
   * 注入面：`deps.checkpointStore = async ({source, checkpoint}) => ({ok, path, incomplete, missingFields, reason})`。
   * 未注入时（例如某个调用方只想装配发现面）**如实**回未接线 —— 让编排层把它记进 `unwired` 并进与门，
   * 而**不许**返回"看起来成功的空结果"：那会让汇总里的「✓ 已保存续接点」变成假话。
   */
  async function persist(input) {
    if (typeof deps.checkpointStore !== 'function') {
      return {
        ok: false,
        path: null,
        reason: 'persist-unwired:checkpoint-store-not-injected',
        detail: '官方无交接槽（侦查 §Q6）⇒ I5 用自建 store；本次装配未注入 checkpointStore，故如实报未接线',
      }
    }
    const result = await settle(deps.checkpointStore(input))
    const ok = result?.ok === true
    return {
      ok,
      verified: result?.verified === true,
      path: ok || typeof result?.path === 'string' ? (result?.path ?? null) : null,
      // 「存下来了」与「存的内容齐全」是两件事：I6 缺字段时 store 会带 `incomplete` 回来，
      // 这里原样透出（编排层记进审计面），**不**在这里改写成 ok:false —— 交接那一步已经会记 ⚠。
      incomplete: result?.incomplete === true,
      ...(Array.isArray(result?.missingFields) && result.missingFields.length > 0
        ? { missingFields: result.missingFields }
        : {}),
      reason: ok ? null : (result?.reason ?? 'checkpoint-store-reported-failure'),
    }
  }

  // ── ④ stop ───────────────────────────────────────────────────────────────
  /**
   * 按 kind 分派到官方原语。**三个原语全是 fire-and-return** ⇒ 这里返回 `fireAndReturn: true`
   * 并**不**声称已停；终态由 `verify` 的可观测量判定。
   */
  async function stop({ source, force = false } = {}) {
    const kind = source?.kind
    const id = source?.id
    const reason = force ? 'user quick stop (force fallback after grace period)' : 'user quick stop'

    if (kind === 'session') return stopSession(id, reason)
    if (kind === 'subagent') return stopSubagent(source, reason)
    if (kind === 'background') return stopJob(source, reason)
    if (kind === 'task') {
      return {
        ok: false,
        fireAndReturn: false,
        reason: 'stop-unwired:task',
        detail: '任务看板**没有** cordis 服务面（docs/V1_2_I_D_HOST_PROBE.md §4.6：src/host-service.ts:13 是裸 class）⇒ 官方没有可调的"停任务"原语',
      }
    }
    return { ok: false, fireAndReturn: false, reason: `stop-unwired:unknown-kind(${String(kind)})` }
  }

  /**
   * G7「④ 落盘 → ⑦ 停」之间的 **durability 屏障**：停之前把该会话缓冲中的事件刷进 durable 存储，
   * 否则"优雅停止"可能把还没落盘的事件一起带走（需求原文：Session state preserved）。
   *
   * 出处（实读官方产物）：`@deepseek-ai/dsh-session/lib/index.js:1738-1768` —— 官方 JSDoc 自称
   * "THE flush entry point"，其余路径都要求走它。**签名要点**：收的是 **live session 对象**，
   * 不是 id 字符串 ⇒ 必须先用同服务的 `get(id)` 取活句柄（`dsh-session/lib/index.js:1779-1781`
   * "the session, or undefined when no live session has that id"）；官方调用点形如
   * `await this.ctx.sessions.flush(this.agent.session)`（`dsh-acp/lib/index.js:972`）。
   * **返回值语义**：`true` = 至少一个 durability listener 参与且全部成功；
   * `false` = **没有 listener 参与 ⇒ 屏障根本没发生**（`dsh-message-feedback/lib/index.js:379`
   * 就是按这个语义判失败的）⇒ 这里分四态如实回报，**绝不**把 `false` 说成"已落盘"。
   */
  async function durabilityBarrier(sessionId) {
    const sessions = serviceOf(ctx, 'sessions')
    if (sessions === undefined || typeof sessions.flush !== 'function') {
      return { state: 'unavailable', reason: 'stop-unwired:sessions.flush' }
    }
    if (typeof sessions.get !== 'function') {
      // 拿不到 live 句柄就**不猜**：官方 flush 对非 live 对象会抛，硬传 id 只会变成一个假失败。
      return { state: 'unavailable', reason: 'stop-unwired:sessions.get（取 live 句柄）' }
    }
    let live
    try {
      live = sessions.get(sessionId)
    } catch (error) {
      return { state: 'failed', reason: `flush-get-failed:${describeError(error)}` }
    }
    if (live === undefined || live === null) {
      // 会话不在 live 表（例如尚未 attach 或已在别处停掉）⇒ 屏障**无可施加对象**，如实说，不假装刷过。
      return { state: 'not-live', reason: 'session-not-live' }
    }
    try {
      const participated = await settle(sessions.flush(live))
      return participated === true
        ? { state: 'ok' }
        : { state: 'no-listener', reason: 'no-durability-listener-participated' }
    } catch (error) {
      return { state: 'failed', reason: `flush-failed:${describeError(error)}` }
    }
  }

  /** 顶层会话 → `sessionController.cancel({sessionId})`（子代理会话会被拒为 session/agent-busy，故必须分流）。 */
  async function stopSession(sessionId, reason) {
    const sessionController = serviceOf(ctx, 'sessionController')
    if (sessionController === undefined || typeof sessionController.cancel !== 'function') {
      return { ok: false, fireAndReturn: false, reason: 'stop-unwired:sessionController.cancel' }
    }
    // 屏障在 cancel **之前**（G7 的顺序），且它的失败**不**阻断停止（G8：不许因为某一环不响应而卡住）。
    const barrier = await durabilityBarrier(sessionId)
    try {
      const value = await settle(sessionController.cancel({ sessionId }))
      return {
        ok: value?.accepted === true,
        fireAndReturn: true,
        reason: value?.accepted === true ? null : 'cancel-did-not-accept',
        barrier,
        detail: `durability 屏障 ${barrier.state}${barrier.reason === undefined ? '' : `（${barrier.reason}）`}；`
          + `返回 ${JSON.stringify(value ?? null)} —— accepted 只代表"已受理"，**不代表**目标已静止（侦查 §四·3）`,
        invoked: reason,
      }
    } catch (error) {
      // `session/not-found`（未 attach）/ `session/agent-busy`（子代理归属）都从这里出来，
      // 一律如实回报（尤其 agent-busy：说明分流判错了，必须可见）。
      return { ok: false, fireAndReturn: false, reason: `cancel-failed:${describeError(error)}` }
    }
  }

  /** 子代理 → `subagents.interruptByParent(childId, parentId, 'continuable')`（需要可信的 direct parent）。 */
  async function stopSubagent(source, reason) {
    const subagents = serviceOf(ctx, 'subagents')
    if (subagents === undefined || typeof subagents.interruptByParent !== 'function') {
      return { ok: false, fireAndReturn: false, reason: 'stop-unwired:subagents.interruptByParent' }
    }
    const childId = source?.id
    const parentId = source?.row?.parentSessionId ?? null
    if (typeof parentId !== 'string' || parentId === '') {
      // 没有 direct parent 就没有权威（`dsh-subagent/lib/index.js:1182` 会判 UNAUTHORIZED）⇒
      // 不去瞎猜一个父 id，如实报"缺父地址"。
      return { ok: false, fireAndReturn: false, reason: 'stop-unwired:subagent-direct-parent-unknown' }
    }
    try {
      const value = await settle(subagents.interruptByParent(childId, parentId, 'continuable'))
      return {
        ok: value?.accepted === true,
        fireAndReturn: true,
        reason: value?.accepted === true ? null : 'interrupt-did-not-accept',
        detail: `返回 ${JSON.stringify(value ?? null)} —— 官方 JSDoc 原文：acknowledgement that the cancel signal was admitted, `
          + 'not that the target is quiescent（dsh-subagent/lib/index.js:1149-1152）；absent/idle/already-completed 目标是 accepted no-op',
        invoked: reason,
      }
    } catch (error) {
      return { ok: false, fireAndReturn: false, reason: `interrupt-failed:${describeError(error)}` }
    }
  }

  /** 后台作业 → `jobs.kill(id, ownerAgent, reason)`（caller 必须是精确 owner，否则被授权位拒）。 */
  async function stopJob(source, reason) {
    const jobs = serviceOf(ctx, 'jobs')
    const agents = serviceOf(ctx, 'agents')
    if (jobs === undefined || typeof jobs.kill !== 'function') {
      return { ok: false, fireAndReturn: false, reason: 'stop-unwired:jobs.kill' }
    }
    const ownerSessionId = source?.row?.sessionId ?? null
    const caller = (agents !== undefined && typeof agents.get === 'function' && ownerSessionId !== null)
      ? agents.get(ownerSessionId)
      : undefined
    if (caller === undefined) {
      // owner 不在 live 注册表 ⇒ 拿不到 caller ⇒ **也不该动它**（$APP/dsh-jobs/README.zh.md:36 的授权边界）。
      // 如实报告"该作业的 owner 已不在"，而不是伪造一次成功。
      return {
        ok: false,
        fireAndReturn: false,
        reason: 'stop-unwired:job-owner-agent-absent',
        detail: `作业 ${String(source?.id)} 的归属会话 ${String(ownerSessionId)} 不在 live Agent 注册表 ⇒ 拿不到授权 caller`,
      }
    }
    try {
      const value = await settle(jobs.kill(source.id, caller, reason))
      return {
        ok: value === 'requested' || value === 'already-finished',
        fireAndReturn: true,
        outcome: value ?? null,
        reason: null,
        detail: `返回 ${JSON.stringify(value ?? null)} —— 官方只把记录置为 stopping 后立刻返回（dsh-jobs-local/lib/index.js:197-209）`,
      }
    } catch (error) {
      return { ok: false, fireAndReturn: false, reason: `kill-failed:${describeError(error)}` }
    }
  }

  // ── ⑤ verify（可观测量，不是调用返回） ────────────────────────────────────
  /**
   * I2「Verify stopped」：**只看可观测量**。返回里一定带 `observable` 与 `strength`，
   * 让上层/UI 无法把弱证据当强证据用。
   */
  async function verify(source) {
    const kind = source?.kind
    const id = source?.id
    const spec = observableSpecForKind(kind)
    if (kind === 'session') {
      const agent = serviceOf(ctx, 'agents')?.get?.(id)
      return {
        stopped: agent !== undefined && agent.status === 'idle',
        kind, id, ...spec,
        detail: `agents.get(${String(id)})?.status === ${JSON.stringify(agent?.status ?? null)}`,
      }
    }
    if (kind === 'background') {
      const jobs = serviceOf(ctx, 'jobs')
      const agents = serviceOf(ctx, 'agents')
      if (jobs === undefined || typeof jobs.get !== 'function') {
        return { stopped: false, kind, id, ...spec, detail: 'jobs.get 不可用 ⇒ 判不出（未知 ≠ 已停）' }
      }
      const ownerSessionId = source?.row?.sessionId ?? null
      const caller = (agents !== undefined && typeof agents.get === 'function' && ownerSessionId !== null)
        ? agents.get(ownerSessionId)
        : undefined
      try {
        const snapshot = await settle(jobs.get(id, caller))
        const status = snapshot?.status ?? null
        return {
          stopped: status === 'completed' || status === 'killed' || status === 'failed',
          kind, id, ...spec,
          detail: `jobs.get().status === ${JSON.stringify(status)}（终态判定 isTerminal，dsh-jobs-local/lib/index.js:79-81）`,
        }
      } catch (error) {
        return { stopped: false, kind, id, ...spec, detail: `jobs.get 失败：${describeError(error)}` }
      }
    }
    if (kind === 'subagent') {
      const subagents = serviceOf(ctx, 'subagents')
      if (subagents === undefined || typeof subagents.listDescendants !== 'function') {
        return { stopped: false, kind, id, ...spec, detail: 'listDescendants 不可用 ⇒ 判不出（未知 ≠ 已停）' }
      }
      const rootId = source?.row?.parentSessionId ?? null
      if (typeof rootId !== 'string' || rootId === '') {
        return { stopped: false, kind, id, ...spec, detail: '没有 direct parent ⇒ 无法重列判定' }
      }
      try {
        const entries = await settle(subagents.listDescendants(rootId, undefined))
        const row = (Array.isArray(entries) ? entries : []).find((entry) => entry?.id === id)
        if (row === undefined) {
          return { stopped: false, kind, id, ...spec, detail: '重列结果里已无这条（不足以为证）' }
        }
        // ⚠️ `inactive` 是**弱**证据：也可能是"从未有过 driver" ⇒ 这里照实返回 stopped:true 但 strength:'weak'，
        // 由上层决定要不要在汇总里标注"该项未被证实是我们停掉的"。
        return {
          stopped: row.activity === 'inactive',
          kind, id, ...spec,
          detail: `activity === ${JSON.stringify(row.activity ?? null)}`,
        }
      } catch (error) {
        return { stopped: false, kind, id, ...spec, detail: `listDescendants 失败：${describeError(error)}` }
      }
    }
    return { stopped: false, kind, id, ...spec, detail: '任务看板无停止原语 ⇒ 无法验证（没有可观测量）' }
  }

  // ── ⑥ resume（I13：把续接点送回会话） ──────────────────────────────────────
  /**
   * 把一段"续接指令"投回指定会话。**这是官方原语**（出处见 `HOST_CALLS.resumePrompt`），
   * 不是我们自建的模拟：`sessionController.prompt` 自己会 resolve-or-resume 目标会话。
   *
   * 四条纪律：
   *   ① 不做任何"看起来成功"的兜底：服务不在 / 方法不在 / 抛错 / 没 accepted ⇒ 一律 `ok:false` + 真原因。
   *   ② 不猜目标：`sessionId` 必须由调用方（续接条所在的会话）给出，本层**不**去"挑一个最近的会话"。
   *   ③ 不重复投递：一次调用 = 一个 prompt（调用方负责别连点）。
   *   ④ `accepted` 的含义照实转述（`ACCEPTED_MEANS`），不许把受理写成完成。
   *
   * @param {{sessionId?: string, text?: string}} input
   */
  async function resume(input = {}) {
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
    const text = typeof input.text === 'string' ? input.text : ''
    if (sessionId === '' || text === '') {
      return {
        ok: false, accepted: false, mode: null,
        reason: 'resume-unwired:missing-argument',
        detail: `sessionId / text 都必须是非空字符串（收到 ${JSON.stringify({ sessionId, textLength: text.length })}）`,
      }
    }
    const sessionController = serviceOf(ctx, 'sessionController')
    if (sessionController === undefined || typeof sessionController.prompt !== 'function') {
      return {
        ok: false, accepted: false, mode: null,
        reason: 'resume-unwired:sessionController.prompt',
        detail: 'ctx.get(\'sessionController\').prompt 不可用 ⇒ 官方投递原语缺失，本次没有把任何内容送回会话',
      }
    }
    const request = {
      requestId: requestId(),
      sessionId,
      mode: RESUME_PROMPT_MODE,
      content: [{ type: 'text', text }],
    }
    try {
      const value = await settle(sessionController.prompt(request, promptSignal()))
      const accepted = value?.accepted === true
      return {
        ok: accepted,
        accepted,
        mode: RESUME_PROMPT_MODE,
        requestId: request.requestId,
        reason: accepted ? null : 'prompt-did-not-accept',
        detail: accepted
          ? `官方受理了这一次投递（返回 ${JSON.stringify(value ?? null)}）；${ACCEPTED_MEANS}`
          : `官方返回 ${JSON.stringify(value ?? null)}（没有 accepted:true）⇒ 不算投递成功`,
      }
    } catch (error) {
      return {
        ok: false, accepted: false, mode: RESUME_PROMPT_MODE,
        requestId: request.requestId,
        reason: `prompt-failed:${describeError(error)}`,
        detail: 'prompt 抛错 ⇒ 续接内容没有送达（不吞错、不重试、不假装成功）',
      }
    }
  }

  function status() {
    return {
      services: { ...serviceState },
      inject: [...QUICKSTOP_HOST_INJECT],
      scope,
      observeTimeoutMs,
      // 这些是**结论性**的诚实边界，直接给宿主日志/验收报告用。
      unwired: [
        ...(serviceState.sessionController === 'missing' ? ['sessionController（会话取消与 G5 交接都无法投递）'] : []),
        ...(serviceState.subagents === 'missing' ? ['subagents（子代理枚举与中断都无法执行）'] : []),
        ...(serviceState.jobs === 'missing' ? ['jobs（后台作业枚举与 kill 都无法执行）'] : []),
        ...(serviceState.agents === 'missing' ? ['agents（可观测量与 jobs 授权 caller 都取不到）'] : []),
        ...(serviceState.sessions === 'missing' ? ['sessions（durability flush / live 会话面不可用）'] : []),
        ...(typeof deps.checkpointStore === 'function'
          ? []
          : ['persist（本次装配未注入 I5 checkpoint store；store 本体已在 server/checkpoint-store.mjs）']),
        'stop(task)（任务看板无 cordis 服务面，官方无"停任务"原语）',
        ...(taskLedgerReader === null && (deps.taskLedger === undefined || deps.tasksAttempted !== true)
          ? ['tasks（本次装配显式关掉了账本读取器 ⇒ 任务一路无法清点）']
          : []),
      ],
      hostCalls: HOST_CALLS,
      verifiedOnRealHost: false,
      verificationNote: '本层的宿主调用**未真机验证**：dsh-personal-quickstop 尚未装机（侦查 §五·坑 2），'
        + '契约层出处见 hostCalls；装机后须用 dedicated test Session + dummy bash 按实施计划 §五 复验',
    }
  }

  return {
    discover, discoverDetailed, handoff, persist, stop, verify, resume, status,
    bindings: { discover, handoff, persist, stop, verify, resume },
  }
}

/**
 * 一行接线：把绑定交给 `createStopOrchestrator`。
 *
 * 【未真机验证】本函数的宿主面同 `createHostBindings`。编排层与纯引擎是已经套件验过的部分，
 * 本函数只做"装配"，不改变它们的语义。
 *
 * @param {object} ctx
 * @param {object} [options] 透传给 `createHostBindings` 的 deps（`scope` / `checkpointStore` / …）
 */
export function createQuickStopHostDeps(ctx, options = {}) {
  const adapter = createHostBindings({ ctx, ...options })
  return {
    adapter,
    // `createStopOrchestrator` 的注入面是 `{discover, handoff, persist, stop, verify}`。
    // `resume`（I13）**不属于**编排九步，它是独立的续接入口 ⇒ 单独由 adapter 交出去，不塞进 deps。
    resume: options.resume ?? adapter.resume,
    deps: {
      ...(options.orchestratorDeps ?? {}),
      discover: options.discover ?? adapter.discover,
      handoff: options.handoff ?? adapter.handoff,
      persist: options.persist ?? adapter.persist,
      stop: options.stop ?? adapter.stop,
      verify: options.verify ?? adapter.verify,
      scope: options.scope,
    },
  }
}
