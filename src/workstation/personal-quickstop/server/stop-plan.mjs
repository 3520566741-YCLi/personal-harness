// dsh-personal-quickstop — 停止计划 / 冻结闸门 / 宽限期流程（V1.2-I 阶段 I-A，纯引擎）
//
// 本文件**没有任何 IO**：全部输入是快照与时钟，全部输出是判定与文案 ⇒ 可被套件逐条钉死。
// 真机取数（官方 sessions / jobs / subagents / task board）属于 I-D，接线不在本文件里假装完成。
//
// 诚实边界（写死在注释里，防漂移）：
//   ① 这里判"活着的"用的都是**官方已核实的词表**：
//      · 会话：官方 `sessions.list` 的 `running` 布尔位（预检已复核；侧栏同一来源）
//      · 作业：`JobStatus = running|stopping|completed|killed|failed`（`dsh-tool-cordis/lib/index.js:6225`）
//      · 子代理：**宿主** `SubagentSummary.activity = 'running' | 'inactive'`
//        （I-D 真机侦查已复核，见 docs/V1_2_I_D_HOST_PROBE.md）；
//        模型面 list_agents 另有 `running / idle / ready` 派生词（`ready` = agents.get(id)===undefined），
//        故两种形状都认，**认不出的既不当作在跑、也不静默丢掉**（进 unknown 桶，见 discoverActiveWork）
//      · 任务：Task Board 是**第三方**账本，状态词表 `backlog|todo|running|done|failed` 由 I-D
//        从账本源码实测钉死（`@linxin666/dsh-client-ui-task-board/src/core/tasks.ts:11`）。
//        该词表的**唯一 owner 是 `./discovery.mjs`**（真机取数的那一层），本文件 import 它 —— 
//        「一处定义、两处使用」，不允许第二份默认集合（I-D 侦查曾指出旧默认缺 `backlog`/`todo`
//        ⇒ 会把"待规划/待办"虚报成"要停的工作"，已按官方词表改正）；
//        词表外的值**既不当作在跑、也不静默丢弃**（进 unknown 桶）
//   ② G4「冻结新工作」在官方层**没有**闸门（预检已枚举官方服务，不存在 admission / hook-bus 原语）。
//      故 `createAdmissionGate` 是**我们自己的层**：只拦我们这条链路上的派生，
//      它**不能**声称拦住了所有派生 —— UI 与文档必须如实说明。

/** I6/G7：默认宽限期。需求只说「设计合理 Grace Period」，故取值集中在常量里，便于一处裁定。 */
export const DEFAULT_GRACE_MS = 20_000
/** 官方 JobStatus 里仍占执行的两种（`stopping` 还没停干净，算活）。 */
export const LIVE_JOB_STATUSES = Object.freeze(['running', 'stopping'])

/** 官方 JobStatus 里已终结的三种。 */
export const TERMINAL_JOB_STATUSES = Object.freeze(['completed', 'killed', 'failed'])

/**
 * 子代理「仍在执行」的判定 —— 两个来源各自的字段与词表（**别混用**）：
 *   · 宿主面：字段 `activity`，值 `'running' | 'inactive'`（I-D 复核；权威见侦查文档）
 *   · 模型面：字段 `status`，值 `'running' | 'idle' | 'ready'`（list_agents 派生）
 * 只有 `'running'` 占执行；`'inactive'` / `'idle'` / `'ready'` 都是**已知不在执行**。
 */
export const LIVE_AGENT_ACTIVITIES = Object.freeze(['running'])
export const LIVE_AGENT_STATUSES = Object.freeze(['running'])
/** 已知「不在执行」的两个词表（用于把"已知不在跑"与"压根判不出"区分开）。 */
export const INACTIVE_AGENT_ACTIVITIES = Object.freeze(['inactive'])
export const INACTIVE_AGENT_STATUSES = Object.freeze(['idle', 'ready'])

/** 发现面的四类源（与快照字段同名）——`unavailableSources` 只能用这些名字。 */
export const DISCOVERY_SOURCES = Object.freeze(['sessions', 'subagents', 'tasks', 'jobs'])

/** G4 要拦的四类派生（需求原文列举）。 */
export const ADMISSION_KINDS = Object.freeze(['task', 'agent', 'subagent', 'background'])

/**
 * 任务看板官方状态词表（**唯一 owner 就是本文件**：本文件是判定"占不占执行"的那一层，
 * 且它必须保持**零 import**（客户端 bundle 直接 import 本文件取文案 —— 见 smoke-v12i-client-render
 * 的纯度断言），所以词表定义在这里、由 `discovery.mjs` **反向 import** 使用）。
 *
 * 出处（I-D 真机侦查复核）：第三方 `@linxin666/dsh-client-ui-task-board@0.3.16`
 * `src/core/tasks.ts:11` = `'backlog' | 'todo' | 'running' | 'done' | 'failed'`；
 * 五列定义见同文件 `:214-220`；`backlog`/`todo` 是人工列（`MANUAL_STATUSES`，`:223`）。
 *
 * ⚠️ 历史缺陷（I-D 侦查发现、已改正）：旧默认集合是**我们自己手写的一份猜测**
 * （`done/completed/cancelled/…`，缺 `backlog`/`todo`），而过滤写成"不在集合里 ⇒ 就是在跑"
 * ⇒ 会把「待规划/待办」**虚报**成"要停的工作"。现在按官方 5 值三态判定（见 discoverActiveWork）。
 */
export const TASK_STATUSES = Object.freeze(['backlog', 'todo', 'running', 'done', 'failed'])
/** 官方词表里**唯一**占执行的状态。 */
export const LIVE_TASK_STATUSES = Object.freeze(['running'])
/** 官方词表里已知**不占用执行**的四个（人工列 + 终态列）。 */
export const INACTIVE_TASK_STATUSES = Object.freeze(['backlog', 'todo', 'done', 'failed'])
/** 已废弃的旧名（兼容既有引用），值 = `INACTIVE_TASK_STATUSES`。 */
export const TASK_INACTIVE_STATUSES = INACTIVE_TASK_STATUSES

/** I3 原文文案（逐字，不润色）。 */
export const QUICK_STOP_TEXTS = Object.freeze({
  tooltip: '快速停止当前运行中的任务和会话，并保存续接状态',
  noWork: '当前没有正在运行的任务或会话。',
  title: '快速停止当前工作？',
  note: 'Harness 会先保存当前进度和续接信息，再有序停止。',
  cancel: '取消',
  confirm: '快速停止',
  doneTitle: '快速停止完成',
  doneNote: '所有可恢复工作已保存续接点。',
})

/**
 * I13（需求原文 G13「RESUME EXPERIENCE」，`docs/V1_2_I_H_REQUIREMENTS.md:496-520`）的文案**唯一 owner**。
 *
 * 逐条标出处，谁是需求原文、谁是我起草的，不许混：
 *   · `barTitleTemplate` / `continueLabel` / `phaseLine` / `completedLine` / `nextLine` / `noReexplain`
 *     —— **需求原文逐字**（`{time}` / `{value}` 是变量占位，套件会逐字对撞需求文件）。
 *   · 其余（accepted / noCheckpoint / incomplete / readFailed / unknownTime / missingValue / 指令头尾）
 *     —— **代理起草**（需求原文没给这些句子）。凡起草句都在 CHANGELOG/报告里注明来源，
 *     并已登记进待用户定稿清单（与 D5 同款处理）；**不许**冒充需求原文。
 */
export const RESUME_TEXTS = Object.freeze({
  /** 需求原文 G13（`:503`）：“该会话于 <time> 被快速停止。” */
  barTitleTemplate: '该会话于 {time} 被快速停止。',
  /** 需求原文 G13（`:507`）的按钮；原文写作 `[继续]`，方括号是**按钮记法**，标签即「继续」。 */
  continueLabel: '继续',
  /** 需求原文 G13（`:515-516`）：`上次停在：` 单独一行、值在下一行（原文样例的版式逐字保留）。 */
  phaseLabel: '上次停在：',
  phaseLine: '上次停在：\n{value}',
  /** 需求原文 G13（`:517-518`）：这两句的值与标签同行。 */
  completedLine: '已完成 {value}',
  nextLine: '下一步 {value}',
  /** 需求原文 G13（`:520`）。 */
  noReexplain: '不要要求用户重新解释整个任务。',
  // ↓↓↓ 以下为代理起草（非需求原文），待用户定稿 ↓↓↓
  acceptedNote: '已把续接点送回会话（宿主已受理；这不等于 Agent 已经跑完）。',
  noCheckpointNote: '⚠ 这次停止没有留下续接点内容。',
  incompleteNote: '⚠ 续接点不完整，缺：{fields}',
  /** 记录只说"不完整"、没带缺失字段清单时（`/state` 的记录就是这种）—— 不编具体字段名。 */
  missingFieldsUnknown: '（字段清单未提供）',
  readFailedTitle: '中断记录读取失败',
  unknownTime: '未知时间',
  missingValue: '（续接点里没有这一项）',
  instructionHeader: '【续接：本会话此前被「快速停止」中断（{time}）】',
  instructionFieldsHeader: '（以下为这次停止保存的完整续接点）',
})

/**
 * 把落盘的 `at` 显示成人可读且**带时区**的时刻。
 *
 * 为什么不做本地时区换算：`at` 是 `new Date().toISOString()` 写下的 UTC 时刻，
 * 本地化要读机器时区 ⇒ 同一份记录在两台机器上显示不同、套件也会随机器而变。
 * 这里只做**确定性**改写（`ISO(UTC) → 'YYYY-MM-DD HH:mm:ss UTC'`）；
 * 形状不认识就**原样显示**（不改写、不猜、不编）。
 * @param {unknown} at
 */
export function formatStoppedAt(at) {
  if (typeof at !== 'string' || at.trim() === '') return RESUME_TEXTS.unknownTime
  const text = at.trim()
  const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/.exec(text)
  if (iso === null) return text
  return `${iso[1]} ${iso[2]} UTC`
}

/** 续接条标题（需求原文 G13 句式 + 真时刻）。 */
export function resumeBarTitle(at) {
  return RESUME_TEXTS.barTitleTemplate.replace('{time}', formatStoppedAt(at))
}

/** 把任意 JSON 值渲染成一行可读文本；缺失**显式**写成"没有这一项"，绝不静默留空。 */
function textOf(value) {
  if (value === undefined || value === null) return RESUME_TEXTS.missingValue
  if (Array.isArray(value)) {
    const parts = value.filter((item) => item !== undefined && item !== null).map((item) => textOf(item))
    return parts.length === 0 ? RESUME_TEXTS.missingValue : parts.join(', ')
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return RESUME_TEXTS.missingValue }
  }
  const text = String(value)
  return text.trim() === '' ? RESUME_TEXTS.missingValue : text
}

/**
 * 续接条的**三行摘要**（需求原文 G13 的 `上次停在 / 已完成 / 下一步` 版式）。
 *
 * 放在这里而不是客户端：版式与占位符是**文案**，文案的唯一 owner 是本文件。
 * 客户端若自己拼 `'上次停在：' + …`，就出现了第二个 owner —— 需求 ④-5 的去注释扫描器
 * 正是钉这件事（`.tsx` 的可执行代码里不许出现这些句子）。
 *
 * 三行**恒定**产出（缺值行也照出，值为 `missingValue`）：条数突变会让"少了一行"看起来像
 * "这项不存在"，而 `（续接点里没有这一项）` 明确说的是"这一项没存"，两者不是一回事。
 *
 * @param {object|null} checkpoint 落盘的续接点（形状不认识时按"没有内容"如实渲染）
 * @returns {string[]}
 */
export function resumeSummaryLines(checkpoint) {
  const value = checkpoint !== null && typeof checkpoint === 'object' && !Array.isArray(checkpoint) ? checkpoint : null
  return [
    RESUME_TEXTS.phaseLine.replace('{value}', textOf(value?.currentPhase)),
    RESUME_TEXTS.completedLine.replace('{value}', textOf(value?.completedWork)),
    RESUME_TEXTS.nextLine.replace('{value}', textOf(value?.nextAction)),
  ]
}

/**
 * I13 的核心动作内容：**送进会话的那段续接指令**。
 *
 * 它必须是纯函数、且**只由落盘的续接点派生** —— 套件据此逐字节比对
 * 「投出去的文本 == 盘上那条续接点算出来的文本」，从而证明续接不是拿内存副本糊的。
 *
 * 需求原文 G13（`:511-520`）要求 Agent 自动获得 Resume Checkpoint、且**不要求用户重述任务**，
 * 故：① 前三行用原文给出的句式；② I6 的 9 个字段**一个不漏**地附上（Agent 要据它接着干）；
 * ③ 缺字段如实标 ⚠ 并点名（不把缺失渲染成"无"）；④ 末尾逐字带上原文那句纪律。
 *
 * @param {{checkpoint?: object|null, stoppedAt?: string|null, missingFields?: string[],
 *          incomplete?: boolean, sourceId?: string|null}} input
 * @returns {string}
 */
export function buildResumeInstruction(input = {}) {
  const checkpoint = input.checkpoint !== null && typeof input.checkpoint === 'object' && !Array.isArray(input.checkpoint)
    ? input.checkpoint
    : null
  const missingFields = Array.isArray(input.missingFields) ? input.missingFields.filter((f) => typeof f === 'string') : []
  const lines = [
    RESUME_TEXTS.instructionHeader.replace('{time}', formatStoppedAt(input.stoppedAt ?? null)),
    RESUME_TEXTS.phaseLine.replace('{value}', textOf(checkpoint?.currentPhase)),
    RESUME_TEXTS.completedLine.replace('{value}', textOf(checkpoint?.completedWork)),
    RESUME_TEXTS.nextLine.replace('{value}', textOf(checkpoint?.nextAction)),
    RESUME_TEXTS.instructionFieldsHeader,
  ]
  for (const field of [
    'originalGoal', 'currentPhase', 'completedWork', 'currentWork', 'nextAction',
    'relevantFiles', 'gitState', 'testsStatus', 'unresolvedIssues',
  ]) {
    lines.push(`${field}: ${textOf(checkpoint?.[field])}`)
  }
  if (missingFields.length > 0) {
    lines.push(RESUME_TEXTS.incompleteNote.replace('{fields}', missingFields.join('、')))
  }
  lines.push(RESUME_TEXTS.noReexplain)
  return lines.join('\n')
}

/**
 * 从快照里挑出**活着的**工作（只读投影，不改任何源）。
 * @param {{sessions?: Array, subagents?: Array, tasks?: Array, jobs?: Array}} snapshot
 */
export function discoverActiveWork(snapshot = {}) {
  const sessions = (snapshot.sessions ?? [])
    .filter((row) => row?.running === true)
    .map((row) => ({
      kind: 'session', sessionId: row.sessionId, title: row.title ?? null, status: 'running',
    }))
  // 子代理：宿主面看 `activity`，模型面看 `status`；两边都认，但**判不出的一律进 unknown**。
  const subagents = []
  const unknown = []
  for (const row of snapshot.subagents ?? []) {
    const sessionId = row?.sessionId
    const activity = row?.activity
    const status = row?.status
    const live = LIVE_AGENT_ACTIVITIES.includes(activity) || LIVE_AGENT_STATUSES.includes(status)
    const knownInactive = INACTIVE_AGENT_ACTIVITIES.includes(activity) || INACTIVE_AGENT_STATUSES.includes(status)
    if (live) {
      subagents.push({
        kind: 'subagent',
        sessionId,
        parentSessionId: row.parentSessionId ?? null,
        status: activity ?? status,
      })
      continue
    }
    if (!knownInactive) {
      // 无 activity/status、或词表外的值：**不假装它没在跑**，也不要谎报它在跑 —— 如实标为未知。
      unknown.push({
        kind: 'subagent',
        sessionId: sessionId ?? null,
        reason: activity === undefined && status === undefined ? 'no-liveness-field' : 'unrecognized-liveness-value',
        observed: { activity: activity ?? null, status: status ?? null },
      })
    }
  }
  // 任务：三态判定（**不许**用"不在不活跃集合里 ⇒ 就是在跑"这种反推 —— 它会把词表外的值
  // 静默算成活动工作，等于替账本编状态）。
  //   · `running`        → 要停的活动工作
  //   · 其余已知 4 值     → 已知不活跃（不虚报要停的东西）
  //   · 词表外的值        → 如实标未知（reason 说明），既不当作在跑也不静默丢弃
  const tasks = []
  for (const row of snapshot.tasks ?? []) {
    if (row?.taskId === undefined) continue
    const status = String(row?.status)
    if (LIVE_TASK_STATUSES.includes(status)) {
      tasks.push({ kind: 'task', taskId: row.taskId, title: row.title ?? null, status })
      continue
    }
    if (INACTIVE_TASK_STATUSES.includes(status)) continue
    unknown.push({
      kind: 'task',
      taskId: row.taskId,
      reason: 'unrecognized-status-value',
      observed: { status },
    })
  }
  const backgrounds = (snapshot.jobs ?? [])
    .filter((row) => row?.id !== undefined && LIVE_JOB_STATUSES.includes(String(row.status)))
    .map((row) => ({
      kind: 'background', id: row.id, status: String(row.status), sessionId: row.sessionId ?? null, label: row.label ?? null,
    }))
  // 源整体不可用（例如 task-board 只有 HTTP/读账本两条取数路，两条都拿不到时）。
  // **不许**把它当成"这类工作为 0" —— 那是把未知当已知。只认声明过的源名，
  // 名字写错的也留下来（reason 说明），避免"拼错字段名 ⇒ 静默变成可用"。
  const unavailableSources = []
  for (const raw of snapshot.unavailableSources ?? []) {
    const name = typeof raw === 'string' ? raw : raw?.name
    const reason = typeof raw === 'string' ? null : (raw?.reason ?? null)
    if (DISCOVERY_SOURCES.includes(name)) unavailableSources.push({ name, reason })
    else unavailableSources.push({ name: String(name), reason: reason ?? 'unrecognized-source-name', unrecognized: true })
  }
  return { sessions, subagents, tasks, backgrounds, unknown, unavailableSources }
}

/**
 * I3：确认框所需的计划与计数（**先审计再动手**：这一步必须只读）。
 * @param {object} snapshot
 */
export function buildStopPlan(snapshot = {}) {
  const active = discoverActiveWork(snapshot)
  const counts = {
    sessions: active.sessions.length,
    tasks: active.tasks.length,
    subagents: active.subagents.length,
    backgrounds: active.backgrounds.length,
  }
  const hasWork = counts.sessions + counts.tasks + counts.subagents + counts.backgrounds > 0
  // 「未知≠0」：判不出活性的条目必须**可见**，不能因为"没数进来"而被读成"没有工作"。
  const unknownCount = active.unknown.length
  // 源整体不可用 ⇒ 计数里那一类**不可信**（不是 0），必须能一路传到 UI 与结果汇总。
  const unavailableSources = active.unavailableSources
  const unavailableNames = unavailableSources.map((row) => row.name).join('、')
  return {
    hasWork,
    active,
    counts,
    unknownCount,
    hasUnknown: unknownCount > 0,
    unavailableSources,
    hasUnavailableSources: unavailableSources.length > 0,
    unavailableNote: unavailableSources.length === 0
      ? null
      : `⚠ ${unavailableNames} 源不可用 ⇒ 该类计数**不可信**（不是 0），可能漏掉正在运行的工作`,
    tooltip: QUICK_STOP_TEXTS.tooltip,
    noWorkMessage: QUICK_STOP_TEXTS.noWork,
    dialog: {
      title: QUICK_STOP_TEXTS.title,
      countLines: [
        `• ${counts.sessions} 个会话`,
        `• ${counts.tasks} 个任务`,
        `• ${counts.subagents} 个子代理`,
        `• ${counts.backgrounds} 个后台执行`,
      ],
      note: QUICK_STOP_TEXTS.note,
      cancelLabel: QUICK_STOP_TEXTS.cancel,
      confirmLabel: QUICK_STOP_TEXTS.confirm,
    },
  }
}

/**
 * I4：冻结新工作。**我们自己的层**（官方没有闸门）——被拒的派生留痕，供 UI 如实说明。
 */
export function createAdmissionGate({ now = () => new Date().toISOString() } = {}) {
  let frozen = false
  const rejections = []
  return {
    freeze() { frozen = true },
    release() { frozen = false },
    isFrozen() { return frozen },
    rejections,
    /**
     * @param {string} kind 见 ADMISSION_KINDS
     * @returns {boolean} 是否放行
     */
    admit(kind) {
      const known = ADMISSION_KINDS.includes(kind)
      if (!frozen && known) return true
      rejections.push({ kind, at: now(), reason: frozen ? 'quick-stop-frozen' : 'unknown-kind' })
      return false
    },
  }
}

/**
 * G2/G7/G8/G15：一次快速停止的流程轨迹 + 超时判定 + 结果汇总。
 * 本函数**不执行停止**（执行属于 I-D 的编排层）；它只负责：
 *   · 记录九步流程走到哪一步（可回看，不是黑盒）
 *   · 判断宽限期是否已过（某代理不响应时 Quick Stop 不会永远卡住）
 *   · 把「强制停止」「交接失败」如实汇总给 UI（I15 的 ⚠ 分支）
 */
export function createStopFlow({ now = () => Date.now(), graceMs = DEFAULT_GRACE_MS } = {}) {
  const phases = []
  const forced = []
  const incomplete = []
  const unpersisted = []
  const unavailable = []
  let startedAt = null
  return {
    phases,
    forced,
    incomplete,
    unpersisted,
    unavailable,
    begin(at) {
      startedAt = typeof at === 'number' ? at : now()
      phases.push({ stage: 'requested', at: startedAt, detail: null })
      return startedAt
    },
    mark(stage, detail = null) {
      phases.push({ stage, at: now(), detail })
    },
    /** 某个源是否拿到了交接（ok=false ⇒ 记入 incomplete，绝不当作成功）。 */
    noteHandoff({ source, sourceId, ok }) {
      if (ok === true) return
      incomplete.push({ source, sourceId })
    },
    /**
     * 某个源的续接点是否**真的落到盘上**（I5）。`ok=false` ⇒ 记进来，汇总必带 ⚠ 且 ok=false。
     *
     * 为什么要单独一个钩子（这是本轮补上的一个真实假成功口子）：
     * 交接成功 ⇒ 内容只在**内存**里；`persist` 失败（盘满 / store 报错 / 索引写不进）时，
     * 旧代码只把 `record.persisted` 置 false，**没人告诉汇总层** ⇒ 汇总照样输出
     * 「✓ 所有可恢复工作已保存续接点」——用户以为电脑可以合盖了，其实什么都没存下来。
     * 交接与落盘是两件事（`noteHandoff` 管前者），不许用前者替后者背书。
     */
    notePersist({ source, sourceId, ok }) {
      if (ok === true) return
      unpersisted.push({ source, sourceId })
    },
    /**
     * 某个源整体取不到数据（**不是**"这一类没有工作"）。记进来 ⇒ 汇总必带 ⚠ 且 ok=false：
     * 拿不到源就没资格声称"全部可恢复工作已保存"。
     */
    noteUnavailableSource(name, reason = null) {
      unavailable.push({ name, reason })
    },
    /** 宽限期到了只能作为**兜底**（I8：force cancel 只能是 fallback）。 */
    force({ source, sourceId, reason = 'timeout' }) {
      forced.push({ source, sourceId, reason, at: now() })
    },
    isExpired() {
      if (startedAt === null) return false
      return now() - startedAt >= graceMs
    },
    /**
     * I15 汇总：全部停止完成后给用户的结果（含 ⚠ 异常分支）。
     *
     * **完成类断言是条件行**（根因修在这里，不在 UI 层兜底）：
     * `doneTitle` / `doneNote` 只在**真的 ok** 时才进 lines。否则卡片就会读成
     * 「快速停止完成 / 所有可恢复工作已保存续接点 / ⚠ …」—— 那是**假成功**：
     * 客户端若忘了过滤，或者将来有别的消费者直接渲染 `lines`，都会当着用户的面撒谎。
     * UI 侧按引用过滤只是**兜底**，不该是唯一防线。
     *
     * @param {{sessions?: number, tasks?: number, subagents?: number, backgrounds?: number}} detail
     * @param {{ok?: boolean, reasons?: string[]}} [verdict]
     *   编排层知道而本层不知道的部分（`unwired` 未接线 / `notStopped` 没停掉）：
     *   它是**与门**（`selfOk && verdict.ok`）—— 本层自己判出的 ⚠ 不会被 verdict 洗白。
     */
    summary(detail = {}, verdict = {}) {
      const sessions = detail.sessions ?? 0
      const tasks = detail.tasks ?? 0
      const subagents = detail.subagents ?? 0
      const backgrounds = detail.backgrounds ?? 0
      const selfOk = forced.length === 0 && incomplete.length === 0
        && unpersisted.length === 0 && unavailable.length === 0
      const ok = selfOk && (verdict.ok === undefined ? true : verdict.ok === true)
      // ── 源不可用 ⇒ **不许**摆 `✓ 0 …` ─────────────────────────────────────
      // 事故背景（本轮实测抓到）：jobs / tasks 源取不到时，汇总照样输出
      // `✓ 0 Background executions 已停止`。这是**假话**：我们并不知道后台执行有几条，
      // "0" 会被用户读成"这一类没有工作"——正是"未知 ≠ 0"明令禁止的那种断言。
      // 因此逐类计数是**条件行**：该源可用才输出 ✓ 与数字；不可用就如实说"无法清点"。
      // （总体的"N 个数据源不可用"⚠ 行仍在下面保留，用于给出 reason 与后果提示。）
      const unavailableNames = new Set(unavailable.map((row) => row.name))
      const countLine = (name, n, text) => (
        unavailableNames.has(name)
          ? `⚠ ${text.split(' ')[0]} 无法清点（数据源不可用）`
          : `✓ ${n} ${text}`
      )
      const counts = [
        countLine('sessions', sessions, 'Sessions 已保存'),
        countLine('tasks', tasks, 'Tasks 已暂停'),
        countLine('subagents', subagents, 'Sub-agents 已停止'),
        countLine('jobs', backgrounds, 'Background executions 已停止'),
      ]
      const lines = ok ? [QUICK_STOP_TEXTS.doneTitle, ...counts, QUICK_STOP_TEXTS.doneNote] : [...counts]
      if (forced.length > 0) {
        lines.push(`⚠ ${forced.length} execution 未能正常退出，已强制停止`)
      }
      if (incomplete.length > 0) {
        lines.push(`⚠ ${incomplete.length} 项未能生成完整续接点（checkpointIncomplete）`)
      }
      if (unpersisted.length > 0) {
        lines.push(`⚠ ${unpersisted.length} 项续接点未能落盘（交接只在内存里，重启即丢）`)
      }
      if (unavailable.length > 0) {
        const names = unavailable.map((row) => row.name).join('、')
        lines.push(`⚠ ${unavailable.length} 个数据源不可用（${names}）：可能有未计入的运行中工作`)
      }
      for (const reason of verdict.reasons ?? []) lines.push(`⚠ ${reason}`)
      return {
        ok,
        selfOk,
        reasons: [...(verdict.reasons ?? [])],
        counts: { sessions, tasks, subagents, backgrounds },
        forced: [...forced],
        incomplete: [...incomplete],
        unpersisted: [...unpersisted],
        unavailable: [...unavailable],
        lines,
        phases: [...phases],
      }
    },
  }
}
