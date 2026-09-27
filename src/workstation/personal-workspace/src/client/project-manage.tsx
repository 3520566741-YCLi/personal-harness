// dsh-personal-workspace — Project Management 小窗（V1.2-A §1.2）+ 封存工作流入口（§1.3）
//
// 用户原文要求（§1.2）：
//   小窗显示：项目名称 / 项目描述 / Star 状态 / 任务数量 / 会话数量 / Workspace 数量 / 最近活动
//   操作：[封存项目] [删除项目] [取消]；「不要直接执行危险操作」。
//
// 纪律：
//   ① 单/双击的区分在 project-center 完成（单击延迟跳转、双击开门）——本文件只负责门里的内容。
//   ② 两个危险动作都是**两段式**：先进入各自小节（说明将要发生什么 + 真实计数），再点第二下的执行按钮。
//      删除的二次确认文案来自用户原文，逐字保留。
//   ③ 封存只有在**归档文件落盘 + 回读校验通过**之后才标记 archived（§1.3 硬规则）；
//      失败一律显示真实原因且**不封存**，绝不出现"以为写好了"。
//   ④ 层序：挂到 LAYERS.modal 的 body 门户（不写 z-index 魔数 —— 层序由 layering.ts 单一源负责），
//      overlay root 自身 pointer-events:none，所以遮罩必须显式 auto 才能收点击。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { projectRegistry, type ProjectRecord } from '../../../personal-registry/src/projects'
import {
  archiveDirLabel,
  archiveEvidenceFileName,
  archiveFileName,
  buildArchiveEvidence,
  buildArchiveMarkdown,
  buildEnrichPrompt,
  MANAGED_ROOT_LABEL,
  requestArchiveWrite,
  type ArchiveFacts,
} from './archive'
import { TaskBoardClient } from './taskboard'
import { LAYERS, overlayRootFor } from './layering'

/** 弹窗展示用的项目事实计数（全部由 project-center 传入 —— 单一真源，不在弹窗里二次推导）。 */
export interface ProjectFactCounts {
  tasksActive: number
  tasksAll: number
  sessions: number
  workspaces: number
  /** 最近活动时刻（ms epoch；0 = 真源里没有任何时间戳）。 */
  lastActivity: number
}

export interface ManageWorkspaceOption {
  workspaceId: string
  path: string
  title: string
}

export interface ProjectManageModalProps {
  project: ProjectRecord
  counts: ProjectFactCounts
  /** 官方 Workspace 目录（用于归档目标选择；空 = 只能落 Personal Harness 自管目录）。 */
  workspaceOptions: ManageWorkspaceOption[]
  /** 该项目当前已关联的工作区 id（决定归档目标默认值）。 */
  linkedWorkspaceIds: string[]
  /**
   * 构造归档事实包（由持有任务/会话/工作区真源的 project-center 注入；
   * 传入 workspaceRoot 决定 md 里记录的归档根）。
   */
  buildFacts: (workspaceRoot: string | null) => ArchiveFacts
  /** 归档成功回调（父层负责 projectRegistry.archiveProject + 提示）。 */
  onArchived: (input: { archiveFile: string; bytes: number }) => void
  /** 删除成功回调。 */
  onDeleted: () => void
  /** 恢复（取消封存）回调。 */
  onRestored: () => void
  onClose: () => void
}

const agoLabel = (ts: number): string => {
  if (!Number.isFinite(ts) || ts <= 0) return '（真源无时间戳）'
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s} 秒前`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.round(h / 24)} 天前`
}

export const CSS_PROJECT_MANAGE = String.raw`
.dpm-backdrop{position:fixed;inset:0;pointer-events:auto;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}
.dpm-box{width:min(560px,100%);max-height:min(78vh,720px);overflow:auto;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#1b1b1f);box-shadow:0 18px 48px rgba(0,0,0,.5);padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);}
.dpm-h{display:flex;align-items:center;gap:8px;font:var(--dsw-font-s-strong-14,600 14px);}
.dpm-h .dpm-glyph{color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dpm-star{border:none;background:transparent;cursor:pointer;font-size:15px;line-height:1;padding:0 2px;color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dpm-star.on{color:#e8b64c;}
.dpm-grid{display:grid;grid-template-columns:88px 1fr;gap:4px 10px;align-items:start;}
.dpm-k2{color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dpm-v{color:var(--dsw-alias-label-primary,#e8e8ec);word-break:break-word;}
.dpm-desc{color:var(--dsw-alias-label-secondary,#c8c8d0);line-height:1.5;}
.dpm-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}
.dpm-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.32));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:4px 11px;cursor:pointer;}
.dpm-btn:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08)) 60%,transparent);}
.dpm-btn.warn{border-color:rgba(240,180,60,.55);color:#f0c46a;background:rgba(240,180,60,.08);}
.dpm-btn.warn:hover{background:rgba(240,180,60,.16);}
.dpm-btn.danger{border-color:rgba(235,90,90,.55);color:#ffb0b0;}
.dpm-btn.danger:hover{background:rgba(235,90,90,.14);}
.dpm-btn:disabled{opacity:.5;cursor:default;}
.dpm-sec{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:9px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 45%,transparent);}
.dpm-sec.danger{border-color:rgba(235,90,90,.45);}
.dpm-sec.warn{border-color:rgba(240,180,60,.45);}
.dpm-warn{color:#f0c46a;font:var(--dsw-font-xxxs-strong-11,600 11px);}
.dpm-danger-t{color:#ffb0b0;font:var(--dsw-font-xxxs-strong-11,600 11px);}
.dpm-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.6;}
.dpm-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.dpm-sel{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.32));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 55%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxxs-11,11px);padding:3px 6px;max-width:100%;}
.dpm-path{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-secondary,#c8c8d0);word-break:break-all;}
.dpm-ok{color:#4ec98a;font:var(--dsw-font-xxxs-strong-11,600 11px);white-space:pre-wrap;word-break:break-word;}
.dpm-err{color:#ffb0b0;line-height:1.55;}
`

type Phase = 'menu' | 'archive' | 'delete'

/** 官方任务板客户端（与 NewTask 同一条官方通道；只用于创建"补写归档"任务）。 */
const taskClient = new TaskBoardClient()

export function ProjectManageModal(props: ProjectManageModalProps): ReactNode {
  const { project, counts, workspaceOptions, linkedWorkspaceIds, buildFacts, onArchived, onDeleted, onRestored, onClose } = props
  const [phase, setPhase] = useState<Phase>('menu')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  /** A3 补写：归档草稿的判断层小节由 Harness 补写（官方任务通道），默认开。 */
  const [enrich, setEnrich] = useState(true)
  const [archiveRoot, setArchiveRoot] = useState<string | null>(() => {
    const linked = workspaceOptions.find((w) => linkedWorkspaceIds.includes(w.workspaceId))
    if (linked) return linked.path
    return null
  })

  const starred = project.starred === true
  const archived = project.status === 'archived'

  // 层序：body 门户（overlayRootFor 自带 LAYERS.modal 的 z-index；此处不写任何 z 魔数）。
  const rootRef = useRef<HTMLElement | null | undefined>(undefined)
  if (rootRef.current === undefined) rootRef.current = overlayRootFor(LAYERS.modal)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
    return undefined
  }, [busy, onClose])

  const runArchive = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    try {
      const facts = buildFacts(archiveRoot)
      const markdown = buildArchiveMarkdown(facts)
      const evidence = buildArchiveEvidence(facts)
      const fileName = archiveFileName(project.name, facts.generatedAt)
      const evidenceFileName = archiveEvidenceFileName(project.name, facts.generatedAt)
      const result = await requestArchiveWrite({
        workspaceRoot: archiveRoot,
        projectId: project.id,
        projectName: project.name,
        markdown,
        evidence,
        fileName,
        evidenceFileName,
      })
      if (!result.ok) {
        // 用户 §1.3 硬规则：生成失败 → 不封存。
        setErr(`归档未完成：${result.message}`)
        return
      }
      onArchived({ archiveFile: result.file ?? '', bytes: result.bytes ?? 0 })
      let enrichNote = ''
      if (enrich && result.file !== undefined && result.evidenceFile !== undefined) {
        try {
          const wsId = workspaceOptions.find((w) => w.path === archiveRoot)?.workspaceId
          const snapshot = await taskClient.create({
            title: `补写归档叙述性小节：${project.name}`,
            description: `为已封存项目「${project.name}」补写 PROJECT_ARCHIVE.md 的叙述性小节（不编造，证据不足就写明）`,
            prompt: buildEnrichPrompt({
              projectName: project.name,
              projectId: project.id,
              draftPath: result.file,
              evidencePath: result.evidenceFile,
            }),
            permission: 'workspace-write',
            ...(wsId !== undefined ? { workspaceId: wsId } : {}),
          })
          const created = snapshot?.tasks?.find((t) => t.title === `补写归档叙述性小节：${project.name}`)
          enrichNote = created !== undefined
            ? `已创建补写任务（\`${created.id}\`）—— 由 Harness 依据事实包把判断性小节写成真正的总结。`
            : '已请求创建补写任务（宿主未回传任务行，请到任务板确认）。'
        } catch (e) {
          // 归档文件已经写好并校验通过 → 封存仍然成立；只如实报告补写任务没建成。
          enrichNote = `补写任务创建失败（归档文件不受影响）：${e instanceof Error ? e.message : String(e)}`
        }
      }
      setOkMsg(`已生成归档并回读校验通过（${result.bytes ?? 0} 字节）→ ${result.file ?? ''}${enrichNote ? `\n${enrichNote}` : ''}`)
      setPhase('menu')
    } catch (e) {
      setErr(`归档未完成：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const runDelete = (): void => {
    setBusy(true)
    setErr(null)
    try {
      const ok = projectRegistry.deleteProject(project.id)
      if (!ok) {
        setErr('删除未生效（项目不存在或已被移除）。')
        return
      }
      onDeleted()
    } catch (e) {
      setErr(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const runRestore = (): void => {
    setErr(null)
    try {
      projectRegistry.restoreProject(project.id)
      onRestored()
    } catch (e) {
      setErr(`恢复失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const body = (
    <div
      className="dpm-backdrop"
      data-dpm-modal="1"
      data-project-id={project.id}
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div className="dpm-box" role="dialog" aria-modal="true" aria-label={`项目管理 · ${project.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="dpm-h">
          <span className="dpm-glyph">{project.glyph ?? '·'}</span>
          <span style={{ flex: 1 }}>{project.name}</span>
          {archived ? <span className="dpm-warn">已封存</span> : null}
          <button
            type="button"
            className={starred ? 'dpm-star on' : 'dpm-star'}
            data-dpm-star="1"
            aria-pressed={starred}
            title={starred ? '★ 重要项目（点击取消星标）' : '☆ 常规项目（点击标记为重要）'}
            onClick={() => {
              try {
                projectRegistry.toggleStar(project.id)
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>

        <div className="dpm-grid">
          <span className="dpm-k2">描述</span>
          <span className="dpm-v dpm-desc">{project.description ? project.description : <span className="dpm-note">未填写</span>}</span>
          <span className="dpm-k2">星标</span>
          <span className="dpm-v">{starred ? '★ 重要项目' : '☆ 常规项目'}</span>
          <span className="dpm-k2">任务</span>
          <span className="dpm-v" data-dpm-count-tasks="1">
            {counts.tasksActive} 个活跃{counts.tasksAll !== counts.tasksActive ? ` / 共 ${counts.tasksAll} 个` : ''}
          </span>
          <span className="dpm-k2">会话</span>
          <span className="dpm-v" data-dpm-count-sessions="1">{counts.sessions} 个</span>
          <span className="dpm-k2">Workspace</span>
          <span className="dpm-v" data-dpm-count-workspaces="1">{counts.workspaces} 个</span>
          <span className="dpm-k2">最近活动</span>
          <span className="dpm-v" data-dpm-last-activity="1">{agoLabel(counts.lastActivity)}</span>
          <span className="dpm-k2">来源</span>
          <span className="dpm-v">{project.seed ? '内置种子档案' : '用户自建'}</span>
        </div>

        {okMsg !== null ? (
          <div className="dpm-ok" data-dpm-result="ok">
            {okMsg}
          </div>
        ) : null}
        {err !== null ? (
          <div className="dpm-err" data-dpm-result="err" role="alert">
            {err}
          </div>
        ) : null}

        {phase === 'menu' ? (
          <div className="dpm-acts">
            <button type="button" className="dpm-btn warn" data-dpm-act="archive" onClick={() => { setPhase('archive'); setErr(null); setOkMsg(null) }}>
              封存项目
            </button>
            <button type="button" className="dpm-btn danger" data-dpm-act="delete" onClick={() => { setPhase('delete'); setErr(null); setOkMsg(null) }}>
              删除项目
            </button>
            {archived ? (
              <button type="button" className="dpm-btn" data-dpm-act="restore" onClick={runRestore}>
                恢复项目
              </button>
            ) : null}
            <button type="button" className="dpm-btn" data-dpm-act="cancel" onClick={onClose}>
              取消
            </button>
          </div>
        ) : null}

        {phase === 'archive' ? (
          <div className="dpm-sec warn" data-dpm-archive-panel="1">
            <div className="dpm-warn">封存项目（不会立刻封存 —— 先生成归档文件，校验通过后才标记已封存）</div>
            <div className="dpm-note">
              将收集该项目的真实关联数据并生成 <b>PROJECT_ARCHIVE.md</b>：任务 {counts.tasksAll} 个（含执行历史）· 会话 {counts.sessions} 个 · 工作区{' '}
              {counts.workspaces} 个 · 项目元数据与活动时间线。判断性小节（Key Decisions / Deliverables / Important Knowledge / Lessons Learned）本层无真源 →
              一律标注「待补写」，由 Harness 补写，**不编造**。
            </div>
            <label className="dpm-line">
              <span className="dpm-k2">归档位置</span>
              <select
                className="dpm-sel"
                data-dpm-archive-root="1"
                value={archiveRoot ?? ''}
                onChange={(e) => setArchiveRoot(e.target.value === '' ? null : e.target.value)}
                disabled={busy}
              >
                <option value="">{MANAGED_ROOT_LABEL}（~/Personal Harness Archives）</option>
                {workspaceOptions.map((w) => (
                  <option key={w.workspaceId} value={w.path}>
                    {w.title} — {w.path}
                  </option>
                ))}
              </select>
            </label>
            <div className="dpm-note">
              将写入：<span className="dpm-path">{archiveDirValue(archiveRoot, project.name)}</span>
              <br />
              文件名：<span className="dpm-path">{archiveFileName(project.name, new Date().toISOString())}</span> ＋同名 <span className="dpm-path">.evidence.json</span>（事实包边车）
            </div>
            <label className="dpm-line">
              <input type="checkbox" data-dpm-enrich="1" checked={enrich} disabled={busy} onChange={(e) => setEnrich(e.target.checked)} />
              <span className="dpm-k2">
                同时创建「补写任务」（推荐）：判断性小节（Key Decisions / Deliverables / Important Knowledge / Lessons Learned）本层无真源 →
                由 Harness 依据事实包**就地补写**归档文件；不编造，证据不足时写明「现有证据不足以判断」。
              </span>
            </label>
            {archiveRoot === null && enrich ? (
              <div className="dpm-note">
                注意：当前归档位置是 Personal Harness 自管目录（不在任何工作区内）→ 补写任务在执行时可能需要一次写盘审批。
              </div>
            ) : null}
            <div className="dpm-note">封存**不会删除**任何官方 Session / Task / execution / Workspace，也不会删除你的真实文件；随时可用「恢复项目」取消封存。</div>
            <div className="dpm-acts">
              <button type="button" className="dpm-btn warn" data-dpm-act="archive-run" onClick={() => void runArchive()} disabled={busy}>
                {busy ? '正在生成并校验…' : '生成归档并封存'}
              </button>
              <button type="button" className="dpm-btn" data-dpm-act="archive-back" onClick={() => setPhase('menu')} disabled={busy}>
                返回
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'delete' ? (
          <div className="dpm-sec danger" data-dpm-delete-panel="1">
            <div className="dpm-danger-t">你确定要删除该项目吗？</div>
            <div className="dpm-err">删除项目后无法恢复。项目关系和 Personal Harness 项目元数据将被删除。</div>
            <div className="dpm-note">
              删除**不会**影响：官方 Sessions · 官方 Tasks · 官方 Task executions · 官方 Workspace · 你的真实文件。原关联的任务与会话会回到「未分配」。
              {project.seed ? '（内置种子项目删除的是个人层元数据与关系；基础档案条目来自构建期目录，不会破坏仓库文件。）' : ''}
            </div>
            <div className="dpm-acts">
              <button type="button" className="dpm-btn" data-dpm-act="delete-cancel" onClick={() => setPhase('menu')} disabled={busy}>
                取消
              </button>
              <button type="button" className="dpm-btn danger" data-dpm-act="delete-confirm" onClick={runDelete} disabled={busy}>
                {busy ? '删除中…' : '确认永久删除'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return rootRef.current !== null ? createPortal(body, rootRef.current) : body
}

/** 归档目录展示值（与宿主半拼接严格一致；受管根显示为 ~/）。 */
export function archiveDirValue(workspaceRoot: string | null, projectName: string): string {
  return archiveDirLabel({
    project: { id: '', name: projectName, seed: false, createdAt: 0, updatedAt: 0 },
    generatedAt: new Date(0).toISOString(),
    workspaceRoot,
    workspaceSource: workspaceRoot === null ? 'managed' : 'linked',
    tasks: [],
    sessions: [],
    workspaces: [],
    activity: [],
  })
}
