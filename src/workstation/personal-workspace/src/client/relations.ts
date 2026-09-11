// dsh-personal-workspace — 关系层派生（E4-FIX-IA-2 FINAL · PHASE F）。
//
// 语义：Project = **纯关系层**（Personal relation），不是官方 schema 的一部分。
//   本模块只做「按关系把官方真源分组」的纯派生 + 一组**诚实**的改挂/解除/归入操作，
//   不做任何写官方 Session/Task schema 的事（relation only）。
//   Unassigned（未归入任何项目）是**合法状态**，不是错误 —— 必须有计数与入口。
//
// React-free / 可 headless（smoke-project-relations.mjs）。

/** 关系查询的最小接口（由 projectRegistry 提供）。 */
export interface RelationLookup {
  projectOfTask(taskId: string): string | undefined
  projectOfSession(sessionId: string): string | undefined
}

/** 只依赖 id 的最小行形状（Task / Session 行都满足）。 */
export interface Identified {
  id: string
}

/** 关系变更函数集合（真实调用方 = projectRegistry；测试可注入纯函数）。 */
export interface RelationWriter {
  assignTask(taskId: string, projectId: string): void
  unassignTask(taskId: string): void
  assignSession(sessionId: string, projectId: string): void
  unassignSession(sessionId: string): void
}

export interface RelationCounts {
  /** 当前项目下的项数。 */
  total: number
  unassigned: number
}

export interface UnassignedCounts {
  tasks: number
  sessions: number
  /** 两者之和（供 Project Center 一行汇总；Unassigned 是合法状态，不是异常）。 */
  all: number
}

/** 未归入任何项目的项（诚实投影：id 列表，由调用方自行渲染）。 */
export function unassignedOf<T extends Identified>(
  rows: readonly T[],
  projectOf: (id: string) => string | undefined,
): T[] {
  return rows.filter((r) => projectOf(r.id) === undefined)
}

export function assignedTo<T extends Identified>(
  rows: readonly T[],
  projectId: string,
  projectOf: (id: string) => string | undefined,
): T[] {
  return rows.filter((r) => projectOf(r.id) === projectId)
}

export function unassignedCounts(
  tasks: readonly Identified[],
  sessions: readonly Identified[],
  lookup: RelationLookup,
): UnassignedCounts {
  const t = unassignedOf(tasks, (id) => lookup.projectOfTask(id)).length
  const s = unassignedOf(sessions, (id) => lookup.projectOfSession(id)).length
  return { tasks: t, sessions: s, all: t + s }
}

/** 改挂目标：除当前项目外的全部项目（自建/种子都合法；空数组 = 没有可改挂目标）。 */
export function rebindTargets<P extends { id: string }>(projects: readonly P[], currentProjectId: string): P[] {
  return projects.filter((p) => p.id !== currentProjectId)
}

export interface RelationOpResult {
  ok: boolean
  /** 人类可读结果（成功也如实说明做了什么；失败必带原因 —— 绝不静默失败）。 */
  message: string
}

/**
 * 把任务改挂到目标项目（target=null → 移出项目，回到合法的 Unassigned）。
 * 失败不抛：返回 `{ok:false, message}`，由 UI 如实展示（不制造“已改挂”的假象）。
 */
export function rebindTask(
  writer: RelationWriter,
  taskId: string,
  targetProjectId: string | null,
  projectName?: (id: string) => string | undefined,
): RelationOpResult {
  if (typeof taskId !== 'string' || taskId === '') return { ok: false, message: '任务 id 为空，无法改挂（未做任何变更）。' }
  try {
    if (targetProjectId === null) {
      writer.unassignTask(taskId)
      return { ok: true, message: '已移出项目（任务回到「未归入项目」，官方任务本身与状态不变）。' }
    }
    writer.assignTask(taskId, targetProjectId)
    const name = projectName?.(targetProjectId) ?? targetProjectId
    return { ok: true, message: `已归入「${name}」（仅 Personal 关系层，未改动官方任务数据）。` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `改挂失败：${reason}（关系未变更）` }
  }
}

/** 会话与任务同语义；会话关系只登记在 Personal 层，**不碰**官方 Session（§19）。 */
export function rebindSession(
  writer: RelationWriter,
  sessionId: string,
  targetProjectId: string | null,
  projectName?: (id: string) => string | undefined,
): RelationOpResult {
  if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, message: '会话 id 为空，无法改挂（未做任何变更）。' }
  try {
    if (targetProjectId === null) {
      writer.unassignSession(sessionId)
      return { ok: true, message: '已移出项目（会话回到「未归入项目」；官方会话与其归档状态不变）。' }
    }
    writer.assignSession(sessionId, targetProjectId)
    const name = projectName?.(targetProjectId) ?? targetProjectId
    return { ok: true, message: `会话已归入「${name}」（仅 Personal 关系层，官方会话不受影响）。` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `改挂失败：${reason}（关系未变更）` }
  }
}

/** UI 常驻文案：关系层边界的一句话明示（避免用户以为改了官方数据）。 */
export const RELATION_NOTE =
  '项目归属是 Personal 关系层：改挂/解除只影响个人视图，不会修改官方会话或任务的数据与状态。'
