// dsh-personal-workspace — 项目镜像推送（V1.2-B Project-aware Context 的取数通路 · 客户端半）
//
// 为什么需要它（替代方案否决见 docs/DECISIONS.md ADR-018 ②③）：
//   注入发生在宿主侧的提示词装配路径上，而**项目真源是浏览器 localStorage**。
//   两边必须有一个单向投影，否则注入层只能靠猜。这里就是那个投影的发送端：
//   每次 registry **真实变更**时把个人层状态 POST 给宿主半，宿主存成镜像，装配时只读镜像。
//
// 为什么订阅 registry 而不是让 registry 自己发请求：
//   `personal-registry` 是纯数据层（storage 写穿 + 订阅广播），它被 sidebar 与 workspace
//   **两个 bundle** 各打一份。网络副作用放进它 = 两个 bundle 都会推、且纯层再也测不了。
//   故副作用归**唯一持有者 bundle**（本 bundle，与项目关系桥同一理由）。
//
// 诚实降级：
//   · 宿主半未加载 / 路由未挂 → 推送失败 → **不重试风暴**（下次真实变更或下次装载再试）、
//     不打断用户操作（项目写入本地已成功），只在控制台留一条可诊断的告警。
//   · 推送失败**不**影响本地真源：镜像落后只会让"自动附带项目上下文"暂时不生效，
//     这与"假装成功"是两回事 —— 界面上没有任何东西声称镜像已同步。

/** 推送目标（与宿主半 server/index.js 的 CONTEXT_STATE_PATH 严格一致）。 */
export const MIRROR_ROUTE = '/personal-workspace/context/state'

/** 单次推送超时（毫秒）。超时即放弃本次，不阻塞后续。 */
export const PUSH_TIMEOUT_MS = 4000

/** registry 的最小读取面（只取推送需要的三个投影，避免把整个 store 形状泄漏到这里）。 */
export interface MirrorSource {
  subscribe(f: () => void): () => void
  getState(): { projects: Array<Record<string, unknown>>; rels: { sessionProject: Record<string, string> }; lifecycle: Record<string, { status?: string; starred?: boolean; archiveFile?: string }> }
  listProjects(): Array<Record<string, unknown>>
}

export interface PushSnapshot {
  projects: Array<{ id: string; name: string; description?: string; repoHint?: string }>
  rels: { sessionProject: Record<string, string> }
  lifecycle: Record<string, { status?: string; starred?: boolean; archiveFile?: string }>
}

/**
 * 从 registry 投影出**该推给宿主的**最小快照（纯函数，可 headless 测）。
 * 只包含个人层组织语义：项目元数据 + 会话归属 + 生命周期。**不含**任务正文、会话正文、文件树。
 *
 * 注意：`listProjects()` 不含已删除墓碑，但宿主需要「已删除 ⇒ 不注入」这个事实，
 * 所以墓碑从 `getState().lifecycle` 取（同一事实只存一处，读取时投影）。
 */
export function buildMirrorSnapshot(reg: MirrorSource): PushSnapshot {
  const state = reg.getState()
  const projects: PushSnapshot['projects'] = []
  for (const p of reg.listProjects()) {
    const id = typeof p.id === 'string' ? p.id : ''
    const name = typeof p.name === 'string' ? p.name : ''
    if (id === '' || name === '') continue
    const rec: PushSnapshot['projects'][number] = { id, name }
    if (typeof p.description === 'string' && p.description !== '') rec.description = p.description
    if (typeof p.repoHint === 'string' && p.repoHint !== '') rec.repoHint = p.repoHint
    projects.push(rec)
    if (projects.length >= 500) break
  }
  const sessionProject: Record<string, string> = {}
  const sp = state.rels?.sessionProject ?? {}
  for (const [sid, pid] of Object.entries(sp)) {
    if (typeof sid !== 'string' || typeof pid !== 'string') continue
    if (sid === '' || pid === '') continue
    sessionProject[sid] = pid
  }
  const lifecycle: PushSnapshot['lifecycle'] = {}
  for (const [pid, lc] of Object.entries(state.lifecycle ?? {})) {
    if (lc === null || typeof lc !== 'object') continue
    const entry: PushSnapshot['lifecycle'][string] = {}
    if (typeof lc.status === 'string') entry.status = lc.status
    if (lc.starred === true) entry.starred = true
    if (typeof lc.archiveFile === 'string' && lc.archiveFile !== '') entry.archiveFile = lc.archiveFile
    if (Object.keys(entry).length > 0) lifecycle[pid] = entry
  }
  return { projects, rels: { sessionProject }, lifecycle }
}

export interface MirrorPushHandle {
  /** 立即推一次（装载时调用：让宿主拿到当前状态，不必等下一次用户操作）。 */
  pushNow(): Promise<{ ok: boolean; message?: string }>
  /** 停掉订阅（卸载时调用）。 */
  stop(): void
  /** 已成功推送次数（诊断用）。 */
  successCount(): number
}

/**
 * 安装镜像推送：装载时推一次 + 每次 registry 变更推一次。
 * @param reg registry 实例（唯一持有者 bundle 传入）
 * @param fetchImpl 可注入的 fetch（headless 测试用）
 */
export function installMirrorPush(reg: MirrorSource, fetchImpl?: typeof fetch): MirrorPushHandle {
  let stopped = false
  let inFlight: Promise<{ ok: boolean; message?: string }> | null = null
  let queued = false
  let successes = 0
  let warnedOnce = false

  const doPush = async () => {
    const impl = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
    if (impl === undefined) return { ok: false, message: '当前环境没有 fetch，未推送' }
    let payload: PushSnapshot
    try {
      payload = buildMirrorSnapshot(reg)
    } catch (e) {
      return { ok: false, message: `投影快照失败：${e instanceof Error ? e.message : String(e)}` }
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined
    const timer = ctrl !== undefined ? setTimeout(() => ctrl.abort(), PUSH_TIMEOUT_MS) : undefined
    try {
      const res = await impl(MIRROR_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        ...(ctrl !== undefined ? { signal: ctrl.signal } : {}),
      })
      if (!res || res.ok !== true) {
        return { ok: false, message: `宿主拒绝镜像写入（HTTP ${res?.status ?? '?'}）` }
      }
      successes += 1
      warnedOnce = false
      return { ok: true }
    } catch (e) {
      return { ok: false, message: `宿主半不可达：${e instanceof Error ? e.message : String(e)}` }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  const pushNow = async (): Promise<{ ok: boolean; message?: string }> => {
    if (stopped) return { ok: false, message: '已停止' }
    if (inFlight !== null) {
      // 单飞：正在推就不叠请求（变更风暴时只补一次尾部）
      queued = true
      return inFlight
    }
    inFlight = doPush()
    try {
      const result = await inFlight
      if (result.ok !== true && !warnedOnce) {
        warnedOnce = true
        // 只告警一次（避免每次变更刷屏）；下一次成功会复位
        try {
          console.warn(`[personal-workspace] 项目镜像未同步到宿主：${result.message}（本地项目数据未受影响）`)
        } catch {
          // logging is best-effort
        }
      }
      return result
    } finally {
      inFlight = null
      if (queued && !stopped) {
        queued = false
        void pushNow()
      }
    }
  }

  const off = reg.subscribe(() => {
    void pushNow()
  })
  void pushNow()

  return {
    pushNow,
    stop(): void {
      stopped = true
      try {
        off()
      } catch {
        // unsubscribe best-effort
      }
    },
    successCount(): number {
      return successes
    },
  }
}
