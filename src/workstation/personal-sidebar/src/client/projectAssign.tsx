// dsh-personal-sidebar · 会话「⋯」菜单 →「加入项目」（2026-09-17 用户需求）。
//
// 用户原话（本功能唯一需求来源）：
//   「每个会话的 3 个点里面的这个窗口，里面加一个加入项目的功能，这个样子就不需要每次都到
//     项目里面一个个收录了。」
//   → 现状是「进项目详情 → 逐个收录会话」（反向操作）；本功能提供正向入口（会话 → 项目）。
//   → 两个入口写的是**同一份关系真源**（`personal-registry/src/projects` 的 sessionProject），
//     不存在两份数据；因此「收录」与「加入项目」互为镜像，结果一致。
//
// 归属边界（必须牢记）：**项目是 Personal 概念，官方壳没有它**。
//   · 官方 `ui-workspace` 里确实有 `IconProjectAddOutline16`，但它挂在 `t("workspace.add")`
//     （"添加工作区"）上，与会话归属无关 —— 所以本项**不是官方菜单项的复现**，
//     而是用户明确要求的新增能力。文案因此由我方拟定（「加入项目」），**不谎称取自官方 i18n**。
//   · 官方三项（重命名/分叉会话/归档会话）顺序与文案在 sessionActions.tsx 中保持不变，
//     本项固定追加在其后，且**只在桥可用时**才出现（不可用就干脆不显示，不给假入口）。
//
// 单实例纪律：本文件**不 import** 项目 store（那是 personal-workspace 的 bundle 资产）。
//   跨 bundle 只经 window 上的桥（键名 = 下方字面量，与 project-bridge.ts 一致，由
//   scripts/smoke-sidebar-convlist.mjs 断言两边相等）。桥不存在 → 如实报不可用。
import type { ReactNode } from 'react'
import { Button, IconProjectAddOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'

/** 桥键名（与 personal-workspace/src/client/project-bridge.ts 的 PROJECT_BRIDGE_KEY 一致）。 */
export const PROJECT_BRIDGE_KEY = '__dshPersonalProjects'
/** 桥协议版本（与 project-bridge.ts 的 PROJECT_BRIDGE_VERSION 一致）。 */
export const PROJECT_BRIDGE_VERSION = 1

/** 菜单项 id（Personal 扩展项；官方三项的 id 见 sessionActions.tsx）。 */
export const PROJECT_MENU_ITEM_ID = 'project'
/** 菜单项文案（Personal 自拟；官方无对应文案，不冒充官方）。 */
export const PROJECT_MENU_ITEM_LABEL = '加入项目'

/** 可选项目（与 workspace 侧 ProjectLite 同构）。 */
export interface ProjectLite {
  id: string
  name: string
  glyph: string
}

/** 关系写结果（与 workspace 侧 RelWriteResult 同构）。 */
export interface RelWriteResult {
  ok: boolean
  projectId?: string
  reason?: string
}

interface ProjectBridgeLike {
  version?: unknown
  list?: unknown
  projectOfSession?: unknown
  assignSession?: unknown
  unassignSession?: unknown
}

/** 对话框数据：读取失败时给**可展示的原因**，绝不返回空列表假装"没有项目"。 */
export type ProjectAssignData =
  | { ok: true; projects: ProjectLite[]; currentId: string | null }
  | { ok: false; reason: string }

/** 桥不可用的如实说明。**用产品语言**（与既有措辞「Personal 工作台未连接」一致）：
 *  内部术语（window 键名/版本号/registry）只进 sidebar 诊断面板，不进用户看到的话术。 */
export function bridgeUnavailableReason(): string {
  return '项目数据暂不可用：Personal 工作台未连接（请确认已启用 Personal 工作台）—— 未做任何修改。'
}

/** 桥版本不符的如实说明（同样是产品语言；具体版本号只进诊断，不进用户话术）。 */
export function versionMismatchReason(): string {
  return '项目数据版本不匹配（当前界面与已加载的工作台不是同一版本）—— 未做任何修改。'
}

/** 桥探测三态：缺失 / 版本不符 / 可用。**不做任何猜测**，版本不符等同不可用。 */
type BridgeProbe =
  | { kind: 'missing' }
  | { kind: 'badVersion'; version: unknown }
  | { kind: 'ready'; bridge: ProjectBridgeLike }

function probeBridge(win: unknown): BridgeProbe {
  if (typeof win !== 'object' || win === null) return { kind: 'missing' }
  const b = (win as Record<string, unknown>)[PROJECT_BRIDGE_KEY] as ProjectBridgeLike | undefined
  if (typeof b !== 'object' || b === null) return { kind: 'missing' }
  const need = ['list', 'projectOfSession', 'assignSession', 'unassignSession'] as const
  for (const k of need) {
    if (typeof b[k] !== 'function') return { kind: 'missing' }
  }
  if (b.version !== PROJECT_BRIDGE_VERSION) return { kind: 'badVersion', version: b.version }
  return { kind: 'ready', bridge: b }
}

/** 桥不可用的统一说明（缺失与版本不符分别如实说明）。 */
function probeReason(p: BridgeProbe): string {
  if (p.kind === 'badVersion') return versionMismatchReason()
  return bridgeUnavailableReason()
}

/** 桥是否可用（**渲染期可安全调用的廉价探测**：供菜单决定是否显示「加入项目」）。
 *  不缓存 → 插件加载顺序变化（workspace 稍后 apply）也能在下次渲染正确反映。 */
export function hasProjectBridge(win: unknown): boolean {
  return probeBridge(win).kind === 'ready'
}

/** 读取对话框所需数据（同步；在打开菜单项时调用一次即可）。 */
export function readProjectAssignData(win: unknown, sessionId: string): ProjectAssignData {
  const p = probeBridge(win)
  if (p.kind !== 'ready') return { ok: false, reason: probeReason(p) }
  const b = p.bridge
  try {
    const list = (b.list as () => ProjectLite[])() ?? []
    const cur = (b.projectOfSession as (s: string) => string | undefined)(sessionId)
    return { ok: true, projects: [...list], currentId: typeof cur === 'string' ? cur : null }
  } catch (e) {
    return { ok: false, reason: `读取项目列表失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 写入关系（projectId=null → 移出项目）。桥不可用/异常都返回 ok:false + 原因。 */
export function applyProjectAssign(win: unknown, sessionId: string, projectId: string | null): RelWriteResult {
  const p = probeBridge(win)
  if (p.kind !== 'ready') return { ok: false, reason: probeReason(p) }
  const b = p.bridge
  try {
    if (projectId === null) {
      return (b.unassignSession as (s: string) => RelWriteResult)(sessionId)
    }
    return (b.assignSession as (s: string, p2: string) => RelWriteResult)(sessionId, projectId)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** 提交按钮可用性（纯判据；供 UI 与回归共用，避免两处判据漂移）。 */
export function confirmDisabled(data: ProjectAssignData, draftId: string | null): boolean {
  if (!data.ok) return true
  if (draftId === null) return true
  return draftId === data.currentId // 选中的就是当前项目 → 无需提交
}

export interface ProjectAssignDialogProps {
  open: boolean
  /** 当前会话标题（仅用于副标题展示；不进入任何状态）。 */
  sessionTitle: string
  data: ProjectAssignData
  draftId: string | null
  error: string | null
  onPick: (projectId: string) => void
  onConfirm: () => void
  /** 「移出项目」（仅当前已归属时提供）。 */
  onUnassign: () => void
  onClose: () => void
}

/**
 * 「加入项目」对话框（P1 复用官方 `Modal` + `Button`，与官方重命名对话框同构）。
 * 双重用途：未归属 → 选择项目加入；已归属 → 可换项目、可移出（同一对话框，不另开入口）。
 */
export function ProjectAssignDialog(props: ProjectAssignDialogProps): ReactNode {
  const { open, sessionTitle, data, draftId, error, onPick, onConfirm, onUnassign, onClose } = props
  const currentName = data.ok ? data.projects.find((p) => p.id === data.currentId)?.name : undefined
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel="关闭"
      title={PROJECT_MENU_ITEM_LABEL}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          {data.ok && data.currentId !== null ? (
            <Button variant="outline" onClick={onUnassign}>
              移出项目
            </Button>
          ) : null}
          <Button variant="primary" disabled={confirmDisabled(data, draftId)} onClick={onConfirm}>
            {PROJECT_MENU_ITEM_LABEL}
          </Button>
        </>
      }
    >
      <div className="dps-pp-sub" data-dps-pp-sub="1">
        会话「{sessionTitle}」
      </div>
      <div className="dps-pp-hint" data-dps-pp-current="1">
        {!data.ok
          ? '项目归属未知（数据源不可用）'
          : data.currentId === null
            ? '当前未加入任何项目'
            : `当前项目：${currentName ?? data.currentId}`}
      </div>
      {data.ok ? (
        data.projects.length === 0 ? (
          <div className="dps-pp-empty" data-dps-pp-empty="1">
            没有可加入的项目（活跃项目为空；已封存/已删除的项目不出现在此，请先在「项目」里新建或恢复）。
          </div>
        ) : (
          <div className="dps-pp-list" data-dps-pp-list="1" role="listbox" aria-label="选择项目">
            {data.projects.map((p) => {
              const isCurrent = p.id === data.currentId
              const isPicked = p.id === draftId
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`dps-pp-item${isPicked ? ' is-picked' : ''}${isCurrent ? ' is-current' : ''}`}
                  data-dps-pp-item={p.id}
                  role="option"
                  aria-selected={isPicked}
                  onClick={() => {
                    onPick(p.id)
                  }}
                >
                  <span className="dps-pp-glyph" aria-hidden="true">
                    {p.glyph}
                  </span>
                  <span className="dps-pp-name">{p.name}</span>
                  {isCurrent ? (
                    <span className="dps-pp-badge" data-dps-pp-badge="1">
                      当前
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )
      ) : (
        <div className="dps-pp-error" data-dps-pp-unavailable="1" role="alert">
          {data.reason}
        </div>
      )}
      {error !== null ? (
        <div className="dps-pp-error" data-dps-pp-error="1" role="alert">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}

/** 菜单项（官方 `Menu` 的 items 元素形状；官方三项之后追加这一项）。 */
export function projectMenuItem(): { id: string; label: string; icon: ReactNode } {
  return { id: PROJECT_MENU_ITEM_ID, label: PROJECT_MENU_ITEM_LABEL, icon: <IconProjectAddOutline16 size={16} /> }
}
