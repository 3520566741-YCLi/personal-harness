// dsh-personal-registry — Personal Harness 单一数据源读取层（V1.1 Phase 1 · E1）。
//
// 定位：agents / projects 目录数据的唯一运行时数据入口（构建期打包）。
//   - 权威数据文件：src/workstation/personal-agents/registry.json
//                   src/workstation/personal-projects/registry.json
//   - 所有 UI 面（sidebar / workspace dashboard / mission(Home) / hud 等）只允许从这里取
//     Agent / Project 元数据；禁止在各 UI 文件内再次硬编码 id/name 清单。
//   - 数据随 esbuild 在构建期打包进各 client bundle（客户端无 fs，不做运行时读盘）；
//     在仓库里修改 registry.json → 重建 → 各 UI 同步（单一修改点）。
//
// Fallback 纪律（E1 原则：Registry 读取失败必须 fallback）：
//   构建期打包的数据不可能在运行时“读盘失败”，但仍做结构校验：非法条目丢弃并 console.warn，
//   不 throw、不影响插件挂载；glyph 缺省回退为首字符。若整个文件结构异常 → 返回空目录，
//   各消费 UI 对空目录天然安全（渲染空分组/计数 0），不阻塞用户。

// @ts-expect-error — JSON modules are resolved at build time by esbuild.
import agentsFile from '../../personal-agents/registry.json'
// @ts-expect-error — JSON modules are resolved at build time by esbuild.
import projectsFile from '../../personal-projects/registry.json'

export interface AgentMeta {
  id: string
  /** 稳定英文名（General / Coder / …），跨 UI 不变。 */
  name: string
  /** 本地化短名。 */
  zh: string
  /** 行首/压缩态 glyph。 */
  glyph: string
  /** 一句话职责描述（副文本）。 */
  description: string
  /** 对应原生 preset id。 */
  presetId: string
}

export interface ProjectMeta {
  id: string
  name: string
  zh: string
  glyph: string
  description: string
  /** 该项目建议的 agent id 集合（档案声明）。 */
  agentIds: string[]
}

interface RawAgent {
  id?: unknown
  name?: unknown
  zh?: unknown
  glyph?: unknown
  description?: unknown
  presetId?: unknown
}
interface RawProject {
  id?: unknown
  name?: unknown
  zh?: unknown
  glyph?: unknown
  description?: unknown
  agents?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const glyphOf = (raw: string, name: string): string => {
  const g = str(raw)
  return g.length > 0 ? g : name.slice(0, 1)
}

function parseAgents(file: unknown): AgentMeta[] {
  const list = Array.isArray((file as { agents?: unknown })?.agents) ? ((file as { agents: RawAgent[] }).agents) : []
  const out: AgentMeta[] = []
  for (const raw of list) {
    const id = str(raw.id)
    const name = str(raw.name)
    if (!id || !name) {
      console.warn('[personal-registry] drop invalid agent entry', raw)
      continue
    }
    out.push({
      id,
      name,
      zh: str(raw.zh) || name,
      glyph: glyphOf(raw.glyph, name),
      description: str(raw.description),
      presetId: str(raw.presetId) || id,
    })
  }
  if (list.length === 0) console.warn('[personal-registry] agents catalog empty — UI will degrade')
  return out
}

function parseProjects(file: unknown): ProjectMeta[] {
  const list = Array.isArray((file as { projects?: unknown })?.projects) ? ((file as { projects: RawProject[] }).projects) : []
  const out: ProjectMeta[] = []
  for (const raw of list) {
    const id = str(raw.id)
    const name = str(raw.name)
    if (!id || !name) {
      console.warn('[personal-registry] drop invalid project entry', raw)
      continue
    }
    const agentIds = Array.isArray(raw.agents)
      ? raw.agents.filter((a): a is string => typeof a === 'string')
      : []
    out.push({
      id,
      name,
      zh: str(raw.zh) || name,
      glyph: glyphOf(raw.glyph, name),
      description: str(raw.description),
      agentIds,
    })
  }
  if (list.length === 0) console.warn('[personal-registry] projects catalog empty — UI will degrade')
  return out
}

/** 6 个 Personal Agent（顺序 = registry.json 声明顺序，稳定）。 */
export const AGENT_CATALOG: AgentMeta[] = parseAgents(agentsFile)
/** 4 个 Personal Project 档案（顺序同上）。 */
export const PROJECT_CATALOG: ProjectMeta[] = parseProjects(projectsFile)

/** 默认 agent = presetId 'general'（V1 约定默认 General），缺失时退回首项。 */
export function defaultAgentName(): string {
  const general = AGENT_CATALOG.find((a) => a.id === 'general')
  return general?.name ?? AGENT_CATALOG[0]?.name ?? 'General'
}
