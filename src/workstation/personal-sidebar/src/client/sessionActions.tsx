// dsh-personal-sidebar · E4-FINAL —— Personal「会话列表」复现**官方 Session 菜单**。
//
// 用户红线（本轮唯一目标）：
//   ①【官方有什么 → Personal 复现什么】—— 只复现官方会话列表现有的三个动作：
//     重命名 / 分叉会话 / 归档会话。**不新增**删除/置顶/收藏/移动/项目归属/导出/标签/备注/
//     自定义归档中心/恢复……（官方菜单里没有的一律不做）。
//   ②【尽可能原样复用】—— 复用优先级：
//      **P1（已采用）**：直接复用官方 UI 原语。`@deepseek-ai/dsh-client-ui-primitives` 是官方
//        壳的**平台静态模块**（与 react 同层，证据 = 壳 bundle 的 staticModules 表：
//        `{react, "react/jsx-runtime", "react-dom", "react-dom/client", "@deepseek-ai/cordis",
//          "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-slots",
//          "@deepseek-ai/dsh-client-ui-primitives"}`），所以本插件可以直接 require，
//        与官方 ui-workspace 自己 import 它的方式完全一致（官方也没把它写进 dsh.client.inject）。
//        · 菜单 = 官方 `Menu`（portal + closeOnPointerLeave，与官方同参）
//        · 对话框 = 官方 `Modal` + 官方 `Button`（与官方重命名对话框同构）
//        · 图标 = 官方 `IconEllipsisOutline16` / `IconEditOutline16` / `IconBranchOutline16` /
//          `IconArchiveOutline20`（官方菜单项用的就是这三个）
//      **P2（已采用）**：复用官方动作/handler。三个动作在 index.tsx 的 conversations 句柄里
//        逐句照抄官方接线（`sessions.binding(id).session.rename` / `sessions.fork({increaseTitle})`
//        / `workspaces.archiveSession`），本文件只负责把点击转成这三条官方调用，**不自己实现**。
//      P3（未使用）：无需薄适配——官方组件与官方 API 都可达。
//
// 官方对照（源码证据：@deepseek-ai/dsh-client-ui-workspace/lib/client.js）
//   · 菜单项数组 `sessionMenuItems` 见 :917-931 —— id/顺序/label/图标与下面 SESSION_MENU_ITEMS 逐项相同
//     （label 取官方 zh 文案：`rename`=重命名 :2514、`menu.fork`=分叉会话 :2522、
//      `menu.archiveSession`=归档会话 :2523）
//   · 行内触发按钮 + Menu 参数见 :976-1000（iconButton / aria `会话“{name}”的操作` / portal /
//     closeOnPointerLeave / 点击 stopPropagation）
//   · 重命名对话框见 :2399-2445（Modal + autoFocus 全选输入框 + Enter 提交 + IME 组合态守卫 +
//     `role="alert"` 错误行 + 取消/重命名两个 Button，重命名中全部禁用）
//   · 重命名状态机（renameTarget/renameDraft/renaming/renameError；blocked = renaming ||
//     trimmed==='' || target===null；renaming 期间 close 为空操作）见 :2086-2101
//
// 单一真源纪律：本文件**不持有**任何会话状态。标题、列表、归档集合全部由官方 store 推送；
// 三个动作成功后的界面变化是官方真相变化的结果，不是我方本地状态。
import { useRef, type ReactNode } from 'react'
import {
  Button,
  IconArchiveOutline20,
  IconBranchOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  Menu,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** 官方 Menu 的条目形状（结构类型；官方未导出该类型名，这里按其渲染代码逐字段对齐）。 */
export interface SessionMenuItem {
  id: string
  label: string
  icon?: unknown
  disabled?: boolean
  danger?: boolean
}

/** 官方会话菜单的三个动作 id（与官方 `sessionMenuItems` 完全一致，顺序也一致）。 */
export const SESSION_ACTION_IDS = ['rename', 'fork', 'archive'] as const
export type SessionActionId = (typeof SESSION_ACTION_IDS)[number]

/** 官方 zh 文案（逐字取自官方 i18n；不自行改写措辞）。 */
export const SESSION_ACTION_LABELS: Record<SessionActionId, string> = {
  rename: '重命名',
  fork: '分叉会话',
  archive: '归档会话',
}

/**
 * 官方会话菜单条目 —— 与官方 `sessionMenuItems`（ui-workspace :917-931）逐项同构：
 * 同一组 id、同一顺序（重命名 → 分叉会话 → 归档会话）、同一组官方图标与官方 zh 文案。
 */
export const SESSION_MENU_ITEMS: SessionMenuItem[] = [
  { id: 'rename', label: SESSION_ACTION_LABELS.rename, icon: <IconEditOutline16 /> },
  { id: 'fork', label: SESSION_ACTION_LABELS.fork, icon: <IconBranchOutline16 /> },
  { id: 'archive', label: SESSION_ACTION_LABELS.archive, icon: <IconArchiveOutline20 size={16} /> },
]

export interface SessionActionsMenuProps {
  /** 当前行标题（只用于 aria 文案；不进入任何状态）。 */
  title: string
  /** 菜单是否展开（由父层持有的单开状态：同一时刻只允许一行展开）。 */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 三个官方动作（调用方 = index.tsx 注入的官方 handler 适配层）。 */
  onRename: () => void
  onFork: () => void
  onArchive: () => void
}

/**
 * 行内「…」按钮 + 官方 Menu（P1 复用）。
 * 与官方一致：anchor 按钮自己 stopPropagation（点菜单不触发行点击），Menu portal 到 body
 * （不被侧栏 overflow 裁剪），指针移出即收起。
 */
export function SessionActionsMenu(props: SessionActionsMenuProps): ReactNode {
  const { title, open, onOpenChange, onRename, onFork, onArchive } = props
  return (
    <Menu
      open={open}
      onClose={() => onOpenChange(false)}
      items={SESSION_MENU_ITEMS}
      onSelect={(id: string) => {
        // 官方同序：先收菜单，再派发（官方 :983-988）。
        onOpenChange(false)
        if (id === 'rename') onRename()
        if (id === 'fork') onFork()
        if (id === 'archive') onArchive()
      }}
      portal
      closeOnPointerLeave
      anchor={
        <button
          type="button"
          className="dps-conv-menu-btn"
          data-dps-conv-menu="1"
          aria-haspopup="menu"
          aria-expanded={open ? 'true' : undefined}
          aria-label={`会话“${title}”的操作`}
          onClick={(e) => {
            e.stopPropagation()
            onOpenChange(!open)
          }}
        >
          <IconEllipsisOutline16 />
        </button>
      }
    />
  )
}

export interface SessionRenameDialogProps {
  /** 是否显示（官方 `open: sessionRenameTarget !== null`）。 */
  open: boolean
  draft: string
  /** 提交中（官方 `sessionRenaming`）：输入与两个按钮全部禁用，关闭为空操作。 */
  renaming: boolean
  /** 官方判据：`renaming || trimmed === '' || target === null`。 */
  blocked: boolean
  /** 官方 `sessionRenameError`（字符串；null = 无错误）。 */
  error: string | null
  onDraft: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

/**
 * 官方「重命名会话」对话框（P1 复用官方 `Modal` + `Button`）。
 * 只做表现层：状态机（draft/renaming/error/blocked）由父层按官方同名变量持有，
 * 提交动作 = 官方 `sessions.binding(id).session.rename(title)`。
 */
export function SessionRenameDialog(props: SessionRenameDialogProps): ReactNode {
  const { open, draft, renaming, blocked, error, onDraft, onConfirm, onClose } = props
  // 官方同款 IME 守卫：中文输入法组合期间的 Enter 不得提交（ui-workspace :2381-2391）。
  const composingRef = useRef(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel="关闭"
      title="重命名会话"
      footer={
        <>
          <Button variant="outline" disabled={renaming} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={blocked} onClick={onConfirm}>
            重命名
          </Button>
        </>
      }
    >
      <input
        className="dps-conv-rename-input"
        data-dps-conv-rename-input="1"
        value={draft}
        aria-label="会话名称"
        autoFocus
        disabled={renaming}
        onFocus={(e) => {
          e.target.select()
        }}
        onChange={(e) => {
          onDraft(e.target.value)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          composingRef.current = false
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !composingRef.current) {
            e.preventDefault()
            onConfirm()
          }
        }}
      />
      {error !== null ? (
        <div className="dps-conv-rename-error" data-dps-conv-rename-error="1" role="alert">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}
