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
  // ---------------------------------------------------------------------------
  // 专业智能体族（V1.2-G）：**可选**，只有自带技能包的专业智能体才声明。
  // 判据 = `skillEntry` 存在（见 personal-agents/scripts/agent-registry.mjs `isProfessional`）。
  // 人格化预设（general/coder/…）不带这些字段，消费方必须容缺 —— 不得因为缺字段而丢条目。
  /** 技能包入口（相对 preset 目录）。存在即表示「专业智能体」。 */
  skillEntry?: string
  /** 技能包目录（相对 preset 目录）。 */
  skillPack?: string
  /** 宣传语（比 description 更完整的一句话定位）。 */
  tagline?: string
  /** 成熟度：UI 必须如实显示，不得把 preview/planned/blocked 画成可用。 */
  status?: 'active' | 'preview' | 'planned' | 'blocked'
  /** 能做什么（通用短标识符，如 research / storyboard / visual-qa）。 */
  capabilities?: string[]
  /** 交付流水线（有序阶段名）。 */
  workflow?: string[]
  /** 机器契约名 → 相对 preset 目录的路径。 */
  contracts?: Record<string, string>
  /** 渲染路径（同一契约的不同渲染内核；needsDependency = 需在插件声明依赖）。 */
  renderers?: { path: string; kernel: string; nature: string; needsDependency?: boolean }[]
  /** 硬纪律（每一条都必须可被机器或人核对）。 */
  guarantees?: string[]
  /** 是否专业智能体（派生：skillEntry 存在）。 */
  professional: boolean
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
  // 专业智能体族（可选；容缺，缺了不丢条目）
  skillEntry?: unknown
  skillPack?: unknown
  tagline?: unknown
  status?: unknown
  capabilities?: unknown
  workflow?: unknown
  contracts?: unknown
  renderers?: unknown
  guarantees?: unknown
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
    // 专业智能体族：逐字段容缺解析（缺项=该能力未声明，而不是"条目无效"）
    const skillEntry = str(raw.skillEntry)
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.filter((c): c is string => typeof c === 'string')
      : []
    const workflow = Array.isArray(raw.workflow)
      ? raw.workflow.filter((w): w is string => typeof w === 'string')
      : []
    const contracts: Record<string, string> = {}
    if (raw.contracts && typeof raw.contracts === 'object' && !Array.isArray(raw.contracts)) {
      for (const [k, v] of Object.entries(raw.contracts as Record<string, unknown>)) {
        if (typeof v === 'string') contracts[k] = v
      }
    }
    const renderers = Array.isArray(raw.renderers)
      ? raw.renderers
          .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
          .map((r) => ({
            path: str(r.path),
            kernel: str(r.kernel),
            nature: str(r.nature),
            ...(r.needsDependency === true ? { needsDependency: true } : {}),
          }))
          .filter((r) => r.path && r.kernel)
      : []
    const guarantees = Array.isArray(raw.guarantees)
      ? raw.guarantees.filter((g): g is string => typeof g === 'string')
      : []
    const status = str(raw.status)
    out.push({
      id,
      name,
      zh: str(raw.zh) || name,
      glyph: glyphOf(raw.glyph, name),
      description: str(raw.description),
      presetId: str(raw.presetId) || id,
      ...(skillEntry ? { skillEntry } : {}),
      ...(str(raw.skillPack) ? { skillPack: str(raw.skillPack) } : {}),
      ...(str(raw.tagline) ? { tagline: str(raw.tagline) } : {}),
      ...(status === 'active' || status === 'preview' || status === 'planned' || status === 'blocked'
        ? { status }
        : {}),
      ...(capabilities.length > 0 ? { capabilities } : {}),
      ...(workflow.length > 0 ? { workflow } : {}),
      ...(Object.keys(contracts).length > 0 ? { contracts } : {}),
      ...(renderers.length > 0 ? { renderers } : {}),
      ...(guarantees.length > 0 ? { guarantees } : {}),
      professional: skillEntry.length > 0,
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

/** 全部 Personal Agent（顺序 = registry.json 声明顺序，稳定；两族共存）。 */
export const AGENT_CATALOG: AgentMeta[] = parseAgents(agentsFile)
/** 4 个 Personal Project 档案（顺序同上）。 */
export const PROJECT_CATALOG: ProjectMeta[] = parseProjects(projectsFile)

/** 专业智能体（自带技能包）—— Agent Center 的「专业」分组口径。 */
export const PROFESSIONAL_AGENTS: AgentMeta[] = AGENT_CATALOG.filter((a) => a.professional)

/** 默认 agent = presetId 'general'（V1 约定默认 General），缺失时退回首项。 */
export function defaultAgentName(): string {
  const general = AGENT_CATALOG.find((a) => a.id === 'general')
  return general?.name ?? AGENT_CATALOG[0]?.name ?? 'General'
}
