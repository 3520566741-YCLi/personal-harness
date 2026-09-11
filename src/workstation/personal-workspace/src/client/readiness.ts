// dsh-personal-workspace — E4-FIX-IA-2-TASK · Task Readiness Check（TASK-5）。
//
// 定位：Composer「创建前检查」的纯函数 —— **只标真正阻塞创建的项**（blockers），其余以
// cautions（不阻塞创建但需如实知晓的提醒）呈现，绝不把「可稍后补」当阻塞、也不造假进度。
// 判据全部基于官方真实约束：
//   · Host create：title 不可空（applyCreateTask 拒绝空标题）；prompt 是执行正文（官方 runner 必填语义）。
//   · Recurring：周期完整 = frequency + 具体时间（hour/minute）；weekly 需 weekdays；monthly 需 dayOfMonth。
//   · 权限：官方定期到期只自动执行 ≤ 会话默认（read-only）的任务；高于默认 → 到期被官方跳过
//     （不询问不执行）→ 属「创建允许但不会自动执行」的诚实提醒（cautions），不误标为字段缺失。
//   · 权限必须是官方枚举；工作区提示必须能在官方目录里找到（找不到 → 忽略，不阻塞）。
// React-free / 可 headless（smoke-personal-readiness.mjs）。

import type { DraftTask } from './parser'
import type { TaskPermission } from './projection'
import { TASK_PERMISSIONS } from './projection'

export interface ReadinessFacts {
  /** 官方工作区显示名（匹配草稿里的 workspaceName 提示）。 */
  workspaceTitles?: readonly string[]
}

export interface ReadinessResult {
  /** 真正阻塞创建的项（中文人类文案；为空 = 可以创建）。 */
  blockers: string[]
  /** 不阻塞但需如实展示的提醒（如定期+高权限=到期不会自动执行）。 */
  cautions: string[]
}

function has(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object'
}

/** 权限是否高于官方默认档 read-only（官方确认门语义，与 projection.exceedsSessionDefault 一致）。 */
function elevated(p: TaskPermission | undefined): boolean {
  return p === 'workspace-write' || p === 'danger-full-access'
}

export function readinessOf(draft: DraftTask, facts?: ReadinessFacts): ReadinessResult {
  const blockers: string[] = []
  const cautions: string[] = []

  // ---- 标题 / 指令正文（官方 create 硬约束） ----
  const title = typeof draft.title === 'string' ? draft.title.trim() : ''
  if (title === '' || title === '未命名任务') blockers.push('任务标题为空，请先写标题')
  const prompt = typeof draft.prompt === 'string' ? draft.prompt.trim() : ''
  if (prompt === '' && blockers.length === 0) blockers.push('还没有填写任务指令（执行时发给 AI 的内容）')

  // ---- 周期完整性（仅 recurring / ask 需要） ----
  if (draft.kind !== 'single') {
    const rec = has(draft.recurrence) ? draft.recurrence : undefined
    const frequency = typeof rec?.frequency === 'string' ? rec!.frequency : undefined
    if (frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') {
      const hour = rec!.hour
      const minute = rec!.minute
      const timeOk = typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
        typeof minute === 'number' && Number.isInteger(minute) && minute >= 0 && minute <= 59
      if (!timeOk) blockers.push('重复时间不完整：请选择每天几点几分')
      if (frequency === 'weekly') {
        const days = Array.isArray(rec!.weekdays) ? rec!.weekdays : []
        if (days.length === 0) blockers.push('重复时间不完整：请选择每周的星期几')
      }
      if (frequency === 'monthly') {
        const d = rec!.dayOfMonth
        if (!(typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 31)) blockers.push('重复时间不完整：请选择每月几号')
      }
    } else if (blockers.length === 0) {
      blockers.push('还未选择任务类型：单次 或 定期')
    }
  }

  // ---- 权限（官方枚举 + 定期自动执行边界） ----
  const perm: TaskPermission | undefined = draft.permission
  if (perm !== undefined && !(TASK_PERMISSIONS as readonly string[]).includes(perm)) {
    blockers.push('权限设置有误（未知选项）')
  }
  if (draft.kind === 'recurring' && perm !== undefined && elevated(perm)) {
    cautions.push('此定期任务的权限高于只读：到期不会自动执行，需先在官方任务板确认权限绑定（确认一次后即可按周期自动执行）')
  }
  if (draft.kind === 'recurring' && perm === undefined) {
    cautions.push('定期任务默认按只读权限执行；如需写入请改为「工作区可写」并在任务板确认权限')
  }

  // ---- 工作区提示（官方目录匹配；找不到 → 诚实忽略） ----
  const wsName = typeof draft.workspaceName === 'string' ? draft.workspaceName.trim() : ''
  if (wsName !== '' && facts?.workspaceTitles !== undefined && !facts.workspaceTitles.includes(wsName)) {
    cautions.push(`未在官方工作区里找到「${wsName}」，将使用默认工作区（可手动选择）`)
  }

  // ---- 所有定期任务都适用的一句明示（UI 常驻也可复用） ----
  if (draft.kind === 'recurring' || draft.kind === 'ask') {
    cautions.push('定期任务仅在 DeepSeek Harness 运行时才会执行；关闭应用期间到期的会自动跳过')
  }

  return { blockers, cautions }
}

/** 便捷：是否有阻塞项。 */
export function isReady(result: ReadinessResult): boolean {
  return result.blockers.length === 0
}
