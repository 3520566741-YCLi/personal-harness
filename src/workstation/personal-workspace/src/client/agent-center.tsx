// dsh-personal-workspace — Agent Center（V1.2-G · G4b）
//
// 语义：
//   AGENT CENTER = 「我有哪些智能体、每个能干什么、现在能不能用」。
//   **单一数据源**：`dsh-personal-registry`（AGENT_CATALOG，构建期从
//   `personal-agents/registry.json` 打进 bundle）。本视图**不直接 import registry.json**，
//   也不做任何派生缓存 —— 仓库宪法（docs/V1_1_PHASE1_SPEC.md §50）规定 Agent 名称只能有
//   一个出处。
//
// 诚实纪律（本轮最重要的一条）：
//   声明的"智能体"与"已安装可用的 preset"是两件事。**安装状态本视图给不出**（需要宿主半读取
//   ~/.dsh/.agent-presets —— 属 G5）。因此这里**如实显示「安装状态：未检测」**，
//   绝不用"可用"这种未经验证的说法。同理，渲染内核未接线时状态标为"未接线"。
//
// 无第三方依赖：schema 校验用仓库自带的纯函数校验器（schema-validate.mjs 零依赖、可直接进浏览器 bundle）。

import type { ReactNode } from 'react'
import { AGENT_CATALOG, type AgentMeta } from '../../../personal-registry/src/index'

export const CSS_AGENT_CENTER = String.raw`
.dac-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);}
.dac-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dac-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.6;}
.dac-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
.dac-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.dac-name{font:var(--dsw-font-s-strong-14,600 14px);color:var(--dsw-alias-label-primary,#e8e8ec);}
.dac-en{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);}
.dac-tag{color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);line-height:1.6;}
.dac-badge{font:var(--dsw-font-xxxs-strong-11,600 11px);border-radius:4px;padding:1px 6px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));flex:none;}
.dac-badge.active{color:#8fd18f;border-color:rgba(120,200,120,.5);}
.dac-badge.preview{color:#e8c46a;border-color:rgba(230,190,90,.5);}
.dac-badge.planned{color:#9a9aa5;}
.dac-badge.blocked{color:#ffb0b0;border-color:rgba(235,90,90,.5);}
.dac-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dac-sec{display:flex;flex-direction:column;gap:4px;}
.dac-chips{display:flex;flex-wrap:wrap;gap:4px;}
.dac-chip{font:var(--dsw-font-xxxs-11,11px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:999px;padding:1px 8px;color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dac-flow{display:flex;flex-wrap:wrap;gap:4px;align-items:center;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);}
.dac-flow .sep{color:var(--dsw-alias-label-dimmed,#8f8f99);}
.dac-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.6;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dac-warn{border-left-color:rgba(235,150,60,.6);}
.dac-err{border-left-color:rgba(235,90,90,.65);color:#ffb4b4;}
.dac-row{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dac-row .k{color:var(--dsw-alias-label-tertiary,#9a9aa5);}
`

const STATUS_LABEL: Record<string, string> = {
  active: '已纳入',
  preview: '预览',
  planned: '已规划',
  blocked: '受阻',
}

export function AgentCenterView(): ReactNode {
  // 单一数据源：全部 agent（两族共存）。专业智能体在前（personal-registry 已排序）。
  const agents: AgentMeta[] = AGENT_CATALOG
  const proCount = agents.filter((a) => a.professional).length

  return (
    <div className="dac-root" data-dsh-plugin="dsh-personal-workspace" data-dac-agent-center="1">
      <h2 className="dac-h">智能体</h2>
      <p className="dac-sub" data-dac-summary="1">
        共 {agents.length} 个智能体，其中 <strong>{proCount}</strong> 个专业智能体。每个智能体由官方 Agent Preset
        承载（目录 = <code>~/.dsh/.agent-presets/&lt;id&gt;/</code>）；专业智能体的技能包随 preset 目录自带。
      </p>

      {agents.length === 0 && (
        <div className="dac-note dac-err" data-dac-registry-empty="1">
          数据源（personal-registry）返回空目录 —— 宿主控制台应有 `[personal-registry] agents catalog empty` 告警。
          本视图不编造条目。
        </div>
      )}

      {agents.map((a) => (
        <section key={a.id} className="dac-card" data-dac-agent={a.id} data-dac-professional={a.professional ? '1' : '0'}>
          <div className="dac-top">
            <span className="dac-name">{a.zh}</span>
            <span className="dac-en">{a.name}</span>
            {a.status && (
              <span className={`dac-badge ${a.status}`} data-dac-status={a.status}>
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            )}
            {!a.professional && <span className="dac-badge planned" data-dac-kind="persona">人格预设</span>}
          </div>

          {a.tagline && <div className="dac-tag">{a.tagline}</div>}
          {!a.tagline && a.description && <div className="dac-tag">{a.description}</div>}

          <div className="dac-row">
            <span className="k">Preset</span>
            <span data-dac-preset={a.presetId}>{a.presetId}</span>
            {a.skillPack && (
              <>
                <span className="k">技能包</span>
                <span data-dac-skill-pack="1">{a.skillPack}/（随 preset 目录自带）</span>
              </>
            )}
            <span className="k">安装状态</span>
            {/* 诚实：本视图（客户端）读不到 ~/.dsh/.agent-presets —— 那是宿主半能力。
                故一律显示"未检测"，绝不用"已安装/可用"这种未经验证的说法。 */}
            <span data-dac-install-state="unknown">未检测（客户端无文件系统；由宿主半查询）</span>
          </div>

          {a.capabilities && a.capabilities.length > 0 && (
            <div className="dac-sec">
              <span className="dac-k">能做</span>
              <div className="dac-chips">
                {a.capabilities.map((c) => <span key={c} className="dac-chip">{c}</span>)}
              </div>
            </div>
          )}

          {a.workflow && a.workflow.length > 0 && (
            <div className="dac-sec">
              <span className="dac-k">工作流</span>
              <div className="dac-flow">
                {a.workflow.map((s, i) => (
                  <span key={s}>
                    {i > 0 && <span className="sep"> → </span>}
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {a.renderers && a.renderers.length > 0 && (
            <div className="dac-sec" data-dac-renderers="1">
              <span className="dac-k">渲染路径</span>
              {a.renderers.map((r) => (
                <div key={r.path} className="dac-row" data-dac-renderer={r.path}>
                  <span className="k">路径 {r.path}</span>
                  <span>{r.kernel} —— {r.nature}{r.needsDependency ? '（需在插件声明依赖）' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {a.guarantees && a.guarantees.length > 0 && (
            <div className="dac-sec">
              <span className="dac-k">纪律</span>
              {a.guarantees.map((g) => <div key={g} className="dac-sub">· {g}</div>)}
            </div>
          )}

          {/* 实现进度如实标注（只对专业智能体；人格预设没有"接线"这回事） */}
          {a.professional && (
            <div className="dac-note dac-warn" data-dac-progress={a.id}>
              当前进度：技能包、叙事契约、校验器、8 套风格与 preset 源已就绪；**渲染内核与 QA 层尚未接线**
              —— 现在可以对它做研究、叙事结构与 storyboard，但还不能交付 .pptx。
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
