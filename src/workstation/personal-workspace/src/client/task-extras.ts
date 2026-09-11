// dsh-personal-workspace — 「自然语言创建任务」：任务补充字段（Personal 组织层，本机持久化）。
//
// 为什么需要这一层（审计事实，见 docs/E4_INVESTIGATION_REPORT.md 与 2026-09-10 协议审计）：
//   官方任务账本（`~/.dsh/task-board/ledger-v2.json`，Host = @linxin666/dsh-client-ui-task-board）
//   **只**接受这些字段：title / description / prompt / workspaceId / mode / permission / model /
//   schedule{enabled,cron}（+ freeze / handover）。create/update 是**白名单精确键集**：
//   多写一个键（dueAt、notes、projectId…）整条请求直接 HTTP 400 `invalid-action`。
//   ⇒ 「截止时间 / 预期交付物 / 约束 / 备注 / 逐字原始需求」在官方任务里**没有存储位**，
//     「项目归属」也不在官方任务里（它属于本仓库既有的真实关系层 `dsh.personal.projects.v1`）。
//
// 因此本层只做两件事，且严格自限：
//   ① 把「官方没有位子、但用户确实填了」的补充字段落本机（刷新后能回显、能再编辑）；
//   ② 保存**逐字原始需求**（用户的自然语言原文永不因识别/改写而丢失）。
//
// 纪律（与 task-model.ts / projects.ts 同构）：
//   · 绝不复制官方执行真源（状态、执行、会话、周期规则都在官方账本里，本层只存引用 id）；
//   · 绝不冒充「已保存到任务」：写入官方 prompt/description 的内容是**另一条真实路径**，
//     本层失败不影响它，UI 必须分别如实说明；
//   · localStorage 单键 `dsh.personal.taskextras.v1`；解析失败 → 空档重来（不抛错）；
//   · headless（无 window/localStorage）→ 内存 Map 降级，不抛错。
import type { DraftEngine } from './draft'

export const TASK_EXTRAS_STORE_KEY = 'dsh.personal.taskextras.v1'
export const TASK_EXTRAS_STORE_VERSION = 1

/** 一条任务的补充字段（全部为「用户填了才有」的可选内容）。 */
export interface TaskExtraRecord {
  /** 官方 TaskRecord.id（本层唯一外键；不复制任何官方字段）。 */
  taskId: string
  /** 逐字原始需求（用户在输入框里写的原文；永不改写、永不截断）。 */
  original: string
  /** 备注（原文中未被结构化字段覆盖的句子，逐字；不做生成式总结）。 */
  notes: string
  /** 预期交付物。 */
  deliverable: string
  /** 约束与注意事项。 */
  constraints: string
  /** 背景与补充说明。 */
  background: string
  /** 截止时间（'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm'，本地；'' = 未填）。 */
  dueAt: string
  /** 截止时间在原文里的原短语（依据展示；'' = 原文没提）。 */
  duePhrase: string
  /** 识别引擎（诚实标注：'rules' 就是本地规则，绝不冒充 AI）。 */
  engine: DraftEngine
  /** 引擎自述（人读）。 */
  engineDetail: string
  /** 识别完成时刻（ms epoch）。 */
  recognizedAt: number
  /** 落盘时刻（ms epoch）。 */
  savedAt: number
}

interface StoreData {
  v: typeof TASK_EXTRAS_STORE_VERSION
  /** taskId → 补充字段。 */
  byTask: Record<string, TaskExtraRecord>
}

/**
 * 空档工厂（**每次新建对象**）。
 * 绝不共享一个可变常量：`parse()` 失败时会把它交出去，而 `save()` 会往它的 `byTask` 里写 ——
 * 那样「一次坏 JSON」就会让旧记录从共享空档里复活（smoke ⑦ 抓到的真实缺陷）。
 */
function empty(): StoreData {
  return { v: TASK_EXTRAS_STORE_VERSION, byTask: {} }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function parseRecord(taskId: string, v: unknown): TaskExtraRecord | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const engine: DraftEngine = o.engine === 'ai' ? 'ai' : 'rules'
  return {
    taskId,
    original: str(o.original),
    notes: str(o.notes),
    deliverable: str(o.deliverable),
    constraints: str(o.constraints),
    background: str(o.background),
    dueAt: str(o.dueAt),
    duePhrase: str(o.duePhrase),
    engine,
    engineDetail: str(o.engineDetail),
    recognizedAt: num(o.recognizedAt),
    savedAt: num(o.savedAt),
  }
}

function parse(raw: string | null): StoreData {
  if (raw === null || raw === '') return empty()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return empty()
    const d = parsed as Record<string, unknown>
    if (d.v !== TASK_EXTRAS_STORE_VERSION) return empty()
    const byTaskRaw = d.byTask
    if (byTaskRaw === null || typeof byTaskRaw !== 'object') return empty()
    const byTask: Record<string, TaskExtraRecord> = {}
    for (const [taskId, rec] of Object.entries(byTaskRaw as Record<string, unknown>)) {
      if (taskId === '') continue
      const parsedRec = parseRecord(taskId, rec)
      if (parsedRec !== null && (parsedRec.original !== '' || parsedRec.notes !== '' || parsedRec.deliverable !== '' || parsedRec.constraints !== '' || parsedRec.background !== '' || parsedRec.dueAt !== '')) {
        byTask[taskId] = parsedRec
      }
    }
    return { v: TASK_EXTRAS_STORE_VERSION, byTask }
  } catch {
    return empty()
  }
}

export class TaskExtrasStore {
  private mem: StoreData | null = null
  private readonly useStorage: boolean

  constructor() {
    this.useStorage = typeof localStorage !== 'undefined' && localStorage !== null
    if (!this.useStorage) this.mem = { v: TASK_EXTRAS_STORE_VERSION, byTask: {} }
  }

  private read(): StoreData {
    if (!this.useStorage) return this.mem ?? empty()
    try {
      return parse(localStorage.getItem(TASK_EXTRAS_STORE_KEY))
    } catch {
      return empty()
    }
  }

  private write(next: StoreData): void {
    if (!this.useStorage) {
      this.mem = next
      return
    }
    try {
      localStorage.setItem(TASK_EXTRAS_STORE_KEY, JSON.stringify(next))
    } catch {
      // 存储满 / 隐私模式：忽略（本层只是补充字段，官方任务与 prompt 不受影响）
    }
  }

  /** 保存（同 taskId 覆盖；只保留用户真的填了东西的记录）。 */
  save(rec: Omit<TaskExtraRecord, 'savedAt'> & { savedAt?: number }): void {
    if (typeof rec.taskId !== 'string' || rec.taskId === '') return
    const empty =
      rec.original === '' && rec.notes === '' && rec.deliverable === '' && rec.constraints === '' && rec.background === '' && rec.dueAt === ''
    const d = this.read()
    if (empty) {
      if (d.byTask[rec.taskId] !== undefined) {
        delete d.byTask[rec.taskId]
        this.write(d)
      }
      return
    }
    d.byTask[rec.taskId] = {
      taskId: rec.taskId,
      original: str(rec.original),
      notes: str(rec.notes),
      deliverable: str(rec.deliverable),
      constraints: str(rec.constraints),
      background: str(rec.background),
      dueAt: str(rec.dueAt),
      duePhrase: str(rec.duePhrase),
      engine: rec.engine === 'ai' ? 'ai' : 'rules',
      engineDetail: str(rec.engineDetail),
      recognizedAt: num(rec.recognizedAt, Date.now()),
      savedAt: num(rec.savedAt, Date.now()),
    }
    this.write(d)
  }

  get(taskId: string): TaskExtraRecord | undefined {
    if (typeof taskId !== 'string' || taskId === '') return undefined
    const rec = this.read().byTask[taskId]
    return rec !== undefined ? { ...rec } : undefined
  }

  /** 全部记录（按 savedAt 降序；UI 只用它回显「本页创建过的任务」，不做看板）。 */
  list(): TaskExtraRecord[] {
    return Object.values(this.read().byTask)
      .slice()
      .sort((a, b) => b.savedAt - a.savedAt)
  }

  clear(taskId: string): void {
    const d = this.read()
    if (d.byTask[taskId] === undefined) return
    delete d.byTask[taskId]
    this.write(d)
  }
}

/** 模块级实例（页面单例，与 personalTasksStore / projectRegistry 用法一致）。 */
export const taskExtrasStore = new TaskExtrasStore()
