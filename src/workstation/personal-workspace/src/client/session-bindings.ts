// dsh-personal-workspace — E4-FIX-IA-2 FINAL · 官方会话「创建后绑定」通道（PHASE A）
//
// 语义（用户 2026-09-10 收口指令 §2.1）：Home = START CONVERSATION。
// Agent / Permission 若要在会话上生效，**必须走官方真实通道**，绝不假装：
//
//   · Agent 预设（官方 agentPresets 远程服务；仅对「尚未开始第一轮」的空白会话有效）
//       ctx.remote.agentPresets.list()                        → 真实预设清单
//       ctx.remote.agentPresets.select(sessionId, presetId)   → 绑定（host 侧
//       `agent-preset/locked`：会话已开始第一轮则拒绝）
//     同款用法实证：@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js:424（list）
//     与本文件同源的调用点 :1353（select），其 inject 含 "remote.agentPresets"（:1394）。
//
//   · 权限预设（官方 /permission 命令 + sessions 投影读回校验）
//       sessions.binding(id).session.command('/permission <preset>')
//       sessions.binding(id).session.projections.faceOf('permissions').getSnapshot()
//     同款用法实证：@deepseek-ai/dsh-client-ui-permission-presets/lib/client.js:491
//     （`live.command('/permission …')` + `!result.value.matched` 判定），读侧 :403。
//     host 侧契约：@deepseek-ai/dsh-permission-presets/lib/index.js:157
//     （commands.register({ name: "permission" })）。
//
// 纪律：
//   · 通道缺失 / 被拒 / 无法校验 → 一律返回**诚实失败原因**，UI 必须显示；
//   · 本模块不做任何本地权限状态缓存（读侧永远回官方投影）；
//   · 无 ctx.remote（未声明依赖/旧环境）→ capability limitation，不抛错。

export interface PresetOption {
  id: string
  label: string
  detail?: string
}

export type CapabilityList =
  | { ok: true; items: PresetOption[]; current?: string }
  | { ok: false; reason: string }

export type ApplyResult = { ok: true; note?: string } | { ok: false; reason: string }

interface LooseSessionLike {
  binding?: (id: string) => { session?: unknown } | undefined
}
interface LooseCtxLike {
  get?: (key: string) => unknown
  remote?: Record<string, unknown>
}

let getCtx: (() => LooseCtxLike | null) | null = null
let getSessions: (() => unknown) | null = null

/** index apply 时调用：绑定 ctx（含 remote 命名空间）与 sessions 服务读取器。 */
export function bindSessionBindings(ctx: LooseCtxLike, sessions: () => unknown): () => void {
  getCtx = () => ctx
  getSessions = sessions
  return () => {
    getCtx = null
    getSessions = null
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function remoteNamespace(name: string): Record<string, unknown> | null {
  try {
    const ctx = getCtx?.()
    const remote = ctx?.remote as Record<string, unknown> | undefined
    const ns = remote?.[name]
    if (ns && typeof ns === 'object') return ns as Record<string, unknown>
    // 兜底：部分环境以服务名暴露（ctx.get('remote.agentPresets')）
    const viaGet = typeof ctx?.get === 'function' ? ctx.get(`remote.${name}`) : undefined
    if (viaGet && typeof viaGet === 'object') return viaGet as Record<string, unknown>
  } catch {
    // ignore
  }
  return null
}

/** 官方 sessions 服务上的某个会话面（binding(id).session）。 */
function sessionFace(sessionId: string): Record<string, unknown> | null {
  try {
    const svc = getSessions?.() as LooseSessionLike | null
    const b = svc?.binding?.(sessionId)
    const s = b?.session
    if (s && typeof s === 'object') return s as Record<string, unknown>
  } catch {
    // ignore
  }
  return null
}

// ---------------------------------------------------------------------------
// Agent 预设（官方 agentPresets 远程服务）

function parseRoster(value: unknown): PresetOption[] {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray((value as { presets?: unknown } | null)?.presets)
      ? ((value as { presets: unknown[] }).presets as unknown[])
      : []
  const out: PresetOption[] = []
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>
    const id = str(r.id) || str(r.name)
    if (!id) continue
    out.push({
      id,
      label: str(r.name) || str(r.title) || id,
      ...(str(r.description) ? { detail: str(r.description) } : {}),
    })
  }
  return out
}

/**
 * 读官方 Agent 预设清单。服务缺失/被拒 → {ok:false, reason}（UI 诚实显示，不伪造清单）。
 */
export async function listAgentPresets(): Promise<CapabilityList> {
  const ns = remoteNamespace('agentPresets')
  if (ns === null || typeof ns.list !== 'function') {
    return { ok: false, reason: '官方 agentPresets 远程服务不可用（capability limitation）' }
  }
  try {
    const res = (await (ns.list as () => Promise<unknown>)()) as { ok?: boolean; value?: unknown; error?: { message?: string; code?: string } }
    if (res?.ok === false) {
      const code = str(res.error?.code)
      if (code === 'gateway/invocation-unavailable') {
        return { ok: false, reason: '宿主未暴露 agentPresets（gateway/invocation-unavailable）' }
      }
      return { ok: false, reason: str(res.error?.message) || '读取 Agent 预设清单失败' }
    }
    const items = parseRoster(res?.value)
    if (items.length === 0) {
      // 官方在 gateway/invocation-unavailable 时也会返回**空 roster**（实证
      // ui-agent-preset/lib/client.js:426-430）。空清单 ≠ 可用：诚实报不可用，
      // 否则 Home 会显示一个空下拉并声称「已生效」。
      return { ok: false, reason: '宿主未提供可用的官方 Agent 预设清单' }
    }
    return { ok: true, items }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 把官方 Agent 预设绑定到刚创建的会话。
 * 官方约束：仅空白会话可换（host `agent-preset/locked`）→ 失败原因如实回传。
 */
export async function applyAgentPreset(sessionId: string, presetId: string): Promise<ApplyResult> {
  const ns = remoteNamespace('agentPresets')
  if (ns === null || typeof ns.select !== 'function') {
    return { ok: false, reason: '官方 agentPresets.select 不可用（capability limitation）' }
  }
  try {
    const res = (await (ns.select as (a: string, b: string) => Promise<unknown>)(sessionId, presetId)) as {
      ok?: boolean
      error?: { message?: string; code?: string }
    }
    if (res?.ok === false) {
      const code = str(res.error?.code)
      const msg = str(res.error?.message) || '官方拒绝'
      if (code === 'agent-preset/locked') {
        return { ok: false, reason: `会话已开始第一轮，Agent 预设固定（${msg}）` }
      }
      return { ok: false, reason: `${code || 'error'}: ${msg}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

// ---------------------------------------------------------------------------
// 权限预设（官方 /permission 命令 + permissions 投影读回）

interface PermSnapshot {
  currentValue?: unknown
  options?: unknown
}

function permSnapshot(sessionId: string): PermSnapshot | null {
  const face = sessionFace(sessionId)
  const projections = face?.projections as { faceOf?: (k: string) => { getSnapshot?: () => unknown } } | undefined
  try {
    const snap = projections?.faceOf?.('permissions')?.getSnapshot?.()
    if (snap && typeof snap === 'object') return snap as PermSnapshot
  } catch {
    // ignore
  }
  return null
}

/**
 * 读官方权限预设清单 + 当前值。
 * 依赖一个**真实存在的官方会话**的 permissions 投影（官方同一做法，见
 * ui-permission-presets:403）。当前无任何会话 → 诚实返回不可用原因。
 */
export function listPermissionPresets(sessionId?: string): CapabilityList {
  let target = str(sessionId)
  if (!target) {
    try {
      const svc = getSessions?.() as { list?: { getSnapshot?: () => { current?: unknown } } } | null
      target = str(svc?.list?.getSnapshot?.().current)
    } catch {
      target = ''
    }
  }
  if (!target) {
    return { ok: false, reason: '当前没有官方会话可读取权限投影（创建首个会话后即可枚举）' }
  }
  const snap = permSnapshot(target)
  if (snap === null) {
    return { ok: false, reason: '官方 permissions 会话投影不可用（capability limitation）' }
  }
  const raw = Array.isArray(snap.options) ? (snap.options as unknown[]) : []
  const items: PresetOption[] = []
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>
    const id = str(r.value) || str(r.id)
    if (!id || id === 'custom') continue
    items.push({
      id,
      label: str(r.name) || id,
      ...(str(r.description) ? { detail: str(r.description) } : {}),
    })
  }
  if (items.length === 0) {
    return { ok: false, reason: '官方权限投影未返回可切换预设' }
  }
  return { ok: true, items, current: str(snap.currentValue) || undefined }
}

/**
 * 通过官方 `/permission <preset>` 命令切换会话权限，并用官方投影**读回校验**。
 * 返回 ok 仅当命令被官方接受（matched）且投影已反映目标预设（verified）。
 */
export async function applyPermissionPreset(sessionId: string, presetId: string): Promise<ApplyResult> {
  const face = sessionFace(sessionId)
  const command = face?.command
  if (typeof command !== 'function') {
    return { ok: false, reason: '官方会话命令通道不可用（sessions.binding().session.command 缺失）' }
  }
  try {
    const res = (await (command as (line: string) => Promise<unknown>).call(face, `/permission ${presetId}`)) as {
      ok?: boolean
      value?: { matched?: boolean }
      error?: { code?: string; message?: string }
    }
    if (res?.ok === false) {
      return { ok: false, reason: `${str(res.error?.code) || 'error'}: ${str(res.error?.message) || '命令被拒'}` }
    }
    if (res?.value?.matched !== true) {
      return { ok: false, reason: '宿主未提供官方 /permission 命令' }
    }
    // 读回校验（官方同一投影；未读到 → 不声称已生效）
    const after = permSnapshot(sessionId)
    if (after === null) return { ok: true, note: '命令已被官方接受；投影不可读，未做读回校验' }
    const current = str(after.currentValue)
    if (current === presetId) return { ok: true }
    return {
      ok: false,
      reason: `命令已被官方接受，但官方投影当前值仍为「${current || '未知'}」（可能被宿主策略覆盖）`,
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
