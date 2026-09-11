// dsh-personal-workspace — Workspace Center（E4-FIX-IA-2 · IA2-7）。
//
// 语义（用户收口 §39 / IA2-7）：侧栏「工作区」= 投影**官方真实 Workspace 注册表**
// （ctx.get('workspaces').list items：workspaceId/path/title/sessionIds —— 官方权威，只读，
// 不复制、不 mock）。每项展示：名称 + 真实路径（只读）+ 官方会话数 + 该工作区内的会话
// （官方 sessions 真源按 workspace.sessionIds 反查）+ 关联到的项目（registry 关系层）+ 操作：
//   ·「打开真实目录」= better-sidebar **editor 文件夹窗口** openTab({type:'editor',path,meta:{dir:true}})
//     —— Personal 侧唯一的「看得见文件」入口（诚实标注：这是 better-sidebar 面板，非官方文件树；
//      官方唯一文件打开 = 宿主默认程序 remote.session.openWorkspacePath，本面板不伪造）。
// 官方能力限制诚实呈现（§43/IA2-7）：官方无 app 内文件树、无 workspace detail 页、无 open 动作
// （只有 archiveSession 等 registry 方法）→ 本面板 = 注册表投影 + 只读标注，绝不假装能浏览文件。
import { useState, type ReactNode } from 'react'
import { useProjectDetailSessions } from './project-detail'
import { useProjects } from './selectors'
import { retryWorkspaceCatalogNow, useWorkspaceCatalog } from './workspace-catalog'
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
`

// ---------------------------------------------------------------------------
// 动作注入（index.tsx apply 时 bind）
let openSessionFn: ((id: string) => void) | null = null
let openFolderFn: ((path: string) => void) | null = null
let openProjectDetailFn: ((projectId: string) => void) | null = null

export function bindWorkspaceCenterActions(actions: {
  openSession: (id: string) => void
  /** 打开 better-sidebar editor 文件夹窗口（真实目录）。 */
  openFolder: (path: string) => void
  /** 打开项目详情（IA2-8：工作区 → 项目跳转）。 */
  openProjectDetail: (projectId: string) => void
}): () => void {
  openSessionFn = actions.openSession
  openFolderFn = actions.openFolder
  openProjectDetailFn = actions.openProjectDetail
  return () => {
    openSessionFn = null
    openFolderFn = null
    openProjectDetailFn = null
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

export function WorkspaceCenterView(): ReactNode {
  const wsCat = useWorkspaceCatalog()
  const sessions = useProjectDetailSessions()
  const projects = useProjects()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sessionById = new Map(sessions.rows.map((s) => [s.id, s]))
  const nameOfProject = (pid: string): string | undefined => projects.find((p) => p.id === pid)?.name

  const openFolder = (path: string): void => {
    if (typeof openFolderFn !== 'function') {
      setNotice('「打开真实目录」依赖 better-sidebar 编辑器窗口，当前不可用（已在界面标注只读路径）。')
      return
    }
    setNotice(null)
    openFolderFn(path)
  }

  return (
    <div className="dwc-root" data-dsh-plugin="dsh-personal-workspace" data-dwc-workspace-center="1">
      <div className="dwc-h">工作区 · Workspace Center</div>
      <div className="dwc-note">
        这里展示 AI 实际工作的**真实文件环境**（官方 Workspace 注册表，只读投影）。官方没有 app 内文件树 /
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
            。本页**不伪造**目录——不会显示任何模拟工作区；请确认官方 workspace 服务已启用后重试。
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
                  onClick={() => setExpanded(isOpen ? null : w.workspaceId)}
                  data-dwc-expand="1"
                >
                  {isOpen ? '收起' : '会话'}
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
                </div>
              ) : null}
            </div>
          )
        })
      )}

      {notice ? (
        <div className="dwc-empty" role="status" data-dwc-notice="1">
          {notice}
        </div>
      ) : null}

      <div className="dwc-note">
        工作区数据来自官方（只读）。在本面板关联项目（Link Workspace）→ 请到「项目详情」页操作；
        归档会话以官方为准（在 Recent/官方会话浏览查看）。
      </div>
    </div>
  )
}
