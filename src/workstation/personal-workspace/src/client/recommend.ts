// dsh-personal-workspace — E4 ＋新任务 · 规则推荐（纯函数，SPEC §5.2/§5.3 文档化规则）。
//
// 定位：给「新任务」NL 面板做初始推荐 —— 项目 / Agent preset / 权限档。
// 规则一律为“建议”，全部可被用户改（面板高级设置/下拉覆盖）；无命中走保守默认 §5.3。
// 数据：Agent/Project 元数据消费 personal-registry 单一源（E1 纪律，禁止重复硬编码清单）。
// 注意：推荐不是权限判定——实际执行权限由宿主门控权威裁决（workspace-write/danger 需人工确认）。
import { AGENT_CATALOG, PROJECT_CATALOG, type AgentMeta, type ProjectMeta } from '../../../personal-registry/src/index'

// ---------------------------------------------------------------------------
// Agent 推荐（§5.2 关键词规则 → 命中计数最高者；并列按下方顺序；全零 → general）
// 关键词为 SPEC 词表（代码/写/改/实现→coder…）＋少量英文同义，避免误伤常见短语。
const AGENT_KEYWORDS: ReadonlyArray<{ id: string; keywords: readonly string[] }> = [
  {
    id: 'hardware',
    keywords: ['串口', '寄存器', '硬件', '烧录', '驱动', '单片机', '嵌入式', '固件', 'gpio', 'i2c', 'uart', 'esp32', 'esp', 'arduino', 'm5stack', 'stm32', '示波器', '电路'],
  },
  {
    id: 'designer',
    keywords: ['视觉', 'ui', 'ux', '原型', '海报', '设计', '图标', '插画', '稿', '排版', '设计稿'],
  },
  {
    id: 'coder',
    keywords: ['代码', '写', '改', '实现', '编程', '重构', '修复', '修一下', 'bug', '调试', 'git', '终端', '脚本', '部署', '测试', '编译', 'code', 'implement', 'build', 'test', '自动化'],
  },
  {
    id: 'research',
    keywords: ['查', '调研', '搜索', 'research', '方案', '对比', '开源', '引用', '文献', '资料', '来源', '了解下', '评估'],
  },
  {
    id: 'study',
    keywords: ['学习', '讲解', '总结', '教程', '课程', '阅读', '笔记', '复习', '练习', '知识卡', 'study', 'learn', 'summar'],
  },
]

const AGENT_PRIORITY = ['coder', 'research', 'study', 'hardware', 'designer', 'general']

/** §5.2 关键词命中计数（小写匹配，供单测）。 */
export function scoreAgent(text: string): Array<{ id: string; hits: number }> {
  const t = String(text ?? '').toLowerCase()
  if (t === '') return AGENT_CATALOG.map((a) => ({ id: a.id, hits: 0 }))
  return AGENT_CATALOG.map((a) => {
    const rule = AGENT_KEYWORDS.find((r) => r.id === a.id)
    const hits = (rule?.keywords ?? []).reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 : 0), 0)
    return { id: a.id, hits }
  })
}

/** 推荐 agent id（并列取 AGENT_PRIORITY 顺序；全零 → 'general'）。 */
export function recommendAgentId(text: string): string {
  const scored = scoreAgent(text).filter((s) => s.hits > 0)
  if (scored.length === 0) {
    const general = AGENT_CATALOG.find((a) => a.id === 'general')
    return general?.id ?? AGENT_CATALOG[0]?.id ?? 'general'
  }
  const best = Math.max(...scored.map((s) => s.hits))
  const top = scored.filter((s) => s.hits === best)
  if (top.length === 1) return top[0].id
  for (const id of AGENT_PRIORITY) {
    if (top.some((s) => s.id === id)) return id
  }
  return top[0].id
}

// ---------------------------------------------------------------------------
// 权限启发（§5.2：纯查询→read-only；涉工作区改动→workspace-write；无信号→默认问（走门控确认））
const READ_ONLY_TOKENS = ['查', '搜索', '看看', '读一下', '找资料', '翻译', '信息', '了解一下', '调研', '对比', '引用', '搜索一下', '阅读', '查询', '读取']
const WRITE_TOKENS = ['写', '改', '更新', '创建', '新建', '删除', '修复', '部署', '安装', '配置', '提交', '推送', '整理', '移动', '重命名', '生成', '制作', '设置', '重构', '提交代码', '发布', '保存']

export interface PermissionGuess {
  /** read-only | workspace-write（danger 永不自动建议）。 */
  permission: 'read-only' | 'workspace-write'
  /** 是否有明确的读/写信号（false = 无信号 → 建议落 workspace-write 走门控“问”语义）。 */
  confident: boolean
}

export function guessPermission(text: string): PermissionGuess {
  const t = String(text ?? '').toLowerCase()
  const read = READ_ONLY_TOKENS.reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 : 0), 0)
  const write = WRITE_TOKENS.reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 : 0), 0)
  if (read > 0 && write === 0) return { permission: 'read-only', confident: true }
  if (write > 0 && read === 0) return { permission: 'workspace-write', confident: true }
  // 两者都有或都无：安全优先 → workspace-write（经宿主确认门 = “问”），不猜只读。
  return { permission: 'workspace-write', confident: false }
}

// ---------------------------------------------------------------------------
// Project 推荐（registry 单一源；命中 name/zh/description 关键词 → 该 project；否则不指定）
export interface ProjectMatch {
  meta: ProjectMeta
  /** 命中的展示名（name/zh）。 */
  via: string
}

export function matchProject(text: string): ProjectMatch | undefined {
  const t = String(text ?? '').toLowerCase()
  if (t === '') return undefined
  for (const meta of PROJECT_CATALOG) {
    const hay: string[] = [meta.name, meta.zh, meta.description].filter(Boolean).map((s) => s.toLowerCase())
    if (hay.some((s) => t.includes(s))) return { meta, via: hay[0] }
    // id 词根（如 'ai-workstation' 拆词）不强行匹配，避免误判。
    void meta
  }
  return undefined
}

/** Agent 目录（面板选择器用；外部调用时避免重复 import registry）。 */
export function catalogAgents(): readonly AgentMeta[] {
  return AGENT_CATALOG
}

/** Project 目录（同上）。 */
export function catalogProjects(): readonly ProjectMeta[] {
  return PROJECT_CATALOG
}
