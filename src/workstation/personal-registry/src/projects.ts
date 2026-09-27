// dsh-personal-registry — Personal Projects + Relation Layer（E4-FIX-IA-2 · IA2-1）。
//
// 定位（用户在 E4-FIX-IA-2 中拍板的分层）：
//   官方 Harness 能力 = Truth Source；Task runtime / Session runtime / Workspace /
//   Files 全部走官方。**Project 是 Personal 新增的组织语义**（官方无 project 概念，
//   见 V1_2_PROJECT_MGMT_REQUIREMENT R-LD：ledger 客户端不可读、sessions 行无 projectId），
//   因此 Project 及其关系由 Personal 层管理——这是允许的 Personal organizational layer。
//
// 本模块 = 该 Personal 层的唯一数据入口（所有 UI 面：workspace 的 Home / 新任务 / 任务板 /
// Project Center / Workspace Center，sidebar 的 Mini Mission Control，全部从这里取，
// 禁止在 UI 文件里再造第二份关系状态）。
//
// 真源纪律（延续 E4 红线，不违反任何一条）：
//   - 不复制 Host 数据：关系只存 Host 侧稳定 id（taskId / sessionId / workspaceId），
//     不复制任务正文、会话正文、归档标记、文件树。
//   - Project 种子来自 registry.json（构建期打包，静态目录）；
//     用户自建项目与全部关系为动态数据。
//   - 持久化：localStorage 单键 `dsh.personal.projects.v1`（Personal 组织语义的单一真源；
//     不是 Task/Session 真源的第二副本）。跨插件 bundle（personal-sidebar 等各自打包本
//     模块副本）经 storage 事件同步 → 同一 localStorage 键 = 所有 bundle 的共享真源，
//     bundle 内各自镜像 + pub/sub 供 useSyncExternalStore。
//   - 写穿（write-through）：每次变更先改内存镜像 → setItem → notify（本 bundle +
//     storage 事件自然广播）。任何 bundle 崩溃不影响已落盘数据。
//
// UI 词：界面显示「项目 / 任务 / 会话 / 工作区」，不暴露 id 协议。
//
// ===========================================================================
// V1.2-A（Project Lifecycle）在本文件的三处实质变更 —— 每条都有实证理由：
//
// ① **存储版本 1 → 2，且迁移必须先修**。
//    旧实现在版本不匹配时 `return empty`（整份丢弃用户项目）。v2 的迁移管线：
//    逐版本升级 + 幂等 + 绝不丢旧项目 + 未来更高版本「降级读」不销毁未知字段 +
//    损坏内容先备份再空态。理由：用户项目只存在于浏览器 localStorage，丢了没有任何后端可恢复。
//
// ② **生命周期字段（星标/封存/归档文件）不落在 ProjectRecord 上，而落在 `lifecycle` 映射里**。
//    实证理由：`listProjects()` = registry.json 种子 ∪ 存储中的**用户自建**项目，
//    **种子项目根本不落盘**（`updateProject` 对种子直接 return）。若把 starred 直接存进
//    ProjectRecord，种子项目的星标一刷新即丢。
//    故：**同一个事实只存一处**（lifecycle[id]），读取时经 `withLifecycle()` 投影到
//    ProjectRecord 的可选字段上（外部看到的形状仍是用户要求的 ProjectRecord 字段）。
//
// ③ **删除语义扩展**：用户自建项目 = 物理移除；**种子项目 = 个人层墓碑**
//    （`status:'deleted'`），因为种子的基础条目来自构建期 registry.json，运行时无法物理删除。
//    两者都只删「个人元数据 + 个人关系」，绝不触碰官方 Session / Task / execution / Workspace / 文件。
// ===========================================================================

// @ts-expect-error — JSON modules are resolved at build time by esbuild.
import projectsFile from '../../personal-projects/registry.json'

/** 项目生命周期状态（个人层；与官方 Session 归档无关）。 */
export type ProjectStatus = 'active' | 'archived' | 'deleted'

/**
 * 个人的项目生命周期元数据（**种子的星标/封存也在这里**，见文件头 ②）。
 * 与 ProjectRecord 分离存储，但读取时投影到 ProjectRecord 的可选字段上。
 */
export interface ProjectLifecycle {
  /** ★ 重要项目。 */
  starred?: boolean
  status?: ProjectStatus
  /** 封存时间（ISO 字符串；Restore 时清除）。 */
  archivedAt?: string
  /** 归档文件路径（相对归档根，**不存绝对路径**）；Restore 后保留（归档产物不删）。 */
  archiveFile?: string
  /** 生命周期最后一次变更时间（排序兜底用；不改动项目本身的 updatedAt）。 */
  updatedAt?: number
}

export interface ProjectRecord {
  /** 稳定 id（种子 = registry.json 的 id；用户新建 = `p-` 前缀 + 时间戳）。 */
  id: string
  name: string
  description?: string
  glyph?: string
  /**
   * true = registry.json 内置种子。基础条目来自构建期 registry.json，**不可能被物理移除**；
   * V1.2-A 起删除种子 = 个人层墓碑（`status:'deleted'`，见 deleteProject/deletedSeeds/restoreSeed），
   * 因此「始终存在」仅指条目来源，不再等于「不可从列表移除」。
   */
  seed: boolean
  createdAt: number
  updatedAt: number
  // ---- V1.2-A：生命周期「读穿」字段（真源 = lifecycle 映射，见文件头 ②）----
  starred?: boolean
  status?: ProjectStatus
  archivedAt?: string
  archiveFile?: string
}

/** 关系（只存 Host 侧 id；实体被 Host 删除时残留条目无害，按需由 UI 忽略）。 */
export interface RelationState {
  /** taskId -> projectId（任务只属于一个项目；缺省 = 未分配）。 */
  taskProject: Record<string, string>
  /** sessionId -> projectId（会话只属于一个项目；缺省 = 未分配）。 */
  sessionProject: Record<string, string>
  /** projectId -> workspaceId[]（一个项目可关联多个官方 Workspace）。 */
  projectWorkspaces: Record<string, string[]>
}

export interface ProjectRegistryState {
  /** 用户自建项目（种子始终与目录并集，不落盘）。 */
  projects: ProjectRecord[]
  rels: RelationState
  /** 项目生命周期元数据（种子 + 用户自建都在这里；见文件头 ②）。 */
  lifecycle: Record<string, ProjectLifecycle>
}

/** 存储诊断（只读；供测试与验收报告取证，UI 不展示）。 */
export interface StoreDiagnostics {
  storeVersion: number
  /** 本次加载发生迁移时 = 迁移来源版本；否则 null。 */
  migratedFrom: number | null
  /** 读到比当前更高的版本号时 = 该版本号（降级读，写回保留）；否则 null。 */
  forwardVersion: number | null
  /** 损坏内容备份键（无损坏则 null）。 */
  corruptBackupKey: string | null
  lifecycleEntries: number
}

const STORE_VERSION = 2
const STORE_KEY = 'dsh.personal.projects.v1'
const CORRUPT_BACKUP_KEY = `${STORE_KEY}.corrupt-backup`
/** 同窗口跨 bundle 同步事件（storage 事件只在跨文档时触发；同窗口多插件 bundle 靠此事件）。 */
const CHANGE_EVENT = 'dsh:personal-projects-changed'

// ---------------------------------------------------------------------------
// 种子目录（registry.json；构建期打包）。与用户项目并集呈现。
interface RawProjectSeed {
  id?: unknown
  name?: unknown
  description?: unknown
  glyph?: unknown
}
const seedList = Array.isArray((projectsFile as { projects?: unknown })?.projects)
  ? ((projectsFile as { projects: RawProjectSeed[] }).projects)
  : []

// 快照缓存（E4-FIX-IA-2 · RUNTIME-REACT #185 修复的核心）：
//   listProjects() 被 React useSyncExternalStore 直接用作 getSnapshot。
//   React 要求 getSnapshot **可缓存**：若每次调用返回新数组/新对象，React 会判定
//   快照持续变化 → commit 后 forceStoreRerender → 无限嵌套更新 → 抛
//   "Maximum update depth exceeded"（压缩构建即 Minified React error #185）。
//   因此：种子与并集列表都缓存引用，只有 state 真的变更（commit/reloadFromStorage）
//   才失效。消费者语义不变（仍是只读投影），但引用稳定。
//   V1.2-A：active/archived 两个视图同样缓存引用（它们也会被直接用作 getSnapshot）。
let seedCache: ProjectRecord[] | null = null
let listCache: ProjectRecord[] | null = null
let activeCache: ProjectRecord[] | null = null
let archivedCache: ProjectRecord[] | null = null

function invalidateProjectSnapshots(): void {
  listCache = null
  activeCache = null
  archivedCache = null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function projectSeeds(): ProjectRecord[] {
  if (seedCache !== null) return seedCache
  const out: ProjectRecord[] = []
  const now = 0
  for (const raw of seedList) {
    const id = str(raw.id)
    const name = str(raw.name)
    if (!id || !name) continue
    const glyph = str(raw.glyph) || name.slice(0, 1)
    out.push({ id, name, description: str(raw.description) || undefined, glyph, seed: true, createdAt: now, updatedAt: now })
  }
  seedCache = out
  return out
}

// ---------------------------------------------------------------------------
// localStorage 访问（headless 测试注入 window.localStorage；缺失即空态，不 throw）。
function lsGet(): string | null {
  try {
    const w = typeof window !== 'undefined' ? window : undefined
    if (!w || !w.localStorage) return null
    return w.localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}
function lsSet(value: string): void {
  try {
    const w = typeof window !== 'undefined' ? window : undefined
    if (!w || !w.localStorage) return
    w.localStorage.setItem(STORE_KEY, value)
  } catch {
    // 存储不可用：本次变更仅内存生效（重启丢失 —— 诚实降级：不伪造持久成功）
  }
}
/** 写任意键（仅用于损坏内容备份等旁路用途）。 */
function lsSetKey(key: string, value: string): void {
  try {
    const w = typeof window !== 'undefined' ? window : undefined
    if (!w || !w.localStorage) return
    w.localStorage.setItem(key, value)
  } catch {
    // best-effort
  }
}
function lsGetKey(key: string): string | null {
  try {
    const w = typeof window !== 'undefined' ? window : undefined
    if (!w || !w.localStorage) return null
    return w.localStorage.getItem(key)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 迁移 / 解析 / 序列化（V1.2-A ①）
//
// 设计约束（用户 A1 + PRE-FLIGHT 结论）：
//   - bump 版本号 → 必须迁移，**绝不因版本不匹配丢用户项目**；
//   - 迁移必须**可重复执行**（幂等）：同一份输入迁移两次结果逐字节一致；
//   - 读到**更高版本**（未来版本降级读）：宽容解析 + 保住未知顶层键 + 写回保留更高版本号，
//     这样"装了新版又回退"不会销毁新版写入的数据；
//   - 无法解析（损坏）：先把**原始字符串**备份到独立键（绝不静默销毁），再退空态；
//   - 记录级宽容：有 id 无 name → name 回退为 id（不丢项目）；无 id → 无法作为键，留在
//     `orphanRecords` 中，写回时原样带出（不丢）。
let migratedFrom: number | null = null
let forwardVersion: number | null = null
let corruptBackupKey: string | null = null
let forwardExtras: Record<string, unknown> = {}
let orphanRecords: unknown[] = []

function emptyState(): ProjectRegistryState {
  return { projects: [], rels: { taskProject: {}, sessionProject: {}, projectWorkspaces: {} }, lifecycle: {} }
}

function parseProjects(raw: unknown): { projects: ProjectRecord[]; orphans: unknown[] } {
  const projects: ProjectRecord[] = []
  const orphans: unknown[] = []
  if (!Array.isArray(raw)) return { projects, orphans }
  for (const rawP of raw) {
    const p = (rawP ?? {}) as Record<string, unknown>
    const id = typeof p.id === 'string' && p.id ? p.id : ''
    if (!id) {
      orphans.push(rawP)
      continue
    }
    const nameRaw = typeof p.name === 'string' && p.name ? p.name : ''
    if (!nameRaw) console.warn('[personal-registry] project record missing name — fallback to id', id)
    const name = nameRaw || id
    projects.push({
      id,
      name,
      description: typeof p.description === 'string' && p.description ? p.description : undefined,
      glyph: typeof p.glyph === 'string' && p.glyph ? p.glyph : name.slice(0, 1),
      seed: p.seed === true,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    })
  }
  return { projects, orphans }
}

function parseLifecycle(raw: unknown): Record<string, ProjectLifecycle> {
  const out: Record<string, ProjectLifecycle> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const status: ProjectStatus | undefined =
      v.status === 'archived' || v.status === 'deleted' || v.status === 'active' ? v.status : undefined
    const entry: ProjectLifecycle = {}
    if (v.starred === true) entry.starred = true
    if (status) entry.status = status
    if (typeof v.archivedAt === 'string' && v.archivedAt) entry.archivedAt = v.archivedAt
    if (typeof v.archiveFile === 'string' && v.archiveFile) entry.archiveFile = v.archiveFile
    if (typeof v.updatedAt === 'number') entry.updatedAt = v.updatedAt
    if (Object.keys(entry).length > 0) out[id] = entry
  }
  return out
}

/**
 * v1 → v2 迁移：v1 只有 { projects, rels }；v2 增加 lifecycle。
 * **不改变** v1 任何字段的语义 —— 逐字段原样搬运，只新增一张空表。
 * 幂等：对已是 v2 的输入执行 = 恒等。
 */
function migrateV1ToV2(data: { projects?: unknown; rels?: unknown }): {
  projects: ProjectRecord[]
  orphans: unknown[]
  rels: RelationState
  lifecycle: Record<string, ProjectLifecycle>
} {
  const { projects, orphans } = parseProjects(data.projects)
  const relsRaw = (data.rels ?? {}) as { taskProject?: unknown; sessionProject?: unknown; projectWorkspaces?: unknown }
  const strMap = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {}
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string' && val) out[k] = val
      }
    }
    return out
  }
  const strListMap = (v: unknown): Record<string, string[]> => {
    const out: Record<string, string[]> = {}
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          const ids = val.filter((x): x is string => typeof x === 'string' && x.length > 0)
          if (ids.length > 0) out[k] = ids
        }
      }
    }
    return out
  }
  return {
    projects,
    orphans,
    rels: {
      taskProject: strMap(relsRaw.taskProject),
      sessionProject: strMap(relsRaw.sessionProject),
      projectWorkspaces: strListMap(relsRaw.projectWorkspaces),
    },
    lifecycle: {}, // v1 无生命周期数据；种子/用户项目均为默认（未星标 / active）
  }
}

function parseStored(raw: string | null): ProjectRegistryState {
  migratedFrom = null
  forwardVersion = null
  corruptBackupKey = null
  forwardExtras = {}
  orphanRecords = []
  if (!raw) return emptyState()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw) as Record<string, unknown>
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('store root is not an object')
  } catch (error) {
    // 绝不静默销毁：先备份原始字符串（已有备份则不覆盖，保留最早证据），再退空态。
    console.warn('[personal-registry] projects store parse failed — backup + start empty:', error)
    const existing = lsGetKey(CORRUPT_BACKUP_KEY)
    if (existing === null) {
      lsSetKey(CORRUPT_BACKUP_KEY, raw)
      corruptBackupKey = CORRUPT_BACKUP_KEY
    } else {
      corruptBackupKey = CORRUPT_BACKUP_KEY
    }
    return emptyState()
  }

  const versionRaw = data.v
  const version = typeof versionRaw === 'number' && Number.isFinite(versionRaw) ? versionRaw : 1
  if (versionRaw === undefined) {
    console.warn('[personal-registry] projects store has no version field — treated as v1')
  }

  if (version > STORE_VERSION) {
    // 未来版本降级读：宽容解析已知字段，保住未知顶层键与无法解析的记录，写回时保留更高版本号。
    console.warn(`[personal-registry] projects store version ${version} > ${STORE_VERSION} — forward-read, data preserved`)
    forwardVersion = version
    for (const [k, v] of Object.entries(data)) {
      if (k === 'v' || k === 'projects' || k === 'rels' || k === 'lifecycle') continue
      forwardExtras[k] = v
    }
    const { projects, orphans } = parseProjects(data.projects)
    orphanRecords = orphans
    const base = migrateV1ToV2({ projects: [], rels: data.rels })
    return { projects, rels: base.rels, lifecycle: parseLifecycle(data.lifecycle) }
  }

  if (version === STORE_VERSION) {
    const { projects, orphans } = parseProjects(data.projects)
    orphanRecords = orphans
    const base = migrateV1ToV2({ projects: [], rels: data.rels })
    return { projects, rels: base.rels, lifecycle: parseLifecycle(data.lifecycle) }
  }

  // version < STORE_VERSION → 走迁移管线（当前只有 1 → 2；后续版本在此追加步骤）。
  migratedFrom = version
  let migrated = migrateV1ToV2(data as { projects?: unknown; rels?: unknown })
  // 未来新增版本时在此依次升级：
  //   if (version < 3) migrated = migrateV2ToV3(migrated)
  return { projects: migrated.projects, rels: migrated.rels, lifecycle: migrated.lifecycle }
}

function serialize(state: ProjectRegistryState): string {
  const v = forwardVersion !== null ? Math.max(forwardVersion, STORE_VERSION) : STORE_VERSION
  const payload: Record<string, unknown> = { ...forwardExtras }
  payload.v = v
  payload.projects = orphanRecords.length > 0 ? [...state.projects, ...orphanRecords] : state.projects
  payload.rels = state.rels
  payload.lifecycle = state.lifecycle
  return JSON.stringify(payload)
}

// ---------------------------------------------------------------------------
// 模块级单例（bundle 内唯一镜像）。跨 bundle 经 storage 事件刷新。
let state: ProjectRegistryState = parseStored(lsGet())
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => {
    try {
      f()
    } catch {
      // listener failure is not ours
    }
  })
}

function commit(next: ProjectRegistryState): void {
  state = next
  invalidateProjectSnapshots()
  lsSet(serialize(state))
  emit()
  // 同窗口其它插件 bundle 立即刷新（storage 事件同文档不触发，必须显式广播）。
  try {
    const w = typeof window !== 'undefined' ? window : undefined
    if (w && typeof w.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      w.dispatchEvent(new CustomEvent(CHANGE_EVENT))
    }
  } catch {
    // dispatch best-effort
  }
}

function reloadFromStorage(): void {
  state = parseStored(lsGet())
  invalidateProjectSnapshots()
  emit()
}

// 变更事件：同窗口其它 bundle（CustomEvent）+ 其它窗口（storage）。
try {
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener(CHANGE_EVENT, () => reloadFromStorage())
    window.addEventListener('storage', (e: StorageEvent) => {
      try {
        if (e.key === STORE_KEY) reloadFromStorage()
      } catch {
        // ignore transient listener failures
      }
    })
  }
} catch {
  // no window in headless test: nothing to attach
}

// ---------------------------------------------------------------------------
// 生命周期投影（文件头 ②）：真源 = state.lifecycle，读取时投影到 ProjectRecord。
function withLifecycle(rec: ProjectRecord): ProjectRecord {
  const lc = state.lifecycle[rec.id]
  if (!lc) return rec
  return {
    ...rec,
    starred: lc.starred === true,
    status: lc.status ?? 'active',
    archivedAt: lc.archivedAt,
    archiveFile: lc.archiveFile,
  }
}

function statusOf(rec: ProjectRecord): ProjectStatus {
  return state.lifecycle[rec.id]?.status ?? 'active'
}

function writeLifecycle(id: string, patch: ProjectLifecycle | null): void {
  const lifecycle = { ...state.lifecycle }
  if (patch === null) {
    delete lifecycle[id]
  } else {
    const merged: ProjectLifecycle = { ...lifecycle[id], ...patch, updatedAt: Date.now() }
    // 清理被显式置空的字段（JSON.stringify 会丢 undefined，但内存镜像要保持干净）
    if (patch.starred === false) delete merged.starred
    if (patch.archivedAt === undefined && 'archivedAt' in patch) delete merged.archivedAt
    if (Object.keys(merged).length === 1 && merged.updatedAt !== undefined) {
      // 只剩 updatedAt 的空条目没有信息量 → 不落盘
      delete lifecycle[id]
    } else {
      lifecycle[id] = merged
    }
  }
  commit({ projects: state.projects, rels: cloneRels(state.rels), lifecycle })
}

/** 项目活动时间（排序用）：生命周期变更时间 > 项目 updatedAt。 */
function defaultActivity(rec: ProjectRecord): number {
  const lc = state.lifecycle[rec.id]
  return Math.max(rec.updatedAt, lc?.updatedAt ?? 0)
}

// ---------------------------------------------------------------------------
// 公开 API
export const projectRegistry = {
  subscribe(f: () => void): () => void {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
  getState(): ProjectRegistryState {
    return state
  },
  /** 种子 + 用户项目并集（种子在前，用户项目按创建时间升序在后）。**不含已删除**（墓碑）。
   *  引用稳定：未变更时返回同一数组（可安全用作 React useSyncExternalStore 的 getSnapshot，
   *  见上方 #185 说明）；变更后返回新数组。 */
  listProjects(): ProjectRecord[] {
    if (listCache === null) {
      const seeds = projectSeeds()
      const seedIds = new Set(seeds.map((s) => s.id))
      const users = state.projects.filter((p) => !seedIds.has(p.id))
      listCache = [...seeds, ...users].map(withLifecycle).filter((p) => p.status !== 'deleted')
    }
    return listCache
  },
  /** Active 视图（Project Center 默认；引用稳定，可作 getSnapshot）。 */
  activeProjects(): ProjectRecord[] {
    if (activeCache === null) activeCache = this.listProjects().filter((p) => p.status !== 'archived')
    return activeCache
  },
  /** Archived 视图（个人软封存；引用稳定，可作 getSnapshot）。 */
  archivedProjects(): ProjectRecord[] {
    if (archivedCache === null) archivedCache = this.listProjects().filter((p) => p.status === 'archived')
    return archivedCache
  },
  /** 排序（用户 A1）：★ 优先 → 同组最近活动 → 名称 → id（稳定兜底）。
   *  纯函数：给定 activityOf(id) 时用真实活动时间（会话/任务），否则用默认活动时间。
   *  **不缓存**（含外部函数入参）→ 调用方负责 memo，不要直接用作 getSnapshot。 */
  sortedProjects(activityOf?: (projectId: string) => number | undefined): ProjectRecord[] {
    const list = this.listProjects()
    return [...list].sort((a, b) => compareProjects(a, b, activityOf, (r) => defaultActivity(r)))
  },
  projectById(id: string): ProjectRecord | undefined {
    return this.listProjects().find((p) => p.id === id)
  },
  /** 生命周期只读投影（含已删除墓碑；供验收/诊断与"已删除的内置档案"说明）。 */
  lifecycleOf(id: string): ProjectLifecycle | undefined {
    const lc = state.lifecycle[id]
    return lc ? { ...lc } : undefined
  },
  storeDiagnostics(): StoreDiagnostics {
    return {
      storeVersion: STORE_VERSION,
      migratedFrom,
      forwardVersion,
      corruptBackupKey,
      lifecycleEntries: Object.keys(state.lifecycle).length,
    }
  },
  // ---- 关系查询（Host 侧 id -> projectId） ----
  projectOfTask(taskId: string): string | undefined {
    return state.rels.taskProject[taskId]
  },
  projectOfSession(sessionId: string): string | undefined {
    return state.rels.sessionProject[sessionId]
  },
  workspacesOf(projectId: string): string[] {
    return state.rels.projectWorkspaces[projectId] ?? []
  },
  projectsOfWorkspace(workspaceId: string): ProjectRecord[] {
    const out: ProjectRecord[] = []
    for (const p of this.listProjects()) {
      if ((state.rels.projectWorkspaces[p.id] ?? []).includes(workspaceId)) out.push(p)
    }
    return out
  },
  // ---- 变更（全部 write-through） ----
  createProject(input: { name: string; description?: string }): ProjectRecord {
    const name = input.name.trim()
    if (!name) throw new Error('项目名称不能为空')
    const now = Date.now()
    const id = `p-${now.toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`
    const rec: ProjectRecord = {
      id,
      name,
      description: input.description?.trim() ? input.description.trim() : undefined,
      glyph: name.slice(0, 1),
      seed: false,
      createdAt: now,
      updatedAt: now,
    }
    commit({ projects: [...state.projects, rec], rels: cloneRels(state.rels), lifecycle: { ...state.lifecycle } })
    return rec
  },
  /** 改名 / 改描述（仅用户自建项目；种子基础档案在 registry.json 改后重建）。 */
  updateProject(id: string, patch: { name?: string; description?: string }): void {
    if (!state.projects.some((p) => p.id === id)) return
    const next = state.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    commit({ projects: next, rels: cloneRels(state.rels), lifecycle: { ...state.lifecycle } })
  },
  // ---- V1.2-A：生命周期变更 ----
  /** 设置 ★（对种子与用户项目**都有效** —— 真源是 lifecycle，见文件头 ②）。 */
  setStar(id: string, starred: boolean): void {
    if (!this.listProjects().some((p) => p.id === id)) return
    writeLifecycle(id, { starred })
  },
  /** 切换 ★，返回切换后的值（id 不存在时返回 false 且不写入）。 */
  toggleStar(id: string): boolean {
    const rec = this.listProjects().find((p) => p.id === id)
    if (!rec) return false
    const next = rec.starred !== true
    this.setStar(id, next)
    return next
  },
  /**
   * 标记为已封存（**只能在归档产物落盘 + 回读校验成功之后调用**；
   * 顺序纪律见 V1.2-A A3/A4：collect → summarize → write → read-back → 才 archived）。
   */
  archiveProject(id: string, input: { archiveFile: string; archivedAt?: string }): void {
    if (!this.listProjects().some((p) => p.id === id)) return
    writeLifecycle(id, {
      status: 'archived',
      archivedAt: input.archivedAt ?? new Date().toISOString(),
      archiveFile: input.archiveFile,
    })
  },
  /** Restore：仅 status=active、清 archivedAt；**归档产物保留**（archiveFile 不动）。 */
  restoreProject(id: string): void {
    const rec = this.listProjects().find((p) => p.id === id)
    if (!rec) return
    if (rec.status === 'deleted') return // 墓碑不可经 Restore 复活（要用 restoreSeed）
    writeLifecycle(id, { status: 'active', archivedAt: undefined })
  },
  /**
   * 已被删除的**内置种子**（墓碑，供 UI 给出恢复入口）。
   *
   * WHY：V1.2-A 之前 deleteProject 直接拒绝种子（"始终存在，不允许删除"）。V1.2-A 按用户 §1.4
   * 把删除统一成「只删个人元数据 + 关系」，种子因此也会从列表消失（基础条目来自构建期
   * registry.json，不可能被物理移除）。**消失而无回收途径 = 陷阱**，所以墓碑必须是可发现、
   * 可恢复的：本函数列出墓碑，restoreSeed() 清除它。用户自建项目仍是物理删除（无墓碑）。
   */
  deletedSeeds(): ProjectRecord[] {
    return projectSeeds().filter((s) => state.lifecycle[s.id]?.status === 'deleted')
  },
  /** 恢复被删除的内置种子（清除墓碑与残余个人元数据）。用户自建项目不可由此恢复（返回 false）。 */
  restoreSeed(id: string): boolean {
    if (!projectSeeds().some((s) => s.id === id)) return false
    if (statusOf(projectSeeds().find((s) => s.id === id)!) !== 'deleted') return false
    writeLifecycle(id, null)
    return true
  },
  /**
   * 永久删除（用户 A6）：只删 **Project metadata + Personal relations**；
   * 绝不删除官方 Session / Task / execution / Workspace / 真实文件 / Memory source data。
   * 用户自建项目 = 物理移除；种子项目 = 个人层墓碑（基础条目来自构建期 registry.json）。
   * 删除后原关联对象回到「未分配」（= 关系表条目被清除）。
   */
  deleteProject(id: string): boolean {
    const isSeed = projectSeeds().some((s) => s.id === id)
    const hasUserRec = state.projects.some((p) => p.id === id && !p.seed)
    if (!isSeed && !hasUserRec) return false
    const rels = cloneRels(state.rels)
    for (const [k, v] of Object.entries(rels.taskProject)) if (v === id) delete rels.taskProject[k]
    for (const [k, v] of Object.entries(rels.sessionProject)) if (v === id) delete rels.sessionProject[k]
    delete rels.projectWorkspaces[id]
    const lifecycle = { ...state.lifecycle }
    delete lifecycle[id] // 清个人元数据（★ / 封存 / 归档文件引用）
    if (isSeed) lifecycle[id] = { status: 'deleted', updatedAt: Date.now() } // 墓碑
    commit({ projects: state.projects.filter((p) => p.id !== id), rels, lifecycle })
    return true
  },
  // ---- 关系变更 ----
  assignTask(taskId: string, projectId: string): void {
    const rels = cloneRels(state.rels)
    rels.taskProject[taskId] = projectId
    commit({ projects: state.projects, rels, lifecycle: { ...state.lifecycle } })
  },
  unassignTask(taskId: string): void {
    const rels = cloneRels(state.rels)
    delete rels.taskProject[taskId]
    commit({ projects: state.projects, rels, lifecycle: { ...state.lifecycle } })
  },
  assignSession(sessionId: string, projectId: string): void {
    const rels = cloneRels(state.rels)
    rels.sessionProject[sessionId] = projectId
    commit({ projects: state.projects, rels, lifecycle: { ...state.lifecycle } })
  },
  unassignSession(sessionId: string): void {
    const rels = cloneRels(state.rels)
    delete rels.sessionProject[sessionId]
    commit({ projects: state.projects, rels, lifecycle: { ...state.lifecycle } })
  },
  linkWorkspace(projectId: string, workspaceId: string): void {
    const rels = cloneRels(state.rels)
    const list = rels.projectWorkspaces[projectId] ?? []
    if (!list.includes(workspaceId)) rels.projectWorkspaces[projectId] = [...list, workspaceId]
    commit({ projects: state.projects, rels, lifecycle: { ...state.lifecycle } })
  },
  unlinkWorkspace(projectId: string, workspaceId: string): void {
    const rels = cloneRels(state.rels)
    const list = rels.projectWorkspaces[projectId] ?? []
    rels.projectWorkspaces[projectId] = list.filter((w) => w !== workspaceId)
    if (rels.projectWorkspaces[projectId].length === 0) delete rels.projectWorkspaces[projectId]
    commit({ projects: state.projects, rels, lifecycle: { ...state.lifecycle } })
  },
  /** 调试/排障：把当前关系快照导出为纯 JSON 字符串（UI 不展示，仅 Advanced/Logs 可用）。 */
  exportSnapshot(): string {
    return serialize(state)
  },
}

/** 排序比较器（用户 A1：★ → 最近活动 → 名称 → id）。导出供 UI 与测试复用。 */
export function compareProjects(
  a: ProjectRecord,
  b: ProjectRecord,
  activityOf?: (projectId: string) => number | undefined,
  fallbackActivity?: (rec: ProjectRecord) => number,
): number {
  const sa = a.starred === true ? 1 : 0
  const sb = b.starred === true ? 1 : 0
  if (sa !== sb) return sb - sa
  const act = (r: ProjectRecord): number => activityOf?.(r.id) ?? (fallbackActivity ? fallbackActivity(r) : r.updatedAt)
  const ta = act(a)
  const tb = act(b)
  if (ta !== tb) return tb - ta
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function cloneRels(rels: RelationState): RelationState {
  return {
    taskProject: { ...rels.taskProject },
    sessionProject: { ...rels.sessionProject },
    projectWorkspaces: Object.fromEntries(Object.entries(rels.projectWorkspaces).map(([k, v]) => [k, [...v]])),
  }
}
