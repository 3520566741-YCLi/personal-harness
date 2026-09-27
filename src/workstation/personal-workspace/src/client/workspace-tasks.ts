// dsh-personal-workspace — V1.2-J J3：工作区维度上的**任务面**（第三方能力，非官方）。
//
// ─────────────────────────────────────────────────────────────────────────────
// 诚实标注（先例写法见 src/workstation/personal-sidebar/src/client/convledger.ts:1-21）
//
// ⚠ **任务面不是官方能力。** 官方 Workspace 注册表（`ctx.get('workspaces').list`）只登记
//   工作区与**会话**（`sessionIds`），**没有任务**，也没有"任务属于哪个工作区"的官方投影。
//   ⇒ 本模块读的是**第三方插件** `@linxin666/dsh-client-ui-task-board`（装机运行时 0.3.16）
//     的宿主账本，按其数据里可选的 `task.workspaceId` 字段过滤。UI 必须显式标注"第三方"。
//
// 取数方式（**实读第三方产物核实**，不是猜）：
//   P="$HOME/.dsh/profiles/desktop/node_modules/@linxin666/dsh-client-ui-task-board"
//   · 传输契约：`GET {prefix}/state` → TaskBoardSnapshot；本包已用 taskboard.ts 的
//     `TaskBoardClient.state()` 走这一条（同源 HTTP `/api/task-board/state`，见 taskboard.ts 文件头）。
//   · `workspaceId` 字段**确实存在**，但**是可选**：
//       `$P/lib/types/core/tasks.d.ts:111`  `workspaceId?: string;`（TaskRecord）
//       `$P/lib/types/core/tasks.d.ts:167`  `workspaceId?: string;`（更新/补丁侧）
//       `$P/lib/index.js:284`  `workspaceId: normalizeTargetId(input.workspaceId)`（create 时规范化）
//       `$P/lib/index.js:694`  `task.workspaceId = normalizeTargetId(row.workspaceId)`（账本行读入）
//   · **覆盖率不是 100%**：本机账本 `~/.dsh/task-board/ledger-v2.json`（实测读取）
//     3 个任务里 **0 个**带 workspaceId ⇒ "按 workspaceId 过滤"在真机上**可能一个都匹配不到**。
//     这**不代表**"该工作区没有任务"，只代表"这批任务没有归属信息"。
//
// ⇒ 本模块的纪律（未知 ≠ 0）：
//   · 账本读不到（网络失败/非 2xx/无快照）→ `kind:'unavailable'`，UI 显示「取不到 / 无法清点」，
//     **绝不**显示「0 个任务」；
//   · 账本读到了、但该工作区匹配 0 条 → 这是**已知的 0**，且必须同时给出"全量 N 条、其中 M 条无归属"
//     的上下文，让用户看得见"0 条匹配"是怎么来的。
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react'
import type { TaskRecord, TaskStatus } from './projection'
import { TaskBoardClient } from './taskboard'

export interface WorkspaceTaskRow {
  id: string
  title: string
  status: TaskStatus
  /** 归属工作区 id（官方 workspace id 字符串；来自第三方账本，可缺）。 */
  workspaceId?: string
  updatedAt: number
  /** 该任务当前是否有未结算的执行（running）。 */
  running: boolean
  /** 已归档（第三方账本的 archivedAt）。 */
  archived: boolean
}

export interface WorkspaceTaskLedger {
  revision: number
  /** 全量任务（**未被任何过滤裁剪**；用于给出"全量 N / 无归属 M"的诚实上下文）。 */
  all: WorkspaceTaskRow[]
}

export type WorkspaceTaskState =
  | { kind: 'loading'; ledger: null }
  | { kind: 'unavailable'; ledger: null; message: string }
  | { kind: 'ready'; ledger: WorkspaceTaskLedger }

/** 一个工作区维度上的任务归属结论（`filterWorkspaceTasks` 产出；纯函数，无 IO）。 */
export interface WorkspaceTaskAttribution {
  kind: 'unavailable' | 'ready'
  /** 该工作区下的任务（kind='unavailable' 时恒为空 —— **不是** 0，是未知）。 */
  rows: WorkspaceTaskRow[]
  /** 全量任务条数（kind='unavailable' 时 0，须配合 kind 判断，不可当作"没有任务"）。 */
  total: number
  /** 全量里**没有 workspaceId** 的条数（= "无法归属到任何工作区"的诚实计数）。 */
  unassigned: number
  /** 该工作区下任务条数（kind='unavailable' 时为 null = **未知**，绝不写作 0）。 */
  count: number | null
}

/** 官方 TaskRecord → 工作区任务面行（字段可缺；不猜、不补默认值）。 */
export function taskRowOf(task: TaskRecord): WorkspaceTaskRow {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    ...(typeof task.workspaceId === 'string' && task.workspaceId.length > 0 ? { workspaceId: task.workspaceId } : {}),
    updatedAt: task.updatedAt,
    running: task.status === 'running',
    archived: task.archivedAt !== undefined,
  }
}

/**
 * **真**过滤函数（不是替身）：按 `workspaceId` 精确相等过滤。
 * 语义三条（与文件头的诚实纪律一一对应）：
 *   ① 账本不可用（state.kind='unavailable'/'loading'）→ count=null（未知），rows 空；
 *   ② 账本可用 → count 是真计数（可以是 0），并同时给出 total / unassigned 上下文；
 *   ③ 只有**非空字符串** workspaceId 才参与匹配 —— 缺字段/空串一律计入 unassigned，不冒充本工作区。
 */
export function filterWorkspaceTasks(state: WorkspaceTaskState, workspaceId: string): WorkspaceTaskAttribution {
  if (state.kind !== 'ready') {
    return { kind: 'unavailable', rows: [], total: 0, unassigned: 0, count: null }
  }
  const all = state.ledger.all
  const id = typeof workspaceId === 'string' ? workspaceId : ''
  const rows = id === '' ? [] : all.filter((t) => t.workspaceId === id)
  const unassigned = all.filter((t) => t.workspaceId === undefined).length
  return { kind: 'ready', rows, total: all.length, unassigned, count: rows.length }
}

// ---------------------------------------------------------------------------
// store（单一实例；工作区中心 / 诊断共用）
type Reader = { state: () => Promise<{ revision: number; tasks: TaskRecord[] }> }

const defaultReader: Reader = new TaskBoardClient()

let reader: Reader = defaultReader
let state: WorkspaceTaskState = { kind: 'loading', ledger: null }
let inFlight: Promise<void> | null = null
const subs = new Set<() => void>()

function notify(): void {
  subs.forEach((f) => {
    try {
      f()
    } catch {
      // ignore
    }
  })
}

function setState(next: WorkspaceTaskState): void {
  state = next
  notify()
}

/** index apply 时注入真 reader（默认 = taskboard.ts 的 TaskBoardClient，同源 HTTP）。 */
export function bindWorkspaceTaskLedgerSource(source: unknown): void {
  const s = source as Partial<Reader> | null
  reader = s && typeof s.state === 'function' ? (s as Reader) : defaultReader
  state = { kind: 'loading', ledger: null }
  inFlight = null
  notify()
}

export function workspaceTaskState(): WorkspaceTaskState {
  return state
}

export function subscribeWorkspaceTaskState(f: () => void): () => void {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/**
 * 拉一次账本。失败 → kind='unavailable' + 真实错误文本（**不**退化成"0 条"）。
 * 并发去重（同一次 in-flight 复用）。
 */
export async function refreshWorkspaceTasks(): Promise<void> {
  if (inFlight !== null) return inFlight
  inFlight = (async () => {
    try {
      const snap = await reader.state()
      const tasks = Array.isArray(snap?.tasks) ? snap.tasks : []
      setState({
        kind: 'ready',
        ledger: { revision: typeof snap?.revision === 'number' ? snap.revision : 0, all: tasks.map(taskRowOf) },
      })
    } catch (e) {
      setState({ kind: 'unavailable', ledger: null, message: e instanceof Error ? e.message : String(e) })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function useWorkspaceTaskState(): WorkspaceTaskState {
  return useSyncExternalStore(subscribeWorkspaceTaskState, workspaceTaskState, workspaceTaskState)
}
