// dsh-personal-workspace — V1.2-E2 · 记忆树**薄画布视图**（中央主区；自绘，ADR-021）
//
// 分层：本文件只做「取数 + 渲染 + 交互」；**判断全在 `memory-tree-select.ts`**（纯函数，headless 可测）。
//   布局在 `memory-layout.ts`（移植 ThoughtDAG why.mjs，MIT，见该文件头的许可说明）。
//
// 裁定落点：
//   · E-1 入口 = 中央主区视图（`MainViewId='memory-tree'`）+ 左栏一条导航行
//   · E-2 首屏 = 最近 1 工作区 + 20 会话；**轮次默认折叠**，点会话才展开（可懒取该会话全轮）
//   · E-3 上限仍 300 —— 视图不假装看得全：被裁掉多少**如实写在标题下**
//
// 三条纪律（与宿主半同源）：
//   ① 取不到 ⇒ 显示"读不到 + 原因"，**绝不**渲染成"你没有记忆"（`failureNotice`）；
//   ② 规模如实（`scaleNotice`）、三层计量如实（`layerNotice`，未知就说未知）；
//   ③ 轮次节点上没有 trace id 可显示（episodes 面不提供）⇒ 来源行只写真实存在的
//      sessionId / episodeId / 时间，**不编一个 id 上去**。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { COLLAPSED_LAYOUT_HEIGHT, LAYOUT_COL_WIDTH, autoLayout, layoutBounds, nodeHeight } from './memory-layout'
import {
  FIRST_SCREEN_SESSIONS,
  FIRST_SCREEN_WORKSPACES,
  MEMORY_TREE_ROUTE,
  MORE_STEP,
  failureNotice,
  hasTurnsFor,
  kindOf,
  labelProvenanceNotice,
  layerNotice,
  mergeSessionTurns,
  parseTreeResponse,
  scaleNotice,
  selectVisible,
  type MemoryTreeGraph,
  type MemoryTreeSource,
} from './memory-tree-select'

/** 打开官方会话的动作由 index.tsx 注入（与 Home/Recent 同一注入点，不另造跳转）。 */
let openSessionFn: ((id: string) => void) | null = null

export function bindMemoryTreeServices(openSession: (id: string) => void): () => void {
  openSessionFn = openSession
  return () => {
    openSessionFn = null
  }
}

type Load =
  | { phase: 'loading' }
  | { phase: 'failed'; reason: string; source: MemoryTreeSource | null }
  | { phase: 'ok'; graph: MemoryTreeGraph; source: MemoryTreeSource }

const TREE_TIMEOUT_MS = 8000

/** 取一次树。**任何**失败都归一成可读原因（不抛 —— 调用方按 phase 渲染）。 */
async function fetchTree(query: string, signal: AbortSignal): Promise<Load> {
  let status = 0
  let body: unknown = null
  try {
    const res = await fetch(MEMORY_TREE_ROUTE + query, {
      method: 'GET',
      signal,
      headers: { accept: 'application/json' },
    })
    status = res.status
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      return { phase: 'failed', reason: '宿主路由响应不是合法 JSON（形状变化）', source: null }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { phase: 'failed', reason: signal.aborted ? '请求被取消' : `请求失败：${msg}`, source: null }
  }
  const parsed = parseTreeResponse(status, body)
  if (parsed.ok !== true) return { phase: 'failed', reason: parsed.reason, source: parsed.source }
  return { phase: 'ok', graph: parsed.graph, source: parsed.source }
}

function fmtTime(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '时间未知'
  try {
    return new Date(n).toLocaleString()
  } catch {
    return '时间未知'
  }
}

function short(s: unknown, n = 8): string {
  const t = typeof s === 'string' ? s : ''
  if (t === '') return '—'
  return t.length <= n ? t : '…' + t.slice(-n)
}

function diag(patch: Record<string, unknown>): void {
  try {
    const w = window as unknown as { __dshDiag?: Record<string, unknown> }
    const d = (w.__dshDiag ??= {})
    const prev = (d.memoryTree ?? {}) as Record<string, unknown>
    d.memoryTree = { ...prev, ...patch, t: Date.now() }
  } catch {
    // diag best-effort
  }
}

export function MemoryTreeView(): ReactNode {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [sessionLimit, setSessionLimit] = useState(FIRST_SCREEN_SESSIONS)
  const [workspaceLimit, setWorkspaceLimit] = useState(FIRST_SCREEN_WORKSPACES)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reload = useCallback((): void => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const timer = setTimeout(() => ac.abort(), TREE_TIMEOUT_MS)
    setLoad({ phase: 'loading' })
    setLocalError(null)
    void fetchTree('?scope=recent', ac.signal)
      .then((next) => {
        if (ac.signal.aborted) return
        setLoad(next)
        diag({
          phase: next.phase,
          nodes: next.phase === 'ok' ? next.graph.nodes.length : 0,
          reason: next.phase === 'failed' ? next.reason : null,
        })
      })
      .finally(() => clearTimeout(timer))
  }, [])

  useEffect(() => {
    reload()
    return () => abortRef.current?.abort()
  }, [reload])

  const graph = load.phase === 'ok' ? load.graph : null

  /** 懒展开：本地已有轮次就直接显示；否则按 `scope=session` 取回该会话全部轮次再合并。 */
  const toggleSession = useCallback(
    (sessionId: string): void => {
      const isOpen = expanded.has(sessionId)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(sessionId)) next.delete(sessionId)
        else next.add(sessionId)
        return next
      })
      if (isOpen || graph === null || hasTurnsFor(graph, sessionId)) return
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), TREE_TIMEOUT_MS)
      setBusy(sessionId)
      setLocalError(null)
      void fetchTree('?scope=session&session=' + encodeURIComponent(sessionId), ac.signal)
        .then((next) => {
          if (ac.signal.aborted) return
          if (next.phase !== 'ok') {
            setLocalError(`该会话的轮次取不到：${next.reason}`)
            return
          }
          setLoad((prev) => {
            if (prev.phase !== 'ok') return prev
            return { phase: 'ok', graph: mergeSessionTurns(prev.graph, sessionId, next.graph), source: prev.source }
          })
        })
        .finally(() => {
          clearTimeout(timer)
          setBusy((b) => (b === sessionId ? null : b))
        })
    },
    [expanded, graph],
  )

  const selection = useMemo(
    () =>
      graph === null
        ? null
        : selectVisible(graph, { workspaceLimit, sessionLimit, expandedSessions: expanded }),
    [graph, workspaceLimit, sessionLimit, expanded],
  )
  const laid = useMemo(() => (selection === null ? [] : autoLayout(selection.nodes, selection.edges)), [selection])
  const bounds = useMemo(() => layoutBounds(laid), [laid])
  // 名称来源声明：没有派生名时为 null（连"这句声明"都不许变成过期的假话）。
  const labelNote = useMemo(() => (load.phase === 'ok' ? labelProvenanceNotice(load.graph) : null), [load])
  const posById = useMemo(() => new Map(laid.map((n) => [n.id, n])), [laid])

  return (
    <div className="dmt-root" data-dsh-plugin="dsh-personal-workspace" data-dsh-memory-tree="1">
      <div className="dmt-head">
        <div>
          <h2 className="dmt-h">记忆树</h2>
          <div className="dmt-sub">
            跨会话记忆的层级总览：工作区 → 会话 → 轮次。轮次默认折叠，点会话展开（可单独取回该会话全部轮）。
          </div>
        </div>
        <div className="dmt-actions">
          <button className="dmt-btn" type="button" onClick={reload} disabled={load.phase === 'loading'}>
            {load.phase === 'loading' ? '取数中…' : '重新取数'}
          </button>
        </div>
      </div>

      {load.phase === 'loading' && <div className="dmt-note">正在读取记忆树…（只读 GET，不动记忆库）</div>}

      {load.phase === 'failed' && (
        <div className="dmt-panel dmt-err" data-dsh-memory-tree-error="1">
          <div className="dmt-errline">读不到记忆树</div>
          <div className="dmt-note">{failureNotice({ reason: load.reason })}</div>
          <button className="dmt-btn" type="button" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {load.phase === 'ok' && selection !== null && (
        <>
          <div className="dmt-meta">
            <div className="dmt-note" data-dsh-memory-tree-scale="1">{scaleNotice(load.graph, load.source)}</div>
            <div className="dmt-note" data-dsh-memory-tree-layers="1">{layerNotice(load.graph, load.source)}</div>
            {labelNote !== null && (
              <div className="dmt-note" data-dsh-memory-tree-labelnote="1">{labelNote}</div>
            )}
            <div className="dmt-note">
              本轮显示：工作区 {selection.shown.workspaces} · 会话 {selection.shown.sessions} · 轮次 {selection.shown.turns}
              （另有 {selection.hidden.workspaces} 个工作区 / {selection.hidden.sessions} 个会话未显示）
            </div>
          </div>

          {localError !== null && <div className="dmt-note dmt-errline" data-dsh-memory-tree-localerror="1">{localError}</div>}

          {(selection.moreSessions > 0 || selection.moreWorkspaces > 0) && (
            <div className="dmt-actions">
              {selection.moreSessions > 0 && (
                <button className="dmt-btn" type="button" onClick={() => setSessionLimit((n) => n + MORE_STEP)}>
                  再显示 {Math.min(MORE_STEP, selection.moreSessions)} 个会话（本工作区还剩 {selection.moreSessions}）
                </button>
              )}
              {selection.moreWorkspaces > 0 && (
                <button className="dmt-btn" type="button" onClick={() => setWorkspaceLimit((n) => n + 1)}>
                  再显示 1 个工作区（还剩 {selection.moreWorkspaces}）
                </button>
              )}
            </div>
          )}

          {laid.length === 0 ? (
            <div className="dmt-panel" data-dsh-memory-tree-empty="1">
              <div className="dmt-note">
                图里确实没有可显示的节点（实测为空，**不是**读取失败）。记忆库当前没有轮次记录。
              </div>
            </div>
          ) : (
            <div className="dmt-canvas" data-dsh-memory-tree-nodes={laid.length}>
              <svg
                className="dmt-edges"
                width={Math.max(bounds.width, 1)}
                height={Math.max(bounds.height, 1)}
                viewBox={`${bounds.minX} ${bounds.minY} ${Math.max(bounds.width, 1)} ${Math.max(bounds.height, 1)}`}
              >
                {selection.edges.map((e) => {
                  const a = posById.get(e.source)
                  const b = posById.get(e.target)
                  if (a === undefined || b === undefined) return null
                  const ax = a.position.x + LAYOUT_COL_WIDTH
                  const ay = a.position.y + nodeHeight(a) / 2
                  const bx = b.position.x
                  const by = b.position.y + nodeHeight(b) / 2
                  const mid = ax + (bx - ax) / 2
                  return (
                    <path
                      key={e.id}
                      className={e.data.kind === 'sequence' ? 'dmt-edge dmt-edge-seq' : 'dmt-edge'}
                      d={`M ${ax} ${ay} H ${mid} V ${by} H ${bx}`}
                      fill="none"
                    />
                  )
                })}
              </svg>
              {laid.map((n) => {
                const kind = kindOf(n)
                const sid = String(n.data.sessionId ?? '')
                const isOpen = expanded.has(sid)
                return (
                  <div
                    key={n.id}
                    className={`dmt-node dmt-${kind}`}
                    data-dsh-memory-tree-kind={kind}
                    data-dsh-memory-tree-node={n.id}
                    style={{
                      left: n.position.x - bounds.minX,
                      top: n.position.y - bounds.minY,
                      width: LAYOUT_COL_WIDTH,
                      minHeight: nodeHeight(n),
                      maxHeight: Math.max(COLLAPSED_LAYOUT_HEIGHT, nodeHeight(n)),
                    }}
                  >
                    <div
                      className="dmt-nlabel"
                      title={
                        n.data.labelDerived === true
                          ? '记忆库未提供名称，此标签由 ID 生成（不是项目真名）'
                          : undefined
                      }
                    >
                      {/* `??` 接不住空串：labelLost（摘要为空）时 label 是 ''，会让整行标签渲染成空白。 */}
                      {String(n.data.label || '（无摘要）')}
                      {n.data.labelTruncated === true && (
                        <span className="dmt-tag" title="摘要只显示了原文开头；点开该会话可取回全部轮次">
                          …已截断
                        </span>
                      )}
                    </div>
                    <div className="dmt-nmeta">
                      {kind === 'workspace' && (
                        <>
                          会话 {String(n.data.sessionCount ?? '?')} · 轮次 {String(n.data.turnCount ?? '?')}
                          <br />
                          {fmtTime(n.data.firstTs)} — {fmtTime(n.data.lastTs)}
                        </>
                      )}
                      {kind === 'session' && (
                        <>
                          {String(n.data.turnCount ?? '?')} 轮 · {fmtTime(n.data.lastTs)}
                          {Array.isArray(n.data.statuses) && n.data.statuses.length > 0 ? ` · ${n.data.statuses.join('/')}` : ''}
                        </>
                      )}
                      {kind === 'turn' && (
                        <>
                          {fmtTime(n.data.ts)}
                          {Array.isArray(n.data.toolTags) && n.data.toolTags.length > 0 ? ` · 工具 ${n.data.toolTags.join(', ')}` : ''}
                          <br />
                          来源：会话 {short(n.data.sessionId)} · 记录 {short(n.data.episodeId ?? n.data.recordId)}
                          {n.data.traceId === null ? '（episodes 面不提供 trace id）' : ''}
                        </>
                      )}
                    </div>
                    {kind === 'session' && (
                      <div className="dmt-nacts">
                        <button
                          className="dmt-btn"
                          type="button"
                          onClick={() => toggleSession(sid)}
                          data-dsh-memory-tree-toggle={sid}
                          disabled={busy === sid}
                        >
                          {busy === sid ? '取轮次中…' : isOpen ? '收起轮次' : '展开轮次'}
                        </button>
                        <button
                          className="dmt-btn"
                          type="button"
                          onClick={() => openSessionFn?.(sid)}
                          data-dsh-memory-tree-open={sid}
                        >
                          打开会话
                        </button>
                      </div>
                    )}
                    {kind === 'turn' && (
                      <div className="dmt-nacts">
                        <button
                          className="dmt-btn"
                          type="button"
                          onClick={() => openSessionFn?.(sid)}
                          data-dsh-memory-tree-open={sid}
                        >
                          打开会话
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const CSS_MEMORY_TREE = String.raw`
.dmt-root{display:flex;flex-direction:column;gap:10px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);height:100%;min-height:0;}
.dmt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.dmt-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0 0 3px;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dmt-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.6;max-width:72ch;}
.dmt-actions{display:flex;gap:6px;flex-wrap:wrap;}
.dmt-btn{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-secondary,#c8c8d0);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08)) 60%,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;padding:3px 9px;cursor:pointer;}
.dmt-btn:disabled{opacity:.55;cursor:default;}
.dmt-meta{display:flex;flex-direction:column;gap:2px;}
.dmt-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.6;}
.dmt-errline{color:#ffb4b4;}
.dmt-panel{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;}
.dmt-err{border-color:rgba(235,90,90,.5);}
.dmt-canvas{position:relative;flex:1;min-height:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)) 50%,transparent);}
.dmt-edges{position:absolute;left:0;top:0;pointer-events:none;}
.dmt-edge{stroke:var(--dsw-alias-border-l3,rgba(140,140,150,.55));stroke-width:1.5;}
.dmt-edge-seq{stroke:rgba(120,150,255,.6);}
.dmt-node{position:absolute;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 55%,transparent);}
.dmt-workspace{border-left:3px solid rgba(120,150,255,.75);}
.dmt-session{border-left:3px solid rgba(140,200,150,.7);}
.dmt-turn{border-left:3px solid rgba(200,180,120,.7);}
.dmt-nlabel{font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);line-height:1.5;word-break:break-word;}
.dmt-tag{margin-left:5px;padding:0 5px;border-radius:4px;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#9a9aa5);border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.35));font:var(--dsw-font-xxxs-11,11px);}
.dmt-nmeta{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.6;}
.dmt-nacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;}
`
