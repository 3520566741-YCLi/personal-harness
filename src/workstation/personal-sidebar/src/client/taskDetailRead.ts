// V1.2-I · **I14**「打开任务详情 ⇒ 紫点消除」的只读 DOM 观察 + read-to-clear 接线
//
// ── 需求原文（唯一依据）──────────────────────────────────────────────────────
//   `docs/V1_2_I_H_REQUIREMENTS.md` 的 ACCEPTANCE TESTS 第 19 条逐字：
//     「Opening Task clears purple unread indicator」= **打开即消除**。
//   用户 2026-09-18 就 D8 的裁定 = **(a) 第三方补丁**（`docs/V1_2_I_PENDING_DECISIONS.md` D8），
//   决定性理由就是这一条：走「自己的条带放 [标记已读]」意味着打开**不会**消除、还要再点一次。
//   所以事实来源必须是补丁给出的 DOM 标记：`data-dsh-taskboard-task-id`
//   （补丁 = `scripts/third-party-patches/任务看板-任务详情带上任务ID.py`）。
//
// ── 本模块的职责边界（只读 + 一次写动作）─────────────────────────────────────
//   · **只读**第三方 DOM（`querySelectorAll` + `getAttribute`），**绝不改**第三方节点；
//   · 唯一的写动作 = I12 既有的 read-to-clear（宿主 `POST /api/personal/quickstop/read`），
//     语义是**追加一条 read 事件**、**绝不删除中断历史**（与侧栏会话行那条路同口径）；
//   · 不落盘、不写 localStorage、不建第二份真源。
//
// ── 「不猜」（本仓硬纪律）在产物侧与本地侧各有一半 ───────────────────────────
//   产物侧（补丁）：`current.id` 为 `undefined`/`null` 时属性**不出现**，为 `''` 时是空串
//     —— 由 `验证-I14-渲染.mjs` 用真 React 断言，补丁绝不编造替代 id。
//   本地侧（本模块）：属性**缺失 / 空串 / 纯空白** ⇒ `none`（什么都不做）；
//     同时出现**多个不同** id ⇒ `ambiguous`（**也不猜**哪一个是用户打开的那个）。
//     两种都不发请求、不清点：宁可不动，也不许把"不知道"变成一次错误的已读。
//
// ── 404 是正常结果，不是失败 ─────────────────────────────────────────────────
//   宿主 `POST /read` 在该源**本来就没有中断记录**时返 **404**
//   （`personal-quickstop/server/index.js:262-266`：`{ok:false, reason, message:'该源没有被 Quick Stop 中断的记录'}`）。
//   这是**合法空**，与"真失败"（5xx / 网络断 / fetch 缺失）必须分开记：
//   `cleared` / `no-record` / `failed` 三态，一态都不许吞掉 —— 全走
//   `diagTrace`（既有诊断通道，`window.__dshDiag.traces`）留痕，**不新增任何用户可见文案**
//   （避免产生需要用户定稿的新措辞；也不把 404 显示成错误吓人）。

import { markInterruptRead } from './interrupts'
import { diagTrace } from './diag'

/** 补丁写进任务详情 dialog 的属性名（与补丁脚本逐字一致，单一 owner 就是这里）。 */
export const TASK_DETAIL_ID_ATTR = 'data-dsh-taskboard-task-id'
/** 只按属性存在性取节点：补丁只往 TaskDetail 的 dialog 上写这一个属性。 */
export const TASK_DETAIL_SELECTOR = `[${TASK_DETAIL_ID_ATTR}]`

/** read 结果的**三态**（`no-record` 是正常结果，不是失败）。 */
export type TaskReadOutcome = 'cleared' | 'no-record' | 'failed'

/** 诊断通道的 kind（既有 `diagTrace` 通道；不进 UI、不改文案）。
 *  命名跟既有约定一致（连字符小写，如 `main-ack` / `main-verify-fail`）。 */
export const TASK_READ_TRACE_KIND: Readonly<Record<TaskReadOutcome, string>> = Object.freeze({
  cleared: 'task-read-cleared',
  'no-record': 'task-read-no-record',
  failed: 'task-read-failed',
})

/** 一次"打开"的读取结论。 */
export type TaskIdReading =
  | { kind: 'none' }
  | { kind: 'one'; id: string }
  | { kind: 'ambiguous' }

/** 属性值 → 可用 id（**不猜**：缺失 / 空串 / 纯空白 ⇒ null；真实 id 原样返回、不 trim）。 */
export function taskIdFromAttrValue(raw: string | null): string | null {
  if (raw === null) return null
  if (raw.trim() === '') return null
  return raw
}

/**
 * 只读扫描：当前 DOM 里**打开着的**任务详情是谁。
 * 0 个 / 全无效 ⇒ `none`；恰好一个不同 id ⇒ `one`；≥2 个不同 id ⇒ `ambiguous`（不猜）。
 */
export function readOpenTaskId(root: ParentNode | null | undefined): TaskIdReading {
  if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') {
    return { kind: 'none' }
  }
  let nodes: ArrayLike<Element>
  try {
    nodes = root.querySelectorAll(TASK_DETAIL_SELECTOR)
  } catch {
    return { kind: 'none' }
  }
  const ids = new Set<string>()
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i]
    if (el === null || el === undefined || typeof el.getAttribute !== 'function') continue
    const id = taskIdFromAttrValue(el.getAttribute(TASK_DETAIL_ID_ATTR))
    if (id !== null) ids.add(id)
  }
  if (ids.size === 0) return { kind: 'none' }
  if (ids.size > 1) return { kind: 'ambiguous' }
  return { kind: 'one', id: [...ids][0] }
}

/** 扫描结论 → 可发请求的 id（`one` 以外一律 null）。 */
export function taskIdOf(reading: TaskIdReading): string | null {
  return reading.kind === 'one' ? reading.id : null
}

/** read 响应 → 三态。`ok` 才算清成功；404 是**正常的"本来就没中断"**；其余都算真失败。 */
export function classifyReadOutcome(res: { ok: boolean; status: number | null }): TaskReadOutcome {
  if (res.ok === true) return 'cleared'
  if (res.status === 404) return 'no-record'
  return 'failed'
}

/**
 * 纯状态机：`observed` = 这一刻 DOM 里打开着的任务 id；`fired` = 上一次"这一轮打开"已经发过 read 的 id。
 * 只有**打开动作变化**才发（关闭后重开同一个任务算新的一次打开 —— 与会话行"点一次发一次"同口径）。
 */
export function taskReadTransition(
  observed: string | null,
  fired: string | null,
): { fire: string | null; next: string | null } {
  if (observed === null) return { fire: null, next: null }
  if (observed === fired) return { fire: null, next: fired }
  return { fire: observed, next: observed }
}

/** 一次 read 的结果事件（诊断用；不含任何 UI 文案）。 */
export interface TaskReadEvent {
  taskId: string
  outcome: TaskReadOutcome
  status: number | null
}

export interface TaskDetailReadDeps {
  /** 发一次 read（默认真打宿主 `POST /read`，source 固定 `'task'`）。 */
  read?: (taskId: string) => Promise<{ ok: boolean; status: number | null }>
  /** 宿主确认已读（`cleared`）时回调 —— 消费方据此乐观翻掉未读位。 */
  onCleared?: (taskId: string) => void
  /** 每一次 read 的结论（含 `no-record` / `failed`）都会来这里，**一态都不吞**。 */
  onEvent?: (event: TaskReadEvent) => void
  /** 观察根（默认 `document`；没有 document 的运行环境 ⇒ 观察器不装、扫描恒 `none`）。 */
  root?: ParentNode | null
}

export interface TaskDetailReadWatcher {
  /** 立刻扫一次（同样走"变化才发"的判据）。 */
  scan: () => void
  /** 停止观察（幂等；停止后不再请求、不再回调）。 */
  stop: () => void
  /** 当前是否已装观察器（诊断/套件读它，避免"看起来装了"）。 */
  watching: boolean
}

/**
 * 起一个任务详情观察器：详情 dialog 出现（或就地换任务）⇒ 该任务发一次 read ⇒ 成功即清紫点。
 * **绝不抛给 UI**：任何异常都收敛成 `failed` 事件（与 `markInterruptRead` 同纪律）。
 */
export function createTaskDetailReadWatcher(deps: TaskDetailReadDeps = {}): TaskDetailReadWatcher {
  // source 固定 `'task'`：只有任务看板的详情 dialog 会带那个属性，与会话行那条路互不串。
  const read = deps.read ?? ((taskId: string) => markInterruptRead('task', taskId))
  const root = deps.root ?? (typeof document === 'undefined' ? null : document)
  let stopped = false
  let fired: string | null = null
  let observer: MutationObserver | null = null

  const fire = async (taskId: string): Promise<void> => {
    let res: { ok: boolean; status: number | null }
    try {
      res = await read(taskId)
    } catch {
      res = { ok: false, status: null }
    }
    if (stopped) return
    const outcome = classifyReadOutcome(res)
    if (outcome === 'cleared') deps.onCleared?.(taskId)
    deps.onEvent?.({ taskId, outcome, status: res.status })
    // 诊断留痕：三态各自一个 kind，**404（no-record）也有自己的名字**，不是"没这回事"。
    diagTrace(TASK_READ_TRACE_KIND[outcome], { detail: `task=${taskId} status=${res.status ?? 'null'}` })
  }

  const scan = (): void => {
    if (stopped) return
    const step = taskReadTransition(taskIdOf(readOpenTaskId(root)), fired)
    fired = step.next
    if (step.fire === null) return
    void fire(step.fire)
  }

  if (root !== null && root !== undefined && typeof MutationObserver === 'function') {
    try {
      observer = new MutationObserver(() => scan())
      // 既看节点增删（打开 = TaskDetail 挂载 / 关闭 = 卸载），也**只看这一个属性**的变化
      // （详情开着就地换任务时 React 只改属性、不换节点）。
      // attributeFilter 是这里能开属性观测的关键：它让"我们自己写的那些 data-* 属性"
      // （紫徽章等）根本不进观测范围 ⇒ 不存在"观测→setState→重渲染→再写属性"的回环；
      // 而且本模块**从不写**这个属性，所以这一路观测在原理上不可能自激。
      observer.observe(root as Node, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [TASK_DETAIL_ID_ATTR],
      })
    } catch {
      observer = null
    }
  }
  scan()

  return {
    scan,
    get watching(): boolean {
      return observer !== null && !stopped
    },
    stop: (): void => {
      stopped = true
      try {
        observer?.disconnect()
      } catch {
        // best-effort
      }
      observer = null
    },
  }
}
