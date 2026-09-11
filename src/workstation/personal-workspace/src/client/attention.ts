// dsh-personal-workspace — E4-FIX-IA-2 FINAL · PHASE B：Needs Attention 单一真源广播
//
// 用户收口指令 §7（决定性）：
//   · **删除整个 Mini Mission Control 区块**（AI 正在做什么 / 需要你处理 / 最近完成 /
//     最近会话 / 查看全部）—— 与主页重复，属第二份「仪表盘」。
//   · 改为在**唯一**的「任务看板」侧栏入口上挂一个真实 Needs Attention 徽标：
//     N 来自既有 projection/reconcile 真源（**不建立第二份 attention store**）；
//     仅计入「阻塞 / 需处理的失败 / 需审批 / 需权限确认 / 等待用户输入」；
//     排除 running、正常调度中、已完成、归档会话、普通最近会话；N = 0 → 无徽标；
//     点击徽标仍然进入任务看板。
//
// 语义（与 projection.attentionOf 完全同源，本模块不重新判定）：
//   attentionOf 只在 ① 权限确认门 ② 宿主 task.error ③ 最近执行 settled-failed
//   ④ 执行结束但缺结果 时非空；已归档任务恒为 null。故 N 天然满足上述包含/排除规则。
//
// 通道纪律：window CustomEvent 纯内存广播（不落盘、不是第二真源）。
//   - 消费方（sidebar）挂载时发 ATTENTION_REQUEST_EVENT → 本模块立即回发当前快照（防丢首帧）；
//   - 任务定位走独立通道 BOARD_OPEN_TASK_EVENT（与 attention 计数无关，仍是唯一通道）。

import type { TaskReconcile, TaskReconcileState } from './reconcile'
import type { ProjectedTask } from './projection'

export const ATTENTION_EVENT = 'dsh:personal-attention'
export const ATTENTION_REQUEST_EVENT = 'dsh:personal-attention-request'
export const BOARD_OPEN_TASK_EVENT = 'dsh:board-open-task'

export interface AttentionRow {
  id: string
  label: string
  /** 人类可读原因（projection.attentionOf 的 label）。 */
  reason: string
  kind: string
  weight: number
}

export interface AttentionSnapshot {
  v: 1
  /**
   * 计数。null = **不可知**（宿主不可达 / 尚未就绪）—— 消费方必须显示“不可用”，
   * 绝不把未知当成 0（“没有需要处理的事”）。
   */
  n: number | null
  ready: boolean
  hostUp: boolean
  hostError?: string
  items: AttentionRow[]
}

export const EMPTY_ATTENTION: AttentionSnapshot = {
  v: 1,
  n: null,
  ready: false,
  hostUp: false,
  items: [],
}

/**
 * 纯函数：由 reconcile 状态派生 Needs Attention 快照（headless 可直接断言）。
 * host 不可达 → n = null（未知），而非 0。
 */
export function composeAttention(st: TaskReconcileState): AttentionSnapshot {
  const hostUp = st.ready && st.hostReachable
  if (!hostUp) {
    return {
      v: 1,
      n: null,
      ready: st.ready,
      hostUp: false,
      ...(typeof st.hostError === 'string' && st.hostError.length > 0 ? { hostError: st.hostError } : {}),
      items: [],
    }
  }
  const items: AttentionRow[] = st.tasks
    .filter((p: ProjectedTask) => p.attention !== null)
    .sort((a, b) => (b.attention?.weight ?? 0) - (a.attention?.weight ?? 0))
    .map((p) => ({
      id: p.task.id,
      label: p.task.title || '（未命名任务）',
      reason: p.attention?.label ?? '需要处理',
      kind: p.attention?.kind ?? 'unknown',
      weight: p.attention?.weight ?? 0,
    }))
  return { v: 1, n: items.length, ready: true, hostUp: true, items }
}

function canBus(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof window.addEventListener === 'function' &&
    typeof window.removeEventListener === 'function' &&
    typeof CustomEvent === 'function'
  )
}

/**
 * index.tsx 在 reconcile.bind() 之后调用：订阅 reconcile，变化即广播 attention 快照，
 * 并响应消费方的 request。返回释放函数。
 */
export function bindAttentionFeed(reconcile: TaskReconcile): () => void {
  let disposed = false
  let lastJson = ''
  let off: (() => void) | null = null

  const snapshot = (): AttentionSnapshot => {
    try {
      return composeAttention(reconcile.getState())
    } catch {
      return EMPTY_ATTENTION
    }
  }
  const emit = (force: boolean): void => {
    if (disposed || !canBus()) return
    const payload = snapshot()
    const json = JSON.stringify(payload)
    if (!force && json === lastJson) return
    lastJson = json
    try {
      window.dispatchEvent(new CustomEvent(ATTENTION_EVENT, { detail: payload }))
    } catch {
      // best-effort: 监听方异常不得影响 workspace 插件
    }
  }
  const onRequest = (): void => emit(true)

  try {
    off = reconcile.subscribe(() => emit(false))
  } catch {
    off = null
  }
  try {
    window.addEventListener(ATTENTION_REQUEST_EVENT, onRequest)
  } catch {
    // 无事件总线（headless 沙箱）→ 仅保留订阅路径
  }
  emit(true)
  return () => {
    disposed = true
    try {
      off?.()
    } catch {
      // ignore
    }
    try {
      window.removeEventListener(ATTENTION_REQUEST_EVENT, onRequest)
    } catch {
      // ignore
    }
  }
}

/** 任务定位通道（sidebar/Home 点任务行 → 任务板打开并选中该任务）。 */
export function bindBoardOpenTask(handler: (taskId: string) => void): () => void {
  if (!canBus()) return () => {}
  const onEvent = (ev: Event): void => {
    try {
      const detail = (ev as CustomEvent<{ taskId?: unknown } | undefined>).detail
      const id = detail?.taskId
      if (typeof id === 'string' && id.length > 0) handler(id)
    } catch {
      // malformed event → ignore
    }
  }
  try {
    window.addEventListener(BOARD_OPEN_TASK_EVENT, onEvent)
  } catch {
    return () => {}
  }
  return () => {
    try {
      window.removeEventListener(BOARD_OPEN_TASK_EVENT, onEvent)
    } catch {
      // ignore
    }
  }
}
