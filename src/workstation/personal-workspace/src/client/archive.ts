// dsh-personal-workspace — V1.2-A 归档（A3 归档工作流 / A4 归档产物 / A5 归档视图数据源）。
//
// WHY THIS FILE EXISTS（用户 V1.2-A §1.3 原文纪律）
//   「内容必须是高质量项目总结，而不是简单罗列 Session 名称」+「Archive 文件必须保存到一个
//    固定的 Workspace archive directory」+「生成文件成功以后，才把 Project 标记为 Archived」。
//
// 本模块的**诚实边界**（读代码的人必须一眼看到）：
//   ① 事实层（Project / Period / Important Conversations / Tasks & Execution History /
//      Files-Workspaces / Unresolved Issues / Source References）**全部来自官方真源**
//      （任务板快照 / 会话列表 / Workspace 目录 / 项目关系层），逐条可回查 id，
//      **零编造**：没有数据就写「无」，不写「大概」。
//   ② 判断层（Key Decisions / Deliverables / Important Knowledge / Lessons Learned）在
//      Personal Harness 这一层**没有真源**（Personal 层不记录决策与经验）。这些小节**不猜**，
//      一律写明 PENDING_MARKER + 指向可用证据，交给 Harness 补写（A3 的 enrichment 路径）。
//   ③ 本模块**不落盘**：落盘由宿主半（server/index.js 的 /personal-workspace/archive 路由）
//      用真实文件系统完成，写完**回读校验**并把结果返回；客户端只有拿到 verified=true
//      才允许调用 projectRegistry.archiveProject()。生成失败 → 项目**不得**变成 archived。
//
// 为什么落盘走宿主半而不是浏览器：浏览器层没有文件系统能力（官方 fs 服务是 host 侧服务），
//   而官方 Workspace 的 `path` 字段是真实绝对路径 —— 归档必须落到真实目录，不能造假的 fs。

/** 事实包版本（evidence 边车文件里带，便于未来迁移与审计）。 */
export const ARCHIVE_FACTS_VERSION = 1

/** 归档目录名（用户 §1.3 指定：<Workspace>/Personal Harness Archives/<Project Name>/）。 */
export const ARCHIVE_DIR_NAME = 'Personal Harness Archives'

/** 宿主半路由前缀（与 server/index.js 严格一致；同源 fetch 免鉴权，见 V1.2 审计 Q2）。 */
export const ARCHIVE_ROUTE = '/personal-workspace/archive'

/** 判断层小节的统一占位标记（测试与 UI 都断言这个字符串；不允许用编造内容替代）。 */
export const PENDING_MARKER = '待补写（需叙述性总结）'

/** 该项目未关联 Workspace 时的受管归档根（宿主半在 homedir 下建；不是假 Workspace）。 */
export const MANAGED_ROOT_LABEL = 'Personal Harness 自管归档目录'

// ---------------------------------------------------------------------------
// 事实包类型（全部字段都能在官方真源里找到出处）
export interface ArchiveTaskFact {
  id: string
  title: string
  status: string
  createdAt?: number
  updatedAt: number
  archived: boolean
  executions: Array<{ id: string; sessionId?: string; startedAt: number; endedAt?: number }>
}

export interface ArchiveSessionFact {
  id: string
  title: string
  updatedAt?: number
  archived: boolean
  running: boolean
}

export interface ArchiveWorkspaceFact {
  workspaceId: string
  path: string
  title: string
}

export interface ArchiveActivityFact {
  at: number
  kind: 'task' | 'session'
  text: string
  tag: string
}

export interface ArchiveFacts {
  project: {
    id: string
    name: string
    description?: string
    seed: boolean
    createdAt: number
    updatedAt: number
    starred?: boolean
    archived?: boolean
    archiveFile?: string
  }
  /** ISO 生成时刻（由调用方注入 —— 保证 buildArchiveMarkdown 是纯函数，可测）。 */
  generatedAt: string
  /** 归档根（真实绝对路径；null = 该项目未关联工作区 → 走受管目录）。 */
  workspaceRoot: string | null
  workspaceSource: 'linked' | 'managed'
  tasks: ArchiveTaskFact[]
  sessions: ArchiveSessionFact[]
  workspaces: ArchiveWorkspaceFact[]
  activity: ArchiveActivityFact[]
}

// ---------------------------------------------------------------------------
/** 文件名安全化：去掉路径分隔符/控制字符/首尾点空格，保留中文与常见可读字符。 */
export function sanitizeArchiveSegment(name: string): string {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 80)
    .trim()
  return cleaned === '' ? 'untitled' : cleaned
}

/** ISO → YYYY-MM-DD（文件名用；取 UTC 日期，避免时区漂移成两天）。 */
export function archiveDateStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '0000-00-00'
  return d.toISOString().slice(0, 10)
}

/** 归档文件名：<project-name>-archive-YYYY-MM-DD.md（用户 §1.3 的命名）。 */
export function archiveFileName(projectName: string, iso: string): string {
  return `${sanitizeArchiveSegment(projectName)}-archive-${archiveDateStamp(iso)}.md`
}

/** evidence 边车文件名（与归档 md 同目录，供补写任务与审计回查事实来源）。 */
export function archiveEvidenceFileName(projectName: string, iso: string): string {
  return `${sanitizeArchiveSegment(projectName)}-archive-${archiveDateStamp(iso)}.evidence.json`
}

/** 归档目标（相对 workspaceRoot；宿主半负责拼接与越界校验）。 */
export function archiveRelativeDir(projectName: string): string {
  return `${ARCHIVE_DIR_NAME}/${sanitizeArchiveSegment(projectName)}`
}

// ---------------------------------------------------------------------------
const mdCell = (s: string): string => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()

const isoOf = (ms?: number): string => {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

const dayOf = (ms?: number): string => {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toISOString().slice(0, 10)
}

const listOrNone = (items: string[], none: string): string => (items.length === 0 ? `_${none}_` : items.map((x) => `- ${x}`).join('\n'))

const uniq = (xs: string[]): string[] => [...new Set(xs)]

/**
 * 事实包 → PROJECT ARCHIVE markdown。
 *
 * **纯函数**：同一 facts 必然产出同一 markdown（generatedAt 是入参，不读时钟）。
 * 判断层小节一律写 PENDING_MARKER，绝不编造决策/经验/交付物。
 */
export function buildArchiveMarkdown(facts: ArchiveFacts): string {
  const p = facts.project
  const times = [
    ...facts.tasks.flatMap((t) => [t.createdAt ?? 0, t.updatedAt]),
    ...facts.sessions.map((s) => s.updatedAt ?? 0),
    p.createdAt,
    p.updatedAt,
  ].filter((n) => Number.isFinite(n) && n > 0)
  const from = times.length > 0 ? Math.min(...times) : 0
  const to = times.length > 0 ? Math.max(...times) : 0

  const doneTasks = facts.tasks.filter((t) => t.status === 'done')
  const openTasks = facts.tasks.filter((t) => t.status !== 'done')
  const runningExecs = facts.tasks.flatMap((t) => t.executions.filter((e) => e.endedAt === undefined).map((e) => ({ task: t, exec: e })))
  const totalExecs = facts.tasks.reduce((n, t) => n + t.executions.length, 0)
  const archivedSessions = facts.sessions.filter((s) => s.archived)

  const root = facts.workspaceRoot ?? `（${MANAGED_ROOT_LABEL}）`

  const lines: string[] = []
  lines.push('# Project Archive')
  lines.push('')
  lines.push(
    `> 由 Personal Harness V1.2-A 于 ${facts.generatedAt} 生成。事实层（Project / Period / Important Conversations / Tasks & Execution History / Files-Workspaces / Unresolved Issues / Source References）全部取自官方真源快照，逐条带 id 可回查；标注「${PENDING_MARKER}」的小节本层无真源，**不编造**，由 Harness 补写。`,
  )
  lines.push('')
  lines.push('## Project')
  lines.push('')
  lines.push('| 字段 | 值 |')
  lines.push('| --- | --- |')
  lines.push(`| 项目名称 | ${mdCell(p.name)} |`)
  lines.push(`| 项目 id | \`${mdCell(p.id)}\` |`)
  lines.push(`| 描述 | ${p.description ? mdCell(p.description) : '_未填写_'} |`)
  lines.push(`| 来源 | ${p.seed ? '内置种子档案（registry.json）' : '用户自建'} |`)
  lines.push(`| 星标 | ${p.starred === true ? '★ 重要' : '☆ 常规'} |`)
  lines.push(`| 创建时间 | ${isoOf(p.createdAt)} |`)
  lines.push(`| 归档时元数据更新 | ${isoOf(p.updatedAt)} |`)
  lines.push(`| 归档根 | \`${mdCell(root)}\` |`)
  lines.push('')

  lines.push('## Period')
  lines.push('')
  lines.push(`- 起始（最早可见活动）：${dayOf(from)}`)
  lines.push(`- 结束（最晚可见活动）：${dayOf(to)}`)
  lines.push(`- 覆盖对象：任务 ${facts.tasks.length} 个 · 会话 ${facts.sessions.length} 个 · 工作区 ${facts.workspaces.length} 个`)
  lines.push('')

  lines.push('## Executive Summary')
  lines.push('')
  lines.push(
    `${p.name} 从 ${dayOf(from)} 活动到 ${dayOf(to)}。累计任务 ${facts.tasks.length} 个（已完成 ${doneTasks.length} · 未完成 ${openTasks.length}），执行 ${totalExecs} 次（其中仍在进行 ${runningExecs.length} 次），关联会话 ${facts.sessions.length} 个（已归档 ${archivedSessions.length}），关联工作区 ${facts.workspaces.length} 个。`,
  )
  lines.push('')
  lines.push('_（本段为机器可核对的事实摘要；研判性结论见下方各节。）_')
  lines.push('')

  lines.push('## Original Goal')
  lines.push('')
  if (p.description) {
    lines.push(`项目描述（真源）：${p.description}`)
  } else {
    lines.push('_项目未记录描述 —— 原始目标在 Personal 层没有真源，不作推测。_')
  }
  lines.push('')
  lines.push('任务标题集合（真源，可视为目标的分解）：')
  lines.push('')
  lines.push(listOrNone(facts.tasks.map((t) => `${t.title}（\`${t.id}\`）`), '该项目没有归属任务。'))
  lines.push('')

  lines.push('## What Was Done')
  lines.push('')
  if (facts.tasks.length === 0) {
    lines.push('_无归属任务 —— 无「已完成工作」的事实依据。_')
  } else {
    lines.push('| 任务 | 状态 | 执行次数 | 最近更新 |')
    lines.push('| --- | --- | --- | --- |')
    for (const t of facts.tasks) {
      lines.push(`| ${mdCell(t.title)} \`${t.id}\` | ${mdCell(t.status)} | ${t.executions.length} | ${dayOf(t.updatedAt)} |`)
    }
  }
  lines.push('')

  lines.push('## Key Decisions')
  lines.push('')
  lines.push(`**${PENDING_MARKER}** —— Personal 层不记录决策，无法从真源得出。`)
  lines.push('')
  lines.push(`可用证据：会话 ${facts.sessions.length} 个（见 Important Conversations）、任务 ${facts.tasks.length} 个（见 Tasks & Execution History）。`)
  lines.push('')

  lines.push('## Important Conversations')
  lines.push('')
  if (facts.sessions.length === 0) {
    lines.push('_无归属会话。_')
  } else {
    const sorted = [...facts.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    for (const s of sorted) {
      const flags = [s.archived ? '已归档' : '在册', s.running ? '运行中' : ''].filter((x) => x !== '').join(' · ')
      lines.push(`- ${s.title}（\`${s.id}\`）— 最近更新 ${dayOf(s.updatedAt)}${flags ? ` · ${flags}` : ''}`)
    }
  }
  lines.push('')

  lines.push('## Tasks & Execution History')
  lines.push('')
  if (facts.tasks.length === 0) {
    lines.push('_无归属任务。_')
  } else {
    for (const t of facts.tasks) {
      lines.push(`### ${t.title}`)
      lines.push('')
      lines.push(`- 任务 id：\`${t.id}\``)
      lines.push(`- 状态：${t.status}${t.archived ? '（任务已归档）' : ''}`)
      lines.push(`- 创建 / 最近更新：${dayOf(t.createdAt)} → ${dayOf(t.updatedAt)}`)
      if (t.executions.length === 0) {
        lines.push('- 执行：无')
      } else {
        lines.push('- 执行：')
        for (const e of t.executions) {
          const span = `${isoOf(e.startedAt)} → ${e.endedAt === undefined ? '进行中' : isoOf(e.endedAt)}`
          lines.push(`  - \`${e.id}\` ${span}${e.sessionId ? ` · 会话 \`${e.sessionId}\`` : ''}`)
        }
      }
      lines.push('')
    }
  }

  lines.push('## Deliverables')
  lines.push('')
  lines.push(`**${PENDING_MARKER}** —— 交付物需要判断，Personal 层只存任务/会话引用，不存产物清单。`)
  lines.push('')
  lines.push(`可用证据：工作区 ${facts.workspaces.length} 个（见 Files / Workspaces）、已完成任务 ${doneTasks.length} 个（见 What Was Done）。`)
  lines.push('')

  lines.push('## Files / Workspaces')
  lines.push('')
  if (facts.workspaces.length === 0) {
    lines.push('_该项目未关联工作区；归档文件写入 Personal Harness 自管归档目录。_')
  } else {
    lines.push('| 工作区 | 路径 | workspaceId |')
    lines.push('| --- | --- | --- |')
    for (const w of facts.workspaces) {
      lines.push(`| ${mdCell(w.title)} | \`${mdCell(w.path)}\` | \`${mdCell(w.workspaceId)}\` |`)
    }
  }
  lines.push('')

  lines.push('## Important Knowledge')
  lines.push('')
  lines.push(`**${PENDING_MARKER}** —— 本层不抽取知识条目；跨会话记忆属于 V1.2-D，不在归档模块内伪造。`)
  lines.push('')

  lines.push('## Unresolved Issues')
  lines.push('')
  const unresolved = openTasks.map((t) => `${t.title}（\`${t.id}\`）— 状态 ${t.status}`)
  const running = runningExecs.map((r) => `执行 \`${r.exec.id}\` 尚未结束（任务 \`${r.task.id}\`）`)
  if (unresolved.length === 0 && running.length === 0) {
    lines.push('_真源显示没有未完成任务，也没有进行中的执行。_')
  } else {
    lines.push(listOrNone([...unresolved, ...running], '无'))
  }
  lines.push('')

  lines.push('## Lessons Learned')
  lines.push('')
  lines.push(`**${PENDING_MARKER}** —— 经验判断无真源，交由 Harness 依据上方事实与对应会话补写。`)
  lines.push('')

  lines.push('## Suggested Next Steps')
  lines.push('')
  if (openTasks.length === 0 && runningExecs.length === 0) {
    lines.push('_没有未完成事项可供派生；下一步建议需由 Harness 依据会话内容补写。_')
  } else {
    lines.push('（由 Unresolved Issues 直接派生，逐条对应 —— 不含推测性规划。）')
    lines.push('')
    for (const t of openTasks) lines.push(`- 复核并推进/关闭任务「${t.title}」（\`${t.id}\`，当前 ${t.status}）`)
    for (const r of runningExecs) lines.push(`- 处理未结束的执行 \`${r.exec.id}\`（任务 \`${r.task.id}\`）`)
  }
  lines.push('')

  lines.push('## Source References')
  lines.push('')
  lines.push(`- 事实包版本：${ARCHIVE_FACTS_VERSION}`)
  lines.push(`- 生成时刻：${facts.generatedAt}`)
  lines.push(`- 项目：\`${p.id}\``)
  lines.push(`- 任务 id：${facts.tasks.length === 0 ? '无' : facts.tasks.map((t) => `\`${t.id}\``).join(' · ')}`)
  lines.push(`- 会话 id：${facts.sessions.length === 0 ? '无' : facts.sessions.map((s) => `\`${s.id}\``).join(' · ')}`)
  lines.push(`- 工作区 id：${facts.workspaces.length === 0 ? '无' : facts.workspaces.map((w) => `\`${w.workspaceId}\``).join(' · ')}`)
  lines.push('- 真源：官方任务板快照（task-board ledger）· 官方会话列表 · 官方 Workspace 目录 · Personal 关系层（localStorage，schema v2）')
  lines.push('')
  return lines.join('\n')
}

/** evidence 边车（机器可读事实包；与 md 同目录落盘，供补写与审计回查）。 */
export function buildArchiveEvidence(facts: ArchiveFacts): Record<string, unknown> {
  return {
    version: ARCHIVE_FACTS_VERSION,
    generatedAt: facts.generatedAt,
    workspaceRoot: facts.workspaceRoot,
    workspaceSource: facts.workspaceSource,
    project: facts.project,
    counts: {
      tasks: facts.tasks.length,
      tasksDone: facts.tasks.filter((t) => t.status === 'done').length,
      executions: facts.tasks.reduce((n, t) => n + t.executions.length, 0),
      sessions: facts.sessions.length,
      workspaces: facts.workspaces.length,
    },
    tasks: facts.tasks,
    sessions: facts.sessions,
    workspaces: facts.workspaces,
    activity: facts.activity,
  }
}

// ---------------------------------------------------------------------------
/** 归档写入请求（客户端 → 宿主半）。 */
export interface ArchiveWriteRequest {
  workspaceRoot: string | null
  projectId: string
  projectName: string
  markdown: string
  evidence: Record<string, unknown>
  fileName: string
  evidenceFileName: string
}

export interface ArchiveWriteResult {
  ok: boolean
  /** 落盘后的真实绝对路径（成功时）。 */
  file?: string
  evidenceFile?: string
  bytes?: number
  /** md 与 evidence 的回读字节数（成功时）：写盘不是"以为写了"，而是**读回来核过**。 */
  readBack?: { markdownBytes: number; evidenceBytes: number }
  /** md 里必须出现的标题（宿主半回读校验用；缺失即失败）。 */
  headingsChecked?: string[]
  message: string
}

/** 必须出现在归档 md 里的小节标题（落盘回读校验的判据，与 buildArchiveMarkdown 严格一致）。 */
export const ARCHIVE_REQUIRED_HEADINGS = [
  '# Project Archive',
  '## Project',
  '## Period',
  '## Executive Summary',
  '## Original Goal',
  '## What Was Done',
  '## Key Decisions',
  '## Important Conversations',
  '## Tasks & Execution History',
  '## Deliverables',
  '## Files / Workspaces',
  '## Important Knowledge',
  '## Unresolved Issues',
  '## Lessons Learned',
  '## Suggested Next Steps',
  '## Source References',
] as const

/**
 * 请求宿主半落盘（唯一写盘通道）。
 *
 * 失败语义（用户 §1.3「Archive summary generation failure 不得 archive project」）：
 *   路由不存在 / 非 2xx / ok:false / 网络异常 → 一律返回 ok:false，
 *   调用方**必须**据此放弃 archive，并把 message 显示给用户。
 */
export async function requestArchiveWrite(input: ArchiveWriteRequest, signal?: AbortSignal): Promise<ArchiveWriteResult> {
  let res: Response
  try {
    res = await fetch(ARCHIVE_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  } catch (e) {
    return { ok: false, message: `宿主归档服务不可达（${e instanceof Error ? e.message : String(e)}）—— 未生成任何文件，项目保持未封存。` }
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: unknown }
      if (typeof body?.message === 'string') detail = `：${body.message}`
    } catch {
      // non-JSON body: keep status only
    }
    return { ok: false, message: `宿主归档服务返回 ${res.status}${detail} —— 未生成任何文件，项目保持未封存。` }
  }
  let body: ArchiveWriteResult
  try {
    body = (await res.json()) as ArchiveWriteResult
  } catch (e) {
    return { ok: false, message: `宿主归档服务响应无法解析（${e instanceof Error ? e.message : String(e)}）—— 项目保持未封存。` }
  }
  if (body?.ok !== true) {
    return { ok: false, message: body?.message ?? '宿主归档服务报告失败 —— 项目保持未封存。' }
  }
  return body
}

/** 汇总用于 UI 展示的归档目录（人类可读；与宿主半 server/index.js 的实际拼接严格一致）。 */
export function archiveDirLabel(facts: ArchiveFacts): string {
  if (facts.workspaceRoot === null) return `~/ ${archiveRelativeDir(facts.project.name)}/（${MANAGED_ROOT_LABEL}）`
  return `${facts.workspaceRoot.replace(/\/+$/, '')}/${archiveRelativeDir(facts.project.name)}/`
}

// ---------------------------------------------------------------------------
// A3 补写（enrichment）：判断层小节（Key Decisions / Deliverables / Important Knowledge /
// Lessons Learned）在 Personal 层**没有真源**，本插件不猜 —— 由 Harness（官方执行会话）
// 依据归档草稿 + evidence 事实包补写。这里只负责生成那份**任务指令**（纯函数，可测）。
//
// 为什么不做成"插件自己调 LLM"：插件客户端没有官方 LLM 通道；而官方 Task/执行会话本来
// 就是 Harness 干活的正规通道（与 New Task / 任务板同一条路），并且天然受工作区沙箱约束。

export const ENRICH_SECTIONS = [
  'Key Decisions（关键决策：为什么这么选、放弃了什么）',
  'Deliverables（交付物：真正产出了什么，逐项给依据）',
  'Important Knowledge（重要知识：本项目产出的可复用结论）',
  'Lessons Learned（经验教训：踩过的坑与代价）',
  'Executive Summary 中属于研判的结论部分',
] as const

/** 需要保留的 16 个必需小节标题（补写时不得增删）。 */
export function requiredHeadingList(): string[] {
  return [...ARCHIVE_REQUIRED_HEADINGS]
}

/** 生成「补写归档叙述性小节」的官方任务指令（纯函数）。 */
export function buildEnrichPrompt(input: {
  projectName: string
  projectId: string
  draftPath: string
  evidencePath: string
}): string {
  const sections = ENRICH_SECTIONS.map((s) => `   - ${s}`).join('\n')
  const headings = requiredHeadingList().map((h) => `   ${h}`).join('\n')
  return [
    `【任务】为已封存项目「${input.projectName}」补写归档文件中的叙述性小节（就地编辑，不要另建文件）。`,
    '',
    `归档草稿（已生成；事实层来自官方真源，其中 id / 时间戳 / 计数**不得改动**）：`,
    `   ${input.draftPath}`,
    '',
    `事实包（机器可读；逐条带真源 id，供你核对与引用）：`,
    `   ${input.evidencePath}`,
    '',
    '请先读这两个文件，然后把下列小节里标记为「待补写（需叙述性总结）」的内容替换为真正的总结：',
    sections,
    '',
    '硬性纪律：',
    '1. 只依据这两个文件里已有的事实、以及 Source References 中列出的会话的真实内容（可用 why_file / why_find 回查历史）。',
    '2. **证据不足就明确写「现有证据不足以判断」**；不得编造决策、结论、交付物、数字或文件名。',
    '3. 下列必需小节必须全部保留（标题逐字不变，不新增也不删除）：',
    headings,
    '4. 不要改动事实表格中的 id、时间戳、状态与计数。',
    '5. 改完后回读文件，确认上述标题齐备、内容非空，然后汇报：改了哪些小节、各依据了哪些来源。',
    '',
    `项目 id：${input.projectId}（Personal 关系层标识，勿改）`,
  ].join('\n')
}
