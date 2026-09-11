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
// UI 词（用户要求，§38）：界面显示「项目 / 任务 / 会话 / 工作区」，不暴露 id 协议。

// @ts-expect-error — JSON modules are resolved at build time by esbuild.
import projectsFile from '../../personal-projects/registry.json'

export interface ProjectRecord {
  /** 稳定 id（种子 = registry.json 的 id；用户新建 = `p-` 前缀 + 时间戳）。 */
  id: string
  name: string
  description?: string
  glyph?: string
  /** true = registry.json 内置种子（始终存在，不允许删除）。 */
  seed: boolean
  createdAt: number
  updatedAt: number
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
}

const STORE_VERSION = 1
const STORE_KEY = 'dsh.personal.projects.v1'
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
let seedCache: ProjectRecord[] | null = null
let listCache: ProjectRecord[] | null = null

function invalidateProjectSnapshots(): void {
  listCache = null
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

// ---------------------------------------------------------------------------
// 解析 / 序列化（保守：任何结构异常 → 空态 + console.warn，绝不 throw / 丢种子）。
function parseStored(raw: string | null): ProjectRegistryState {
  const empty: ProjectRegistryState = { projects: [], rels: { taskProject: {}, sessionProject: {}, projectWorkspaces: {} } }
  if (!raw) return empty
  try {
    const data = JSON.parse(raw) as {
      v?: unknown
      projects?: unknown
      rels?: { taskProject?: unknown; sessionProject?: unknown; projectWorkspaces?: unknown }
    }
    if (data.v !== STORE_VERSION) {
      console.warn('[personal-registry] projects store version mismatch — ignore stored data')
      return empty
    }
    const projects: ProjectRecord[] = []
    if (Array.isArray(data.projects)) {
      for (const rawP of data.projects) {
        const p = (rawP ?? {}) as Record<string, unknown>
        const id = typeof p.id === 'string' && p.id ? p.id : ''
        const name = typeof p.name === 'string' && p.name ? p.name : ''
        if (!id || !name) continue
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
    }
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
    const rels: RelationState = {
      taskProject: strMap(data.rels?.taskProject),
      sessionProject: strMap(data.rels?.sessionProject),
      projectWorkspaces: strListMap(data.rels?.projectWorkspaces),
    }
    return { projects, rels }
  } catch (error) {
    console.warn('[personal-registry] projects store parse failed — start empty:', error)
    return empty
  }
}

function serialize(state: ProjectRegistryState): string {
  return JSON.stringify({ v: STORE_VERSION, projects: state.projects, rels: state.rels })
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
  /** 种子 + 用户项目并集（种子在前，用户项目按创建时间升序在后）。
   *  引用稳定：未变更时返回同一数组（可安全用作 React useSyncExternalStore 的 getSnapshot，
   *  见上方 #185 说明）；变更后返回新数组。 */
  listProjects(): ProjectRecord[] {
    if (listCache === null) {
      const seeds = projectSeeds()
      const seen = new Set(seeds.map((s) => s.id))
      const users = state.projects.filter((p) => !seen.has(p.id))
      listCache = [...seeds, ...users]
    }
    return listCache
  },
  projectById(id: string): ProjectRecord | undefined {
    return this.listProjects().find((p) => p.id === id)
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
    commit({ projects: [...state.projects, rec], rels: cloneRels(state.rels) })
    return rec
  },
  /** 改名 / 改描述（仅用户自建项目；种子基础档案在 registry.json 改后重建）。 */
  updateProject(id: string, patch: { name?: string; description?: string }): void {
    if (!state.projects.some((p) => p.id === id)) return
    const next = state.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
    commit({ projects: next, rels: cloneRels(state.rels) })
  },
  /** 仅用户自建项目可删；删除时清除其全部关系（关联任务/会话回到未分配）。 */
  deleteProject(id: string): boolean {
    const target = state.projects.find((p) => p.id === id && !p.seed)
    if (!target) return false
    const rels = cloneRels(state.rels)
    for (const [k, v] of Object.entries(rels.taskProject)) if (v === id) delete rels.taskProject[k]
    for (const [k, v] of Object.entries(rels.sessionProject)) if (v === id) delete rels.sessionProject[k]
    delete rels.projectWorkspaces[id]
    commit({ projects: state.projects.filter((p) => p.id !== id), rels })
    return true
  },
  // ---- 关系变更 ----
  assignTask(taskId: string, projectId: string): void {
    const rels = cloneRels(state.rels)
    rels.taskProject[taskId] = projectId
    commit({ projects: state.projects, rels })
  },
  unassignTask(taskId: string): void {
    const rels = cloneRels(state.rels)
    delete rels.taskProject[taskId]
    commit({ projects: state.projects, rels })
  },
  assignSession(sessionId: string, projectId: string): void {
    const rels = cloneRels(state.rels)
    rels.sessionProject[sessionId] = projectId
    commit({ projects: state.projects, rels })
  },
  unassignSession(sessionId: string): void {
    const rels = cloneRels(state.rels)
    delete rels.sessionProject[sessionId]
    commit({ projects: state.projects, rels })
  },
  linkWorkspace(projectId: string, workspaceId: string): void {
    const rels = cloneRels(state.rels)
    const list = rels.projectWorkspaces[projectId] ?? []
    if (!list.includes(workspaceId)) rels.projectWorkspaces[projectId] = [...list, workspaceId]
    commit({ projects: state.projects, rels })
  },
  unlinkWorkspace(projectId: string, workspaceId: string): void {
    const rels = cloneRels(state.rels)
    const list = rels.projectWorkspaces[projectId] ?? []
    rels.projectWorkspaces[projectId] = list.filter((w) => w !== workspaceId)
    if (rels.projectWorkspaces[projectId].length === 0) delete rels.projectWorkspaces[projectId]
    commit({ projects: state.projects, rels })
  },
  /** 调试/排障：把当前关系快照导出为纯 JSON 字符串（UI 不展示，仅 Advanced/Logs 可用）。 */
  exportSnapshot(): string {
    return serialize(state)
  },
}

function cloneRels(rels: RelationState): RelationState {
  return {
    taskProject: { ...rels.taskProject },
    sessionProject: { ...rels.sessionProject },
    projectWorkspaces: Object.fromEntries(Object.entries(rels.projectWorkspaces).map(([k, v]) => [k, [...v]])),
  }
}
