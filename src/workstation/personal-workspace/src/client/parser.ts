// dsh-personal-workspace — E4-FIX-IA-2-TASK · AI Task Parser（TASK-4）。
//
// 定位与诚实边界：
//   · **规则式解析器，不是 LLM**。把一段自然语言（NL）解析成 Structured Draft，
//     供 TASK-6 Composer 预填；**非黑箱** —— 每次解析返回 notes[]（人类可读的
//     解析依据：命中了哪些词/模式），UI 可展示「自动解析（规则匹配），可修改」。
//   · 不伪造「AI 判断」：能确定的才填；不确定 → kind='ask' + missing[] 列出缺什么，
//     由 UI 询问用户（TASK-8 澄清同理复用本层语义）。
//   · 产出 DraftTask 是**草稿**（用户可编辑），不含任何 id/技术词；cron 由 UI 在
//     创建前经 schedule.ts 生成（本文件不出 cron）。
//   · 周期意图识别支持文案：每天/每日/每晚、每周[一…日/天]（可逗号顿号连写）、
//     每月/每个月 N 号；时间：HH:mm、X点、X点半、X点Y分，带 早上/上午/中午/下午/晚上。
//   · 无网络/DOM/React —— 可 headless（smoke-personal-parser.mjs）。

import type { RecurrenceFrequency } from './schedule'
import type { TaskPermission } from './projection'

export type TaskKindHint = 'single' | 'recurring' | 'ask'

export interface ParserRecurrence {
  frequency: RecurrenceFrequency
  /** weekly：1=周一..7=周日 */
  weekdays?: number[]
  /** monthly：1..31 */
  dayOfMonth?: number
  /** 时间已识别（0..23 / 0..59）；缺失 = 需补充 */
  hour?: number
  minute?: number
}

export interface DraftSections {
  /** 上下文/背景 */
  context?: string
  /** 输入材料 */
  input?: string
  /** 期望输出 */
  output?: string
  /** 约束 */
  constraints?: string
}

export interface DraftTask {
  kind: TaskKindHint
  title: string
  /** 任务指令正文（创建时的 prompt 候选）。 */
  prompt: string
  description?: string
  recurrence?: ParserRecurrence
  permission?: TaskPermission
  /** 若正文提到「在 X 工作区」等 → 工作区显示名提示（UI 用官方目录匹配，找不到即忽略）。 */
  workspaceName?: string
  sections?: DraftSections
}

export interface TaskParseResult {
  draft: DraftTask
  /** 人类可读解析依据（UI 展示，非黑箱）。 */
  notes: string[]
  /** 缺什么才无法落地（TASK-5 Readiness 复用的真正阻塞项）。 */
  missing: string[]
}

// ---------------------------------------------------------------------------
// 基础工具
const WEEKDAY_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  日: 7, 天: 7,
}

const MONTHS = /每?月/

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/** 中文时段 → 小时偏移规则（早上/上午=0；中午=12 修正；下午/晚上=+12；晚上不足 6 点再加）。 */
function periodBias(period: string | undefined, hour: number): number {
  if (period === undefined) return hour
  if (period === '早上' || period === '上午') return hour >= 12 ? hour - 12 : hour
  if (period === '中午') return hour === 12 ? 12 : hour < 7 ? hour + 12 : hour
  if (period === '下午') return hour < 12 ? hour + 12 : hour
  if (period === '晚上') return hour < 6 ? hour + 12 : hour < 12 ? hour + 12 : hour
  return hour
}

/** 解析「20:00 / 8点 / 8点半 / 8点30分 / 晚上8点」。返回 [hour, minute] 或 null。 */
function parseClock(text: string): [number, number] | null {
  const t = norm(text)
  const colon = t.match(/(\d{1,2}):(\d{1,2})/)
  if (colon !== null) {
    const h = Number(colon[1])
    const m = Number(colon[2])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return [h, m]
    return null
  }
  const period =
    t.indexOf('早上') >= 0 ? '早上' :
      t.indexOf('上午') >= 0 ? '上午' :
        t.indexOf('中午') >= 0 ? '中午' :
          t.indexOf('下午') >= 0 ? '下午' :
            t.indexOf('晚上') >= 0 ? '晚上' : undefined
  const hm = t.match(/(?:(?:早|上|中|下|晚)(?:上|午)?)?(\d{1,2})点(?:(\d{1,2})分?|半)?/)
  if (hm === null || hm[1] === undefined) return null
  const raw = Number(hm[1])
  if (raw < 0 || raw > 24) return null
  const minute = hm[2] !== undefined ? Number(hm[2]) : hm[0].indexOf('半') >= 0 ? 30 : 0
  if (minute < 0 || minute > 59) return null
  return [periodBias(period, raw), minute]
}

// ---------------------------------------------------------------------------
// 频率 / 星期 / 日期识别
/** 识别「每天/每日/每晚/每周X/每月N号」。返回 {frequency, ...} | null；recog=命中词。 */
function recognizeFrequency(src: string): { rule: ParserRecurrence; recog: string } | null {
  const s = norm(src)
  // 每天 / 每日 / 每晚（字面命中；避免误中「明天/后天」里的单个「天」字）
  if (/(?:每天|每日|每晚|天天)/.test(s)) {
    const m = s.match(/(?:每天|每日|每晚|天天)/)!
    return { rule: { frequency: 'daily' }, recog: m[0] === '每晚' ? '每晚' : '每天' }
  }
  // 每周 / 每星期 / 星期[一..日]
  const weekly = s.match(/每?周|每?星期/)
  if (weekly !== null) {
    const segStart = weekly.index! + weekly[0].length
    const seg = s.slice(segStart)
    const days: number[] = []
    // 只认「紧跟周期词」的连续星期字/数字表（一三五 / 1,3,5），避免把「一份」的「一」误判为周一
    const run = seg.match(/^[一二三四五六日天\d][一二三四五六日天\d,，、]*/)
    if (run !== null) {
      for (const ch of run[0]) {
        const d = WEEKDAY_MAP[ch]
        if (d !== undefined && !days.includes(d)) days.push(d)
      }
      const fromNumbers = run[0].match(/\d/g)
      if (fromNumbers !== null) for (const n of fromNumbers) {
        const v = Number(n)
        if (v >= 1 && v <= 7 && !days.includes(v)) days.push(v)
      }
    }
    if (days.length > 0) return { rule: { frequency: 'weekly', weekdays: days.sort((a, b) => a - b) }, recog: '每周' }
    return { rule: { frequency: 'weekly', weekdays: undefined }, recog: '每周' }
  }
  // 每月 / 每个月 [N 号]
  const monthly = s.match(/(?:每月|每个月)/)
  if (monthly !== null) {
    const seg = s.slice(monthly.index! + monthly[0].length)
    const dom = seg.match(/(\d{1,2})\s*[号日]/)
    if (dom !== null) {
      const v = Number(dom[1])
      if (v >= 1 && v <= 31) return { rule: { frequency: 'monthly', dayOfMonth: v }, recog: '每月' }
    }
    const bare = seg.match(/^(\d{1,2})(?=[点:：]|$)/)
    if (bare !== null && Number(bare[1]) <= 31) return { rule: { frequency: 'monthly', dayOfMonth: Number(bare[1]) }, recog: '每月' }
    return { rule: { frequency: 'monthly', dayOfMonth: undefined }, recog: '每月' }
  }
  return null
}

/** 在整句中找时间（HH:mm 或 中文 X点[半/YY分]，可带 早上/上午/下午/晚上）。 */
function findClock(src: string): [number, number] | null {
  return parseClock(norm(src))
}

// 权限词
const PERM_WORDS: Array<{ re: RegExp; perm: TaskPermission; label: string }> = [
  { re: /完全权限|全权限|完整权限|完全控制/, perm: 'danger-full-access', label: '完全权限' },
  { re: /可写|写入|修改文件|读写|工作区写入/, perm: 'workspace-write', label: '工作区写入' },
  { re: /只读|仅查看|只读权限|只看/, perm: 'read-only', label: '只读' },
]

// 工作区提示：「在 项目Alpha 工作区 / 工作区：xxx / 放到 某工作区」
function findWorkspaceName(src: string): { name: string; recog: string } | null {
  const m = src.match(/(?:在|放到|放进|使用)\s*「([^」]{1,24})」\s*(?:工作区|项目)?|(?:工作区|项目)\s*[：:]\s*「?([^「」\s，。,。]{1,24})/)
  if (m === null) return null
  const name = m[1] ?? m[2]
  if (name === undefined || name.trim() === '') return null
  return { name: name.trim(), recog: m[0] }
}

// 分节：按 背景/上下文/输入/输出/约束/截止 标题行切分正文（轻量启发）
function splitSections(body: string): DraftSections {
  const out: DraftSections = {}
  const lines = body.split('\n')
  let context: string[] = []
  let input: string[] = []
  let output: string[] = []
  let constraints: string[] = []
  let bucket: 'context' | 'input' | 'output' | 'constraints' = 'context'
  const heads: Record<string, 'context' | 'input' | 'output' | 'constraints'> = {
    背景: 'context', 上下文: 'context', 目标: 'context',
    输入: 'input', 材料: 'input',
    输出: 'output', 产出: 'output', 结果: 'output',
    约束: 'constraints', 注意: 'constraints', 要求: 'constraints',
  }
  for (const line of lines) {
    const t = line.trim()
    if (t === '') continue
    const head = t.replace(/^[-*#\d.、]+/, '').split(/[：:]/)[0].trim()
    if (heads[head] !== undefined) {
      bucket = heads[head]
      const rest = t.slice(t.indexOf('：') >= 0 ? t.indexOf('：') + 1 : t.indexOf(':') >= 0 ? t.indexOf(':') + 1 : head.length).trim()
      if (rest !== '') ; else continue
      if (bucket === 'context') context.push(rest)
      else if (bucket === 'input') input.push(rest)
      else if (bucket === 'output') output.push(rest)
      else constraints.push(rest)
      continue
    }
    if (bucket === 'context') context.push(t)
    else if (bucket === 'input') input.push(t)
    else if (bucket === 'output') output.push(t)
    else constraints.push(t)
  }
  if (context.length > 0) out.context = context.join('；')
  if (input.length > 0) out.input = input.join('；')
  if (output.length > 0) out.output = output.join('；')
  if (constraints.length > 0) out.constraints = constraints.join('；')
  return out
}

// ---------------------------------------------------------------------------
// 主入口
export function parseTaskText(raw: string): TaskParseResult {
  const src = raw.trim()
  const notes: string[] = []
  const missing: string[] = []
  const firstLine = src.split('\n')[0] ?? ''
  // 标题：首行去头尾语气词，截取语义片段
  const titleSource = firstLine.replace(/^(请|帮我|麻烦|请帮我)\s*/, '').replace(/[。！？!?，,]$/, '')
  const title = titleSource.length > 0 ? titleSource.slice(0, 28) : '未命名任务'

  const prompt = src
  const sections = splitSections(src)
  const descLines = (sections.context ?? '') !== '' ? [`背景：${sections.context}`, ...(sections.output !== undefined ? [`产出：${sections.output}`] : []), ...(sections.constraints !== undefined ? [`约束：${sections.constraints}`] : [])] : []
  const description = descLines.join('\n') || undefined

  // 权限
  let permission: TaskPermission | undefined
  for (const w of PERM_WORDS) {
    if (w.re.test(src)) {
      permission = w.perm
      notes.push(`识别到权限词「${w.label}」`)
      break
    }
  }

  // 工作区
  const ws = findWorkspaceName(src)
  if (ws !== null) {
    notes.push(`识别到执行位置提示「${ws.name}」（如与官方工作区不符可忽略）`)
  }

  // 周期
  const freq = recognizeFrequency(src)
  if (freq !== null) {
    const clock = findClock(src)
    const rule: ParserRecurrence = { frequency: freq.rule.frequency, ...freq.rule }
    if (clock !== null) {
      rule.hour = clock[0]
      rule.minute = clock[1]
    } else {
      missing.push('重复时间')
    }
    if (rule.frequency === 'weekly' && (rule.weekdays === undefined || rule.weekdays.length === 0)) missing.push('每周的星期几')
    if (rule.frequency === 'monthly' && rule.dayOfMonth === undefined) missing.push('每月几号')
    notes.push(`识别到重复周期「${freq.recog}」` + (rule.hour !== undefined ? `（时间 ${String(rule.hour).padStart(2, '0')}:${String(rule.minute).padStart(2, '0')}）` : '，但未给出具体时间'))
    return {
      draft: {
        kind: missing.length === 0 ? 'recurring' : 'ask',
        title, prompt, ...(description !== undefined ? { description } : {}),
        recurrence: rule,
        ...(permission !== undefined ? { permission } : {}),
        ...(ws !== null ? { workspaceName: ws.name } : {}),
        ...(Object.keys(sections).length > 0 ? { sections } : {}),
      },
      notes,
      missing,
    }
  }

  // 单次：默认。给出轻量说明（非黑箱）。
  notes.push('未识别到重复周期词 → 按单次任务处理')
  if (title === '未命名任务') missing.push('任务标题')
  return {
    draft: {
      kind: 'single',
      title, prompt,
      ...(description !== undefined ? { description } : {}),
      ...(permission !== undefined ? { permission } : {}),
      ...(ws !== null ? { workspaceName: ws.name } : {}),
      ...(Object.keys(sections).length > 0 ? { sections } : {}),
    },
    notes,
    missing,
  }
}

/** 供 UI 展示的周期草稿描述（无技术词；可直接引用 describeRule）。 */
export function recurrenceLabelOf(r: ParserRecurrence): string | null {
  if (r.hour === undefined) return null
  const hh = `${String(r.hour).padStart(2, '0')}:${String(r.minute ?? 0).padStart(2, '0')}`
  if (r.frequency === 'daily') return `每天 ${hh}`
  if (r.frequency === 'weekly') return `每周 ${(r.weekdays ?? []).join('、')} ${hh}`
  return `每月 ${r.dayOfMonth} 号 ${hh}`
}
