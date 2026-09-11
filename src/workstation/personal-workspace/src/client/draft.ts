// dsh-personal-workspace — 「自然语言创建任务」：草稿字段抽取 + 「需要补充」判定（纯函数）。
//
// 设计纪律（与 E4 其他纯模块同构，可 headless smoke 断言）：
//   ① **只搬不造**：每个字段值都必须能在用户原文里找到出处（逐字子串或由原文的**显式**
//      时间短语按日历推算而来）。任何无法在原文中定位的值一律留空 —— 绝不猜日期、项目、
//      预算、交付格式、联系人。
//   ② **不强制填表**：只有 `任务目标` 永远必填；其余字段仅在「没有它就无法明确执行或验收」
//      时才进入 `needs`（需要补充），且必须带一句人读原因。没有提及项目/重复/预算/格式
//      ⇒ 一律可选项，不进 needs。
//   ③ **原文永不丢**：`original` 逐字保留；`notes`（备注）只放**原文里未被结构化字段覆盖的
//      句子**（逐字引用，不做生成式总结 —— 本机规则引擎没有「总结」能力，就不假装有）。
//   ④ 时间短语 → 具体日期属于**换算**（按本机日历），不是猜测；但换算结果旁边必须同时展示
//      原文短语（`duePhrase`），且换算不出来的短语（「尽快」「下周」无具体日）→ 留空 + 进 needs。
//
// 字段与官方 TaskRecord 的真实关系（见 projection.ts / taskboard.ts）：
//   官方 create 只接受 title / description / prompt / workspaceId / mode / permission / model /
//   schedule。**没有** dueAt / notes / deliverable / constraints / project 字段 ⇒
//   · 任务目标 → 官方 `title`（截断）+ `description`/`prompt` 的首段；
//   · 背景 / 交付物 / 截止 / 约束 / 备注 → 组合进官方 `description`（人读）与 `prompt`（执行指令）；
//   · 重复规则 → 官方 `schedule.cron`（真实字段）；
//   · 项目归属 → Personal 关系层 `dsh.personal.projects.v1` 的 `rels.taskProject`（真实字段）；
//   · 结构化原件（含逐字原文）→ 本层 `dsh.personal.taskextras.v1`（见 task-extras.ts），
//     用于刷新后回显与再编辑；**不复制会话正文、不冒充执行真源**。
import { parseTaskText } from './parser'
import type { RecurrenceRule } from './schedule'

// ---------------------------------------------------------------------------
// 字段与模型
export type DraftFieldKey =
  | 'goal'
  | 'background'
  | 'deliverable'
  | 'dueAt'
  | 'project'
  | 'recurrence'
  | 'constraints'
  | 'notes'

export interface TaskDraftFields {
  /** 任务目标（唯一永远必填）。 */
  goal: string
  /** 背景与补充说明。 */
  background: string
  /** 预期交付物。 */
  deliverable: string
  /** 截止时间：'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm'（本地）；'' = 未识别。 */
  dueAt: string
  /** 截止时间在原文里的**原短语**（依据展示；'' = 原文没提）。 */
  duePhrase: string
  /** 项目归属（真实项目 id；null = 暂不归类）。 */
  projectId: string | null
  /** 重复规则（真识别到才非 null）。 */
  recurrence: RecurrenceRule | null
  /**
   * 原文说了「重复执行」但**没给时间**（真信息，不能丢）：
   * true 时草稿里的 `recurrence.hour/minute` 只是编辑器显示占位（默认 20:00），
   * **不得**当成用户确认过的时间 —— 必须补时间（或明确改成单次）才能创建。
   */
  recurrenceTimeMissing: boolean
  /** 约束与注意事项。 */
  constraints: string
  /** 备注：原文中未被结构化字段覆盖的句子（逐字）。 */
  notes: string
  /** 原始需求：逐字保真，永不改写。 */
  original: string
}

/** 需要补充项（仅「没有它就无法明确执行或验收」时才出现）。 */
export interface DraftNeed {
  key: DraftFieldKey
  reason: string
}

/** 识别引擎（诚实标注，绝不把规则引擎说成 AI）。 */
export type DraftEngine = 'ai' | 'rules'

export interface DraftRecognition {
  fields: TaskDraftFields
  needs: DraftNeed[]
  /** 识别依据（人读、可展示；不是黑箱）。 */
  notes: string[]
  engine: DraftEngine
  /** 引擎自述（AI 时=模型名；规则时=本地规则，明确「未使用模型」）。 */
  engineDetail: string
  /** AI 不可用的原因（engine='rules' 且曾尝试 AI 时非空；如实展示）。 */
  aiUnavailableReason?: string
}

export interface ProjectOption {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// 人读原因文案（唯一来源；UI 与 smoke 共用同一批字符串）
export const NEED_REASON = {
  goal: '需要补充任务目标：这是唯一必填项 —— 请描述要让 Harness 做什么。',
  deliverable: '需要补充交付物：目前无法判断完成后要交给你什么。',
  dueAt: '需要补充截止时间：你提到了时间敏感事项，但没有给出时间。',
  dueAtUnclear: '需要补充截止时间：你提到的时间说法无法换算成具体日期（例如「尽快」「下周」没有指定哪天）。',
  recurrence: '需要补充重复规则：你提到了重复执行，但没有给出执行时间。',
} as const

export const ENGINE_DETAIL_RULES = '本地规则识别（未使用模型；逐字搬运原文，不做生成）'
export const ENGINE_DETAIL_AI_UNAVAILABLE = 'AI 不可用 → 已退回本地规则识别'

// ---------------------------------------------------------------------------
// 切句 / 分类
const SENTENCE_SPLIT = /[。！？；\n]+/
const CLAUSE_SPLIT = /[，,、]+/

/** 输出物信号（「给我/交付/产出…」= 用户能拿到的东西）。 */
const DELIVERABLE_MARKERS = [
  '给我', '发我', '交付', '产出', '输出', '提供', '返回', '做成', '写成', '整理成', '汇总成', '生成',
]
/** 约束信号。 */
const CONSTRAINT_MARKERS = [
  '预算', '不超过', '以内', '不要', '不能', '必须', '只能', '限制', '格式', '字数', '用中文', '用英文',
  '时长', '禁止', '最多', '至少', '低于', '高于', '包邮', '免', '需符合', '务必',
]
/** 背景信号。 */
const BACKGROUND_MARKERS = ['背景', '因为', '由于', '目前', '当前', '最近我', '我在', '情况是', '原因是', '为了']
/** 目标动词信号（用于挑出「要做什么」那一句）。 */
const ACTION_MARKERS = [
  '帮我', '请', '需要', '要', '做', '写', '查', '找', '整理', '调研', '总结', '检查', '生成', '分析',
  '优化', '修复', '创建', '搭建', '设计', '对比', '翻译', '计算', '规划', '清理', '备份', '安装', '配置',
]
/** 模糊目标词（说不出交付物 → 才需要补交付物）。 */
const VAGUE_MARKERS = [
  '弄一下', '搞一下', '看看', '看一下', '优化一下', '处理一下', '整理一下', '弄好', '搞定', '研究一下',
  '了解一下', '完善一下', '改进一下', '搞定它', '弄一下那个',
]
/** 时间敏感信号（提到了时间但换算不出 → 才需要补截止时间）。 */
const DUE_MARKERS = [
  '之前', '前完成', '前给', '截止', '尽快', '尽早', '近期', '本周', '这周', '下周', '下下周', '月底',
  '月初', '今天', '明天', '后天', '大后天', '月', '号', '日', '天内', '周内', '内完成',
]
/** 明确的周期词（**只有**这些才算「重复执行」；「下周三」「周报」不是周期）。 */
const RECURRENCE_MARKERS = /(每天|每日|每晚|天天|每周|每星期|每礼拜|每月|每个月)/

function has(text: string, marker: string): boolean {
  return text.indexOf(marker) >= 0
}
function hasAny(text: string, markers: readonly string[]): boolean {
  return markers.some((m) => has(text, m))
}

function clausesOf(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(SENTENCE_SPLIT)) {
    for (const raw of sentence.split(CLAUSE_SPLIT)) {
      const c = raw.trim()
      if (c !== '') out.push(c)
    }
  }
  return out
}

/**
 * 解析器小节（`sections.output` 等）里**真正带来新信息**的部分。
 * 为什么必须过滤：`splitSections` 的 context 是「默认桶」——没有显式小节标题时它等于整篇原文的
 * 复述（一整段自然语言会被原样塞进 `sections.context`）。把复述当成「背景与补充说明」，
 * 等于给用户凭空多出一个他没填的字段 ⇒ 只在片段**不在任何已归类句子里**时才并入。
 */
function sectionExtras(section: string | undefined, clauses: readonly string[]): string[] {
  const s = (section ?? '').trim()
  if (s === '') return []
  const out: string[] = []
  for (const piece of s.split('；')) {
    const t = piece.trim()
    if (t === '') continue
    if (clauses.some((c) => c.indexOf(t) >= 0)) continue
    if (out.some((o) => o.indexOf(t) >= 0)) continue
    out.push(t)
  }
  return out
}

// ---------------------------------------------------------------------------
// 时间短语 → 具体日期（换算，不猜）
interface DueHit {
  /** 原文短语（逐字，含「前/之前/内」这类后缀 —— 后缀是时间说法的一部分）。 */
  phrase: string
  /** 换算结果（无法换算 = null）。 */
  at: Date | null
  /** 是否含具体时刻。 */
  hasTime: boolean
  /** 是否只是「催时间的模糊说法」（尽快/尽早…）→ 进 needs 时用不同的原因文案。 */
  vague: boolean
}

const WEEKDAY_CN: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

/** 时间命中后面的「限定后缀」（下周三**前**、3月5日**之前**、两周**内**…）：必须一起搬走，不能把「前」留在目标里。 */
const DUE_TAILS = ['之前', '以前', '之内', '以内', '前', '内']

/** 把命中扩展成含后缀的完整短语。 */
function withTail(text: string, m: RegExpMatchArray): string {
  const rest = text.slice((m.index ?? 0) + m[0].length)
  for (const tail of DUE_TAILS) if (rest.startsWith(tail)) return m[0] + tail
  return m[0]
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setDate(x.getDate() + n)
  return x
}
/** 周一=1 … 周日=7（本机本地时区）。 */
function isoWeekday(d: Date): number {
  const w = d.getDay()
  return w === 0 ? 7 : w
}
function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 0, 0, 0, 0)
}
function fmt(d: Date, withTime: boolean): string {
  const p = (n: number): string => (n < 10 ? `0${n}` : String(n))
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day
}

/**
 * 从原文抽「截止时间」。
 * 只识别**显式**写法：今天/明天/后天/大后天、本周X、下周X、下下周X、X月X日(/号)、
 * N天内/天后/周内/周后、一周内、月底、可带 HH:mm 或「X点[半|YY分]」。
 * 「尽快/尽早/近期/下周（无具体日）」→ 认定「提到了时间但换算不出」→ at=null（进 needs）。
 */
export function extractDue(raw: string, now: Date = new Date()): DueHit | null {
  const text = raw.replace(/\s+/g, '')
  const clock = text.match(/(\d{1,2})[:：](\d{2})/) ?? text.match(/(早上|上午|中午|下午|晚上)?(\d{1,2})点(半|(\d{1,2})分?)?/)
  let hour: number | null = null
  let minute = 0
  if (clock !== null) {
    if (clock[0].indexOf(':') >= 0 || clock[0].indexOf('：') >= 0) {
      hour = Number(clock[1])
      minute = Number(clock[2])
    } else {
      const period = clock[1]
      let h = Number(clock[2])
      if (clock[3] === '半') minute = 30
      else if (typeof clock[4] === 'string' && clock[4] !== '') minute = Number(clock[4])
      if (period === '下午' || period === '晚上') h = h < 12 ? h + 12 : h
      else if (period === '中午') h = h === 12 ? 12 : h < 7 ? h + 12 : h
      else if (period === '早上' || period === '上午') h = h >= 12 ? h - 12 : h
      hour = h
    }
    if (hour !== null && (hour < 0 || hour > 23 || minute < 0 || minute > 59)) hour = null
  }
  const withClock = (d: Date): Date =>
    hour === null ? startOfDay(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0)
  const base = startOfDay(now)

  // 1) 今天 / 明天 / 后天 / 大后天（含「今日/明日」）
  const abs = text.match(/(大后天|后天|明天|明日|今天|今日)/)
  if (abs !== null) {
    const offset = abs[1] === '大后天' ? 3 : abs[1] === '后天' ? 2 : abs[1] === '明天' || abs[1] === '明日' ? 1 : 0
    return { phrase: withTail(text, abs), at: withClock(addDays(base, offset)), hasTime: hour !== null, vague: false }
  }
  // 2) X月X日 / X月X号
  const md = text.match(/(\d{1,2})月(\d{1,2})[日号]/)
  if (md !== null) {
    const month = Number(md[1])
    const day = Number(md[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = now.getFullYear()
      const candidate = new Date(year, month - 1, day, 0, 0, 0, 0)
      if (candidate.getTime() < base.getTime()) year += 1 // 今年已过 → 明年（按最近将来解释）
      return { phrase: withTail(text, md), at: withClock(new Date(year, month - 1, day, 0, 0, 0, 0)), hasTime: hour !== null, vague: false }
    }
  }
  // 3) 本周X / 这周X / 下周X / 下下周X / 周X
  const wd = text.match(/(下下周|下周|本周|这周|周|星期)([一二三四五六日天])/)
  if (wd !== null) {
    const prefix = wd[1]
    const target = WEEKDAY_CN[wd[2]]
    if (target !== undefined) {
      const cur = isoWeekday(base)
      let delta = target - cur
      if (prefix === '下周') delta += 7
      else if (prefix === '下下周') delta += 14
      else if (delta < 0) delta += prefix === '本周' || prefix === '这周' ? 0 : 7
      // 「本周X」已过 → 仍是本周那天（用户明说本周）；其余默认按最近的将来解释。
      const d = addDays(base, delta < 0 ? 0 : delta)
      return { phrase: withTail(text, wd), at: withClock(d), hasTime: hour !== null, vague: false }
    }
  }
  // 4) N天内 / N天后 / N周内 / N周后 / 一周内 / 两周内
  const rel = text.match(/([一二三四五六七八九十\d]{1,3})(天|日|周|个?星期)(内|后|之内|以内)/)
  if (rel !== null) {
    const n = cnNumber(rel[1])
    if (n !== null) {
      const days = rel[2] === '天' || rel[2] === '日' ? n : n * 7
      return { phrase: rel[0], at: withClock(addDays(base, days)), hasTime: hour !== null, vague: false }
    }
  }
  // 5) 月底 / 月末
  if (has(text, '月底') || has(text, '月末')) {
    return { phrase: has(text, '月底') ? '月底' : '月末', at: withClock(lastDayOfMonth(base)), hasTime: hour !== null, vague: false }
  }
  // 6) 提到了时间但换算不出（尽快/尽早/近期/下周/本周/下下周 且无具体日）
  const vague = ['尽快', '尽早', '近期', '最近', '这几天', '过几天', '有空', '方便时']
  const hitVague = vague.find((w) => has(text, w))
  if (hitVague !== undefined) return { phrase: hitVague, at: null, hasTime: false, vague: true }
  for (const w of ['下周', '下下周', '本周', '这周', '月底', '月末']) {
    if (has(text, w)) return { phrase: w, at: null, hasTime: false, vague: false }
  }
  return null
}

/** 中文数字（一…十/十一…/两）→ number；无法解析 = null。 */
function cnNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s)
  const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (s.length === 1) return map[s] ?? null
  if (s === '十一') return 11
  if (s === '十二') return 12
  return null
}

// ---------------------------------------------------------------------------
// 主抽取
export interface RecognizeOptions {
  projects?: readonly ProjectOption[]
  now?: Date
}

/** 规则引擎：把原文拆成结构化草稿（逐字搬运 + 显式时间换算 + 需要补充判定）。 */
export function recognizeByRules(raw: string, opts: RecognizeOptions = {}): DraftRecognition {
  const original = String(raw ?? '')
  const text = original.trim()
  const now = opts.now ?? new Date()
  const notes: string[] = []

  const parsed = parseTaskText(text)
  const clauses = clausesOf(text)
  const due = extractDue(text, now)

  // 逐句分类（互斥；优先级：约束 > 交付物 > 背景 > 目标/备注）
  const constraintClauses: string[] = []
  const deliverableClauses: string[] = []
  const backgroundClauses: string[] = []
  const rest: string[] = []
  for (const c of clauses) {
    if (hasAny(c, CONSTRAINT_MARKERS)) constraintClauses.push(c)
    else if (hasAny(c, DELIVERABLE_MARKERS)) deliverableClauses.push(c)
    else if (hasAny(c, BACKGROUND_MARKERS)) backgroundClauses.push(c)
    else rest.push(c)
  }
  // 目标：rest 里第一句带动作词的；没有则用第一句；仍无（纯时间句）→ 空（进 needs）
  const goalClause = rest.find((c) => hasAny(c, ACTION_MARKERS)) ?? rest[0] ?? ''
  const goalIndex = goalClause === '' ? -1 : rest.indexOf(goalClause)
  const leftover = rest.filter((_, i) => i !== goalIndex)

  // 目标里若以识别到的截止短语开头 → 去掉该前缀（时间归「截止时间」，其余逐字保留）
  let goal = goalClause
  if (due !== null && due.phrase !== '' && goal.startsWith(due.phrase)) {
    goal = goal.slice(due.phrase.length).replace(/^[，,]/, '').trim()
    notes.push(`任务目标已去掉开头的时间短语「${due.phrase}」（该短语记入「截止时间」）`)
  }

  const background = backgroundClauses.join('；')
  const constraints = constraintClauses.join('；')
  const deliverableExtra = sectionExtras(parsed.draft.sections?.output, clauses)
  const deliverable = [...deliverableClauses, ...deliverableExtra].join('；')
  const notesField = leftover.join('；')

  // 项目归属：只认**真实项目名**在原文中出现（大小写/空格无关），命中多个取最长名（更具体）。
  const projects = opts.projects ?? []
  let projectId: string | null = null
  const flat = text.replace(/\s+/g, '').toLowerCase()
  let bestLen = 0
  for (const p of projects) {
    const name = p.name.replace(/\s+/g, '').toLowerCase()
    if (name === '' || !flat.includes(name)) continue
    if (name.length > bestLen) {
      bestLen = name.length
      projectId = p.id
    }
  }
  if (projectId !== null) notes.push(`项目归属命中原文中的项目名：${projects.find((p) => p.id === projectId)?.name ?? projectId}`)

  // 重复规则：复用既有规则解析，但**必须先有明确的周期词**（每天/每周/每月/天天…）。
  // 为什么加这道闸：旧解析器的频率正则是 `/每?周|每?星期/`，「下周三」「周报」这类**非周期**
  // 说法也会被它判成 weekly ⇒ 会把单次任务误当重复任务、并逼用户补「重复时间」。
  const recurrenceDeclared = RECURRENCE_MARKERS.test(text)
  let recurrence: RecurrenceRule | null = null
  const pr = recurrenceDeclared ? parsed.draft.recurrence : undefined
  if (pr !== undefined) {
    recurrence = {
      frequency: pr.frequency,
      ...(pr.weekdays !== undefined ? { weekdays: pr.weekdays } : {}),
      ...(pr.dayOfMonth !== undefined ? { dayOfMonth: pr.dayOfMonth } : {}),
      hour: pr.hour ?? 20,
      minute: pr.minute ?? 0,
    }
    notes.push(`识别到重复执行：${parsed.notes.join('；') || parsed.draft.recurrence !== undefined ? '来自原文的周期说法' : ''}`.trim())
  }
  if (recurrenceDeclared) for (const n of parsed.notes) if (notes.indexOf(n) < 0) notes.push(n)

  // ---- 需要补充（只有「没有它就无法明确执行或验收」才进）----
  const needs: DraftNeed[] = []
  if (goal.trim() === '') needs.push({ key: 'goal', reason: NEED_REASON.goal })
  const vagueGoal = hasAny(text, VAGUE_MARKERS)
  const explicitOutput = deliverableClauses.length > 0 || deliverableExtra.length > 0
  if (goal.trim() !== '' && !explicitOutput && (vagueGoal || text.replace(/\s+/g, '').length < 10)) {
    needs.push({ key: 'deliverable', reason: NEED_REASON.deliverable })
  }
  const dueMentioned = due !== null || hasAny(text, DUE_MARKERS)
  if (dueMentioned && (due === null || due.at === null)) {
    // 「尽快」= 说了时间敏感但没给时间；「下周」= 给了时间段但换算不出具体日 → 两种原因分开说
    const vagueOnly = due !== null && due.at === null && due.vague
    needs.push({ key: 'dueAt', reason: vagueOnly ? NEED_REASON.dueAt : NEED_REASON.dueAtUnclear })
  }
  const recurrenceTimeMissing = pr !== undefined && (pr.hour === undefined || pr.minute === undefined)
  const recurrenceIncomplete = pr !== undefined && (recurrenceTimeMissing || (pr.frequency === 'weekly' && (pr.weekdays ?? []).length === 0) || (pr.frequency === 'monthly' && pr.dayOfMonth === undefined))
  if (recurrenceIncomplete) needs.push({ key: 'recurrence', reason: NEED_REASON.recurrence })

  const fields: TaskDraftFields = {
    goal,
    background,
    deliverable,
    dueAt: due !== null && due.at !== null ? fmt(due.at, due.hasTime) : '',
    duePhrase: due !== null ? due.phrase : '',
    projectId,
    recurrence,
    recurrenceTimeMissing,
    constraints,
    notes: notesField,
    original,
  }
  return { fields, needs, notes, engine: 'rules', engineDetail: ENGINE_DETAIL_RULES }
}

// ---------------------------------------------------------------------------
// AI 结果接地校验（不编造事实的硬闸）
export interface AiDraftPayload {
  goal?: unknown
  background?: unknown
  deliverable?: unknown
  dueAt?: unknown
  constraints?: unknown
  notes?: unknown
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
/** 归一化用于接地比对（去空白/标点，便于「逐字出处」判定）。 */
function squish(s: string): string {
  return s.replace(/[\s，,。.；;：:、！!？?（）()「」“”"'\-—]/g, '').toLowerCase()
}

/**
 * 把 AI 返回的字段**接地**到原文：
 *   · 每个文本字段必须能在原文里找到（去标点后为子串），否则丢弃并记原因；
 *   · dueAt 额外要求：AI 给的日期必须与原文中**显式**时间短语的换算结果一致
 *     （用同一个 extractDue 复核），否则丢弃 —— 绝不让模型凭空补日期；
 *   · 项目归属只认真实项目名（AI 给的名字必须命中真实项目目录）。
 */
export function groundAiDraft(
  ai: AiDraftPayload,
  raw: string,
  opts: RecognizeOptions = {},
): { fields: TaskDraftFields; notes: string[]; dropped: string[] } {
  const rules = recognizeByRules(raw, opts)
  const base = rules.fields
  const original = base.original
  const flat = squish(original)
  const notes: string[] = []
  const dropped: string[] = []
  const pick = (key: DraftFieldKey, value: string): string => {
    if (value === '') return ''
    const sq = squish(value)
    // 允许 AI 做轻微改写：要求其「主要内容」在原文可定位（长度 ≥ 4 时按子串；更短按整段包含）
    if (sq.length >= 4 && flat.includes(sq)) return value
    if (sq.length < 4 && sq !== '' && flat.includes(sq)) return value
    dropped.push(key)
    return ''
  }
  const goal = pick('goal', str(ai.goal)) || base.goal
  const background = pick('background', str(ai.background)) || base.background
  const deliverable = pick('deliverable', str(ai.deliverable)) || base.deliverable
  const constraints = pick('constraints', str(ai.constraints)) || base.constraints
  const notesField = pick('notes', str(ai.notes)) || base.notes
  const dueRaw = str(ai.dueAt)
  let dueAt = base.dueAt
  if (dueRaw !== '') {
    const explicit = extractDue(original, opts.now ?? new Date())
    const computed = explicit !== null && explicit.at !== null ? fmt(explicit.at, explicit.hasTime) : ''
    if (computed !== '' && squish(dueRaw) === squish(computed)) dueAt = computed
    else {
      dropped.push('dueAt')
      notes.push('原文没有可换算的显式时间短语 → AI 给出的截止时间未被采用（防止凭空补日期）')
    }
  }
  if (dropped.length > 0) notes.push(`以下 AI 字段在原文中找不到出处，已丢弃（不编造）：${[...new Set(dropped)].join('、')}`)
  return { fields: { ...base, goal, background, deliverable, constraints, notes: notesField, dueAt }, notes, dropped }
}

// ---------------------------------------------------------------------------
// 草稿 → 官方任务入参（title / description / prompt）
//
// 官方语义（审计实证）：
//   · `description` **只给人看**（卡片摘录 + 详情「描述」），**从不进入执行会话**；
//   · `prompt` 是**唯一**会被 host-runner 发给执行会话的正文（为空时回退 title）。
// ⇒ 结构化字段必须**同时**写进这两处：description 给人读，prompt 让 agent 真的看到；
//   而「原始需求」永远逐字附在 prompt 末尾，避免识别/改写丢掉用户的任何一句话。
export const TITLE_MAX = 48

export interface TaskPayload {
  title: string
  description: string
  prompt: string
}

/** 任务标题 = 目标首行截断（官方 title 必填非空）。 */
export function titleOfDraft(goal: string, fallback = '新任务'): string {
  const first = String(goal ?? '').split('\n')[0].trim()
  if (first === '') return fallback
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX)}…` : first
}

/** 结构化分段（description 用，人读；空字段整行不出现，不写「无」）。 */
export function composeDescription(f: TaskDraftFields): string {
  const lines: string[] = []
  if (f.goal.trim() !== '') lines.push(`任务目标：${f.goal.trim()}`)
  if (f.background.trim() !== '') lines.push(`背景与补充说明：${f.background.trim()}`)
  if (f.deliverable.trim() !== '') lines.push(`预期交付物：${f.deliverable.trim()}`)
  if (f.dueAt.trim() !== '') {
    const phrase = f.duePhrase.trim() !== '' ? `（原文：${f.duePhrase.trim()}）` : ''
    lines.push(`截止时间：${f.dueAt.trim()}${phrase}`)
  }
  if (f.constraints.trim() !== '') lines.push(`约束与注意事项：${f.constraints.trim()}`)
  if (f.notes.trim() !== '') lines.push(`备注：${f.notes.trim()}`)
  if (f.original.trim() !== '') lines.push(`原始需求（逐字）：\n${f.original.trim()}`)
  return lines.join('\n')
}

/** 执行指令（prompt 用；唯一会到 agent 手里的东西）。 */
export function composePrompt(f: TaskDraftFields): string {
  const lines: string[] = []
  if (f.goal.trim() !== '') lines.push(`【任务目标】${f.goal.trim()}`)
  if (f.deliverable.trim() !== '') lines.push(`【预期交付物】${f.deliverable.trim()}`)
  if (f.dueAt.trim() !== '') {
    const phrase = f.duePhrase.trim() !== '' ? `（原文：${f.duePhrase.trim()}）` : ''
    lines.push(`【截止时间】${f.dueAt.trim()}${phrase}`)
  }
  if (f.constraints.trim() !== '') lines.push(`【约束与注意事项】${f.constraints.trim()}`)
  if (f.background.trim() !== '') lines.push(`【背景】${f.background.trim()}`)
  if (f.notes.trim() !== '') lines.push(`【备注】${f.notes.trim()}`)
  const head = lines.join('\n')
  if (f.original.trim() === '') return head
  const tail = `【原始需求（逐字，未改写）】\n${f.original.trim()}`
  return head === '' ? tail : `${head}\n\n${tail}`
}

/** 生成官方 create 入参（不含 schedule/workspace/mode/permission 等执行档位，那些另传）。 */
export function buildTaskPayload(fields: TaskDraftFields): TaskPayload {
  return {
    title: titleOfDraft(fields.goal),
    description: composeDescription(fields),
    prompt: composePrompt(fields),
  }
}

/** 草稿是否被用户改过（用于「识别结果已按你的编辑重建执行指令」这类如实提示）。 */
export function draftEdited(recognized: TaskDraftFields | null, current: TaskDraftFields): boolean {
  if (recognized === null) return false
  const keys: Array<keyof TaskDraftFields> = ['goal', 'background', 'deliverable', 'dueAt', 'constraints', 'notes']
  for (const k of keys) {
    if (String(recognized[k] ?? '').trim() !== String(current[k] ?? '').trim()) return true
  }
  if ((recognized.projectId ?? null) !== (current.projectId ?? null)) return true
  if (recognized.recurrenceTimeMissing !== current.recurrenceTimeMissing) return true
  const a = recognized.recurrence
  const b = current.recurrence
  if ((a === null) !== (b === null)) return true
  if (a !== null && b !== null) {
    if (a.frequency !== b.frequency || a.hour !== b.hour || a.minute !== b.minute) return true
    if (JSON.stringify(a.weekdays ?? []) !== JSON.stringify(b.weekdays ?? [])) return true
    if ((a.dayOfMonth ?? 0) !== (b.dayOfMonth ?? 0)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 「需要补充」的活性判定：识别当时判出来的项，在用户补齐后必须**立刻消失**
// （否则用户填好了还被拦着 —— 那是死锁，不是校验）。
import { isValidRecurrenceRule } from './schedule'

export function liveNeeds(needs: readonly DraftNeed[], fields: TaskDraftFields): DraftNeed[] {
  return needs.filter((n) => {
    switch (n.key) {
      case 'goal':
        return fields.goal.trim() === ''
      case 'deliverable':
        return fields.deliverable.trim() === ''
      case 'dueAt':
        return fields.dueAt.trim() === ''
      case 'recurrence':
        // 说了重复但没给时间（recurrenceTimeMissing）→ 仍拦；
        // 真去掉了重复（recurrence=null 且未声明缺时间）→ 视为用户选择单次，放行。
        return fields.recurrenceTimeMissing || (fields.recurrence !== null && !isValidRecurrenceRule(fields.recurrence))
      default:
        return false
    }
  })
}
