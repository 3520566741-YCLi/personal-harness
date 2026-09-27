// dsh-personal-workspace — V1.2-J J3：官方 Workspace 注册表的**写**面（创建 / 注销注册）。
//
// ─────────────────────────────────────────────────────────────────────────────
// 官方 API 真实签名与出处（**逐条在官方源码里核实过**，不是凭印象；仓库纪律）
//
// 核实方式（本次实读的文件与命令）：
//   R="/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-api-workspace-controller"
//   然后 cat/sed 读下面这些**已编译**的官方产物（官方包在本机只发布 lib/*.js，无 .ts 源）：
//
// ① 客户端面服务 `ctx.get('workspaces')` —— 是 cordis Service，注册名 'workspaces'：
//     `$R/lib/types/client/service.js:16`   `super(ctx, 'workspaces')`
//     `$R/lib/client.js:292`                `super(ctx, 'workspaces')`（同一份的实现副本）
//    · `create(input)`       `$R/lib/types/client/service.js:22-27`（镜像 `$R/lib/client.js:301-306`）
//        → `async create(input)`：await `model.create(input)` → 失败抛 `WorkspaceCreateError`；
//          成功 **return `result.value.workspace`**（= 单个 workspace view，**不是** 宿主那层的
//          `{workspace, created}` 信封 —— 这个差别是我实读 client.js:301-306 才确认的）。
//    · `delete(workspaceId)` `$R/lib/types/client/service.js:36-39`（镜像 `$R/lib/client.js:314-317`）
//        → `async delete(workspaceId)`：await `model.delete(workspaceId)` → 失败抛
//          `Error('workspace delete failed: <code>: <message>')`；成功 **返回 undefined**。
//    · `rename(workspaceId, title)` `service.js:29-34` / `archiveSession(sessionId)` `service.js:47-52`
//        （本包**不用**这两个方法；列在这里只为说明形状已被读过）。
//
// ② `create` 的**入参**形状：`{ path }` = 一个**已存在的绝对目录**，不是"新建目录"：
//     `$R/lib/types/client/model.js:39-44`  「@param input - existing absolute path to adopt」
//     `$R/lib/types/commands.js:18-38`      宿主侧 `create(request)` = `request.path` →
//       `workspaceRegistry.resolveByPath(request.path)`；已存在 → `{workspace, created:false}`（**不**新建）；
//       否则 `workspaceRegistry.create(request.path)` → `{workspace, created:true}`；
//       路径不可用 → `RemoteError('workspace/invalid-path', ...)`（→ 客户端抛 WorkspaceCreateError）。
//     ⇒ 本包 UI 的输入框只接受**已存在的绝对路径**，绝不代用户建目录（不越权、不猜）。
//
// ③ `delete` 官方**原生语义 = 只注销注册，目录与全部会话都不动**：
//     `$R/lib/types/commands.js:59-68`（同 `$R/lib/index.js:236-241`）
//       /** Delete one Workspace registration without deleting its directory or Sessions. */
//       `if (!await this.ctx.workspaceRegistry.delete(WorkspaceId(request.workspaceId))) throw …`
//     ⇒ 本包 UI 文案必须与之一致：**不删目录、不删文件、不删任何会话**（D-6 口径）。
//       本实现**绝不**调用任何删磁盘/删会话的路径（代码里连 fs / sessions.delete 都不引）。
//
// ④ 能力探针（硬护栏 1）：官方服务可能**只交付部分方法**（回归夹具 `scripts/smoke-workspace-capability.mjs:110-113`
//    就只造了 `{ list }`）⇒ 本模块**按方法逐个探测**，缺哪个就只关掉哪个入口，并给出可读原因；
//    绝不抛错、绝不假装成功（否则该套件 FAIL）。
// ─────────────────────────────────────────────────────────────────────────────

/** 官方 workspace view（`feed.js workspaceView` 的形状：workspaceId/path/title/sessionIds/createdAt/updatedAt）。 */
export interface WorkspaceLike {
  workspaceId: string
  path: string
  title: string
  sessionIds?: string[]
}

/**
 * 官方 `ctx.get('workspaces')` 中本包实际使用的方法子集（其余方法本包不碰）。
 * 全部可选 —— 真机/夹具都可能只交付一部分，缺失 = 诚实降级。
 */
export interface WorkspacesWriteService {
  create?: (input: { path: string }) => unknown
  delete?: (workspaceId: string) => unknown
}

export interface WorkspaceWriteCapability {
  /** 官方服务存在（`ctx.get('workspaces')` 拿到对象）。 */
  present: boolean
  /** 有可调用的 `create`。 */
  canCreate: boolean
  /** 有可调用的 `delete`。 */
  canDelete: boolean
  /** 诚实原因（面向用户；缺失时才非空）。 */
  reason: string | null
}

/** 本包自持文案（**不是需求原文，也不是项目那两句**；owner = 本文件）。 */
export const WS_WRITE_TEXTS = {
  /** 一级：卡上入口。 */
  menuCreate: '新建工作区',
  menuDelete: '删除工作区',
  /** 二级：危险面板正文。 */
  panelTitle: '你确定要删除这个工作区吗？',
  /** 二级：语义直述（与官方 delete 的原生语义一致）。 */
  panelSemantics: '删除只注销这个工作区在官方注册表里的登记：目录与文件不会被删除、会话不会被删除。',
  /** 二级：副作用说明。 */
  panelWhere: '该工作区下的会话会回到官方「未分组」；你可以再用同一路径新建工作区把它加回来。',
  /** 二级：确认按钮。 */
  confirmDelete: '确认永久删除',
  /** 一级/二级共用：取消。 */
  cancel: '取消',
  /** 服务缺失时的原因（硬护栏 1：必须给可读原因）。 */
  missingService: '官方 workspaces 服务当前不可用（capability limitation）—— 无法创建或删除工作区。',
  missingCreate: '官方 workspaces 服务未提供 create 方法 —— 本环境无法创建新工作区。',
  missingDelete: '官方 workspaces 服务未提供 delete 方法 —— 本环境无法注销工作区注册。',
} as const

const reasonOf = (present: boolean, canCreate: boolean, canDelete: boolean): string | null => {
  if (!present) return WS_WRITE_TEXTS.missingService
  if (!canCreate && !canDelete) return WS_WRITE_TEXTS.missingCreate + '（delete 亦缺失）'
  if (!canCreate) return WS_WRITE_TEXTS.missingCreate
  if (!canDelete) return WS_WRITE_TEXTS.missingDelete
  return null
}

let service: WorkspacesWriteService | null = null
let cap: WorkspaceWriteCapability = { present: false, canCreate: false, canDelete: false, reason: WS_WRITE_TEXTS.missingService }

/**
 * 能力状态是**外部可变化的**（官方服务可能晚于本插件 apply 注册 —— 真机已知的服务注册顺序差，
 * workspace-catalog 的有界重试会把服务在 12s 内交过来）。
 * ⇒ 必须**可订阅**：否则 UI 只在挂载那一刻读一次快照，服务晚到时创建/删除入口会**永久**停在
 * "不可用"（那本身就是不诚实的降级）。这里是一个最小的外部 store（React 侧 useSyncExternalStore），
 * 与 workspace-catalog 同一手法，不引第二个状态库。
 */
const capSubs = new Set<() => void>()
let capVersion = 0

function recompute(): void {
  const present = service !== null
  const canCreate = typeof service?.create === 'function'
  const canDelete = typeof service?.delete === 'function'
  cap = { present, canCreate, canDelete, reason: reasonOf(present, canCreate, canDelete) }
  capVersion += 1
  capSubs.forEach((f) => {
    try {
      f()
    } catch {
      // 单个订阅者抛错不影响其他订阅者
    }
  })
}

/**
 * index apply 时把 `ctx.get('workspaces')` 绑到本模块。
 * ⚠ 与 workspace-catalog 的**有界重试**配套使用：catalog 探到服务后调用 `rebind`，
 *   否则「服务晚注册」的真机场景里本模块会永久停留在"不可用"（那是不诚实的降级）。
 */
export function bindWorkspaceWriteService(svc: unknown): void {
  service = (svc ?? null) as WorkspacesWriteService | null
  recompute()
}

export function workspaceWriteCapability(): WorkspaceWriteCapability {
  return cap
}

export function subscribeWorkspaceWriteCapability(f: () => void): () => void {
  capSubs.add(f)
  return () => {
    capSubs.delete(f)
  }
}

/** useSyncExternalStore 的 getSnapshot：同版本同值（否则 React 会判"每次都在变"而死循环）。 */
export function workspaceWriteCapabilityVersion(): number {
  return capVersion
}

/** 测试/诊断用只读快照（真源 = 上面的 cap）。 */
export function workspaceWriteBound(): boolean {
  return service !== null
}

export type CreateOutcome =
  | { ok: true; workspace: WorkspaceLike | null }
  | { ok: false; message: string }

/** 本机绝对路径判据（只做"是不是绝对路径"的形式检查，**不**做任何 fs 访问）。 */
export function isAbsolutePath(input: string): boolean {
  const p = input.trim()
  if (p.length === 0) return false
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * 创建：调官方 `workspaces.create({ path })`。
 * 输入**必须是已存在的绝对目录路径**（官方语义）；本函数不做 fs 校验、不建目录。
 * 失败一律 `ok:false` + 官方错误文本（UI 显示真实原因，不误报成功）。
 */
export async function createWorkspace(input: { path: string }): Promise<CreateOutcome> {
  const path = input?.path?.trim?.() ?? ''
  if (!cap.canCreate) return { ok: false, message: cap.reason ?? WS_WRITE_TEXTS.missingService }
  if (path === '') return { ok: false, message: '请填写要登记为工作区的绝对目录路径（官方 create 只接受已存在的绝对路径）。' }
  if (!isAbsolutePath(path)) return { ok: false, message: `「${path}」不是绝对路径 —— 官方 create 需要一个已存在的绝对目录路径。` }
  try {
    const created = (await service!.create!({ path })) as WorkspaceLike | null | undefined
    return { ok: true, workspace: created ?? null }
  } catch (e) {
    return { ok: false, message: errText(e) }
  }
}

export type DeleteOutcome = { ok: true } | { ok: false; message: string }

/**
 * 删除（注销注册）：调官方 `workspaces.delete(workspaceId)`。
 * 官方原生语义 = 只注销登记；**本函数绝不删除磁盘目录/文件，也绝不删除任何会话**。
 */
export async function deleteWorkspaceById(workspaceId: string): Promise<DeleteOutcome> {
  const id = typeof workspaceId === 'string' ? workspaceId.trim() : ''
  if (!cap.canDelete) return { ok: false, message: cap.reason ?? WS_WRITE_TEXTS.missingService }
  if (id === '') return { ok: false, message: '缺少工作区 id —— 未调用官方 delete（不猜目标）。' }
  try {
    await service!.delete!(id)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: errText(e) }
  }
}
