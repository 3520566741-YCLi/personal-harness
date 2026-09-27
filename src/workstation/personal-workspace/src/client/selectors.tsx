// dsh-personal-workspace — 共享选择器（E4-FIX-IA-2 · IA2-3/4/6 复用）。
//
// ProjectSelect：现有项目 / 不属于项目 / ＋ 新建项目（inline 快速创建，成功后自动选中）。
//   数据 = projectRegistry（Personal relation layer 单一源，IA2-1）；值语义 projectId | null
//   （null = 不属于任何项目，Unassigned 是正式状态）。
// AgentSelect / PermissionSelect：仅供把「建议/预设」展示为可选项 —— 对任务走 Host（真实生效）；
//   对对话官方无法程序化预绑 → 由调用方以诚实标签说明（§43，不假装已生效）。
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { AGENT_CATALOG } from '../../../personal-registry/src/index'
import { projectRegistry } from '../../../personal-registry/src/projects'
import type { WorkspaceItem } from './workspace-catalog'
import { TASK_PERMISSIONS, type TaskPermission } from './taskboard'

/** 模块级稳定引用：subscribe/getSnapshot 每次 render 都换新函数会让 React 反复重订阅，
 *  而 getSnapshot 返回新值则直接触发 #185（Maximum update depth）——两者都必须稳定。 */
const subscribeProjects = (f: () => void): (() => void) => projectRegistry.subscribe(f)
const getProjects = (): ReturnType<typeof projectRegistry.listProjects> => projectRegistry.listProjects()

/** 响应式项目列表（registry 单一源；任一 bundle 变更后本组件自动刷新）。 */
export function useProjects(): ReturnType<typeof projectRegistry.listProjects> {
  return useSyncExternalStore(subscribeProjects, getProjects, getProjects)
}

export const CSS_SELECTORS = String.raw`
.dpsel{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.dpsel-k{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);flex:none;}
.dpsel-s{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 60%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:2px 6px;max-width:210px;}
.dpsel-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%;}
.dpsel-in{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 50%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:4px 8px;min-width:120px;box-sizing:border-box;}
.dpsel-in:focus{border-color:rgba(120,150,255,.6);outline:none;}
.dpsel-btn{border:1px solid rgba(120,150,255,.5);border-radius:6px;background:rgba(120,150,255,.12);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:3px 10px;cursor:pointer;}
.dpsel-btn:hover{background:rgba(120,150,255,.22);}
.dpsel-link{border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxs-12,12px);cursor:pointer;padding:2px 4px;}
.dpsel-link:hover{color:var(--dsw-alias-label-primary,#e8e8ec);}
.dpsel-err{color:#e08585;font:var(--dsw-font-xxxs-11,11px);}
`

const UNASSIGNED = '__unassigned__'
const NEW_ITEM = '__new__'

export const PERM_LABEL: Record<TaskPermission, string> = {
  'read-only': '只读（read-only）',
  'workspace-write': '工作区可写（workspace-write）',
  'danger-full-access': '危险（danger-full-access）',
}

export interface ProjectSelectProps {
  /** 当前选中项目 id；null = 不属于项目。 */
  value: string | null
  onChange: (projectId: string | null) => void
  /** 附加说明文案（可选）。 */
  hint?: string
}

/** 项目选择器：不属于项目 / 现有项目 / ＋新建（inline，创建后自动选中）。 */
export function ProjectSelect({ value, onChange, hint }: ProjectSelectProps): ReactNode {
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const projects = useProjects()
  const cur = value ?? UNASSIGNED

  const pick = (v: string): void => {
    if (v === NEW_ITEM) {
      setNewOpen(true)
      return
    }
    onChange(v === UNASSIGNED ? null : v)
  }

  const create = (): void => {
    const n = name.trim()
    if (!n) {
      setErr('项目名称不能为空')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const rec = projectRegistry.createProject({ name: n, description: desc.trim() || undefined })
      onChange(rec.id) // 创建成功后自动选择该项目（§5/§8）
      setNewOpen(false)
      setName('')
      setDesc('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="dpsel" data-dpsel-project="1">
      <label className="dpsel-k" htmlFor="dpsel-project">
        Project
      </label>
      <select id="dpsel-project" className="dpsel-s" value={cur} onChange={(e) => pick(e.target.value)} aria-label="项目">
        <option value={UNASSIGNED}>不属于项目</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.glyph ? `${p.glyph} ` : ''}
            {p.name}
          </option>
        ))}
        <option value={NEW_ITEM}>＋ 新建项目…</option>
      </select>
      {hint ? <span className="dpsel-k">{hint}</span> : null}
      {newOpen ? (
        <span className="dpsel-form" data-dpsel-new-project="1">
          <input
            className="dpsel-in"
            placeholder="项目名称 *"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
            }}
            aria-label="新项目名称"
          />
          <input
            className="dpsel-in"
            placeholder="描述（可选）"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
            }}
            aria-label="新项目描述"
          />
          <button type="button" className="dpsel-btn" onClick={create} disabled={busy}>
            {busy ? '创建中…' : '创建'}
          </button>
          <button type="button" className="dpsel-link" onClick={() => setNewOpen(false)}>
            取消
          </button>
          {err ? <span className="dpsel-err">{err}</span> : null}
        </span>
      ) : null}
    </span>
  )
}

export interface AgentSelectProps {
  value: string | null
  onChange: (agentId: string | null) => void
  /**
   * 官方 agentPresets 真实清单（Home 用；缺省 = 本仓库 personal agent registry 目录）。
   * E4-FIX-IA-2 FINAL · PHASE A：Home 的 Agent 走官方预设（创建后由官方 select 绑定）。
   */
  options?: { id: string; label: string; detail?: string }[]
  /**
   * 官方清单读不到时的**降级原因**（需求 ⓑ · 口径 C，2026-09-17 用户裁定）。
   * 与「控件坏掉」明确区分：**Agent 是可选项**，清单读不到不该禁用控件、也不该在界面报错误样式的红字
   * （那会让「主页 = 开始一段会话」看起来坏了）。降级 = 只提供「自动（官方默认）」一项；
   * 技术原因保留在 `title`（可查、不吓人），并非隐去 —— 见 `data-dpsel-agent-state="auto-only"`。
   */
  degradedReason?: string
}

export function AgentSelect({ value, onChange, options, degradedReason }: AgentSelectProps): ReactNode {
  const degraded = typeof degradedReason === 'string' && degradedReason.length > 0
  // 降级时**不列本仓库 catalog**：那会让人以为选到的是官方预设（口径 C：只留「自动」）。
  const items = degraded
    ? []
    : options ?? AGENT_CATALOG.map((a) => ({ id: a.id, label: `${a.name}（${a.zh}）` }))
  return (
    <span
      className="dpsel"
      data-dpsel-agent="1"
      data-dpsel-agent-degraded={degraded ? '1' : undefined}
      title={degraded ? degradedReason : undefined}
    >
      <label className="dpsel-k" htmlFor="dpsel-agent">
        Agent
      </label>
      <select
        id="dpsel-agent"
        className="dpsel-s"
        value={degraded ? '' : value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        aria-label="执行 Agent"
      >
        <option value="">自动（官方默认）</option>
        {items.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      {degraded ? (
        <span className="dpsel-k" data-dpsel-agent-state="auto-only">
          仅「自动」可选（官方清单当前读不到）
        </span>
      ) : null}
    </span>
  )
}

export interface PermissionSelectProps {
  value: TaskPermission | null
  onChange: (p: TaskPermission | null) => void
  /** 官方 permissions 投影枚举出的真实预设（Home 用）。 */
  options?: { id: string; label: string; detail?: string }[]
  /** 能力不可用时的诚实原因。 */
  unavailableReason?: string
}

export function PermissionSelect({ value, onChange, options, unavailableReason }: PermissionSelectProps): ReactNode {
  const blocked = typeof unavailableReason === 'string' && unavailableReason.length > 0
  const items =
    options ?? TASK_PERMISSIONS.map((id) => ({ id: String(id), label: PERM_LABEL[id] }))
  return (
    <span className="dpsel" data-dpsel-perm="1">
      <label className="dpsel-k" htmlFor="dpsel-perm">
        Permission
      </label>
      <select
        id="dpsel-perm"
        className="dpsel-s"
        value={value ?? ''}
        disabled={blocked}
        onChange={(e) => onChange((e.target.value === '' ? null : e.target.value) as TaskPermission | null)}
        aria-label="权限档"
        aria-invalid={blocked ? true : undefined}
      >
        <option value="">官方默认</option>
        {items.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {blocked ? (
        <span className="dpsel-k" data-dpsel-perm-state="unavailable">
          不可用：{unavailableReason}
        </span>
      ) : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceSelect —— 官方 workspaces 目录投影（IA2-3/4/7/8 共用）。
// 数据源 = index 运行时 bind 的官方 workspaces.list（workspace-catalog.ts）；
// 值 = workspaceId | null（null = 不指定，交由会话创建链路沿用当前/最近工作区）。
export interface WorkspaceSelectProps {
  value: string | null
  onChange: (workspaceId: string | null) => void
  /** 官方工作区目录（未就绪 = [] 且 ready=false）。 */
  items: WorkspaceItem[]
  ready: boolean
  /** 未就绪但仍在有界重试探测官方服务（E4-FIX-IA-2 · 诚实区分“读取中”与“能力不可用”）。 */
  probing?: boolean
}

export function WorkspaceSelect({ value, onChange, items, ready, probing }: WorkspaceSelectProps): ReactNode {
  const cur = value ?? ''
  const disabled = !ready || items.length === 0
  return (
    <span className="dpsel" data-dpsel-ws="1">
      <label className="dpsel-k" htmlFor="dpsel-ws">
        Workspace
      </label>
      <select
        id="dpsel-ws"
        className="dpsel-s"
        value={cur}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        aria-label="工作区"
      >
        <option value="">自动（当前/最近）</option>
        {items.map((w) => (
          <option key={w.workspaceId} value={w.workspaceId}>
            {w.title}
          </option>
        ))}
      </select>
      {!ready ? (
        <span className="dpsel-k" data-dpsel-ws-state={probing ? 'probing' : 'unavailable'}>
          {probing ? '工作区数据读取中…（自动重试中）' : '官方工作区能力不可用（本环境未提供，绝不伪造目录）'}
        </span>
      ) : items.length === 0 ? (
        <span className="dpsel-k">暂无可用工作区（请先在官方界面添加）</span>
      ) : null}
    </span>
  )
}
