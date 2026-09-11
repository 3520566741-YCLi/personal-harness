// dsh-personal-workspace — WorkspaceRegistry core (client, React-free).
// Lists workspace views. `chat` is the official center view (always default,
// never shadowed). `files/terminal/browser/code` are served by the existing
// better-sidebar workbench tabs. `dashboard` is our first custom view.
// Future plugins can add views via registerWorkspaceView().
export interface WorkspaceView {
  id: string
  title: string
  kind: 'chat' | 'workbench' | 'dashboard' | 'plugin'
  hint: string
}

export const DEFAULT_VIEW_ID = 'chat'

export const BASE_VIEWS: WorkspaceView[] = [
  { id: 'chat', title: 'Chat', kind: 'chat', hint: '官方对话（中央默认视图，永不删除）' },
  { id: 'files', title: 'Files', kind: 'workbench', hint: '工作台文件树（better-sidebar 内建）' },
  { id: 'terminal', title: 'Terminal', kind: 'workbench', hint: '工作台终端（better-sidebar 内建）' },
  { id: 'browser', title: 'Browser', kind: 'workbench', hint: '工作台浏览器（better-sidebar 内建）' },
  { id: 'code', title: 'Code', kind: 'workbench', hint: '工作台编辑器（better-sidebar 内建，CodeMirror）' },
  { id: 'dashboard', title: 'Personal Dashboard', kind: 'dashboard', hint: '个人工作台总览（STAGE 5 自定义视图）' },
]

const extra = new Map<string, WorkspaceView>()

export function registerWorkspaceView(view: WorkspaceView): void {
  if (!view || !view.id) return
  extra.set(view.id, view)
}

export function listViews(): WorkspaceView[] {
  return [...BASE_VIEWS, ...extra.values()]
}

export function viewById(id: string): WorkspaceView | undefined {
  return BASE_VIEWS.find((v) => v.id === id) ?? extra.get(id)
}
