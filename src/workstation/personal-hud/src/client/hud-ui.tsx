// dsh-personal-hud — Status Bar + Inspector UI (React components + styles).
// Honest data policy（E5-3 收口）：只有**官方真源**（当前会话 feed）渲染真实值；没有真源的字段
//   一律渲染 '—'（未知 ≠ 0），**不显示任何写死的假名字**，也不再用"Stage N 接入"这类会过期的话术
//   （旧 STAGE-2 占位常量已删除，见 docs/E5_FINAL_SOURCE_OF_TRUTH_AUDIT.md §3 FAIL-1）。
import { useState, type ReactNode } from 'react'
import { useHudState, useHudWindow, hudWindow } from './store'
import { PRODUCT_LABEL, HUD_COMPONENT_VERSION } from './product'
// FIX-5 Overlay/Layering: hud chrome z-values come from the shared LAYERS
// token table (docs/OVERLAY_LAYERING.md), never from ad-hoc constants. Band:
// Aux selection popup (60) < hud (450/550) < official Modal (1000)/Toast.
import { LAYERS } from '../../../personal-workspace/src/client/layering'

export const CSS_PH = String.raw`
/* Auto-hide status bar: a 5px bottom hot zone by default (covers nothing);
   hovering it expands the shell to 24px and slides the full bar up. */
.ph-shell {
  position: fixed; left: 0; right: 0; bottom: 0; height: 5px;
  z-index: ${LAYERS.hudStatus}; pointer-events: auto;
  transition: height .14s ease;
}
.ph-shell.ph-on { height: 24px; }
.ph-shell .ph-bar {
  position: absolute; left: 0; right: 0; bottom: 0; height: 24px;
  pointer-events: auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 8px;
  font: var(--dsw-font-xxxs-11, 11px);
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #111) 92%, transparent);
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25));
  backdrop-filter: blur(6px);
  user-select: none;
  transform: translateY(110%);
  transition: transform .14s ease;
}
.ph-shell.ph-on .ph-bar { transform: translateY(0); }
.ph-seg { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ph-chip { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; }
.ph-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-border-l2, #666); }
.ph-dot[data-on="true"] { background: var(--dsw-alias-state-business-primary, #3b82f6); }
.ph-dot[data-warn="true"] { background: var(--dsw-alias-state-warn-primary, #eab308); }
.ph-title { color: var(--dsw-alias-label-primary); max-width: 220px; text-overflow: ellipsis; overflow: hidden; }
.ph-muted { color: var(--dsw-alias-label-dimmed); }
.ph-btn {
  pointer-events: auto; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));
  background: transparent; border-radius: 5px;
  padding: 1px 6px;
  font: var(--dsw-font-xxxs-11, 11px);
  color: var(--dsw-alias-label-secondary);
}
.ph-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.ph-btn[data-on="true"] { color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); border-color: var(--dsw-alias-brand-primary, inherit); }
.ph-inspector {
  /* v0.1.2: floating card below the top chrome, not a full-height right-edge
     overlay, so it never covers the workbench's top row / collapse control. */
  position: fixed; top: 64px; right: 8px; width: 320px;
  max-height: calc(100vh - 96px);
  z-index: ${LAYERS.hudInspector};
  display: flex; flex-direction: column;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #15171c) 96%, transparent);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25));
  border-radius: 10px;
  backdrop-filter: blur(10px);
  font: var(--dsw-font-xxs-12, 12px);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 12px 36px rgba(0,0,0,.28);
  overflow: hidden;
}
.ph-resize {
  position: absolute; left: -3px; top: 0; bottom: 0; width: 6px;
  cursor: ew-resize; touch-action: none;
}
.ph-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2));
  flex: 0 0 auto;
}
.ph-head-title { font: var(--dsw-font-xxs-strong-12, 600 12px); letter-spacing: .02em; }
.ph-body { flex: 1 1 auto; overflow-y: auto; padding: 4px 10px 10px; min-height: 0; }
.ph-kbd { font-family: var(--ds-font-family-code, monospace); color: var(--dsw-alias-label-dimmed); }
.ph-group { margin: 8px 0 4px; font: var(--dsw-font-xxxs-strong-11, 600 11px); letter-spacing: .06em; color: var(--dsw-alias-label-tertiary); }
.ph-row { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; }
.ph-row-label { flex: 0 0 76px; color: var(--dsw-alias-label-tertiary); }
.ph-row-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.ph-row-value[data-main="true"] { color: var(--dsw-alias-label-primary); }
.ph-sess { display: flex; align-items: center; gap: 6px; padding: 2px 0; color: var(--dsw-alias-label-secondary); min-width: 0; }
.ph-sess-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-empty { color: var(--dsw-alias-label-dimmed); padding: 2px 0; }
`

function dotData(running: boolean | undefined): Record<string, unknown> {
  return { 'data-on': running === true }
}

/** Section row: label + value (value may be a placeholder with stage hint). */
function Row({ label, value, main, hint }: { label: string; value: string; main?: boolean; hint?: string }): ReactNode {
  return (
    <div className="ph-row">
      <span className="ph-row-label">{label}</span>
      <span className="ph-row-value" data-main={main === true} title={hint}>
        {value}
      </span>
    </div>
  )
}

function timeLabel(ts: number | undefined): string {
  if (typeof ts !== 'number') return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtId(id: string | undefined): string {
  return id && id.length > 26 ? `${id.slice(0, 10)}…${id.slice(-6)}` : (id ?? '—')
}

export function StatusBar(): ReactNode {
  const { open } = useHudWindow()
  const s = useHudState()
  const cur = s.current
  const [on, setOn] = useState(false)
  return (
    <div
      className={on ? 'ph-shell ph-on' : 'ph-shell'}
      data-dsh-plugin="dsh-personal-hud"
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
    >
      <div className="ph-bar">
        <div className="ph-seg" style={{ minWidth: 0 }}>
          <span className="ph-chip" title={cur ? `会话 ${cur.id}` : '当前会话'}>
            <span className="ph-dot" data-on={cur?.running === true} />
            <span className="ph-title">{cur ? cur.title : '无会话'}</span>
          </span>
          <span className="ph-chip ph-muted" title="Agent 真源未接入（不显示占位值）">
            Agent · <span className="ph-muted">—</span>
          </span>
          <span className="ph-chip ph-muted" title="Project 真源未接入（不显示占位值）">
            Project · <span className="ph-muted">—</span>
          </span>
        </div>
        <div className="ph-seg">
          <span className="ph-chip ph-muted" title="上下文占用（无真源 → 如实显示未知）">ctx —%</span>
          <span className="ph-chip ph-muted" title="Token 速率（无真源 → 如实显示未知）">tok —/s</span>
          <span className="ph-chip ph-muted" title="会话费用（无真源 → 如实显示未知）">¥ —</span>
          <span className="ph-chip ph-muted" title="Git 状态（无真源 → 如实显示未知）">Git —</span>
          <span className="ph-chip">
            <span className="ph-dot" data-on={s.runtime === 'online'} data-warn={s.runtime === 'connecting'} />
            Sync
          </span>
          <button
            type="button"
            className="ph-btn"
            data-on={open}
            title="打开/关闭 Inspector（快捷键 ⌘I）"
            onClick={() => hudWindow.setOpen(!open)}
          >
            Inspector <span className="ph-kbd">⌘I</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function Inspector(): ReactNode | null {
  const { open, width } = useHudWindow()
  const s = useHudState()
  if (!open) return null
  const cur = s.current
  return (
    <div className="ph-inspector" style={{ width }} data-dsh-plugin="dsh-personal-hud">
      <div
        className="ph-resize"
        title="拖拽调整宽度"
        onMouseDown={(e) => {
          e.preventDefault()
          const startX = e.clientX
          const startW = width
          const onMove = (ev: MouseEvent): void => {
            hudWindow.setWidth(startW + (startX - ev.clientX))
          }
          const onUp = (): void => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />
      <div className="ph-head">
        <span className="ph-head-title">Inspector</span>
        <button type="button" className="ph-btn" onClick={() => hudWindow.setOpen(false)} title="关闭">
          ✕
        </button>
      </div>
      <div className="ph-body">
        <div className="ph-group">会话</div>
        {cur ? (
          <>
            <Row label="标题" value={cur.title} main hint={cur.id} />
            <Row label="会话 ID" value={fmtId(cur.id)} hint={cur.id} />
            <Row label="状态" value={cur.running ? '运行中' : '空闲'} main />
          </>
        ) : (
          <div className="ph-empty">暂无当前会话</div>
        )}
        <div className="ph-group">产品</div>
        <Row label="产品版本" value={PRODUCT_LABEL} main hint="产品版本（与组件版本语义不同）" />
        <Row label="组件版本" value={HUD_COMPONENT_VERSION} hint="组件版本仅用于排障核对；sidebar/workspace 版本见左栏诊断面板" />
        <div className="ph-group">工作台</div>
        <Row label="Agent" value="—" hint="Agent 真源未接入：不显示占位名（未知 ≠ 0）" />
        <Row label="Project" value="—" hint="Project 真源未接入：不显示占位名（项目数据在「项目中心」为真源）" />
        <Row label="Task" value="—" hint="任务真源在官方任务看板（本面板未接入）" />
        <Row label="Context" value="—" hint="上下文占用/压缩（无真源）" />
        <Row label="Memory" value="—" hint="长期记忆视图（无真源）" />
        <Row label="Tools" value="—" hint="当前可用工具集（无真源）" />
        <div className="ph-group">活动</div>
        <Row label="Activity" value="—" hint="回合/工具活动流（无真源）" />
        <Row label="Files" value="—" hint="文件变更（无真源）" />
        <Row label="Git" value="—" hint="Git 状态（无真源）" />
        <div className="ph-group">最近会话</div>
        {s.recent.length === 0 ? (
          <div className="ph-empty">（无）</div>
        ) : (
          s.recent.slice(0, 8).map((r) => (
            <div className="ph-sess" key={r.id} title={r.id}>
              <span className="ph-dot" {...dotData(r.running)} />
              <span className="ph-sess-title">{r.title}</span>
              <span className="ph-muted" style={{ marginLeft: 'auto', flex: '0 0 auto' }}>{timeLabel(r.updatedAt)}</span>
            </div>
          ))
        )}
        <div className="ph-empty" style={{ marginTop: 6 }}>
          真实数据逐步接入：会话/运行态来自官方 Session 快照；其余字段按 Stage 规划补齐。
        </div>
      </div>
    </div>
  )
}
