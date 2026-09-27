// dsh-personal-quickstop — 客户端 UI 展示件（V1.2-I 阶段 I-B）
//
// 纪律：
//   ① 文案**不在这里重写**：全部从 `server/stop-plan.mjs` 的 `QUICK_STOP_TEXTS` 引用。
//      该文件是纯引擎（零 import、零 IO）⇒ 可以被客户端 bundle 直接引用，两侧**同一个 owner**。
//      （套件会验：本文件不出现任何硬写的需求原文句子。）
//   ② 组件是**纯展示件**：不断言任何"已经停止"的事实，只渲染传进来的 plan / summary。
//      真编排（谁被停、停成功了没）属于 I-D，本阶段不假装知道。
//   ③ 唯一新增的字符串是 UI chrome（关闭按钮），已在下方显式标注"非需求原文"。
//   ④ 层序：确认框与结果卡都挂到 **body 门户** `overlayRootFor(LAYERS.modal)`（不写 z-index 魔数）。
//      为什么必须门户而不是 CSS 抬高：桌面壳把 `#root` 包在一层 transform 里 ⇒ `#root` 内所有
//      `position:fixed` 都被困在那个 stacking context 内，**纯 CSS 抬不到 body 级宿主之上**；
//      而 better-sidebar 的工作台面板是 body 级（z=25，面板 40 / 浮窗 42 / toggle 45）——
//      不门户的话"确认停止"的模态会被工作台面板盖住（真 UX 缺陷，非样式洁癖）。
//      单一源 = `personal-workspace/src/client/layering.ts`（照 project-manage.tsx 的既有姿势）。
//      门户根自身 `pointer-events:none`，所以遮罩必须显式 `pointer-events:auto` 才收得到点击。

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { LAYERS, overlayRootFor } from '../../../personal-workspace/src/client/layering'
import { QUICK_STOP_TEXTS, RESUME_TEXTS } from '../../server/stop-plan.mjs'

/** 非需求原文：结果卡片的关闭按钮（I15 只定义结果行，没定义怎么关）。 */
export const DISMISS_LABEL = '关闭'

/** 归属标注（悬停可见）：该面属于哪一个产品与外挂，用来在原生 UI 里标明来源。 */
export const QUICKSTOP_SOURCE = 'Personal Harness · Quick Stop'

const CSS = `
.dps-qs-btn{border:1px solid var(--dsw-alias-border-l2);min-width:96px;height:32px;
color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:0 0;
border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:6px 12px;font-size:13px;
font-weight:400;line-height:20px;display:inline-flex}
.dps-qs-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dps-qs-btn:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}
.dps-qs-btn span{white-space:nowrap;flex:none}
.dps-qs-overlay{position:fixed;inset:0;pointer-events:auto;display:flex;align-items:center;justify-content:center;
background:rgba(12,14,22,.46)}
.dps-qs-card{min-width:380px;max-width:520px;box-sizing:border-box;padding:18px 20px;border-radius:12px;
background:var(--dsw-alias-bg-elevated,#1b1f2b);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));
color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;line-height:20px;
box-shadow:0 18px 48px rgba(0,0,0,.42)}
.dps-qs-title{font-size:15px;font-weight:600;line-height:22px;margin:0 0 10px}
.dps-qs-counts{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.dps-qs-counts li{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}
.dps-qs-note{margin:0 0 14px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}
.dps-qs-warn{color:#e8b64c}
.dps-qs-error{margin:0 0 12px;padding:7px 9px;border-radius:7px;color:#f0b4b4;
background:rgba(229,100,106,.14);border:1px solid rgba(229,100,106,.42)}
.dps-qs-actions{display:flex;justify-content:flex-end;gap:8px}
.dps-qs-lines{margin:0 0 14px;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.dps-qs-resume{margin:0 0 8px;padding:8px 10px;border-radius:8px;box-sizing:border-box;max-width:560px;
  background:var(--dsw-alias-bg-elevated,#1b1f2b);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));
  color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;line-height:20px}
.dps-qs-resume-title{margin:0 0 6px;font-weight:600}
.dps-qs-resume-lines{margin:0 0 6px;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.dps-qs-resume-line{white-space:pre-line;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}
.dps-qs-resume-note{margin:0 0 8px;white-space:pre-line}
.dps-qs-resume-note.dps-qs-warn{color:#e8b64c}
.dps-qs-resume-note.dps-qs-error{color:#f0b4b4}
.dps-qs-resume-actions{display:flex;justify-content:flex-end;gap:8px}
`

/** 幂等注入样式（照 dsh-restart-button 的做法：同一 tagId 只插一次）。 */
export function ensureStyle(doc = typeof document === 'undefined' ? null : document) {
  if (doc === null) return
  const tagId = 'dsh-personal-quickstop/quick-stop.css'
  if (doc.querySelector(`style[data-plugin-css="${tagId}"]`)) return
  const tag = doc.createElement('style')
  tag.setAttribute('data-plugin-css', tagId)
  tag.textContent = CSS
  doc.head.appendChild(tag)
}

/**
 * 把浮层挂到 body 门户（`overlayRootFor(LAYERS.modal)`），从而脱出 `#root` 的 transform
 * stacking context、与 better-sidebar 的 body 级面板同场竞技（见文件头 ④）。
 * 门户不可用（headless / 无 document）时**降级为原地渲染** —— 照 project-manage.tsx 的写法，
 * 不抛错（套件就在 jsdom 里跑，这条降级路径也必须能渲染）。
 * @param {{children: any}} props
 */
function OverlayPortal(props) {
  const rootRef = useRef(undefined)
  if (rootRef.current === undefined) rootRef.current = overlayRootFor(LAYERS.modal)
  return rootRef.current !== null ? createPortal(props.children, rootRef.current) : props.children
}

/**
 * 座位里的那颗 pill。文案与 tooltip 全部取需求原文。
 * @param {{onClick: () => void, disabled?: boolean}} props
 */
export function QuickStopPill(props) {
  ensureStyle()
  return (
    <button
      type="button"
      className="dps-qs-btn"
      disabled={props.disabled === true}
      title={QUICK_STOP_TEXTS.tooltip}
      onClick={props.onClick}
    >
      <span>{QUICK_STOP_TEXTS.confirm}</span>
    </button>
  )
}

/**
 * I3 确认框。`plan` 由宿主只读审计产出（`buildStopPlan`）；**确认没有工作**（plan 已拿到且
 * `hasWork === false`）时只展示原文提示，不给"确认"按钮；`plan` 未知（取计划失败）时既不显示
 * 计数也不显示"没有工作"，只显示 error —— 未知 ≠ 没有（见下方分支注释）。
 * @param {{plan: any, busy: boolean, error: string | null, onConfirm: () => void, onCancel: () => void}} props
 */
export function QuickStopDialog(props) {
  ensureStyle()
  const plan = props.plan
  const hasWork = plan?.hasWork === true
  return (
    <OverlayPortal>
    <div className="dps-qs-overlay" role="dialog" aria-modal="true">
      <div className="dps-qs-card" title={QUICKSTOP_SOURCE}>
        <h2 className="dps-qs-title">{QUICK_STOP_TEXTS.title}</h2>
        {hasWork ? (
          <>
            <ul className="dps-qs-counts">
              {(plan?.dialog?.countLines ?? []).map((line, index) => <li key={index}>{line}</li>)}
            </ul>
            <p className="dps-qs-note">{QUICK_STOP_TEXTS.note}</p>
          </>
        ) : plan !== null && plan !== undefined ? (
          // I-B 追加（最小改动，I-D 接线前必需）：**只有拿到计划**才敢说"没有工作"。
          // 计划没拿到（取计划失败 / 404 未接线）时 plan = null ⇒ 此时我们对"有没有在跑的工作"
          // 一无所知，再渲染这句就是在编事实。故未知时**不渲染**该句，只让 error 行说话。
          <p className="dps-qs-note">{QUICK_STOP_TEXTS.noWork}</p>
        ) : null}
        {props.error !== null && props.error !== undefined ? (
          <p className="dps-qs-error">{props.error}</p>
        ) : null}
        <div className="dps-qs-actions">
          <button type="button" className="dps-qs-btn" onClick={props.onCancel} disabled={props.busy === true}>
            <span>{QUICK_STOP_TEXTS.cancel}</span>
          </button>
          {hasWork ? (
            <button type="button" className="dps-qs-btn" onClick={props.onConfirm} disabled={props.busy === true}>
              <span>{QUICK_STOP_TEXTS.confirm}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
    </OverlayPortal>
  )
}

/**
 * I15 结果卡：正常行 + ⚠ 异常行（forced / checkpointIncomplete）。⚠ 行必须**看得见**地分开着色。
 * @param {{summary: any, onDismiss: () => void}} props
 */
export function QuickStopSummary(props) {
  ensureStyle()
  const lines = props.summary?.lines ?? []
  const warnings = lines.filter((line) => typeof line === 'string' && line.startsWith('⚠'))
  const normal = lines.filter((line) => !(typeof line === 'string' && line.startsWith('⚠')))
  return (
    <OverlayPortal>
    <div className="dps-qs-overlay" role="dialog" aria-modal="true">
      <div className="dps-qs-card">
        <ul className="dps-qs-lines">
          {normal.map((line, index) => <li key={index}>{line}</li>)}
          {warnings.map((line, index) => <li key={`w${index}`} className="dps-qs-warn">{line}</li>)}
        </ul>
        <div className="dps-qs-actions">
          <button type="button" className="dps-qs-btn" onClick={props.onDismiss}>
            <span>{DISMISS_LABEL}</span>
          </button>
        </div>
      </div>
    </div>
    </OverlayPortal>
  )
}

/**
 * I13 续接条（需求原文 G13「RESUME EXPERIENCE」）—— **纯展示件**。
 *
 * 它**只**渲染传进来的 `view`（由 `index.tsx` 的 `resumeBarViewFrom` 这个纯函数算出），
 * 自己不做判断、不发请求、不知道续接点是从哪儿来的。这样：
 *   · 版式可被套件用 CSS 选择器逐项钉死（`.dps-qs-resume*` 那几个钩子）；
 *   · "该不该显示 / 能不能点 / 说什么话"全由一个纯函数决定 ⇒ 没有藏在组件里的条件。
 *
 * 为什么**不**用门户（与确认框/结果卡不同）：续接条是会话头工具区的**常驻提示**，
 * 它的位置**就是**座位本身（I1 的 `[快速停止]` 同一区域）；门户会把它从座位里摘出去。
 * 需要门户的只有模态（确认框/结果卡），那里才有遮挡问题。
 *
 * `view === null` ⇒ 什么都不渲染（没被中断过 / 拿不到 sessionId 都是这条路径）。
 * @param {{view: any, onResume: () => void}} props
 */
export function ResumeBar(props) {
  ensureStyle()
  const view = props.view
  if (view === null || view === undefined) return null
  const tone = view.tone === 'warn' ? ' dps-qs-warn' : view.tone === 'error' ? ' dps-qs-error' : ''
  return (
    <div className="dps-qs-resume" role="status" title={QUICKSTOP_SOURCE}>
      <p className="dps-qs-resume-title">{view.title}</p>
      {view.lines.length > 0 ? (
        <ul className="dps-qs-resume-lines">
          {view.lines.map((line, index) => (
            <li key={index} className="dps-qs-resume-line">{line}</li>
          ))}
        </ul>
      ) : null}
      {typeof view.note === 'string' && view.note !== '' ? (
        <p className={`dps-qs-resume-note${tone}`}>{view.note}</p>
      ) : null}
      {view.canResume === true ? (
        <div className="dps-qs-resume-actions">
          <button
            type="button"
            className="dps-qs-btn dps-qs-resume-go"
            disabled={view.busy === true || view.accepted === true}
            onClick={props.onResume}
          >
            <span>{RESUME_TEXTS.continueLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
