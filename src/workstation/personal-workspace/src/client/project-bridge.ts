// dsh-personal-workspace — 项目关系桥（Project Relation Bridge）。
//
// 为什么需要它（**单实例问题**，不是设计洁癖）：
//   项目关系 store 住在 `personal-registry/src/projects`（localStorage 写穿 + 内存态）。
//   personal-workspace 与 personal-sidebar 是**两个独立 bundle**，同页各自有模块注册表 ——
//   若 sidebar 也 import 该 store，页面上会出现**两份内存状态**：sidebar 写入后，workspace 的
//   内存副本仍旧，项目详情要刷新才看见（"点了没反应"的经典真机投诉）。因此：
//     · **唯一持有者** = personal-workspace（它本来就渲染项目视图）；
//     · 其他 bundle（sidebar 的会话菜单）通过本桥**同步读写同一个实例**；
//     · 桥不存在（workspace 未加载/未 apply）→ 调用方必须**如实报不可用**，不许假装成功。
//   workspace 侧写入后无需额外通知：store 自身会 notify 其订阅者，项目详情/项目中心即刷新。
//
// 与既有跨 bundle 约定一致（见 mainview.ts 顶部注释）：两个 bundle **不互相 import 运行期常量**，
// 字面量各自持有、由回归断言两边一致（scripts/smoke-sidebar-convlist.mjs K 段）。
//
// 本文件保持纯逻辑（store 由调用方注入）→ headless smoke 可直接测，不需要浏览器。

/** window 上的桥键名（sidebar 侧持有同名字面量；回归断言两边一致）。 */
export const PROJECT_BRIDGE_KEY = '__dshPersonalProjects'
/** 桥的协议版本（形状变化时必须 bump，消费方按版本判断）。 */
export const PROJECT_BRIDGE_VERSION = 1

/** 选择器只需最小信息（不要把整个 ProjectRecord 泄漏到别的 bundle）。 */
export interface ProjectLite {
  id: string
  name: string
  glyph: string
}

/** 写操作结果：**必带 ok**，失败必须带 reason（调用方据此如实提示）。 */
export interface RelWriteResult {
  ok: boolean
  projectId?: string
  reason?: string
}

export interface ProjectBridge {
  version: number
  /** 可选项目 = 非封存且非删除（与 Project Center 的 Active 视图同一口径）。 */
  list(): ProjectLite[]
  projectOfSession(sessionId: string): string | undefined
  assignSession(sessionId: string, projectId: string): RelWriteResult
  unassignSession(sessionId: string): RelWriteResult
}

/** store 的最小结构面（只声明用到的部分；便于测试注入替身）。 */
export interface ProjectStoreLike {
  activeProjects(): { id: string; name: string; glyph?: string }[]
  projectOfSession(sessionId: string): string | undefined
  assignSession(sessionId: string, projectId: string): void
  unassignSession(sessionId: string): void
  projectById(id: string): { id: string; name: string } | undefined
}

/** 构造桥（纯函数式：store 注入 → 可 headless 测试）。 */
export function createProjectBridge(store: ProjectStoreLike): ProjectBridge {
  return {
    version: PROJECT_BRIDGE_VERSION,
    list(): ProjectLite[] {
      try {
        return store.activeProjects().map((p) => ({
          id: p.id,
          name: p.name,
          // 无 glyph 时退化为名称首字（与 Project Center 同一退化规则；不编造图标）。
          glyph: p.glyph ?? p.name.slice(0, 1),
        }))
      } catch {
        return []
      }
    },
    projectOfSession(sessionId: string): string | undefined {
      try {
        return store.projectOfSession(sessionId)
      } catch {
        return undefined
      }
    },
    assignSession(sessionId: string, projectId: string): RelWriteResult {
      if (!sessionId) return { ok: false, reason: '缺少会话 id' }
      if (!projectId) return { ok: false, reason: '缺少项目 id' }
      if (!store.projectById(projectId)) return { ok: false, reason: `项目不存在：${projectId}` }
      try {
        store.assignSession(sessionId, projectId)
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
      }
      return { ok: true, projectId }
    },
    unassignSession(sessionId: string): RelWriteResult {
      if (!sessionId) return { ok: false, reason: '缺少会话 id' }
      try {
        store.unassignSession(sessionId)
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
      }
      return { ok: true }
    },
  }
}

/** 消费方（sidebar）用的结构校验：形状不对就当作"桥不可用"，绝不半信半疑地调用。 */
export function isProjectBridge(v: unknown): v is ProjectBridge {
  const b = v as Partial<ProjectBridge> | null
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof b.version === 'number' &&
    typeof b.list === 'function' &&
    typeof b.projectOfSession === 'function' &&
    typeof b.assignSession === 'function' &&
    typeof b.unassignSession === 'function'
  )
}

/** 安装桥到 window（返回 disposer，卸载时只删自己装的那个实例）。 */
export function installProjectBridge(win: Record<string, unknown>, store: ProjectStoreLike): () => void {
  const bridge = createProjectBridge(store)
  win[PROJECT_BRIDGE_KEY] = bridge
  return () => {
    if (win[PROJECT_BRIDGE_KEY] === bridge) delete win[PROJECT_BRIDGE_KEY]
  }
}
