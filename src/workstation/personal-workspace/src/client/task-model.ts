// dsh-personal-workspace — E4-FIX-IA-2-TASK · Personal 任务组织层存储（TASK-3）。
//
// 纪律（与 projectRegistry 同构）：
//   · 只存 **Personal 组织层** 的辅助标记，**绝不复制官方执行真源**：
//       - armedAt[taskId]   ：本层「经 Personal UI 启用/创建定期任务」的时刻书签
//                              （用于错过 reconcile 的统计基准；官方不存该信息）。
//       - missedAcks[taskId]：用户把某次错过「标为已错过/已处理」的时刻集合。
//   · localStorage 单键 `dsh.personal.tasks.v1`；损坏容错（解析失败 → 空档重来）；
//   · headless（无 window/localStorage）→ 内存 Map 降级，不抛错；
//   · 每次读写都重读（简单、跨实例安全）；不建订阅（UI 每次渲染时现读）。

export const PERSONAL_TASKS_STORE_KEY = 'dsh.personal.tasks.v1'

export const PERSONAL_TASKS_STORE_VERSION = 1

export interface PersonalTasksData {
  v: typeof PERSONAL_TASKS_STORE_VERSION
  /** taskId → 本层登记「启用调度/创建定期任务」的时刻(ms epoch)。 */
  armedAt: Record<string, number>
  /** taskId → 用户 ack 的错过时刻(ms epoch) 数组（升序去重）。 */
  missedAcks: Record<string, number[]>
  /** taskId → 来源会话引用（TASK-7：originating session 映射，只存官方会话 id + 标题引用，不复制正文）。 */
  originSessions: Record<string, OriginRef>
}

/** 来源会话引用（Personal 组织层；正文永远留在官方会话里）。 */
export interface OriginRef {
  sessionId: string
  /** 会话标题（展示用；官方 sessions.list displayTitle）。 */
  title?: string
  /** 登记时刻(ms epoch)。 */
  at: number
}

function memory(): PersonalTasksData {
  return { v: PERSONAL_TASKS_STORE_VERSION, armedAt: {}, missedAcks: {}, originSessions: {} }
}

function isData(v: unknown): v is PersonalTasksData {
  if (v === null || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  if (d.v !== PERSONAL_TASKS_STORE_VERSION) return false
  if (d.armedAt === null || typeof d.armedAt !== 'object') return false
  if (d.missedAcks !== undefined && (d.missedAcks === null || typeof d.missedAcks !== 'object')) return false
  if (d.originSessions !== undefined && (d.originSessions === null || typeof d.originSessions !== 'object')) return false
  return true
}

function parse(raw: string | null): PersonalTasksData {
  if (raw === null || raw === '') return memory()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isData(parsed)) return memory()
    const armedAt: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed.armedAt)) {
      if (typeof v === 'number' && Number.isFinite(v)) armedAt[k] = v
    }
    const missedAcks: Record<string, number[]> = {}
    for (const [k, arr] of Object.entries(parsed.missedAcks)) {
      if (!Array.isArray(arr)) continue
      const times = arr.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
      if (times.length > 0) missedAcks[k] = times
    }
    const originSessions: Record<string, OriginRef> = {}
    for (const [k, v] of Object.entries(parsed.originSessions ?? {})) {
      const o = v as Record<string, unknown>
      if (o !== null && typeof o === 'object' && typeof o.sessionId === 'string' && o.sessionId !== '' && typeof o.at === 'number' && Number.isFinite(o.at)) {
        originSessions[k] = {
          sessionId: o.sessionId,
          ...(typeof o.title === 'string' && o.title !== '' ? { title: o.title } : {}),
          at: o.at,
        }
      }
    }
    return { v: PERSONAL_TASKS_STORE_VERSION, armedAt, missedAcks, originSessions }
  } catch {
    return memory()
  }
}

/** 读存储；内存 fallback 实例用于 headless。 */
export class PersonalTasksStore {
  private mem: PersonalTasksData | null = null
  private readonly useStorage: boolean

  constructor() {
    this.useStorage = typeof localStorage !== 'undefined' && localStorage !== null
    if (!this.useStorage) this.mem = memory()
  }

  private read(): PersonalTasksData {
    if (!this.useStorage) return this.mem ?? memory()
    try {
      return parse(localStorage.getItem(PERSONAL_TASKS_STORE_KEY))
    } catch {
      return memory()
    }
  }

  private write(next: PersonalTasksData): void {
    if (!this.useStorage) {
      this.mem = next
      return
    }
    try {
      localStorage.setItem(PERSONAL_TASKS_STORE_KEY, JSON.stringify(next))
    } catch {
      // 存储满/隐私模式：忽略（只影响 ack/基准标记，不影响执行真相）
    }
  }

  /** 登记：该任务被本层启用/创建为定期任务（时刻 ms；缺省 now）。 */
  markArmed(taskId: string, at = Date.now()): void {
    if (typeof taskId !== 'string' || taskId === '') return
    const d = this.read()
    if (typeof d.armedAt[taskId] !== 'number' || d.armedAt[taskId] > at) d.armedAt[taskId] = at
    this.write(d)
  }

  armedAtOf(taskId: string): number | undefined {
    const at = this.read().armedAt[taskId]
    return typeof at === 'number' ? at : undefined
  }

  /** 用户把错过时刻标为已处理。 */
  ackMissed(taskId: string, at: number): void {
    if (typeof taskId !== 'string' || taskId === '' || !Number.isFinite(at)) return
    const d = this.read()
    const list = [...(d.missedAcks[taskId] ?? []), at].filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
    const uniq = [...new Set(list)]
    d.missedAcks[taskId] = uniq
    this.write(d)
  }

  isMissedAcked(taskId: string, at: number): boolean {
    return (this.read().missedAcks[taskId] ?? []).includes(at)
  }

  missedAcksOf(taskId: string): number[] {
    return this.read().missedAcks[taskId] ?? []
  }

  /** 任务删除/归档时清理（避免长期累积）。 */
  clearFor(taskId: string): void {
    const d = this.read()
    let changed = false
    if (d.armedAt[taskId] !== undefined) {
      delete d.armedAt[taskId]
      changed = true
    }
    if (d.missedAcks[taskId] !== undefined) {
      delete d.missedAcks[taskId]
      changed = true
    }
    if (d.originSessions[taskId] !== undefined) {
      delete d.originSessions[taskId]
      changed = true
    }
    if (changed) this.write(d)
  }

  /** TASK-7：登记来源会话引用（originating session 映射；不复制正文）。 */
  markOrigin(taskId: string, origin: OriginRef): void {
    if (typeof taskId !== 'string' || taskId === '' || origin === null || typeof origin !== 'object') return
    if (typeof origin.sessionId !== 'string' || origin.sessionId === '') return
    const d = this.read()
    d.originSessions[taskId] = {
      sessionId: origin.sessionId,
      ...(typeof origin.title === 'string' && origin.title !== '' ? { title: origin.title } : {}),
      at: Number.isFinite(origin.at) ? origin.at : Date.now(),
    }
    this.write(d)
  }

  originOf(taskId: string): OriginRef | undefined {
    const o = this.read().originSessions[taskId]
    return o !== undefined ? { ...o } : undefined
  }
}

/** 模块级实例（页面单例，与 projectRegistry 用法一致）。 */
export const personalTasksStore = new PersonalTasksStore()
