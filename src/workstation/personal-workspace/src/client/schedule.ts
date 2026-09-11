// dsh-personal-workspace — E4-FIX-IA-2-TASK · Recurrence 纯函数层（TASK-3 核心）。
//
// 职责边界（TASK-2 审计结论，见 docs/E4_IA2_TASK_AUDIT.md §2.4）：
//   · 「到点执行」的真相在官方任务板宿主（cron schedule + 30s tick + skipMissed），
//     本文件 **绝不调度、绝不写执行真相** —— 只做 UI 需要的纯派生：
//       1) 用户周期规则(每天/每周N/每月N号 + 时间) ↔ 官方 cron 5 段字符串 的双向映射
//          （cron 是内部编码，UI 永不出现；本文件产出的人话描述专供 UI）
//       2) 周期描述（中文：每天晚上 8:00 / 每周一、三、五 / 每月 1 号）
//       3) occurrence 派生：某时间窗内的应执行时刻序列（仅支持本层生成的规则形状；
//          形状未知 → analyzable=false，UI 诚实降级为只显示官方 nextRunAt）
//       4) missed 汇总：应执行但无官方 execution 落点的时刻（错过 reconcile 的输入）
//
// 语义镜像官方（源码级实证 @linxin666/dsh-client-ui-task-board 0.3.16 lib/index.js）：
//   · cron 星期字段 0/7=周日、1=周一 …（weekdays.add(day===7?0:day)，date.getDay()）
//   · 官方按宿主机本地时间计算 nextRunAt —— 本文件一律用本地时间（Intl 系统时区）计算，
//     不做任何假时区；UI 文案只说「本地时间」。
//   · 错过 = 官方静默跳过（skipMissed 不记账）→ 本文件只做「可理解的 reconcile 输入」。
//
// React-free / DOM-free / network-free —— 可 headless（smoke-personal-schedule.mjs）。

// ---------------------------------------------------------------------------
// 用户周期规则（UI 面模型；不暴露给技术层以外的任何界面）
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  /** weekly 时必填：1=周一 … 7=周日（可多选，升序无重复）。 */
  weekdays?: number[]
  /** monthly 时必填：1..31（>28 的日期按官方语义只在当月存在该日时触发）。 */
  dayOfMonth?: number
  /** 0..23 */
  hour: number
  /** 0..59 */
  minute: number
}

export function isValidRecurrenceRule(rule: RecurrenceRule): boolean {
  if (rule === null || typeof rule !== 'object') return false
  if (rule.frequency !== 'daily' && rule.frequency !== 'weekly' && rule.frequency !== 'monthly') return false
  if (!Number.isInteger(rule.hour) || rule.hour < 0 || rule.hour > 23) return false
  if (!Number.isInteger(rule.minute) || rule.minute < 0 || rule.minute > 59) return false
  if (rule.frequency === 'weekly') {
    const days = rule.weekdays ?? []
    if (days.length === 0) return false
    const sorted = [...new Set(days)].sort((a, b) => a - b)
    if (sorted.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return false
    if (sorted.length !== days.length) return false
    return true
  }
  if (rule.frequency === 'monthly') {
    const d = rule.dayOfMonth
    if (!Number.isInteger(d) || d! < 1 || d! > 31) return false
  }
  return true
}

/** UI 星期 1..7（周一..周日）→ cron 星期字段值（0/7=周日）。 */
function wdToCron(wd: number): number {
  return wd === 7 ? 0 : wd
}

/** cron 星期字段值 → UI 星期（0/7 → 7=周日；1..6 → 同值）。 */
function wdFromCron(v: number): number {
  return v === 0 ? 7 : v
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// ---------------------------------------------------------------------------
// 规则 ↔ cron
/** 用户周期规则 → 官方 cron（5 段，全部为固定分/时 + 日/月/周 约束）。非法规则返回 null。 */
export function ruleToCron(rule: RecurrenceRule): string | null {
  if (!isValidRecurrenceRule(rule)) return null
  const hh = `${rule.minute} ${rule.hour}`
  if (rule.frequency === 'daily') return `${hh} * * *`
  if (rule.frequency === 'weekly') {
    const days = [...new Set((rule.weekdays ?? []).map(wdToCron))].sort((a, b) => a - b).join(',')
    return `${hh} * * ${days}`
  }
  return `${hh} ${rule.dayOfMonth} * *`
}

export interface CronShape {
  frequency: RecurrenceFrequency
  /** weekly：1..7（周一..周日）。 */
  weekdays?: number[]
  /** monthly：1..31。 */
  dayOfMonth?: number
  hour: number
  minute: number
}

/** 解析官方 cron（仅本层生成的形状）；形状未知（含自由通配）→ null，调用方诚实降级。 */
export function parseCronShape(cron: string): CronShape | null {
  if (typeof cron !== 'string') return null
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [min, hour, dom, month, dow] = fields
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return null
  const minute = Number(min)
  const hr = Number(hour)
  if (minute < 0 || minute > 59 || hr < 0 || hr > 23) return null
  if (month !== '*') return null
  // daily：日/周全通配
  if (dom === '*' && dow === '*') return { frequency: 'daily', hour: hr, minute }
  // weekly：日通配、周为数字列表（0/7=周日；1=周一，镜像官方 weekdays.add(day===7?0:day)）
  if (dom === '*' && dow !== '*') {
    if (!/^[\d,]+$/.test(dow)) return null
    const nums = dow.split(',').map(Number)
    if (nums.some((d) => !Number.isInteger(d) || d < 0 || d > 7)) return null
    const weekdays = [...new Set(nums.map(wdFromCron))].sort((a, b) => a - b)
    if (weekdays.length === 0) return null
    return { frequency: 'weekly', weekdays, hour: hr, minute }
  }
  // monthly：日为固定数字、周通配
  if (/^\d+$/.test(dom) && dow === '*') {
    const dayOfMonth = Number(dom)
    if (dayOfMonth < 1 || dayOfMonth > 31) return null
    return { frequency: 'monthly', dayOfMonth, hour: hr, minute }
  }
  return null
}

// ---------------------------------------------------------------------------
// 中文周期描述（UI 展示；不出现 cron/表达式等技术词）
const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function hhmm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`
}

/** 规则 → 中文描述，如「每天晚上 8:00 / 每周一、三、五 08:30 / 每月 1 号 20:00」。 */
export function describeRule(rule: RecurrenceRule): string | null {
  if (!isValidRecurrenceRule(rule)) return null
  const time = hhmm(rule.hour, rule.minute)
  if (rule.frequency === 'daily') return `每天 ${time}`
  if (rule.frequency === 'weekly') {
    const names = (rule.weekdays ?? []).map((d) => WEEKDAY_NAMES[d - 1]).join('、')
    return `每${names} ${time}`
  }
  return `每月 ${rule.dayOfMonth} 号 ${time}`
}

/** cron（本层形状）→ 中文描述；未知形状 → null（调用方用「按设定周期」等泛化文案）。 */
export function describeCron(cron: string): string | null {
  const shape = parseCronShape(cron)
  if (shape === null) return null
  const rule: RecurrenceRule = {
    frequency: shape.frequency,
    ...(shape.weekdays !== undefined ? { weekdays: shape.weekdays } : {}),
    ...(shape.dayOfMonth !== undefined ? { dayOfMonth: shape.dayOfMonth } : {}),
    hour: shape.hour,
    minute: shape.minute,
  }
  return describeRule(rule)
}

// ---------------------------------------------------------------------------
// occurrence 派生（本地时间；仅本层形状可精确计算）
function dateAt(y: number, mo: number, day: number, hour: number, minute: number): number {
  return new Date(y, mo, day, hour, minute, 0, 0).getTime()
}

function dayParts(ms: number): { y: number; mo: number; day: number } {
  const d = new Date(ms)
  return { y: d.getFullYear(), mo: d.getMonth(), day: d.getDate() }
}

function dayMatches(shape: CronShape, y: number, mo: number, day: number): boolean {
  const dow = (new Date(y, mo, day, 12, 0, 0, 0).getDay() + 6) % 7 + 1 // 1=周一..7=周日
  if (shape.frequency === 'weekly') return (shape.weekdays ?? []).includes(dow)
  if (shape.frequency === 'monthly') return day === shape.dayOfMonth
  return true
}

/** 严格晚于 fromMs 的下一次应执行时刻（本地时间）；未来 400 天内无匹配 → undefined。 */
export function nextCronInstantAfter(cron: string, fromMs: number): number | undefined {
  const shape = parseCronShape(cron)
  if (shape === null) return undefined
  const start = dayParts(fromMs)
  for (let offset = 0; offset < 400; offset += 1) {
    const cur = new Date(start.y, start.mo, start.day + offset, 0, 0, 0, 0)
    const y = cur.getFullYear()
    const mo = cur.getMonth()
    const day = cur.getDate()
    if (!dayMatches(shape, y, mo, day)) continue
    const t = dateAt(y, mo, day, shape.hour, shape.minute)
    if (t > fromMs) return t
  }
  return undefined
}

/**
 * (afterMs, uptoMs] 内的应执行时刻序列（本地时间，升序，最多 limit 个）。
 * 仅支持本层生成的形状；未知形状返回空数组（调用方须先查 analyzable）。
 */
export function cronInstantsBetween(cron: string, afterMs: number, uptoMs: number, limit = 400): number[] {
  const shape = parseCronShape(cron)
  if (shape === null) return []
  const out: number[] = []
  const start = dayParts(afterMs)
  const maxDay = Math.floor((uptoMs - afterMs) / 86_400_000) + 400
  for (let offset = 0; offset < maxDay; offset += 1) {
    if (out.length >= limit) break
    const cur = new Date(start.y, start.mo, start.day + offset, 0, 0, 0, 0)
    if (cur.getTime() > uptoMs) break
    const y = cur.getFullYear()
    const mo = cur.getMonth()
    const day = cur.getDate()
    if (!dayMatches(shape, y, mo, day)) continue
    const t = dateAt(y, mo, day, shape.hour, shape.minute)
    if (t > afterMs && t <= uptoMs) out.push(t)
  }
  return out
}

/** 应执行时刻是否可精确分析（形状为本层可生成）。 */
export function isAnalyzableCron(cron: string | undefined): boolean {
  return typeof cron === 'string' && parseCronShape(cron) !== null
}

// ---------------------------------------------------------------------------
// Missed 汇总（错过 reconcile 的输入 —— 是否错过、何时、是否已执行/已 ack）
export const EXECUTION_MATCH_WINDOW_MS = 10 * 60_000 // 官方触发滞后容忍 ±10 分钟

export interface MissedSummary {
  /** cron 形状可分析？false → missed 列表不可精确推导（UI 诚实降级）。 */
  analyzable: boolean
  /** 错过（应执行但无官方 execution 落点、且未 ack）的时刻（升序）。 */
  missed: number[]
  /** 窗内应执行次数。 */
  expected: number
  /** 窗内官方有执行落点的次数。 */
  executed: number
  /** 基准不精确（无 lastTriggeredAt 也无任何 execution 时基于创建时间推断）。 */
  uncertain: boolean
}

/**
 * 汇总一次「错过了多少/哪些」：
 *   · window = (refBase, now]，refBase = 调用方给的基准（优先：schedule.lastTriggeredAt；
 *     本层注册的 armedAt；最后 resort 到 task.createdAt 并置 uncertain）。
 *   · 应执行序列中，官方有 execution.startedAt 落在 ±10 分钟内 → 已执行，不算错过。
 *   · ackedTimes 提供后，其中与错过时刻重合者被排除（用户已「标为已错过」）。
 */
export function summarizeMissed(
  cron: string | undefined,
  refBase: number,
  now: number,
  executions: ReadonlyArray<{ startedAt?: number }>,
  ackedTimes: readonly number[] = [],
  uncertain = false,
): MissedSummary {
  if (!isAnalyzableCron(cron)) return { analyzable: false, missed: [], expected: 0, executed: 0, uncertain: false }
  if (!(now > refBase)) return { analyzable: true, missed: [], expected: 0, executed: 0, uncertain }
  const instants = cronInstantsBetween(cron!, refBase, now, 366)
  const acked = new Set(ackedTimes)
  const missed: number[] = []
  let executed = 0
  for (const t of instants) {
    const hit = (executions ?? []).some((e) => {
      const s = e.startedAt
      return typeof s === 'number' && Math.abs(s - t) <= EXECUTION_MATCH_WINDOW_MS
    })
    if (hit) {
      executed += 1
      continue
    }
    if (!acked.has(t)) missed.push(t)
  }
  return {
    analyzable: true,
    missed,
    expected: instants.length,
    executed,
    uncertain,
  }
}
