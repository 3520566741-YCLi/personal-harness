// V1.2-C · Background Execution Session Isolation —— 纯投影分类层（无 IO、无 DOM、无状态）。
//
// 目的（用户痛点，ADR-014 / PREFLIGHT §20）：每晚 23:30 的定期任务会不断产生 Session，
// 它们被官方 `sessions.list` 当成普通会话 → 把「会话列表」刷乱（D 期还会污染长期记忆）。
//
// 本模块只做一件事：**按真源判定"哪些 Session 是后台任务执行产生的"**，供投影层过滤。
//
// ── 真源（不可争议）──────────────────────────────────────────────────────────
//   权威 = 任务板账本里 `executions[].sessionId`（PRE-FLIGHT 实证：这才是真实的
//   Task→Session 链路）。**不猜标题、不猜时间、不猜 origin、不看 agentPreset**。
//
// ── 纪律（硬约束，逐条对应 A 验收时冻结的设计）──────────────────────────────
//   1. **隐藏 ≠ 删除**：分类结果只影响「普通会话列表」的投影；Session 本体、官方引擎状态、
//      任务板账本**一个字节都不改**。Task Detail → Execution History → 查看会话永久可开。
//   2. **绝不 mock**：账本读不到 ⇒ `known:false` + 空集 ⇒ **什么都不隐藏**（而不是猜着隐藏、
//      也不是假装已过滤）。未知 ≠ 空集。
//   3. **绝不走 session event**：PRE-FLIGHT 实证「未知事件类型会让整份日志在下次加载时被拒」
//      ⇒ 分类只在内存里按需重算，不落盘、不写事件、不建第二份真源。
//   4. **不许静默**：`known:true` 但账本一条 execution 都没有（首装 / 第三方格式变动）也是合法状态，
//      必须能被 UI 如实说成「已按账本分类，当前无后台执行会话」，而不是和"读不到"混为一谈。

/** 一条后台执行会话的归属（只用于显示/定位，不参与判定）。 */
export interface BackgroundRef {
  /** 所属任务 id（任务板账本里的真实 id）。 */
  taskId: string
  /** 所属任务标题（账本里是什么就说什么；缺失 → 空串，不编）。 */
  taskTitle: string
  /** 承载该会话的执行 id（账本真实 id；缺失 → 空串）。 */
  executionId: string
}

/** 分类真源：任务板账本 → 后台执行会话集合。 */
export interface BackgroundTruth {
  /** true = 账本真的读到了（即便集合为空）；false = 读不到（未知，不得当成"没有"）。 */
  known: boolean
  /** sessionId → 归属。只在 `known:true` 时有意义。 */
  bySession: ReadonlyMap<string, BackgroundRef>
}

/** 账本不可读（服务缺失 / HTTP 失败 / 格式不认识）→ 未知 + 空集。 */
export const UNKNOWN_BACKGROUND: BackgroundTruth = { known: false, bySession: new Map<string, BackgroundRef>() }

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 判定单个任务是否"后台执行产生的会话来源"。
 *
 * 口径：任务曾**真实跑过**（`executions` 里至少有一条带非空 `sessionId`）⇒ 那些 sessionId 都是后台执行会话。
 * 为什么按"曾跑过"而不是"正在跑"：任务跑完后 Session 会结束，若只算 running，历史执行会话会**重新漏回**
 * 普通列表（用户痛点正是"列表被刷乱"，跑完的那批同样在刷）。而 `endedAt` 是否为空不参与判定
 * —— 它只说明执行是否结束，不改变"这个 Session 是后台产生的"这一事实。
 */
export function executionSessionIdsOf(task: unknown): string[] {
  const t = (task ?? {}) as Record<string, unknown>
  const executions = t.executions
  if (!Array.isArray(executions)) return []
  const out: string[] = []
  for (const raw of executions) {
    const e = (raw ?? {}) as Record<string, unknown>
    const id = str(e.sessionId)
    if (id !== '') out.push(id)
  }
  return out
}

/**
 * 任务板快照 → 后台执行会话分类。
 *
 * `snapshot` 形状 = 官方 task-board `GET /api/task-board/state`（`{ tasks: [...] }`）。
 * 任何"不像快照"的输入（null / 非对象 / 没有 `tasks` 数组）⇒ **known:false**：
 * 我们**拒绝**把"我读不懂"说成"没有后台会话"。
 */
export function backgroundTruthOf(snapshot: unknown): BackgroundTruth {
  if (snapshot === null || snapshot === undefined) return UNKNOWN_BACKGROUND
  const s = snapshot as Record<string, unknown>
  if (typeof s !== 'object' || Array.isArray(s)) return UNKNOWN_BACKGROUND
  if (!Array.isArray(s.tasks)) return UNKNOWN_BACKGROUND
  const bySession = new Map<string, BackgroundRef>()
  for (const rawTask of s.tasks) {
    const task = (rawTask ?? {}) as Record<string, unknown>
    const taskId = str(task.id)
    const taskTitle = str(task.title)
    const executions = Array.isArray(task.executions) ? task.executions : []
    // 该 sessionId 归属哪条执行：取**最后一次**携带它的执行（账本顺序即时间顺序）。
    const owner = new Map<string, string>()
    for (const rawExec of executions) {
      const exec = (rawExec ?? {}) as Record<string, unknown>
      const sid = str(exec.sessionId)
      if (sid === '') continue
      owner.set(sid, str(exec.id))
    }
    for (const [sid, executionId] of owner) {
      // 同一 sessionId 若被多条任务引用（异常但可能），**先到者留名**：不覆盖、不合并、不编造，
      // 后续任务不会让已归类的行"跳槽"（分类只需要真，不需要唯一）。
      if (bySession.has(sid)) continue
      bySession.set(sid, { taskId, taskTitle, executionId })
    }
  }
  return { known: true, bySession }
}

/** 某个 session 是否属于后台执行会话（仅当账本可读时才有答案）。 */
export function isBackgroundSession(truth: BackgroundTruth, sessionId: string): boolean {
  return truth.known && truth.bySession.has(sessionId)
}

export interface BackgroundFilterResult<T> {
  /** 应用过滤后仍应在「普通会话列表」出现的行。 */
  rows: T[]
  /** 本次被隐藏的后台执行会话数（0 = 没隐藏任何东西）。 */
  hiddenBackground: number
  /** 账本不可读：UI 必须如实标注"未按后台执行过滤"，**不得**声称已过滤。 */
  backgroundUnknown: boolean
}

/**
 * 投影过滤（V1.2-C 的唯一落点）。
 *
 * @param rows 已按官方规则可见的会话行（`visibleConversations` 的输出，保持其顺序）
 * @param truth 分类真源
 * @param showBackground 用户开关「显示后台任务会话」；false = 隐藏（默认）
 *
 * 三条纪律在这里兑现：
 *   · `known:false` ⇒ 原样返回（**未知不隐藏**），并置 `backgroundUnknown:true`
 *   · `known:true` 时只按 `bySession` 精确命中过滤，绝不按标题/时间等启发式误伤
 *   · 不过滤 subagent / 归档 / blank（那些归 `visibleConversations`，本函数不抢 owner）
 */
export function filterBackgroundSessions<T extends { id: string }>(
  rows: readonly T[],
  truth: BackgroundTruth,
  showBackground: boolean,
): BackgroundFilterResult<T> {
  if (!truth.known) {
    return { rows: [...rows], hiddenBackground: 0, backgroundUnknown: true }
  }
  if (showBackground) {
    return { rows: [...rows], hiddenBackground: 0, backgroundUnknown: false }
  }
  const kept: T[] = []
  let hidden = 0
  for (const row of rows) {
    if (truth.bySession.has(row.id)) {
      hidden += 1
      continue
    }
    kept.push(row)
  }
  return { rows: kept, hiddenBackground: hidden, backgroundUnknown: false }
}

/** 后台执行会话的**总数**（UI 开关文案用；账本不可读 → undefined，不编 0）。 */
export function backgroundCount(truth: BackgroundTruth): number | undefined {
  return truth.known ? truth.bySession.size : undefined
}
