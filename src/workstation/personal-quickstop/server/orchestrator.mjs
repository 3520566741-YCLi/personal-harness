// dsh-personal-quickstop — 停止编排核心（V1.2-I 阶段 I-D 的流程驱动）
//
// 本文件把需求 G2 的**九步流程**逐字实现为一个可回看的流程驱动，并且只用**注入的适配器**
// 去碰真实世界（官方 cancel/abort/stop 原语由 I-D 接线注入，见 `docs/V1_2_I_IMPLEMENTATION_PLAN.md`）。
//
// 三条写死在代码里的纪律：
//  ① **禁止硬杀优先**（G2）：顺序必须是
//      requested → freeze → discover → handoff → persist → stop → verify → mark → notify，
//      **不得**第一步就 kill。
//  ② **不许假成功**：某个源没有适配器（未接线）、没停掉、或交接失败 ⇒ 一律进入 `unwired` /
//      `notStopped` / `incomplete` 并如实汇总；`ok` 只在"真的都干净"时才为 true。
//  ③ **TEST SAFETY 是代码闸门**：`scope` 一旦声明为 `test`，**任何不在白名单里的源都不会被碰**
//      （不是"文档里劝你别这么干"）。需求原文要求初期只在 dedicated test Session/Task + dummy bash 上测。
//
// 官方原语是否存在由 `docs/V1_2_I_D_HOST_PROBE.md` 钉死；本文件**不猜测**它们，
// 缺哪一类就把它记成 `unwired`，让 UI 如实说"这一类还没接线"。

import { DEFAULT_GRACE_MS, QUICK_STOP_TEXTS, buildStopPlan, createAdmissionGate, createStopFlow } from './stop-plan.mjs'
import {
  STOP_REASON_QUICK_STOP,
  appendInterruptEvent,
  createInterruptEvent,
  INTERRUPT_PATH,
} from './interrupt-store.mjs'

/** G2 原文九步（逐字，供流程轨迹与文档对照）。 */
export const STOP_STAGES = Object.freeze([
  'Quick Stop requested',
  'Freeze new work creation',
  'Discover active work',
  'Ask active AI/Agent to perform handoff',
  'Persist resumable state',
  'Gracefully stop/cancel active execution',
  'Verify stopped',
  'Mark interrupted',
  'UI notification',
])

/** 需要"停"的四类源（与 `ADMISSION_KINDS` 对齐但语义是"要停的东西"）。 */
export const STOPPABLE_KINDS = Object.freeze(['session', 'task', 'subagent', 'background'])

/** 源 → 计数键（I3/I15 文案里的四类）。 */
export const COUNT_KEY_BY_KIND = Object.freeze({
  session: 'sessions',
  task: 'tasks',
  subagent: 'subagents',
  background: 'backgrounds',
})

/** 从发现的活跃工作里抽出"要停的源"（新工作冻结后用的同一份判定）。 */
export function toSources(active = {}) {
  const sources = []
  for (const row of active.sessions ?? []) sources.push({ kind: 'session', id: row.sessionId, row })
  for (const row of active.tasks ?? []) sources.push({ kind: 'task', id: row.taskId, row })
  for (const row of active.subagents ?? []) sources.push({ kind: 'subagent', id: row.sessionId, row })
  for (const row of active.backgrounds ?? []) sources.push({ kind: 'background', id: row.id, row })
  return sources
}

/**
 * 源是否在声明的测试作用域内（TEST SAFETY 的唯一判定入口）。
 *
 * 按**归属**判定，而不是"只看 id 是否在名单里"：
 *   · session      → 其 sessionId 在名单里
 *   · subagent     → 它自己所属会话或父会话在名单里（测试会话的子代理算测试范围）
 *   · background   → **归属会话**在名单里（测试会话自己起的 dummy bash 算测试范围；
 *                    没有归属信息的一律**不算**，免得"顺手"停掉用户真实的后台执行）
 *   · task         → 其 taskId 在名单里
 * 需求原文的 TEST SAFETY 就是"dedicated test Session / Task / dummy bash"这一组合。
 */
export function isInScope(source, scope) {
  if (scope === null || scope === undefined || scope.mode === 'all') return true
  if (scope.mode !== 'test') return false
  const sessionIds = Array.isArray(scope.sessionIds) ? scope.sessionIds : []
  const taskIds = Array.isArray(scope.taskIds) ? scope.taskIds : []
  if (source.kind === 'task') return taskIds.includes(source.id)
  if (source.kind === 'background') {
    const owner = source.row?.sessionId ?? null
    return owner !== null && sessionIds.includes(owner)
  }
  if (source.kind === 'subagent') {
    return sessionIds.includes(source.id) || sessionIds.includes(source.row?.parentSessionId ?? null)
  }
  return sessionIds.includes(source.id)
}

/**
 * 创建编排器。
 *
 * @param {object} deps
 * @param {() => Promise<object>} [deps.discover]   只读快照（官方 sessions/jobs/subagents/任务账本）
 * @param {(source: object) => Promise<{ok: boolean, checkpoint?: object, detail?: any}>} [deps.handoff]
 * @param {(input: {source: object, checkpoint: object|null}) => Promise<{ok: boolean, path?: string}>} [deps.persist]
 * @param {(input: {source: object, force: boolean}) => Promise<{ok: boolean, forced?: boolean, detail?: any}>} [deps.stop]
 * @param {(source: object) => Promise<{stopped: boolean, detail?: any}>} [deps.verify]
 * @param {(source: object, event: object) => Promise<{ok: boolean}>} [deps.recordInterrupt]  默认写本地 store
 * @param {() => number} [deps.now]
 * @param {number} [deps.graceMs]
 * @param {{mode: 'all'|'test', sessionIds?: string[], taskIds?: string[]}} [deps.scope]
 */
export function createStopOrchestrator(deps = {}) {
  const now = deps.now ?? (() => Date.now())
  const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS
  const scope = deps.scope ?? { mode: 'all' }
  const storePath = deps.storePath ?? INTERRUPT_PATH
  const recordInterrupt = deps.recordInterrupt
    ?? ((source, event) => appendInterruptEvent(storePath, createInterruptEvent({
      ...event,
      source: source.kind === 'background' ? 'background' : source.kind,
      sourceId: source.id,
    })))
  const gate = deps.gate ?? createAdmissionGate({ now: () => new Date(now()).toISOString() })
  const flow = createStopFlow({ now, graceMs })

  /** 只读部分：发现 + 冻结前的审计（**绝不**在这里停任何东西）。 */
  async function plan() {
    if (typeof deps.discover !== 'function') {
      return { ok: false, reason: 'discovery-not-wired', message: '宿主发现面未接线（V1.2-I 阶段 I-D）' }
    }
    const snapshot = await deps.discover()
    const built = buildStopPlan(snapshot)
    const all = toSources(built.active)
    const inScope = all.filter((source) => isInScope(source, scope))
    const skipped = all.filter((source) => !isInScope(source, scope))
    return {
      ok: true,
      plan: built,
      sources: inScope,
      skippedOutOfScope: skipped,
      unavailableSources: built.unavailableSources,
    }
  }

  /**
   * 执行九步流程。
   * @param {{scope?: object}} [options]
   */
  async function run(options = {}) {
    const effectiveScope = options.scope ?? scope
    const requested = await plan()
    if (requested.ok !== true) {
      return {
        ok: false,
        reason: requested.reason,
        message: requested.message,
        stages: STOP_STAGES,
        executed: [],
      }
    }
    const stages = []
    const counts = { sessions: 0, tasks: 0, subagents: 0, backgrounds: 0 }
    // 逐源步骤（④–⑧）会**每个源各记一次**，detail 用于回看是给哪个源做的。
    const step = (name, detail = null) => {
      stages.push({ name, at: now(), detail })
      flow.mark(name, detail)
    }
    flow.begin()
    step(STOP_STAGES[0])

    // 源整体不可用**先**记账：它会让"没有工作"变成一句无根据的话，也会让汇总带 ⚠。
    for (const row of requested.unavailableSources ?? []) {
      flow.noteUnavailableSource(row.name, row.reason ?? null)
    }
    const sourcesUnavailable = (requested.unavailableSources ?? []).length > 0
    const unavailableNames = (requested.unavailableSources ?? []).map((row) => row.name).join('、')

    // 没有任何活动工作 ⇒ 安全 no-op（G3 原文提示），不冻结、不留痕、不报成功以外的任何东西。
    // **例外**：有源不可用时，"没有工作"是**无根据**的断言 ⇒ 如实报失败，绝不拿它顶替未知。
    if (requested.plan.hasWork !== true) {
      if (sourcesUnavailable) {
        const message = `无法确认"没有工作"：${unavailableNames} 源不可用（不拿"没有工作"顶替未知）`
        const summary = flow.summary(counts)
        step(STOP_STAGES[8])
        return {
          ok: false,
          noWork: false,
          reason: 'source-unavailable',
          unavailableSources: requested.unavailableSources,
          message,
          stages,
          executed: [],
          summary,
        }
      }
      return {
        ok: true,
        noWork: true,
        message: QUICK_STOP_TEXTS.noWork,
        stages,
        executed: [],
        summary: null,
      }
    }

    const unwired = []
    const notStopped = []
    const executed = []

    try {
      gate.freeze()
      step(STOP_STAGES[1])
      step(STOP_STAGES[2])

      for (const source of requested.sources) {
        const record = { kind: source.kind, id: source.id, handoff: false, persisted: false, stopped: false, forced: false, verified: false }
        executed.push(record)

        // ④ 交接
        let checkpoint = null
        if (typeof deps.handoff !== 'function') {
          unwired.push({ ...source, missing: 'handoff' })
        } else {
          const handoffResult = await deps.handoff(source)
          checkpoint = handoffResult?.checkpoint ?? null
          record.handoff = handoffResult?.ok === true
          flow.noteHandoff({ source: source.kind, sourceId: source.id, ok: record.handoff })
        }
        step(STOP_STAGES[3], `${source.kind}:${source.id}`)

        // ⑤ 落盘续接点（拿不到交接就如实标 checkpointIncomplete，不伪装）
        if (typeof deps.persist !== 'function') {
          unwired.push({ ...source, missing: 'persist' })
          flow.notePersist({ source: source.kind, sourceId: source.id, ok: false })
        } else {
          const persisted = await deps.persist({ source, checkpoint })
          record.persisted = persisted?.ok === true
          record.checkpointPath = persisted?.path ?? null
          // 交接成功 ≠ 已保存：落盘这一步的真假**必须**进汇总的与门，否则会输出
          // 「✓ 所有可恢复工作已保存续接点」而盘上一个字节都没有。
          flow.notePersist({ source: source.kind, sourceId: source.id, ok: record.persisted })
          if (record.persisted !== true) {
            record.persistReason = persisted?.reason ?? null
          } else if (persisted?.incomplete === true) {
            // 存下来了，但内容本身不完整（I6 缺字段）⇒ 记进审计面，不进"失败"（交接那一步已记 ⚠）。
            record.checkpointIncomplete = true
            record.checkpointMissingFields = persisted.missingFields ?? []
          }
        }
        step(STOP_STAGES[4], `${source.kind}:${source.id}`)

        // ⑥ 优雅停止（**不是**硬杀优先；force 只在宽限期后作为兜底）
        if (typeof deps.stop !== 'function') {
          unwired.push({ ...source, missing: 'stop' })
        } else {
          const stopped = await deps.stop({ source, force: false })
          record.stopped = stopped?.ok === true
          if (stopped?.forced === true) { record.forced = true; flow.force({ source: source.kind, sourceId: source.id, reason: 'adapter-reported-forced' }) }
        }
        step(STOP_STAGES[5], `${source.kind}:${source.id}`)

        // ⑦ 验证：没停掉且宽限期已过 ⇒ 强制兜底（I8）
        if (typeof deps.verify === 'function') {
          let verdict = await deps.verify(source)
          if (verdict?.stopped !== true && flow.isExpired() && typeof deps.stop === 'function') {
            const forcedResult = await deps.stop({ source, force: true })
            record.forced = true
            flow.force({ source: source.kind, sourceId: source.id, reason: 'grace-expired' })
            verdict = await deps.verify(source)
            if (forcedResult?.ok !== true) record.forceFailed = true
          }
          record.verified = verdict?.stopped === true
          record.stopped = record.verified || record.stopped
        }
        if (record.stopped !== true) notStopped.push({ kind: source.kind, id: source.id })
        step(STOP_STAGES[6], `${source.kind}:${source.id}`)

        // ⑧ 标记 interrupted（只对**真的停了**的源；没停的不许标记成功）
        if (record.stopped === true) {
          const written = await recordInterrupt(source, {
            at: new Date(now()).toISOString(),
            stopReason: STOP_REASON_QUICK_STOP,
            forced: record.forced === true,
            checkpoint,
            checkpointIncomplete: checkpoint === null,
          })
          record.marked = written?.ok === true
          counts[COUNT_KEY_BY_KIND[source.kind]] += 1
        }
        step(STOP_STAGES[7], `${source.kind}:${source.id}`)
      }

      // ⑨ UI 通知
      // **把编排层才知道的 verdict 交给汇总层**，让它自己决定要不要宣告"完成"——
      // 完成类断言不该由 UI 事后过滤（那只是兜底，漏一处就是假成功）。
      const reasons = []
      if (unwired.length > 0) reasons.push(`未接线 ${unwired.length} 项`)
      if (notStopped.length > 0) reasons.push(`未停掉 ${notStopped.length} 项`)
      if (sourcesUnavailable) reasons.push(`${unavailableNames} 源不可用`)
      const summary = flow.summary(counts, { ok: reasons.length === 0, reasons })
      step(STOP_STAGES[8])
      const ok = summary.ok === true
      return {
        ok,
        noWork: false,
        stages,
        executed,
        unwired,
        notStopped,
        unavailableSources: requested.unavailableSources ?? [],
        skippedOutOfScope: requested.skippedOutOfScope,
        gateRejections: gate.rejections,
        summary,
        message: ok ? QUICK_STOP_TEXTS.doneTitle : `快速停止未完全成功（${reasons.join('；')}）`,
      }
    } finally {
      gate.release()
    }
  }

  return { plan, run, gate, flow, scope, stages: STOP_STAGES }
}
