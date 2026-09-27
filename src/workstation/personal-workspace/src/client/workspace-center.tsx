// dsh-personal-workspace — Workspace Center（E4-FIX-IA-2 · IA2-7）＋ V1.2-J J3（任务面 / 创建 / 删除）。
//
// 语义（用户收口 §39 / IA2-7）：侧栏「工作区」= 投影**官方真实 Workspace 注册表**
// （ctx.get('workspaces').list items：workspaceId/path/title/sessionIds —— 官方权威，只读，
// 不复制、不 mock）。每项展示：名称 + 真实路径（只读）+ 官方会话数 + 该工作区内的会话
// （官方 sessions 真源按 workspace.sessionIds 反查）+ **该工作区范围内的任务（第三方任务板，见
// workspace-tasks.ts 文件头的诚实标注）** + 关联到的项目（registry 关系层）+ 操作：
//   ·「打开真实目录」= better-sidebar **editor 文件夹窗口** openTab({type:'editor',path,meta:{dir:true}})
//     —— Personal 侧唯一的「看得见文件」入口（诚实标注：这是 better-sidebar 面板，非官方文件树；
//      官方唯一文件打开 = 宿主默认程序 remote.session.openWorkspacePath，本面板不伪造）。
//   ·「会话/任务」= 就地展开该工作区范围内的会话与任务（会话可「打开」；任务可「打开」= 任务板定位）。
//   ·「新建工作区」= 官方 workspaces.create({path})（只登记**已存在的绝对目录**，本面板不建目录）。
//   ·「删除工作区」= 官方 workspaces.delete(id)，**两级确认**（菜单 → 危险面板 → 「确认永久删除」）。
//     官方原生语义 = 只注销注册；**不删目录、不删文件、不删任何会话**（文案见 workspace-actions.ts）。
// 官方能力限制诚实呈现（§43/IA2-7）：官方无 app 内文件树、无 workspace detail 页、无 open 动作
// （只有 archiveSession 等 registry 方法）→ 本面板 = 注册表投影 + 只读标注，绝不假装能浏览文件。
// 本面板**不引入新 main view**（就地增强 workspace-center），因此不触碰 4 个套件共享的视图白名单。
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useProjectDetailSessions } from './project-detail'
import { useProjects } from './selectors'
import { retryWorkspaceCatalogNow, useWorkspaceCatalog } from './workspace-catalog'
import {
  WS_WRITE_TEXTS,
  createWorkspace,
  deleteWorkspaceById,
  subscribeWorkspaceWriteCapability,
  workspaceWriteCapability,
  workspaceWriteCapabilityVersion,
} from './workspace-actions'
import {
  filterWorkspaceTasks,
  refreshWorkspaceTasks,
  useWorkspaceTaskState,
  type WorkspaceTaskAttribution,
} from './workspace-tasks'
import { projectRegistry } from '../../../personal-registry/src/projects'

// ---------------------------------------------------------------------------
export const CSS_WORKSPACE_CENTER = String.raw`
.dwc-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.dwc-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dwc-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dwc-sec{display:flex;flex-direction:column;gap:6px;}
.dwc-empty{color:var(--dsw-alias-label-dimmed,#8f8f99);font:var(--dsw-font-xxs-12,12px);padding:2px 0;line-height:1.5;}
.dwc-retry{margin-left:6px;padding:1px 8px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-secondary,#c9c9d1);background:transparent;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:6px;cursor:pointer;}
.dwc-retry:hover{border-color:var(--dsw-alias-border-l3,#55555f);}
.dwc-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dwc-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);padding:8px 10px;display:flex;flex-direction:column;gap:6px;}
.dwc-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 45%,transparent);width:100%;text-align:left;color:inherit;font:inherit;cursor:pointer;}
.dwc-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1)) 60%,transparent);}
.dwc-row.static{cursor:default;}
.dwc-glyph{width:18px;text-align:center;flex:none;color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dwc-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.dwc-name{display:flex;align-items:center;gap:6px;min-width:0;}
.dwc-name b{color:var(--dsw-alias-label-primary,#e8e8ec);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dwc-path{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;}
.dwc-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;}
.dwc-count{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));border-radius:4px;padding:0 6px;white-space:nowrap;}
.dwc-count b{color:var(--dsw-alias-label-secondary,#c8c8d0);font-weight:600;}
.dwc-act{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:2px 9px;cursor:pointer;flex:none;}
.dwc-act:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dwc-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#37c871;}
.dwc-dot.idle{background:var(--dsw-alias-label-dimmed,#6a6a74);}
.dwc-dot.arch{background:var(--dsw-alias-label-dimmed,#55555e);}
.dwc-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dwc-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);white-space:nowrap;flex:none;}
.dwc-tag{display:inline-flex;align-items:center;font:var(--dsw-font-xxxs-11,11px);border-radius:4px;padding:1px 5px;white-space:nowrap;flex:none;}
.dwc-tag.prj{background:rgba(150,120,255,.12);color:#b49bff;border:1px solid rgba(150,120,255,.3);}
.dwc-sessions{border-top:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.18));padding-top:4px;display:flex;flex-direction:column;gap:3px;}
/* ── V1.2-J J3：任务面（第三方标注）／创建／删除（二级询问） ───────────────── */
.dwc-3p{display:inline-flex;align-items:center;font:var(--dsw-font-xxxs-11,11px);border-radius:4px;padding:1px 5px;white-space:nowrap;flex:none;background:rgba(240,180,60,.12);border:1px solid rgba(240,180,60,.35);color:#e8b64c;}
.dwc-taskgrp{display:flex;flex-direction:column;gap:3px;margin-top:2px;}
.dwc-in{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 50%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:5px 9px;flex:1;min-width:0;box-sizing:border-box;outline:none;}
.dwc-in:focus{border-color:rgba(120,150,255,.6);}
.dwc-create{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:9px;padding:9px 11px;display:flex;flex-direction:column;gap:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 45%,transparent);}
.dwc-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.32));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:3px 10px;cursor:pointer;flex:none;}
.dwc-btn:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08)) 60%,transparent);}
.dwc-btn.danger{border-color:rgba(235,90,90,.55);color:#ffb0b0;}
.dwc-btn.danger:hover{background:rgba(235,90,90,.14);}
.dwc-btn:disabled{opacity:.5;cursor:default;}
.dwc-panel{border:1px solid rgba(235,90,90,.45);border-radius:9px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;background:rgba(235,90,90,.06);margin-top:2px;}
.dwc-danger-t{color:#ffb0b0;font:var(--dsw-font-xxxs-strong-11,600 11px);}
.dwc-err{color:#ffb0b0;line-height:1.55;}
.dwc-ok{color:#4ec98a;font:var(--dsw-font-xxxs-strong-11,600 11px);white-space:pre-wrap;word-break:break-word;}
.dwc-disabled-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;}
`

// ---------------------------------------------------------------------------
// 动作注入（index.tsx apply 时 bind）
let openSessionFn: ((id: string) => void) | null = null
let openFolderFn: ((path: string) => void) | null = null
let openProjectDetailFn: ((projectId: string) => void) | null = null
let openTaskFn: ((taskId: string) => void) | null = null

export function bindWorkspaceCenterActions(actions: {
  openSession: (id: string) => void
  /** 打开 better-sidebar editor 文件夹窗口（真实目录）。 */
  openFolder: (path: string) => void
  /** 打开项目详情（IA2-8：工作区 → 项目跳转）。 */
  openProjectDetail: (projectId: string) => void
  /** J3：打开任务（任务板定位；与 Home/Project Center 同一个注入点）。 */
  openTask?: (taskId: string) => void
}): () => void {
  openSessionFn = actions.openSession
  openFolderFn = actions.openFolder
  openProjectDetailFn = actions.openProjectDetail
  openTaskFn = typeof actions.openTask === 'function' ? actions.openTask : null
  return () => {
    openSessionFn = null
    openFolderFn = null
    openProjectDetailFn = null
    openTaskFn = null
  }
}

const ago = (ts?: number): string => {
  if (!ts || !Number.isFinite(ts)) return ''
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return s + ' 秒前'
  const m = Math.round(s / 60)
  if (m < 60) return m + ' 分钟前'
  const h = Math.round(m / 60)
  if (h < 24) return h + ' 小时前'
  return Math.round(h / 24) + ' 天前'
}

/**
 * J3 任务面（**第三方能力，非官方**；见 workspace-tasks.ts 文件头）：
 * 一个工作区卡片里渲染「该工作区范围内的任务」。
 * 诚实三态（未知 ≠ 0）：
 *   · 账本取不到 → 「取不到 / 无法清点」，**绝不**出现「0 个任务」；
 *   · 账本可用 → 给出真计数 + 全量/无归属上下文（让"0 条匹配"可被解释）。
 */
function WorkspaceTaskPanel({ workspaceId }: { workspaceId: string }): ReactNode {
  const taskState = useWorkspaceTaskState()
  const attribution: WorkspaceTaskAttribution = filterWorkspaceTasks(taskState, workspaceId)
  const openTask = (taskId: string): void => {
    try {
      openTaskFn?.(taskId)
    } catch {
      // best-effort：任务板不可用时不假装跳转成功
    }
  }
  return (
    <div className="dwc-taskgrp" data-dwc-ws-tasks="1" data-dwc-tasks-third-party="1">
      <span className="dwc-note">
        [第三方能力，非官方] 以下任务来自第三方任务板（@linxin666/dsh-client-ui-task-board）宿主账本，按其
        task.workspaceId 归到本工作区 —— 官方 Workspace 注册表只登记会话，并没有任务真源。
      </span>
      {attribution.kind === 'unavailable' ? (
        <div className="dwc-err" data-dwc-ws-tasks-state="unavailable" role="status">
          {taskState.kind === 'loading'
            ? '任务账本读取中…（尚未清点，暂不给出条数）'
            : `取不到任务账本，无法清点本工作区的任务：${taskState.message}（第三方任务板服务不可用时如此；这不是"没有任务"）`}
        </div>
      ) : attribution.count === null ? (
        <div className="dwc-err" data-dwc-ws-tasks-state="unavailable">
          无法清点本工作区的任务（第三方账本未就绪）。
        </div>
      ) : (
        <>
          <span className="dwc-count" data-dwc-ws-task-count={String(attribution.count)}>
            第三方任务 <b>{attribution.count}</b> 条（全量 {attribution.total} 条
            {attribution.unassigned > 0 ? ` · 其中 ${attribution.unassigned} 条无 workspaceId 归属` : ''}）
          </span>
          {attribution.rows.length === 0 ? (
            <div className="dwc-empty">
              {attribution.total === 0
                ? '第三方任务账本当前是空的（0 条任务）—— 这是已知的清点结果，不是取不到。'
                : `全量 ${attribution.total} 条任务里没有一条归到本工作区${
                    attribution.unassigned > 0
                      ? `（其中 ${attribution.unassigned} 条根本没有 workspaceId，无法归到任何工作区）`
                      : ''
                  }。`}
            </div>
          ) : (
            attribution.rows.map((t) => (
              <div className="dwc-row static" key={t.id} data-dwc-ws-task="1" data-dwc-ws-task-id={t.id}>
                <span className={`dwc-dot${t.running ? '' : ' idle'}`} />
                <span className="dwc-t">{t.title}</span>
                <span className="dwc-sub">{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                {t.archived ? <span className="dwc-sub">已归档</span> : null}
                {t.updatedAt ? <span className="dwc-sub">{ago(t.updatedAt)}</span> : null}
                <span
                  className="dwc-act"
                  role="button"
                  tabIndex={0}
                  data-dwc-ws-task-open="1"
                  onClick={(e) => {
                    e.stopPropagation()
                    openTask(t.id)
                  }}
                >
                  打开
                </span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}

/**
 * 写面能力（create/delete）**可反应地**读：
 * 官方服务可能晚于本插件 apply 注册（真机顺序差）⇒ 只读一次快照会把入口永久钉在"不可用"。
 * 这里订阅 workspace-actions 的能力版本号，服务晚到时入口自动转为可用（诚实降级 → 自动恢复）。
 */
function useWriteCapability(): ReturnType<typeof workspaceWriteCapability> {
  useSyncExternalStore(
    subscribeWorkspaceWriteCapability,
    workspaceWriteCapabilityVersion,
    workspaceWriteCapabilityVersion,
  )
  return workspaceWriteCapability()
}

/** 任务状态中文标签（第三方看板的五列）。 */
const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: '待规划',
  todo: '待执行',
  running: '运行中',
  done: '已完成',
  failed: '失败',
}

/** J3 创建区（官方 workspaces.create；服务缺失 ⇒ 入口禁用 + 一句可读原因）。 */
function WorkspaceCreateBox(): ReactNode {
  const cap = useWriteCapability()
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await createWorkspace({ path })
      if (!res.ok) {
        setErr(`创建失败：${res.message}`)
        return
      }
      const title = res.workspace?.title ?? path.trim()
      setMsg(
        `已登记工作区「${title}」（官方 workspaces.create）${
          res.workspace !== null ? ` · workspaceId=${res.workspace.workspaceId}` : '；官方未回传 workspace 行，请以列表为准。'
        }`,
      )
      setPath('')
    } catch (e) {
      setErr(`创建失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dwc-create" data-dwc-create-box="1">
      <span className="dwc-k">新建工作区（官方注册表 · 只登记已存在的绝对目录）</span>
      <label className="dwc-row static" style={{ gap: 6 }}>
        <input
          className="dwc-in"
          data-dwc-create-path="1"
          type="text"
          value={path}
          disabled={busy || !cap.canCreate}
          placeholder="/Users/you/codes/some-existing-dir"
          onChange={(e) => setPath(e.target.value)}
        />
        <button
          type="button"
          className="dwc-btn"
          data-dwc-act-create="1"
          data-dwc-create-disabled={cap.canCreate ? '0' : '1'}
          disabled={busy || !cap.canCreate}
          aria-disabled={busy || !cap.canCreate}
          title={cap.canCreate ? '调官方 workspaces.create({ path })' : (cap.reason ?? WS_WRITE_TEXTS.missingService)}
          onClick={() => void submit()}
        >
          {busy ? '创建中…' : '创建'}
        </button>
      </label>
      {cap.canCreate ? (
        <div className="dwc-note">
          官方 create 语义：路径必须是已经存在的目录（本面板不建目录、不写磁盘）；同一路径已登记时官方直接返回既有工作区。
        </div>
      ) : (
        <div className="dwc-disabled-note" data-dwc-create-unavailable="1" role="status">
          {cap.reason ?? WS_WRITE_TEXTS.missingService}
        </div>
      )}
      {msg !== null ? (
        <div className="dwc-ok" data-dwc-create-result="ok">
          {msg}
        </div>
      ) : null}
      {err !== null ? (
        <div className="dwc-err" data-dwc-create-result="err" role="alert">
          {err}
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceCenterView(): ReactNode {
  const wsCat = useWorkspaceCatalog()
  const sessions = useProjectDetailSessions()
  const projects = useProjects()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** J3 删除：只有这一个 id 处于「危险面板」段（一级 → 二级）。 */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delErr, setDelErr] = useState<string | null>(null)
  const [delOk, setDelOk] = useState<string | null>(null)

  const sessionById = new Map(sessions.rows.map((s) => [s.id, s]))
  const nameOfProject = (pid: string): string | undefined => projects.find((p) => p.id === pid)?.name
  const cap = useWriteCapability()

  // J3：任务账本只在**本视图挂载期间**拉一次（不常驻轮询、不订阅 SSE —— 本面板是只读投影；
  //   用户在任务板改过之后再回到本页即刷新）。
  useEffect(() => {
    void refreshWorkspaceTasks()
  }, [])

  const openFolder = (path: string): void => {
    if (typeof openFolderFn !== 'function') {
      setNotice('「打开真实目录」依赖 better-sidebar 编辑器窗口，当前不可用（已在界面标注只读路径）。')
      return
    }
    setNotice(null)
    openFolderFn(path)
  }

  /**
   * 第二级：真正调用官方 delete。
   * 失败 → **留在确认段**（面板不关、错误可见、不显示成功）。
   */
  const runDelete = async (workspaceId: string, title: string): Promise<void> => {
    setDelBusy(true)
    setDelErr(null)
    setDelOk(null)
    try {
      const res = await deleteWorkspaceById(workspaceId)
      if (!res.ok) {
        setDelErr(`删除未生效：${res.message}`)
        return
      }
      setDelOk(`已从官方注册表注销「${title}」：目录与文件、全部会话都还在（该工作区下的会话回到官方「未分组」）。`)
      setPendingDelete(null)
    } catch (e) {
      setDelErr(`删除未生效：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDelBusy(false)
    }
  }

  return (
    <div className="dwc-root" data-dsh-plugin="dsh-personal-workspace" data-dwc-workspace-center="1">
      <div className="dwc-h">工作区 · Workspace Center</div>
      <div className="dwc-note">
        这里展示 AI 实际工作的真实文件环境（官方 Workspace 注册表，只读投影）。官方没有 app 内文件树 /
        detail 页 —— 看真实目录用每项的「打开真实目录」（better-sidebar 编辑器文件夹窗口）；打开单个文件走
        宿主默认程序（桌面端）。
      </div>

      {!wsCat.ready ? (
        wsCat.probing ? (
          <div className="dwc-empty" data-dwc-ws-state="probing">
            工作区数据读取中…（正在探测官方 workspaces 服务，最多自动重试 12s）
          </div>
        ) : (
          <div className="dwc-empty" data-dwc-ws-state="unavailable">
            官方 workspaces 能力当前不可用（capability limitation）：{wsCat.error ?? '本环境未提供 ctx.get("workspaces").list'}
            。本页不伪造目录——不会显示任何模拟工作区；请确认官方 workspace 服务已启用后重试。
            <button
              type="button"
              className="dwc-retry"
              data-dwc-ws-retry="1"
              onClick={() => {
                const ok = retryWorkspaceCatalogNow()
                setNotice(ok ? null : '仍未探测到官方 workspaces 服务。')
              }}
            >
              立即重试
            </button>
          </div>
        )
      ) : wsCat.items.length === 0 ? (
        <div className="dwc-empty">当前没有可用工作区：请先在官方界面添加一个工作区目录。</div>
      ) : (
        wsCat.items.map((w) => {
          const wsSessions = w.sessionIds
            .map((id) => sessionById.get(id))
            .filter((s): s is NonNullable<typeof s> => s !== undefined)
          const projIds = projectRegistry.projectsOfWorkspace(w.workspaceId).map((p) => p.id)
          const isOpen = expanded === w.workspaceId
          const isPending = pendingDelete === w.workspaceId
          const hasPath = typeof w.path === 'string' && w.path.length > 0
          return (
            <div
              className="dwc-card"
              key={w.workspaceId}
              data-dwc-ws="1"
              data-workspace-id={w.workspaceId}
              data-dwc-ws-limited={hasPath ? '0' : '1'}
            >
              <div className="dwc-row static" style={{ padding: 4, border: 'none', background: 'transparent' }}>
                <span className="dwc-glyph">▤</span>
                <span className="dwc-main">
                  <span className="dwc-name">
                    <b>{w.title}</b>
                    {projIds.length > 0
                      ? projIds.map((pid) => (
                          <span
                            key={pid}
                            className="dwc-tag prj"
                            role="button"
                            tabIndex={0}
                            data-dwc-project-chip="1"
                            title={`打开项目「${nameOfProject(pid) ?? pid}」详情`}
                            onClick={(e) => {
                              e.stopPropagation()
                              try {
                                openProjectDetailFn?.(pid)
                              } catch {
                                // best-effort
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                try {
                                  openProjectDetailFn?.(pid)
                                } catch {
                                  // best-effort
                                }
                              }
                            }}
                          >
                            {nameOfProject(pid) ?? pid}
                          </span>
                        ))
                      : null}
                  </span>
                  {/* PHASE G（§17）：官方真源项**可能没有目录路径**（partial capability）→
                      如实标注「limited」，并把「打开真实目录」置为不可用 + 原因，绝不静默空跳。 */}
                  {hasPath ? (
                    <span className="dwc-path" title={w.path}>
                      {w.path}
                    </span>
                  ) : (
                    <span className="dwc-path" data-dwc-ws-path-missing="1" title="官方注册表未提供该工作区的目录路径">
                      （官方未提供目录路径 · limited）
                    </span>
                  )}
                  <span className="dwc-meta">
                    <span className="dwc-count">官方会话 <b>{w.sessionIds.length}</b></span>
                    {projIds.length > 0 ? (
                      <span className="dwc-count">
                        关联项目 <b>{projIds.length}</b>
                      </span>
                    ) : (
                      <span className="dwc-count">未关联项目</span>
                    )}
                  </span>
                </span>
                {hasPath ? (
                  <span className="dwc-act" onClick={() => openFolder(w.path)} data-dwc-open-folder="1">
                    打开真实目录
                  </span>
                ) : (
                  <span
                    className="dwc-act"
                    data-dwc-open-folder="1"
                    data-dwc-open-folder-disabled="1"
                    aria-disabled="true"
                    title="官方注册表未提供该工作区的目录路径，无法打开（不伪造路径）"
                  >
                    无法打开目录（缺路径）
                  </span>
                )}
                <span
                  className="dwc-act"
                  onClick={() => {
                    setDelErr(null)
                    setDelOk(null)
                    setPendingDelete(isPending ? null : w.workspaceId)
                  }}
                  data-dwc-act-delete="1"
                  data-dwc-delete-disabled={cap.canDelete ? '0' : '1'}
                  role="button"
                  tabIndex={0}
                  aria-disabled={!cap.canDelete}
                  title={cap.canDelete ? '删除工作区（两级确认）' : (cap.reason ?? WS_WRITE_TEXTS.missingService)}
                >
                  删除工作区
                </span>
                <span
                  className="dwc-act"
                  onClick={() => setExpanded(isOpen ? null : w.workspaceId)}
                  data-dwc-expand="1"
                >
                  {isOpen ? '收起' : `会话 ${w.sessionIds.length} / 任务`}
                </span>
              </div>
              {isOpen ? (
                <div className="dwc-sessions" data-dwc-ws-sessions="1">
                  {wsSessions.length === 0 ? (
                    <div className="dwc-empty">该工作区下暂无会话记录（官方会话浏览里可查看）。</div>
                  ) : (
                    wsSessions.map((s) => (
                      <div className="dwc-row static" key={s.id}>
                        <span className={`dwc-dot${s.archived ? ' arch' : s.running ? '' : ' idle'}`} />
                        <span className="dwc-t">{s.title}</span>
                        {s.archived ? <span className="dwc-sub">已归档</span> : s.running ? <span className="dwc-sub">运行中</span> : null}
                        {s.updatedAt ? <span className="dwc-sub">{ago(s.updatedAt)}</span> : null}
                        <span
                          className="dwc-act"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            try {
                              openSessionFn?.(s.id)
                            } catch {
                              // best-effort
                            }
                          }}
                        >
                          打开
                        </span>
                      </div>
                    ))
                  )}
                  {/* J3：该工作区范围内的任务（第三方能力；见 workspace-tasks.ts 文件头） */}
                  <WorkspaceTaskPanel workspaceId={w.workspaceId} />
                </div>
              ) : null}
              {/* J3 删除：第二级（危险面板）—— 面板出现**本身不调用**官方 delete，
                  只有点「确认永久删除」才调（一级不产生任何副作用）。 */}
              {isPending ? (
                <div className="dwc-panel" data-dwc-delete-panel="1" data-dwc-delete-ws={w.workspaceId} role="dialog" aria-modal="false">
                  <div className="dwc-danger-t">{WS_WRITE_TEXTS.panelTitle}</div>
                  <div className="dwc-err">{WS_WRITE_TEXTS.panelSemantics}</div>
                  <div className="dwc-note">
                    {WS_WRITE_TEXTS.panelWhere}
                    {hasPath ? (
                      <>
                        {' '}
                        该工作区登记的目录是 <span className="dwc-path">{w.path}</span> —— 它会原样保留。
                      </>
                    ) : null}
                  </div>
                  {delErr !== null ? (
                    <div className="dwc-err" data-dwc-delete-result="err" role="alert">
                      {delErr}
                    </div>
                  ) : null}
                  <div className="dwc-meta">
                    <button
                      type="button"
                      className="dwc-btn"
                      data-dwc-act-delete-cancel="1"
                      disabled={delBusy}
                      onClick={() => {
                        setDelErr(null)
                        setPendingDelete(null)
                      }}
                    >
                      {WS_WRITE_TEXTS.cancel}
                    </button>
                    <button
                      type="button"
                      className="dwc-btn danger"
                      data-dwc-act-delete-confirm="1"
                      disabled={delBusy || !cap.canDelete}
                      title={cap.canDelete ? '调官方 workspaces.delete(workspaceId)' : (cap.reason ?? WS_WRITE_TEXTS.missingService)}
                      onClick={() => void runDelete(w.workspaceId, w.title)}
                    >
                      {delBusy ? '删除中…' : WS_WRITE_TEXTS.confirmDelete}
                    </button>
                  </div>
                  {!cap.canDelete ? (
                    <div className="dwc-disabled-note" data-dwc-delete-unavailable="1" role="status">
                      {cap.reason ?? WS_WRITE_TEXTS.missingService}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })
      )}

      {/* J3：创建入口（空态与有工作区时都在；服务缺失 ⇒ 禁用 + 原因，绝不抛错、绝不假装成功） */}
      <WorkspaceCreateBox />

      {delOk !== null ? (
        <div className="dwc-ok" data-dwc-delete-result="ok" role="status">
          {delOk}
        </div>
      ) : null}

      {notice ? (
        <div className="dwc-empty" role="status" data-dwc-notice="1">
          {notice}
        </div>
      ) : null}

      <div className="dwc-note">
        工作区数据来自官方（只读）；创建/删除走官方 workspaces.create / workspaces.delete（删除 = 只注销注册，
        目录与文件、全部会话都保留）。在本面板关联项目（Link Workspace）→ 请到「项目详情」页操作；
        归档会话以官方为准（在 Recent/官方会话浏览查看）。卡片里的任务来自第三方任务板（非官方），
        取不到时如实写「取不到」，不当作 0 条。
      </div>
    </div>
  )
}
