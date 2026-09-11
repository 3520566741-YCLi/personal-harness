// dsh-personal-workspace — E4-FIX-IA-2-TASK · 任务 UI 派生辅助（TASK-11 起）。
//
// 纯函数（无 React）：把「官方字段」映射成 UI 可展示的形状与中文文案，供
// 任务板卡片/详情、项目页任务行复用，并可 headless smoke 断言。
//
// 纪律：
//   · 只读投影，绝不改动任何官方数据；
//   · 技术词（schedule/cron/sessionId/executionId…）永不进入返回的 UI 文案；
//   · 周期中文描述委托 schedule.ts（describeCron 仅当可分析才给 detail）。
import { describeCron, isAnalyzableCron } from './schedule'
import type { TaskExecution, TaskSchedule } from './projection'

// ---------------------------------------------------------------------------
// 周期状态徽标（单次任务 = 无 schedule → 不显示；有 schedule → 定期/已停用）
export interface ScheduleChip {
  /** UI 标签。 */
  label: '定期' | '定期(已停用)'
  /** 视觉基调：on=生效中，off=已停用。 */
  tone: 'on' | 'off'
  /** 中文周期描述（规则可分析时，如「每天 20:00」；否则 null）。 */
  detail: string | null
}

export function scheduleChipOf(schedule: TaskSchedule | undefined): ScheduleChip | null {
  if (schedule === undefined || schedule === null) return null
  const detail = isAnalyzableCron(schedule.cron) ? describeCron(schedule.cron) : null
  if (schedule.enabled) return { label: '定期', tone: 'on', detail }
  return { label: '定期(已停用)', tone: 'off', detail }
}

/** 任务是否带生效中的周期规则（UI 决策点，非执行真相）。 */
export function recurringEnabledOf(schedule: TaskSchedule | undefined): boolean {
  return schedule !== undefined && schedule !== null && schedule.enabled === true
}

// ---------------------------------------------------------------------------
// 执行结果展示（单点真值：卡片/详情/项目页共用同一映射，避免文案分叉）
export type ExecViewKind = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'

export interface ExecView {
  kind: ExecViewKind
  /** 用户可见中文。 */
  text: string
}

export function execResultView(execution: TaskExecution | undefined): ExecView | null {
  if (execution === undefined || execution === null) return null
  if (execution.endedAt === undefined) return { kind: 'running', text: '执行中' }
  switch (execution.result) {
    case 'succeeded':
      return { kind: 'succeeded', text: '成功' }
    case 'failed':
      return { kind: 'failed', text: '失败' }
    case 'cancelled':
      return { kind: 'cancelled', text: '已取消' }
    default:
      return { kind: 'unknown', text: '已结束' }
  }
}

/** 最近一次执行（执行记录按时间升序时取末项）。 */
export function latestExecutionOf(executions: readonly TaskExecution[] | undefined): TaskExecution | undefined {
  if (!Array.isArray(executions) || executions.length === 0) return undefined
  return executions[executions.length - 1]
}

/** 是否还有未结束（进行中）的执行。 */
export function hasRunningExecution(executions: readonly TaskExecution[] | undefined): boolean {
  return Array.isArray(executions) && executions.some((e) => e.endedAt === undefined)
}

// ---------------------------------------------------------------------------
// 执行历史汇总（TASK-12：全量记录的可读摘要 —— 总数/成功/失败/已取消/进行中）
export interface ExecHistorySummary {
  total: number
  succeeded: number
  failed: number
  cancelled: number
  running: number
}

export function execHistorySummary(executions: readonly TaskExecution[] | undefined): ExecHistorySummary {
  const list = Array.isArray(executions) ? executions : []
  const out: ExecHistorySummary = { total: list.length, succeeded: 0, failed: 0, cancelled: 0, running: 0 }
  for (const e of list) {
    if (e.endedAt === undefined) {
      out.running += 1
    } else if (e.result === 'succeeded') {
      out.succeeded += 1
    } else if (e.result === 'failed') {
      out.failed += 1
    } else if (e.result === 'cancelled') {
      out.cancelled += 1
    }
    // result 未给出但已结束 → 不计入任何子类（总数仍含）
  }
  return out
}

/** 执行历史展示顺序：最新在前（账本为升序，倒排即可；不做其他猜测）。 */
export function executionHistoryRows(executions: readonly TaskExecution[] | undefined): TaskExecution[] {
  if (!Array.isArray(executions)) return []
  return [...executions].sort((a, b) => b.startedAt - a.startedAt)
}
