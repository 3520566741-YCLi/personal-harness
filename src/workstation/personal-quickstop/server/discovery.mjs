// dsh-personal-quickstop — 发现面**纯映射层**（V1.2-I 阶段 I-D）
//
// 本文件的三条硬边界（违反即返工，写在这里防漂移）：
//   ① **零 IO / 零 `ctx` / 零 `node:*`**：输入是「官方那面已经取回来的原始数据」，输出是
//      `discoverActiveWork` / `buildStopPlan` 能吃的快照。碰 `ctx` 的只有 `host-adapter.mjs`。
//      （这样套件可以用**真机形状的普通数据夹具**钉死映射，不需要伪造宿主对象。）
//   ② **未知 ≠ 0**：任何"取不到/取不全"都必须以 `unavailableSources: [{name, reason}]` 如实声明，
//      绝不把"取不到"写成"这一类是 0 个"。四类源名只能是 `sessions` / `subagents` / `tasks` / `jobs`
//      （与 `stop-plan.mjs` 的 `DISCOVERY_SOURCES` 同一份词表）。
//   ③ **不吞引擎语义**：词表外的值**原样**透传给引擎（引擎已有 `unknown` 桶：
//      `no-liveness-field` / `unrecognized-liveness-value`），本层不提前判活、也不静默丢弃。
//
// 出处纪律：每处字段/词表都写 `路径:行号`（`$C` = 官方类型权威
// `/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-tool-cordis/lib/index.js`，
// `$APP` = 同目录）。凡是**推断**而非真机证实的，一律标 `【未真机验证】`。

/** 与 `stop-plan.mjs` 的 `DISCOVERY_SOURCES` 保持一致（此处**只读**，不另立一份真源）。 */
export const SOURCE_NAMES = Object.freeze(['sessions', 'subagents', 'tasks', 'jobs'])

/**
 * 官方 `JobStatus`（`$C:6225`：`'running' | 'stopping' | 'completed' | 'killed' | 'failed'`）。
 * 真源仍是 `stop-plan.mjs` 的 `LIVE_JOB_STATUSES` / `TERMINAL_JOB_STATUSES`；本文件照抄一份
 * **只为在映射层做"官方词表内/外"的判定**（映射层不许 import 引擎以外的东西，也不许猜）。
 */
export const JOB_STATUSES = Object.freeze(['running', 'stopping', 'completed', 'killed', 'failed'])
export const LIVE_JOB_STATUSES = Object.freeze(['running', 'stopping'])

/**
 * 宿主**子代理**面词表：`$C:7441` `SubagentListEntry` 的 `activity: 'running' | 'inactive'`。
 * ⚠️ `running | idle | ready` 是**模型面** `list_agents` 的派生词
 * （`$APP/dsh-tool-subagent-control/lib/types/list-agents.js:24` 的 `statusOf`），**不是**宿主 API 词表。
 * 本层只认宿主 `activity`；模型面 `status` 是**另一个字段名**，混用会把"从未有过 driver"当成"在跑"。
 */
export const SUBAGENT_HOST_ACTIVITIES = Object.freeze(['running', 'inactive'])

// 任务看板官方状态词表的**唯一 owner 是 `./stop-plan.mjs`**（判定层，且必须零 import 以便
// 客户端 bundle 直接引用）。本层**反向 import** 同一份常量并 re-export —— 不再有第二份定义。
import { INACTIVE_TASK_STATUSES, LIVE_TASK_STATUSES, TASK_STATUSES } from './stop-plan.mjs'
// 再导出同一份（本层是宿主侧映射，可以 import；客户端只 import stop-plan，故其零 import 不变式不受影响）。
export { INACTIVE_TASK_STATUSES, LIVE_TASK_STATUSES, TASK_STATUSES }

/**
 * 任务词表口径的**结案记录**（原为"口径冲突"，已改正，留常量是为了让审计链可追）。
 *
 * 原冲突（I-D 侦查上报）：引擎的 inactive 集合缺 `backlog` / `todo`，而过滤是
 * "不在集合里 ⇒ 就是在跑" ⇒ 待规划/待办会被虚报成要停的工作。
 * 现已按官方 5 值三态判定改正（`stop-plan.mjs` 是词表唯一 owner：running 占执行；
 * backlog/todo/done/failed 已知不活跃；词表外一律进 unknown 桶）。
 * 本层仍**只放出 `running` 行**并留 `excludedTasks` 供审计（保守方向不变，但不再是"绕过缺陷"，
 * 而是"取数层只喂确定的活跃行，判定层仍能独立纠错"）。
 */
export const TASK_VOCAB_MISMATCH_NOTE =
  '任务词表口径已统一（引擎 stop-plan.mjs 为唯一 owner：只有 running 占执行，backlog/todo 为人工列）；'
  + '本层只放出 running 行并留 excludedTasks 审计'

/** 一次发现的原始输入。任何一项 `undefined` 都表示"这一类**没被真正取到**"，不是"这一类是 0 个"。 */
const ATTEMPT_KEYS = Object.freeze(['sessions', 'subagents', 'tasks', 'jobs'])

/**
 * `host-adapter.mjs` 的出处台账**必须**覆盖的键（套件据此防"台账被悄悄删项"）。
 * 为什么这条断言值得存在：台账是"有出处的事实 vs 未真机验证"的**唯一**分界记录，
 * 少了哪一条，"未验证"就会被默认当成"已验证"。
 */
export const HOST_CALLS_EXPECTED_KEYS = Object.freeze([
  'sessionList',
  'sessionCancel',
  'sessionPrompt',
  'sessionPage',
  'agentStatus',
  'agentCancel',
  'subagentListDescendants',
  'subagentListChildren',
  'subagentInterruptByParent',
  'jobsList',
  'jobsKill',
  'jobsGet',
  'sessionsFlush',
])

/**
 * 脚本**不允许**写"已验证"三个字（这三条停止原语在本阶段一次都没真机跑过）。
 * 放在这里而不是套件里：任何 import 本模块的人都能拿到这条口径。
 */
export const REAL_HOST_VERIFICATION_PENDING =
  '宿主调用未真机验证：dsh-personal-quickstop 尚未装机（docs/V1_2_I_D_HOST_PROBE.md §五·坑 2）；'
  + '本阶段只钉死了契约层出处，装机后须用 dedicated test Session + dummy bash 按实施计划 §五 复验'

/** 取数组，非数组一律当"没取到"（`null` 也是没取到 —— 官方接口不会返回"空数组"以外的空值）。 */
function asArray(value) {
  return Array.isArray(value) ? value : undefined
}

/** 只收集非空字符串，用于把"为什么这一类不可信"写成人能读懂的一句话。 */
function collectNotes(notes) {
  return notes.filter((note) => typeof note === 'string' && note !== '')
}

// ─────────────────────────────────────────────────────────────────────────────
// 会话
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 映射一行 `SessionSummary`（`$C:7145` / `$APP/dsh-api-session-controller/lib/typert.host.js:1800`）。
 *
 * 真机事实（有出处）：
 *   · `running: boolean` 的真实来源是**实时查 Agent 注册表**，不是事件推导位 ——
 *     `$APP/dsh-api-session-controller/lib/types/list.js:154`：
 *     `running: this.ctx.agents.get(session.id)?.status === 'running'`；底层词表 `$C:5452`
 *     `AgentStatus = 'idle' | 'running'`（**没有**第三个值）。
 *   · `SessionSummary` **没有** `title` 字段：`listFields()` 只带 `parentSessionId` / `origin` / `cwd`
 *     （`list.js:401-407`）⇒ 这里 `title` 恒为 `null`，标题属渲染层（客户端
 *     `displayTitleOf(entry.title, entry.cwd, entry.sessionId)`，`$APP/.../client/sessions/service.js:45-54`）。
 *   · 列表整体是 `{items: [...]}` 信封（`SessionListValue`，`typert.host.js:1696`），
 *     本函数吃的是**拆信后**的 `items`。
 *
 * ⚠️ `running` 只认**严格 `true`**（`=== true`）：字段缺失、`undefined`、`'true'` 字符串、
 * `0`/`1` 一律**不算在跑** —— 与引擎 `discoverActiveWork` 的 `row?.running === true` 同一判定，
 * 不给出第三种解释。
 */
export function mapSessionRow(row, { now } = {}) {
  if (row === null || typeof row !== 'object') {
    return { invalid: true, observed: row === null ? null : typeof row }
  }
  const sessionId = typeof row.sessionId === 'string' && row.sessionId !== '' ? row.sessionId : null
  return {
    // —— 引擎契约字段（`stop-plan.mjs:69-73`）——
    sessionId,
    title: typeof row.title === 'string' && row.title !== '' ? row.title : null,
    running: row.running === true,
    // —— 原始事实，逐条留证（便于审计"这个判断是从哪个字段来的"）——
    rawRunning: row.running === undefined ? null : row.running,
    hasRunningField: Object.prototype.hasOwnProperty.call(row, 'running'),
    parentSessionId: typeof row.parentSessionId === 'string' ? row.parentSessionId : null,
    origin: typeof row.origin === 'string' ? row.origin : null,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : null,
    blank: row.blank === true,
    at: now ?? null,
  }
}

/** 映射 `sessionController.list()` 的返回信封：`SessionListValue = {items: readonly SessionSummary[]}`。 */
export function mapSessionSummaries(value, options = {}) {
  const items = Array.isArray(value) ? value : asArray(value?.items)
  if (items === undefined) {
    return {
      rows: [],
      envelopeOk: false,
      notes: ['session-list-envelope-unrecognized（既不是数组，也没有 items 数组；未按 0 计）'],
    }
  }
  return { rows: items.map((row) => mapSessionRow(row, options)), envelopeOk: true, notes: [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 子代理
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 映射一行 `SubagentListEntry` / `SubagentDescendantListEntry`（`$C:7441` / `$C:7425`）。
 *
 * 真机事实（有出处）：
 *   · 宿主枚举 `ctx.subagents.listChildren(parentId, signal?)` / `listDescendants(rootId, signal?)`
 *     （`$C:3629` / `$C:3642`，返回 `Promise<SubagentListEntry[]>`）。
 *   · **子代理 id 的字段名是 `id`**（`childRow(id, …)`，`$APP/dsh-subagent/lib/index.js:2125-2141`），
 *     不是 `sessionId`；引擎却按 `row.sessionId` 取（`stop-plan.mjs:78`）⇒ 由本层改名。
 *   · 活动位在 `childRow` 里**是**填好的：live 行 `'running'`（`index.js:2021`），
 *     冷行 / 无 Agent 注册表时一律 `'inactive'`（`index.js:2080,2090,2122`），
 *     与 `catalogView` 的派生口径一致（`$APP/dsh-subagent/lib/types/control.js:53`）。
 *   · 直接子代行**没有** `parentId`（父就是调用时的 root）；只有 `listDescendants` 才补
 *     `parentId` / `depth`（`index.js:1948-1952`）⇒ 直接子代要由调用方传 `parentSessionId`。
 *
 * `kind: 'diagnostic'` 的行（`reason: 'corrupt' | 'unsupported' | 'unavailable'`）**没有** activity：
 * 这**不是**"没有活性字段所以未知"，而是"这颗子代理本身取不到确信身份" ⇒ 本层把它们放进
 * `diagnostics`，并让 `subagents` 源整体声明不可信（见 `buildDiscoverySnapshot`），
 * 而不是塞进引擎的 `unknown` 桶冒充"未知活性"。
 *
 * ⚠️ 本函数**只认宿主词表**，认不出或缺失时**原样透传**：`activity` 保留观察到的值（哪怕是 `'idle'`
 * 这种模型面词），并**不**写引擎的 `status` 字段 —— 引擎对"`activity` 与 `status` 两字段都认"
 * （`stop-plan.mjs:77-100`），本层若把模型面词写进 `status`，就等于把"模型面词表"偷渡进宿主面判定。
 */
export function mapSubagentRow(row, { parentSessionId = null, now } = {}) {
  if (row === null || typeof row !== 'object') {
    return { invalid: true, observed: row === null ? null : typeof row }
  }
  const id = typeof row.id === 'string' && row.id !== '' ? row.id : null
  if (row.kind === 'diagnostic') {
    return {
      diagnostic: true,
      sessionId: id,
      reason: typeof row.reason === 'string' ? row.reason : null,
      at: now ?? null,
    }
  }
  return {
    // —— 引擎契约字段（`stop-plan.mjs:84-89`）——
    sessionId: id,
    parentSessionId: typeof row.parentId === 'string' && row.parentId !== ''
      ? row.parentId
      : (parentSessionId ?? null),
    // —— 原样透传：词表外交给引擎的 unknown 桶（本层不提前吞掉）——
    activity: row.activity,
    // 宿主面向来不提供 status；显式不动它，让引擎走 activity 分支。
    // —— 原始事实 ——
    mode: typeof row.mode === 'string' ? row.mode : null,
    label: typeof row.label === 'string' ? row.label : null,
    depth: typeof row.depth === 'number' ? row.depth : null,
    hasChildren: row.hasChildren === true,
    observedActivityValue: row.activity === undefined ? null : row.activity,
    at: now ?? null,
  }
}

/**
 * 把若干次 `listChildren` / `listDescendants` 的结果拼成子代理输入。
 * `results` 形如 `[{parentSessionId, entries}]`（每次调用的**原始返回**，不拆信）。
 * 同一 id 出现多次（多会话各自展开时可能重合）**只留第一条**，并如实记 `duplicates`。
 */
export function mapSubagentResults(results = [], options = {}) {
  const rows = []
  const diagnostics = []
  const duplicates = []
  const seen = new Set()
  for (const result of Array.isArray(results) ? results : []) {
    const entries = asArray(result?.entries)
    if (entries === undefined) {
      diagnostics.push({
        sessionId: null,
        parentSessionId: result?.parentSessionId ?? null,
        reason: 'listing-returned-non-array',
      })
      continue
    }
    for (const entry of entries) {
      const mapped = mapSubagentRow(entry, { parentSessionId: result?.parentSessionId ?? null, now: options.now })
      if (mapped.invalid === true) { diagnostics.push({ sessionId: null, reason: 'row-not-an-object' }); continue }
      if (mapped.diagnostic === true) { diagnostics.push(mapped); continue }
      if (mapped.sessionId !== null && seen.has(mapped.sessionId)) {
        duplicates.push(mapped.sessionId)
        continue
      }
      if (mapped.sessionId !== null) seen.add(mapped.sessionId)
      rows.push(mapped)
    }
  }
  return { rows, diagnostics, duplicates }
}

// ─────────────────────────────────────────────────────────────────────────────
// 作业
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 映射一行 `JobSnapshot`（`$C:6217`）：
 * `{ id, kind, label, outputLimitBytes?, ownerSession?, status, detail?, startedAt, finishedAt?, reported }`。
 *
 * 真机事实（有出处）：
 *   · **归属字段叫 `ownerSession`**（`$APP/dsh-jobs-local/lib/index.js:318` 的 `snapshot()`
 *     把 `job.owner?.id` 写进 `ownerSession`），而引擎按 `row.sessionId` 读（`stop-plan.mjs:108`）⇒ 由本层改名。
 *   · 客户端控制流的 `jobView`（`$APP/dsh-api-session-controller/lib/types/control.js:181-191`）
 *     **根本不含归属** ⇒ 若将来有人想用客户端快照喂本层，那是一条**丢归属**的路，必须重新取数。
 *   · `jobs.list(caller)` 只返回 `owner === undefined || owner.id === caller.id` 的作业
 *     （`$APP/dsh-jobs-local/lib/index.js:178-181`）⇒ **见 `enumerateJobs` 的诚实边界**。
 *
 * 词表外交给引擎的 unknown 语义：本层把**词表外/缺失**的 `status` 原样透传并标 `unknown: true`
 * （引擎会把它从"活着的后台执行"里滤掉 ⇒ 本层**必须**同时声明 `jobs` 源不可信，
 * 否则就是拿"未知"当"0 个在跑"）。
 */
export function mapJobRow(row, { now } = {}) {
  if (row === null || typeof row !== 'object') {
    return { invalid: true, observed: row === null ? null : typeof row }
  }
  const id = typeof row.id === 'string' && row.id !== '' ? row.id : null
  const rawStatus = row.status
  const status = typeof rawStatus === 'string' ? rawStatus : null
  const unknown = status === null || !JOB_STATUSES.includes(status)
  return {
    // —— 引擎契约字段（`stop-plan.mjs:105-109`）——
    id,
    status,
    sessionId: typeof row.ownerSession === 'string' && row.ownerSession !== '' ? row.ownerSession : null,
    label: typeof row.label === 'string' ? row.label : null,
    // —— 原始事实 ——
    kind: typeof row.kind === 'string' ? row.kind : null,
    terminal: status !== null && !LIVE_JOB_STATUSES.includes(status) && JOB_STATUSES.includes(status),
    unknown,
    observedStatusValue: rawStatus === undefined ? null : rawStatus,
    at: now ?? null,
  }
}

/**
 * 作业枚举的**诚实边界**（这一段是本文件最重要的输出之一，别当成注释噪音）。
 *
 * 官方 `jobs` 面**没有"列出全部"的入口**：
 *   · `jobs.list(caller?)` 是按 caller 过滤的可见集（`$APP/dsh-jobs-local/lib/index.js:178-181`）；
 *   · 拿别人的 owner 当 caller 会被 `assertAccess` 拒（`:313-315`，报
 *     `job <id> belongs to another session`）；
 *   · `jobs.get/read/kill/wait` 都先 `assertAccess`，`foreign job` 直接抛。
 * ⇒ 宿主插件（这个第三方插件的上下文里）**只可能**看到 `caller === undefined` 的可见集
 *   （unowned 作业）与"我们明确知道 owner 的那些会话"的作业。**别的会话的作业不可枚举，
 *   也不可 kill** —— 这就是"未知 ≠ 0"，必须在快照里如实声明，而不是返回 `[]`。
 *
 * 调用形态（每次一个 owner，避免把 caller 用错 —— 坑 5 的授权边界，`$APP/dsh-jobs/README.zh.md:36`）：
 *   `for (const agent of agents) { jobs.list(agent) }` → 按 `ownerSession` 去重。
 *
 * @param {{ unowned?: ReadonlyArray, byOwner?: ReadonlyArray<{sessionId: string, ownerReachable: boolean, jobs?: ReadonlyArray}> }} input
 */
export function enumerateJobs(input = {}) {
  const rows = []
  const owners = []
  const notes = []
  const unowned = asArray(input.unowned)
  if (unowned !== undefined) {
    for (const job of unowned) {
      const mapped = mapJobRow(job)
      if (mapped.invalid === true) { notes.push('unowned-job-row-not-an-object'); continue }
      rows.push({ ...mapped, ownerReachable: false, unowned: true })
    }
  }
  for (const entry of Array.isArray(input.byOwner) ? input.byOwner : []) {
    const sessionId = typeof entry?.sessionId === 'string' ? entry.sessionId : null
    const jobs = asArray(entry?.jobs)
    const ownerReachable = entry?.ownerReachable === true
    owners.push({ sessionId, ownerReachable, count: jobs === undefined ? null : jobs.length })
    if (jobs === undefined) {
      notes.push(`owner-${sessionId ?? 'unknown'}-jobs-not-read`)
      continue
    }
    for (const job of jobs) {
      const mapped = mapJobRow(job)
      if (mapped.invalid === true) { notes.push(`owner-${sessionId ?? 'unknown'}-job-row-not-an-object`); continue }
      rows.push({ ...mapped, ownerReachable, unowned: false })
    }
  }
  // 去重（同一 job 可能既出现在 unowned 集里又出现在某个 owner 集里 —— 以第一条为准）。
  const deduped = []
  const seen = new Set()
  for (const row of rows) {
    if (row.id !== null && seen.has(row.id)) continue
    if (row.id !== null) seen.add(row.id)
    deduped.push(row)
  }
  return { rows: deduped, owners, notes }
}

/**
 * 作业源不可信的**固定理由**（只要作业被枚举过就带上）。
 * 为什么不带 `unavailableSources` 就无法诚实：见 `enumerateJobs` 的边界说明。
 */
export const JOBS_PARTIAL_REASON =
  '作业面按 caller 过滤（dsh-jobs-local/lib/index.js:178-181 的 list + :313-315 的 assertAccess 授权位）：'
  + '非已知 owner 的会话作业既不可枚举也不可 kill ⇒ 作业计数**不可信**（不是 0）；'
  + 'owner 已不在 live 注册表时同样拿不到 caller（$APP/dsh-jobs/README.zh.md:36 的授权边界）'

/** 任务源不可用的固定理由（当前两条取数路都没接线，见需求/实施计划的 I-D 范围）。 */
export const TASKS_NOT_WIRED_REASON =
  '任务看板无 cordis 服务面（src/host-service.ts:13 是裸 class，非 Service 子类）⇒ 只有 '
  + 'HTTP GET /api/task-board/state 或读 ~/.dsh/task-board/ledger-v2.json 两条路；'
  + '两条在本阶段都未接线 ⇒ 任务计数**不可信**（不是 0）'

// ─────────────────────────────────────────────────────────────────────────────
// 任务
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 映射一行任务账本记录（`TaskRecord`，字段清单见侦查 §4.5 实测：
 * `archivedAt, createdAt, description, executions, id, permission, permissionConfirmedAt, prompt, schedule, status, title, updatedAt`）。
 *
 * 引擎契约字段是 `taskId`（`stop-plan.mjs:104`），账本里的字段叫 `id` ⇒ 本层改名。
 * `executions[].result ∈ {succeeded, failed, cancelled}`（`src/protocol.ts:116`）；`executions[].sessionId`
 * 是与会话的连接键（实施计划 §二 已声明）。
 *
 * 只放 `running` 行（见 `TASK_VOCAB_MISMATCH_NOTE`）；其余行进 `excludedTasks` 供审计，
 * **不**静默丢弃，也**不**改写成别的状态值（改状态 = 造假）。
 */
export function mapTaskRow(row, { now } = {}) {
  if (row === null || typeof row !== 'object') {
    return { invalid: true, observed: row === null ? null : typeof row }
  }
  const taskId = typeof row.id === 'string' && row.id !== '' ? row.id : null
  const status = typeof row.status === 'string' ? row.status : null
  const inVocab = status !== null && TASK_STATUSES.includes(status)
  return {
    taskId,
    title: typeof row.title === 'string' && row.title !== '' ? row.title : null,
    status,
    archived: typeof row.archivedAt === 'number',
    executionSessionIds: (Array.isArray(row.executions) ? row.executions : [])
      .map((execution) => (typeof execution?.sessionId === 'string' ? execution.sessionId : null))
      .filter((id) => id !== null),
    inVocab,
    live: inVocab && LIVE_TASK_STATUSES.includes(status),
    at: now ?? null,
  }
}

/**
 * 把任务账本（`{schemaVersion, revision, tasks, scheduler, power}`，侦查 §4.4 真机响应形状）映射成
 * 引擎输入 + 审计信息。`revision` / `scheduler` / `power` 原样带出（不做判断，只做证据）。
 */
export function mapTaskLedger(ledger, { now } = {}) {
  const tasks = asArray(ledger?.tasks)
  if (tasks === undefined) {
    return {
      rows: [],
      excludedTasks: [],
      unrecognized: [],
      revision: null,
      scheduler: null,
      power: null,
      notes: ['ledger-tasks-not-an-array（未按 0 计）'],
    }
  }
  const rows = []
  const excludedTasks = []
  const unrecognized = []
  for (const task of tasks) {
    const mapped = mapTaskRow(task, { now })
    if (mapped.invalid === true) { unrecognized.push({ taskId: null, reason: 'row-not-an-object' }); continue }
    if (mapped.status === null || !mapped.inVocab) {
      // 词表外/缺失：**保守** —— 不当作在跑（不虚报要停的东西），也不当作已知终态。
      unrecognized.push({ taskId: mapped.taskId, observedStatus: mapped.status, reason: 'task-status-outside-vocabulary' })
      excludedTasks.push({ ...mapped, excludedReason: 'unrecognized-status' })
      continue
    }
    if (!mapped.live) {
      excludedTasks.push({ ...mapped, excludedReason: 'known-inactive-status' })
      continue
    }
    rows.push(mapped)
  }
  return {
    rows,
    excludedTasks,
    unrecognized,
    revision: typeof ledger?.revision === 'number' ? ledger.revision : null,
    scheduler: ledger?.scheduler ?? null,
    power: ledger?.power ?? null,
    notes: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 快照组装（引擎契约的收敛点）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 组装 `discoverActiveWork` / `buildStopPlan` 能吃的快照。
 *
 * @param {object} raw
 * @param {object} [raw.sessionList]   `ctx.sessionController.list()` 的**原始返回**（`{items}` 信封）
 * @param {Array}  [raw.subagentResults] `[{parentSessionId, entries}]`（每次 list* 的**原始返回**）
 * @param {object} [raw.jobInput]      `enumerateJobs` 的输入（`{unowned, byOwner}`）
 * @param {object} [raw.taskLedger]    任务账本对象（HTTP 响应或 `ledger-v2.json` 解析结果）
 * @param {object} [options]
 * @param {boolean} [options.tasksAttempted] 任务取数**是否真的做过**（默认 `false` ⇒ 声明不可用）
 * @param {string} [options.tasksReason] 任务不可用的具体理由（例如"没接线"/"HTTP 500"）
 * @param {boolean} [options.jobsComplete] 调用方**明确声明**"作业面这次是完整的"（默认 `false`）
 * @param {(string|{name: string, reason?: string})[]} [options.extraUnavailable]
 *   额外如实声明的源；字符串或 `{name, reason}` 都吃（`reason` 会替代该源的默认理由）
 *
 * 输出：
 *   · `snapshot` —— 引擎输入。四类数组**只在真取到时**才是数组；取不到时该键**不存在**
 *     （引擎对缺失即空数组，但那一定是**同时**声明了 `unavailableSources` 的情形）。
 *   · `audit` —— 给套件与验收报告看的完整证据（映射前后、被排除的行、诊断行、去重、理由）。
 */
export function buildDiscoverySnapshot(raw = {}, options = {}) {
  const { now = null } = options
  const audit = {
    sessions: null,
    subagents: null,
    jobs: null,
    tasks: null,
    unavailable: [],
    attempted: {},
    notes: [],
  }
  const snapshot = {}
  const unavailable = []
  const attempted = {}

  // ── 会话 ────────────────────────────────────────────────────────────────
  if (raw.sessionList === undefined || raw.sessionList === null) {
    attempted.sessions = false
    unavailable.push({ name: 'sessions', reason: 'session-enumeration-not-attempted' })
  } else {
    attempted.sessions = true
    const mapped = mapSessionSummaries(raw.sessionList, { now })
    snapshot.sessions = mapped.rows
    audit.sessions = mapped
    if (mapped.envelopeOk !== true) {
      // 信封认不出 ⇒ 我们**没有**真的读到会话行，不能让它变成"0 个会话"。
      unavailable.push({ name: 'sessions', reason: 'session-list-envelope-unrecognized' })
    }
  }

  // ── 子代理 ──────────────────────────────────────────────────────────────
  if (raw.subagentResults === undefined || raw.subagentResults === null) {
    attempted.subagents = false
    unavailable.push({ name: 'subagents', reason: 'subagent-enumeration-not-attempted' })
  } else {
    attempted.subagents = true
    const mapped = mapSubagentResults(raw.subagentResults, { now })
    snapshot.subagents = mapped.rows
    audit.subagents = mapped
    if (mapped.diagnostics.length > 0) {
      // 有诊断行 ⇒ 这颗子代理的身份/活性**取不到确信值**。整源如实标不可信，而不是悄悄少一条。
      const reasons = [...new Set(mapped.diagnostics.map((row) => row.reason ?? 'unknown'))].join(',')
      unavailable.push({ name: 'subagents', reason: `subagent-listing-diagnostics:${reasons}` })
    }
  }

  // ── 作业 ────────────────────────────────────────────────────────────────
  if (raw.jobInput === undefined || raw.jobInput === null) {
    attempted.jobs = false
    unavailable.push({ name: 'jobs', reason: 'job-enumeration-not-attempted' })
  } else {
    attempted.jobs = true
    const enumerated = enumerateJobs(raw.jobInput)
    snapshot.jobs = enumerated.rows
    audit.jobs = enumerated
    // **作业被取到了也仍然不可信**（见 JOBS_PARTIAL_REASON）—— 除非调用方明确声明"整套都拿到了"。
    if (options.jobsComplete !== true) {
      unavailable.push({ name: 'jobs', reason: JOBS_PARTIAL_REASON })
    }
    const unknownJobs = enumerated.rows.filter((row) => row.unknown === true)
    if (unknownJobs.length > 0) {
      const observed = [...new Set(unknownJobs.map((row) => JSON.stringify(row.observedStatusValue)))].join(',')
      audit.notes.push(`job-status-outside-official-vocabulary:${observed}`)
    }
  }

  // ── 任务 ────────────────────────────────────────────────────────────────
  if (options.tasksAttempted !== true || raw.taskLedger === undefined || raw.taskLedger === null) {
    attempted.tasks = false
    unavailable.push({ name: 'tasks', reason: options.tasksReason ?? TASKS_NOT_WIRED_REASON })
  } else {
    attempted.tasks = true
    const mapped = mapTaskLedger(raw.taskLedger, { now })
    snapshot.tasks = mapped.rows
    audit.tasks = mapped
    if (mapped.unrecognized.length > 0) {
      const observed = [...new Set(mapped.unrecognized.map((row) => JSON.stringify(row.observedStatus ?? null)))].join(',')
      unavailable.push({ name: 'tasks', reason: `task-status-outside-vocabulary:${observed}（保守：不当作在跑）` })
    }
    // 注：口径结案记录（TASK_VOCAB_MISMATCH_NOTE）**不再**推进 `unavailableSources`。
    // 理由：账本真取到时它就是**可用**的源，把可用源标成不可用是"反向撒谎"（UI 会据此显示 ⚠）。
    // 审计信息留在 `audit.tasks`（rows / excludedTasks / unrecognized）里，不占用可用性通道。
  }

  // 调用方额外如实声明的源（例如"这一类取数抛错了"）。
  // `reason` 是**更具体**的观察（服务缺失 / 调用抛错），所以它**改写**该源的默认理由 ——
  // 引擎侧的 `unavailableSources` 是"一名一理由"的形状，具体理由对真机定位更有价值。
  for (const entry of Array.isArray(options.extraUnavailable) ? options.extraUnavailable : []) {
    const name = typeof entry === 'string' ? entry : entry?.name
    if (typeof name !== 'string' || name === '') continue
    const reason = typeof entry === 'object' && entry !== null && typeof entry.reason === 'string'
      ? entry.reason
      : 'declared-unavailable-by-caller'
    const existing = unavailable.find((row) => row.name === name)
    if (existing === undefined) unavailable.push({ name, reason })
    else existing.reason = reason
  }

  // 源名只在四类词表内（拼错的**照样带上**并标 unrecognized —— 免得"拼错字段名 ⇒ 静默变成可用"）。
  const normalized = []
  for (const row of unavailable) {
    if (SOURCE_NAMES.includes(row.name)) normalized.push({ name: row.name, reason: collectNotes([row.reason])[0] ?? null })
    else normalized.push({ name: String(row.name), reason: row.reason ?? 'unrecognized-source-name', unrecognized: true })
  }

  snapshot.unavailableSources = normalized
  audit.unavailable = normalized
  audit.attempted = attempted
  audit.notes = [...audit.notes, ...(audit.sessions?.notes ?? []), ...(audit.tasks?.notes ?? []), ...(audit.jobs?.notes ?? [])]

  for (const key of ATTEMPT_KEYS) {
    if (attempted[key] === false) audit.notes.push(`source-not-attempted:${key}`)
  }

  return { snapshot, audit }
}

/**
 * 主机侧服务缺失 ⇒ 把"这一类取不到"翻译成 `unavailableSources` 的固定理由。
 * 宿主插件里 `ctx.get('sessions')` 拿不到**只可能**是 inject 没声明或加载顺序问题
 * （真机缺陷先例：`server/index.js:7-9`）⇒ 这种情况绝不是"这类工作为 0"。
 */
export function reasonForMissingService(serviceKey) {
  return `host-service-not-mounted:${serviceKey}（inject 声明或加载顺序问题，非"这一类为 0"；先例 server/index.js:7-9）`
}

// ─────────────────────────────────────────────────────────────────────────────
// G5 交接（I5）：投递 / 读回 / 判定 —— **全部是纯函数**
// ─────────────────────────────────────────────────────────────────────────────
//
// 为什么放在这个文件：交接的"何时算成功"必须是**可断言的纯判定**，不能散在 `ctx` 调用里。
// 投递与读回本身（`prompt` / `page` / `whenIdle`）由 `host-adapter.mjs` 落。
//
// ⚠️【未真机验证】本节的契约来自类型权威与官方实现，**没有任何一次真机调用**：
//   · `sessionController.prompt`：`$C:2196` `@Remote('prompt') prompt(request: SessionPromptRequest, signal)`
//     —— "Admit one prompt after explicitly resuming its Session."；`SessionPromptRequest` 形状见
//     `$C:7044`：`{requestId, sessionId, mode: 'queue'|'steer', content, clientTimeZone?}`；
//     `SessionPromptValue = {accepted: true}`（`$C:7048`）。
//   · 宿主**可否直调** `prompt`：**推断**（同一服务、同一 `@Remote` 家族的 `cancel` 已被侦察证实
//     `invocation:{kind:'direct'}`，见 `$APP/dsh-api-session-controller/lib/typert.host.js:741-749`），
//     装机后必须用真会话复验。
//   · `page`：`$C:2226+` 区块的 `@Remote('page') page(request: SessionPageRequest, signal)`
//     —— "Read one cold-safe, message-aligned Session history page."；`SessionPageRequest`（`$C:6996`）
//     的 `throughSeq` 传 `-1` 即"读到最新"（实现 `$APP/dsh-api-session-controller/lib/index.js:1212`
//     `request.throughSeq === -1 ? -1 : …`）。**这条也是读代码得出，未真机验证。**
//   · **返回的 `accepted: true` 只代表"被接收"**，不代表对方已经交接完 —— 故判定只认可观测量与读回内容。

/** G5 要求的 11 项（`docs/V1_2_I_H_REQUIREMENTS.md:238-251` 逐条，不自造清单）。 */
export const HANDOFF_FIELDS = Object.freeze([
  { key: 'originalGoal', label: '原始目标' },
  { key: 'completedWork', label: '已完成内容' },
  { key: 'currentWork', label: '当前正在做什么' },
  { key: 'currentPhase', label: '当前停在什么位置' },
  { key: 'relevantFiles', label: '已修改文件' },
  { key: 'uncommittedChanges', label: '尚未提交的修改' },
  { key: 'testsRun', label: '已运行测试' },
  { key: 'testsNotRun', label: '未运行测试' },
  { key: 'unresolvedIssues', label: '当前错误/风险' },
  { key: 'nextAction', label: '下一步应该从哪里继续' },
  { key: 'contextForResume', label: '继续时需要知道的重要上下文' },
])

/**
 * G5 交接指令（**逐字照需求原文的 11 条**，只加"用 `键: 值` 输出"这一条格式要求，
 * 因为读回的是文本消息、没有结构化槽位 —— 不发明清单，只约束表达形式）。
 * 明确写入「不要开始新的大步骤 / 不要做完整个任务」，这是原文 `:254-264` 的 SAFE CHECKPOINT 要求。
 */
export function buildHandoffInstruction() {
  const lines = HANDOFF_FIELDS.map((field) => `- ${field.key}: ${field.label}`)
  return [
    '用户请求暂时停止当前工作。',
    '',
    '不要开始新的大步骤，也不要把整个任务做完；请立即整理当前工作状态，尽快达到一个安全续接点，然后结束当前执行。',
    '',
    '请严格按下面 11 行的键名逐行输出（每行 `键: 值`，值可以是简短的多项，用顿号或分号分隔；确实为空的写「无」）：',
    ...lines,
  ].join('\n')
}

/**
 * 从会话历史页里抽出**人类可读的文本**。
 *
 * 页记录有两种（`$C:6840` `SessionEventEntry = {type:'event', event}` / `$C:6816`
 * `SessionChunkRun = {type:'chunks', event}`），`event` 形状为 `SessionWireEvent`
 * （`$C:7220`：`{type, seq, time, data, ignorable?, sourceEventSeqs?, surfaceOp?}`）。
 * `data` 是**任意 JSON**（`JsonValue`）⇒ 这里只做"尽力而为的递归取串"，并如实返回**失败了没有**：
 * 抽不到文本时返回 `text: ''` + `empty: true`，由判定函数把它算作"交接未完成"，不冒充拿到内容。
 */
export function collectTextFromPage(page) {
  const records = asArray(page?.records)
  if (records === undefined) return { text: '', records: [], empty: true, hasMore: false }
  const parts = []
  const seen = []
  for (const record of records) {
    const event = record?.event ?? record
    const seq = typeof event?.seq === 'number' ? event.seq : null
    const time = typeof event?.time === 'number' ? event.time : null
    const type = typeof event?.type === 'string' ? event.type : null
    const extracted = extractStrings(event?.data)
    seen.push({ seq, time, type, chars: extracted.length })
    if (extracted.length > 0) parts.push(...extracted)
  }
  const text = parts.join('\n').trim()
  return {
    text,
    records: seen,
    empty: text === '',
    hasMore: page?.hasMore === true,
  }
}

/** 递归取 `data` 里的字符串，深度/条数上界写死（不信任远端结构，避免病态数据把内存吃满）。 */
function extractStrings(value, depth = 0, out = []) {
  if (depth > 6 || out.length > 2000 || value === null || value === undefined) return out
  if (typeof value === 'string') { out.push(value); return out }
  if (Array.isArray(value)) {
    for (const item of value) extractStrings(item, depth + 1, out)
    return out
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) extractStrings(value[key], depth + 1, out)
  }
  return out
}

/**
 * 从交接答复的**纯文本**里解析 11 个键。
 *
 * 判定是**结构化**的：键名出现 + 值不是空/占位（`无` / `none` / `N/A` / `-` / `null` / 空串）
 * 才算给到。不认识的键进 `ignored`（如实留痕，不静默丢）。
 * 多行值：后续**不是 `键:` 开头的行**续到当前键（模型常把多行值缩进或直接换行）。
 */
export function parseHandoffReply(text) {
  const source = typeof text === 'string' ? text : ''
  const found = {}
  const order = []
  let current = null
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    const match = /^[-*•]?\s*([A-Za-z][A-Za-z0-9_]*)\s*[:：]\s*(.*)$/.exec(line)
    if (match !== null && HANDOFF_FIELDS.some((field) => field.key === match[1])) {
      current = match[1]
      if (!order.includes(current)) order.push(current)
      found[current] = match[2].trim()
      continue
    }
    if (current !== null) found[current] = `${found[current]} ${line}`.trim()
  }
  const placeholders = new Set(['无', 'none', 'n/a', 'na', '-', '—', 'null', 'undefined', ''])
  const present = []
  const missing = []
  for (const field of HANDOFF_FIELDS) {
    const value = found[field.key]
    const usable = typeof value === 'string' && !placeholders.has(value.toLowerCase())
    if (usable) present.push(field.key)
    else missing.push(field.key)
  }
  const ignored = order.filter((key) => !HANDOFF_FIELDS.some((field) => field.key === key))
  return {
    fields: found,
    present,
    missing,
    ignored,
    complete: missing.length === 0,
  }
}

/**
 * 读回的文本 → 引擎要的 `checkpoint` 形状。
 * 键名映射是**忠实**的：G5 的 `testsRun`/`testsNotRun` 合成 `testsStatus`
 * （`interrupt-store.mjs:36-46` 的 `CHECKPOINT_REQUIRED_FIELDS` 要 `testsStatus`），
 * `currentPhase` 在两侧同名（G5 的「当前停在什么位置」）。
 * ⚠️ 缺失的字段**留 `null`**（不编造），让 `validateCheckpoint` 如实判不完整。
 */
export function checkpointFromHandoffFields(fields = {}) {
  const value = (key) => {
    const raw = fields[key]
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
  }
  return {
    originalGoal: value('originalGoal'),
    currentPhase: value('currentPhase'),
    completedWork: value('completedWork'),
    currentWork: value('currentWork'),
    nextAction: value('nextAction'),
    relevantFiles: value('relevantFiles'),
    gitState: value('uncommittedChanges'),
    testsStatus: {
      run: value('testsRun'),
      notRun: value('testsNotRun'),
    },
    unresolvedIssues: value('unresolvedIssues'),
    // G5 额外项：引擎的必填集里没有，但需求原文要求保存 ⇒ 一并带上，不丢。
    contextForResume: value('contextForResume'),
  }
}

/** 可观测量的强弱 —— **不许**把弱证据说成强证据。 */
export const OBSERVABLE_STRENGTH = Object.freeze({
  /** 官方 `JobStatus` 终态（`isTerminal`，`$APP/dsh-jobs-local/lib/index.js:79-81`）：作业真的结束了。 */
  jobTerminal: 'strong',
  /** `ctx.agents.get(id)?.status === 'idle'`（`$C:5452`）或 `await agent.whenIdle()`：这名 agent 的驱动已静。 */
  agentIdle: 'strong',
  /**
   * 子代理 `activity === 'inactive'`：**弱**证据 —— 它也可能是"**从未有过 driver**"
   * （`$APP/dsh-subagent/lib/types/control.js:53` 的派生：`agents?.get(id)?.status === 'running' ? 'running' : 'inactive'`；
   * 无 Agent 注册表时每一行都是 `inactive`；冷行也一律 `inactive`）。**不能单独当作"是我们停掉的"证据。**
   */
  subagentInactive: 'weak',
})

/**
 * 判定一次 G5 交接是否真的完成。输入全是**可观测的原始事实**，没有一个是"调用返回的 accepted"。
 *
 * @param {object} input
 * @param {boolean} input.promptAccepted       `prompt(mode:'steer')` 是否回 `{accepted:true}`（**只算投递成功，不算交接成功**）
 * @param {string|null} input.promptError      投递失败的原因（有则直接判未完成）
 * @param {'idle'|'running'|'unknown'} input.agentState 等待后的**可观测**状态
 * @param {boolean} input.idleTimedOut         等待静止是否超时（宽限期语义）
 * @param {object|null} input.page             `page(...)` 的原始返回
 * @param {string|null} input.pageError        读回失败的原因
 */
export function judgeHandoff(input = {}) {
  const facts = {
    promptAccepted: input.promptAccepted === true,
    promptError: input.promptError ?? null,
    agentState: input.agentState === 'idle' || input.agentState === 'running' ? input.agentState : 'unknown',
    idleTimedOut: input.idleTimedOut === true,
    pageError: input.pageError ?? null,
  }
  const fail = (reason, extra = {}) => ({ ok: false, reason, facts, checkpoint: null, ...extra })
  if (facts.promptError !== null) return fail('handoff-prompt-not-delivered')
  if (facts.promptAccepted !== true) return fail('handoff-prompt-not-accepted')
  // 投递成功之后，"已交接"必须来自可观测量：驱动没静下来就**不许**说交接完成。
  if (facts.idleTimedOut === true) return fail('handoff-grace-expired')
  if (facts.agentState !== 'idle') return fail('handoff-agent-not-observed-idle')
  if (facts.pageError !== null) return fail('handoff-readback-failed')
  const page = collectTextFromPage(input.page ?? null)
  if (page.empty) return fail('handoff-reply-empty', { readback: page })
  const parsed = parseHandoffReply(page.text)
  if (parsed.complete !== true) {
    return fail('handoff-reply-incomplete', { readback: page, missing: parsed.missing, parsed })
  }
  return {
    ok: true,
    reason: null,
    facts,
    readback: page,
    parsed,
    checkpoint: checkpointFromHandoffFields(parsed.fields),
  }
}
