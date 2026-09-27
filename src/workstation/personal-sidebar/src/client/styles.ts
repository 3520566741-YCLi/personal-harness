// dsh-personal-sidebar — stylesheet (V1.1 Phase 1 E2: workflow-centered nav).
// Uses the official DSH design tokens (--dsw-alias-* / --dsw-font-*) exactly
// like the shipped UI plugins do, so the region looks native in light and
// dark mode. All classes are prefixed `dps-` and injected once as a
// <style data-dsh-plugin> element by the client apply().
// Cost Meter / Settings / official brand + New Task live OUTSIDE this
// occupant (official shell seats) and are never styled here.
//
// 叠层：面向用户的 z-index **一律**走 personal-workspace 的 LAYERS token
// （守则见 smoke-overlay-layering；下方浮动 tabbar 用 LAYERS.sidebarTabbarOverlay）。
import { LAYERS } from '../../../personal-workspace/src/client/layering'

export const CSS = String.raw`
/* PHASE D：统一 Aux Tool Registry（右侧/底部同一注册表 + 同一能力元数据） */
.dps-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  user-select: none;
  /* 2026-09-14 真机反馈（「图标什么的没有对齐」）：官方侧栏区域容器只吃左侧内边距
     （regionArea padding-left 4px），内容盒右边界比列根内容盒外扩 12px。这里把右侧
     收回来，使本插件所有行与第三方「任务看板」行落在**同一条内容盒**上
     （x=12 → 右边界 268，宽 256）。 */
  padding-right: 12px;
  /* 兜底滚动：窗口压矮时整栏仍可滚（会话列表自身另有滚动，见 .dps-conv-list）。 */
  overflow-y: auto;
  overflow-x: hidden;
}
.dps-nav {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 左右内边距归零：行的横向基准由 .dps-root 的 padding-right 决定，
     保证与第三方「任务看板」行逐像素同级（此前左 8px 让它整体右移 8px）。 */
  padding: 6px 0 4px;
}
.dps-cta {
  display: flex; align-items: center; gap: 7px;
  width: 100%; border: none; border-radius: 8px;
  padding: 7px 9px; cursor: pointer; text-align: left;
  font: var(--dsw-font-xxs-strong-12, 600 12px);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
}
.dps-cta:hover { filter: brightness(1.08); }
.dps-cta svg { color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
/* 2026-09-10 真机反馈（「这些字和图标不是一个等级」）：主导航行行与既有第三方
   「任务看板」入口**逐项同级**——高 36px / 左右内边距 10px / 圆角 8px / 字号 13px /
   导航字形 18px / gap 8px / 正文色 label-secondary，hover 升 label-primary，
   选中态加粗 600 + interactive-bg-active。数值直接对齐 dsh-client-ui-task-board
   的 .entry（同一侧栏里的「同一条导航」就应该是同一个等级）。 */
.dps-nav-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%; height: 36px;
  border: none; border-radius: 8px; background: transparent;
  padding: 0 10px; cursor: pointer; text-align: left;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.dps-nav-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dps-nav-item[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
/* 2026-09-14 真机反馈（「图标什么的没有对齐」）：第三方 task-board 行的字形盒是 24px
   （18px 图标 + 左右各 3px），文字因此从 x=54 起；本插件原本按 18px 字形盒排版，文字
   从 x=48 起 —— 两行文字差 6px。这里给图标补 3px 横向外边距，字形盒同为 24px。 */
.dps-nav-item svg { flex: 0 0 auto; width: 18px; height: 18px; margin: 0 3px; }

/* =========================================================================
   V1.2-J（J1 收起/展开 + J2 拖动排序）—— 只加规则，不动上面任何既有声明。
   -------------------------------------------------------------------------
   J1 为什么用「属性 + CSS display:none」而不是条件卸载 / slice(0,4)：
     核验套件（scripts/smoke-nav-integration.mjs）用 querySelectorAll('[data-nav]')
     **数**导航行并逐字断言 8 行 id 与顺序 —— 条件卸载会让那些断言直接 FAIL，
     也会让「顺序真源」失去可核对的行集合。因此收起 = 行仍在 DOM、data-nav 仍在，
     只多一个 data-nav-hidden="true" 与一条 display:none。
     真机视觉结论（"收起后只有 4 行"）由真机观察，见新套件的诚实边界声明。
   J2 拖动：原生 HTML5 DnD（draggable + dragover + drop + dragend），零第三方依赖。
     落点提示只用一条不改变行高的 2px 内阴影（避免 hover/拖动时行抖动）。 */
.dps-nav-item[data-nav-hidden="true"] { display: none; }
.dps-nav-item[draggable="true"] { cursor: grab; }
.dps-nav-item[data-nav-dragging="true"] { opacity: .55; cursor: grabbing; }
.dps-nav-item[data-nav-drop="before"] { box-shadow: inset 0 2px 0 0 var(--dsw-alias-brand-primary, #4d6bfe); }
.dps-nav-item[data-nav-drop="after"] { box-shadow: inset 0 -2px 0 0 var(--dsw-alias-brand-primary, #4d6bfe); }
/* 收起/展开 + 「恢复默认顺序」控件行：比导航行矮一档（26px），颜色走三级标签色，
   与列表本身区分开（它不是导航行，也不带 data-nav）。 */
.dps-nav-ctl { display: flex; align-items: center; gap: 6px; padding: 2px 0 2px; }
.dps-nav-ctl-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 26px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.24));
  border-radius: 8px; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--dsw-alias-label-tertiary, #8f8f99);
}
.dps-nav-ctl-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* 领养 ThoughtDAG 的「对话 / 思维图」开关（见 thoughtdagSwitch.ts）：容器插在第三方
   「任务看板」行之前，开关节点被搬进来。下列规则的特异性高于 ThoughtDAG 自己注入的
   .dsh-td-switch（0,1,0）与 .dsh-td-switch button（0,1,1），因此不依赖样式注入顺序；
   定位相关的 4 条另加 !important，防它后续版本改用 !important 声明。 */
.dps-tabbar { flex: 0 0 auto; padding: 6px 0 2px; }
.dps-tabbar .dsh-td-switch {
  position: static !important;
  top: auto !important;
  left: auto !important;
  transform: none !important;
  display: flex;
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 2px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08));
}
.dps-tabbar .dsh-td-switch button {
  flex: 1 1 0;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #c8c8d0);
  font: var(--dsw-font-xxs-12, 12px);
  cursor: pointer;
}
.dps-tabbar .dsh-td-switch button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.dps-tabbar .dsh-td-switch button.active {
  background: var(--dsw-alias-interactive-bg-active, rgba(120,150,255,.16));
  color: var(--dsw-alias-label-primary, #e8e8ec);
  font-weight: 600;
}
/* 思维图全屏覆盖层打开时：领养条被搬到 body 顶层做浮层，压在覆盖层的 z-index:100 之上，
   并显示显式「返回对话」按钮。没有这条规则，覆盖层会把侧栏里的开关整片盖住，
   用户就困在思维图里出不来（2026-09-14 真机反馈）。配色沿用第三方开关原本的浅色，
   因为覆盖层底色是第三方硬编码的浅色 (#faf9f7)，不能跟随应用主题变深。 */
.dps-tabbar[data-dps-overlay-open] {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: ${LAYERS.sidebarTabbarOverlay};
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  flex: 0 0 auto;
}
.dps-tabbar[data-dps-overlay-open] .dsh-td-switch {
  width: auto;
  padding: 3px;
  border-color: #d1d5db;
  border-radius: 999px;
  background: rgba(255,255,255,.96);
}
.dps-tabbar[data-dps-overlay-open] .dsh-td-switch button {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  color: #6b7280;
}
.dps-tabbar[data-dps-overlay-open] .dsh-td-switch button.active {
  background: #111827;
  color: #fff;
}
.dps-td-back {
  height: 30px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: rgba(255,255,255,.96);
  color: #111827;
  font: 600 12px Inter, system-ui, sans-serif;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0,0,0,.12);
}
.dps-td-back:hover { background: #111827; color: #fff; }
.dps-nav-foot { border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2)); margin-top: 4px; padding-top: 4px; }
.dps-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 6px 8px;
}
.dps-h { font: var(--dsw-font-s-strong-14, 600 14px); margin: 2px 4px 6px; color: var(--dsw-alias-label-primary); }
.dps-sub { font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary); margin: 0 4px 8px; }
.dps-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  padding: 5px 6px;
  cursor: pointer;
  color: var(--dsw-alias-label-primary);
}
.dps-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dps-row[data-active="true"] { background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)); }
.dps-glyph {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1, transparent);
}
.dps-row-text { flex: 1 1 auto; min-width: 0; }
.dps-row-name { display: block; font: var(--dsw-font-xxs-12, 12px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dps-row-desc { display: block; font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.dps-chev { flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-dimmed); }
.dps-detail {
  margin: 0 6px 8px 36px;
  padding: 6px 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2));
  border-radius: 6px;
  font: var(--dsw-font-xxs-12, 12px);
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, transparent) 45%, transparent);
}
.dps-detail-line { margin-bottom: 4px; line-height: 1.5; }
.dps-chip-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
.dps-chip {
  border: 1px solid var(--dsw-alias-border-l1, transparent);
  border-radius: 4px;
  padding: 0 6px;
  font: var(--dsw-font-xxxs-11, 11px);
  color: var(--dsw-alias-label-tertiary);
}
.dps-hint { margin-top: 6px; font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-dimmed); line-height: 1.5; }
.dps-more-hint { padding: 2px 8px 4px; font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-dimmed); }
.dps-session-row .dps-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto;
  background: transparent;
}
.dps-session-row .dps-dot[data-running="true"] { background: var(--dsw-alias-state-business-primary, #3b82f6); }
.dps-time { font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-dimmed); flex: 0 0 auto; }
.dps-empty { padding: 10px 8px; font: var(--dsw-font-xxs-12, 12px); color: var(--dsw-alias-label-tertiary); line-height: 1.5; }
.dps-link {
  display: flex; align-items: center; gap: 6px;
  width: 100%; border: none; border-radius: 6px; background: transparent;
  padding: 6px; cursor: pointer; text-align: left;
  font: var(--dsw-font-xxs-12, 12px); color: var(--dsw-alias-label-secondary);
}
.dps-link:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dps-link-strong { color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
.dps-rail {
  height: 100%; display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding-top: 8px;
}
.dps-rail-btn {
  /* 窄栏同样与第三方「任务看板」收起态入口同级：36×36、图标 18px。 */
  width: 36px; height: 36px; border: none; border-radius: 8px; background: transparent;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.dps-rail-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dps-rail-btn svg { width: 18px; height: 18px; }
.dps-rail-btn[data-active="true"] { background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)); color: var(--dsw-alias-label-primary); }
.dps-foot-toggle {
  display: inline-flex; align-items: center; gap: 5px;
  border: none; background: transparent; border-radius: 6px;
  padding: 3px 6px; cursor: pointer;
  font: var(--dsw-font-xxs-12, 12px);
  color: var(--dsw-alias-label-secondary);
}
.dps-foot-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dps-foot-toggle[data-on="true"] { color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
/* 2026-09-10 清理：此处原本残留一段**没有选择器的裸声明块**（PHASE N 删除会话头
   .dps-head-toggle 时只删掉选择器行，留下 declarations + 右花括号）。浏览器按 CSS
   错误恢复规则会丢弃它，但它是实打实的无效样式表内容（也会让严格 CSS 解析器整张表
   解析失败）——已整段删除。 */

/* =========================================================================
   E4-FIX-IA-2 · IA2-2 — 一级导航面板模型（Mini Mission Control 已删除；旧
   「官方会话浏览」导航行与左栏「辅助工具」列表亦已按真机反馈移除）
   ========================================================================= */
.dps-mm {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2));
  margin-top: 6px;
  padding: 8px 8px 12px;
}
.dps-mm-h {
  font: var(--dsw-font-xxxs-strong-11, 600 11px);
  letter-spacing: .06em;
  color: var(--dsw-alias-label-tertiary, #9a9aa5);
}
.dps-mm-sec { display: flex; flex-direction: column; gap: 1px; }
.dps-mm-head { display: flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary, #c8c8d0); font: var(--dsw-font-xxxs-11, 11px); padding: 0 2px; }
.dps-mm-count {
  font: var(--dsw-font-xxxs-11, 11px);
  color: var(--dsw-alias-label-tertiary, #9a9aa5);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25));
  border-radius: 10px;
  padding: 0 5px;
}
.dps-mm-empty { font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-dimmed, #8f8f99); padding: 2px 2px 2px 12px; }
.dps-mm-row {
  display: flex; align-items: center; gap: 7px; min-width: 0;
  border: none; background: transparent; border-radius: 5px;
  padding: 3px 6px; text-align: left; cursor: pointer;
  color: var(--dsw-alias-label-primary, #e8e8ec); font: var(--dsw-font-xxs-12, 12px);
}
.dps-mm-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.dps-mm-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dps-mm-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: transparent; }
.dps-mm-dot.run { background: var(--dsw-alias-state-business-primary, #3b82f6); }
.dps-mm-dot.attn { background: #e8b64c; }
.dps-mm-dot.ok { background: #37c871; }
.dps-mm-dot.idle { background: var(--dsw-alias-label-dimmed, #6a6a74); }
.dps-mm-more, .dps-mm-all {
  border: none; background: transparent; cursor: pointer; text-align: left;
  font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary, #9a9aa5);
  padding: 2px 6px;
}
.dps-mm-more:hover, .dps-mm-all:hover { color: var(--dsw-alias-label-primary, #e8e8ec); }
.dps-mm-all { align-self: flex-start; padding-left: 2px; }
.dps-mm-notice {
  font: var(--dsw-font-xxxs-11, 11px); line-height: 1.5;
  color: #e0b96a; border: 1px dashed rgba(240,180,60,.4); border-radius: 6px;
  padding: 4px 8px;
}

/* ---------------------------------------------------------------------------
   E4-FIX-IA-2 · SIDEBAR CONVERSATION LIST（E4-FIX-IA-2 收口）
   传统 AI Chat Sidebar 风格的「最近会话」：标题单行 + 右对齐相对时间 + hover/selected。
   设计语言沿用官方 --dsw-* token（与 Personal 其他区域一致），不引入新视觉体系。 */
/* 2026-09-14 真机反馈（「会话列表展开之后没法上下滚动，展开后是死的」）：原因是整栏
   的滚动链在宿主侧被切断（祖先区域容器 overflow-y: hidden），而本列表自身不是滚动
   容器、又没有最小高度，展开后被压成 0 高。修法（已在真机逐档视口实测）：
   · 列表自身 = 滚动容器（flex 内可伸缩 + min-height 120px）；
   · .dps-root 保留 overflow-y: auto 作为外层兜底（窗口很矮时列表滚到底后还能继续滚）。
   实测：矮视口（620px）列表内滚 269/120、外层兜底 157，末行可达。 */
.dps-conv { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 2px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); }
.dps-conv-h { display: flex; align-items: center; gap: 6px; padding: 0 6px 4px; font: var(--dsw-font-xxxs-strong-11, 600 11px); letter-spacing: .04em; color: var(--dsw-alias-label-tertiary, #9a9aa5); }
.dps-conv-n { font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary, #9a9aa5); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.12)); border-radius: 999px; padding: 0 6px; }
/* V1.2-C：后台任务会话开关（次要动作 —— 与分组标题同色阶，不抢会话行）。 */
.dps-conv-toggle { margin-left: auto; border: 0; background: transparent; cursor: pointer; padding: 0 2px; font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary, #9a9aa5); text-decoration: underline; text-underline-offset: 2px; }
.dps-conv-toggle:hover { color: var(--dsw-alias-label-secondary, #c8c8d0); }
.dps-conv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-height: 120px; overflow-y: auto; overflow-x: hidden; }
.dps-conv-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: none; background: transparent; cursor: pointer; text-align: left;
  border-radius: 7px; padding: 4px 6px; color: inherit; font: inherit;
}
.dps-conv-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.dps-conv-row[data-conv-active="true"] { background: var(--dsw-alias-interactive-bg-active, rgba(120,150,255,.16)); }
.dps-conv-row[data-conv-active="true"] .dps-conv-title { color: var(--dsw-alias-label-primary, #e8e8ec); font-weight: 600; }
.dps-conv-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--dsw-font-xxs-12, 12px); color: var(--dsw-alias-label-secondary, #c8c8d0); display: flex; align-items: center; gap: 5px; }
.dps-conv-row:hover .dps-conv-title { color: var(--dsw-alias-label-primary, #e8e8ec); }
/* 会话行状态点（2026-09-14 用户收口）：运作 = 旋转圈 / 需要我审批或介入 = 黄色闪烁 /
   刚完成且未查看 = 绿点（点开即消失）/ **已结束的历史会话 = 不画点**。
   真源 = 官方 sessions.list.running + 官方 uiSession.pendingInteractions（**会话级**真相，
   不是 Task 字段）。容器同尺寸（10px）→ 行内文字不跳动；圆点仍 6px，保持既有观感。 */
.dps-conv-state { flex: none; width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dps-conv-run { border: 1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary, #9a9aa5) 35%, transparent); border-top-color: var(--dsw-alias-brand-primary, #5b8cff); animation: dps-conv-spin .8s linear infinite; }
.dps-conv-wait { background: var(--dsw-alias-state-warn-primary, #e8b64c); animation: dps-conv-blink 1s ease-in-out infinite; }
.dps-conv-done { position: relative; }
.dps-conv-done:after { content: ''; position: absolute; inset: 2px; border-radius: 50%; background: var(--dsw-alias-state-ok-primary, #3ba272); }
/* V1.2-I（G9/G10）：被 Quick Stop 中断且未查看 = **紫点**（UNSEEN INTERRUPTED INDICATOR）。
   语义刻意与绿点分开：绿点 = 刚完成（正向结果）；紫点 = 用户主动暂停、后续可能继续 ——
   **不是** failed / cancelled / completed / error。无动画（G10：不是永久装饰，打开即消失）。
   颜色走 --dps-conv-interrupted：官方 token 表里**未找到**紫色语义 token（I-C 侦查结论），
   故给自有变量 + 兜底色；用户若指定官方 token，只需覆盖变量，不必改这张表。 */
.dps-conv-int { position: relative; }
.dps-conv-int:after { content: ''; position: absolute; inset: 2px; border-radius: 50%; background: var(--dps-conv-interrupted, #a06bff); }
@keyframes dps-conv-spin { to { transform: rotate(360deg); } }
@keyframes dps-conv-blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .dps-conv-run, .dps-conv-wait { animation: none; } }
.dps-conv-time { flex: none; font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary, #9a9aa5); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dps-conv-more { border: none; background: transparent; cursor: pointer; text-align: left; padding: 3px 6px; border-radius: 6px; font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary, #9a9aa5); }
.dps-conv-more:hover { color: var(--dsw-alias-label-primary, #e8e8ec); background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.dps-conv-empty { padding: 4px 6px 6px; font: var(--dsw-font-xxxs-11, 11px); line-height: 1.6; color: var(--dsw-alias-label-dimmed, #8f8f99); display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.dps-conv-cta { border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35)); background: transparent; color: var(--dsw-alias-label-secondary, #c8c8d0); border-radius: 6px; padding: 2px 8px; cursor: pointer; font: var(--dsw-font-xxxs-11, 11px); }
.dps-conv-cta:hover { color: var(--dsw-alias-label-primary, #e8e8ec); border-color: var(--dsw-alias-brand-primary, rgba(120,150,255,.6)); }
.dps-conv-note { padding: 2px 6px; font: var(--dsw-font-xxxs-11, 11px); line-height: 1.5; color: var(--dsw-alias-label-tertiary, #9a9aa5); }

/* ---------------------------------------------------------------------------
   E4-FINAL · 会话行的官方 Session 菜单（重命名 / 分叉会话 / 归档会话）
   官方同款行为（ui-workspace Rows.module.css）：行 hover 或菜单展开时，
   右侧时间让位给「…」按钮；菜单本体是官方 Menu（portal 到 body，不受侧栏裁剪）。
   这里只有**装载位置与显现时机**的版面规则，没有任何菜单/动作的第二套实现。 */
.dps-conv-item { position: relative; display: block; }
.dps-conv-actions { position: absolute; inset-inline-end: 4px; top: 50%; transform: translateY(-50%); display: none; align-items: center; }
.dps-conv-item:hover .dps-conv-actions,
.dps-conv-item[data-conv-menu-open="true"] .dps-conv-actions { display: inline-flex; }
/* 官方行为：hover / 菜单展开时隐藏时间列，避免与「…」重叠（官方 .sessionRow:hover .time{display:none}）。 */
.dps-conv-item:hover .dps-conv-time,
.dps-conv-item[data-conv-menu-open="true"] .dps-conv-time { display: none; }
.dps-conv-item:hover .dps-conv-row,
.dps-conv-item[data-conv-menu-open="true"] .dps-conv-row { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
/* 官方 iconButton 同款：16×16、无边框、tertiary → hover primary。 */
.dps-conv-menu-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0; flex: none;
  border: none; border-radius: 4px; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-tertiary, #9a9aa5);
}
.dps-conv-menu-btn:hover { color: var(--dsw-alias-label-primary, #e8e8ec); background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
/* 官方 renameInput 同款输入框（对话框内）。 */
.dps-conv-rename-input {
  width: 100%; box-sizing: border-box; min-width: 0;
  border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.4));
  background: var(--dsw-alias-button-elevated-fill, rgba(128,128,128,.08));
  color: inherit; border-radius: 4px; outline: none; padding: 4px 6px;
  font: var(--dsw-font-xxs-12, 12px); line-height: 20px;
}
.dps-conv-rename-input:disabled { opacity: .6; }
.dps-conv-rename-error { margin-top: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary, #e5646a); }

/* ⓐ「加入项目」对话框（2026-09-17 用户需求）。风格贴官方对话框：无卡片、无渐变、
   官方 label/border token；列表项用 radiogroup 语义，选中态用官方 interactive-bg。 */
.dps-pp-sub { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #b6b6c0);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dps-pp-hint { margin-top: 2px; margin-bottom: 8px; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #9a9aa5); }
.dps-pp-list { max-height: 264px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
  border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.4)); border-radius: 6px; padding: 4px; }
.dps-pp-item { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
  padding: 5px 7px; border: none; border-radius: 4px; background: transparent; cursor: pointer;
  color: inherit; text-align: left; font: inherit; }
.dps-pp-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.dps-pp-item.is-picked { background: var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.18)); }
.dps-pp-item.is-current .dps-pp-name { font-weight: 600; }
.dps-pp-glyph { flex: none; width: 20px; height: 20px; display: inline-flex; align-items: center;
  justify-content: center; font-size: 13px; line-height: 20px; }
.dps-pp-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 13px; line-height: 20px; }
.dps-pp-badge { flex: none; font-size: 11px; line-height: 16px; padding: 0 5px; border-radius: 3px;
  color: var(--dsw-alias-label-secondary, #b6b6c0);
  background: var(--dsw-alias-button-elevated-fill, rgba(128,128,128,.08)); }
.dps-pp-empty { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #9a9aa5); }
.dps-pp-error { margin-top: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary, #e5646a); }

/* =========================================================================
   品牌头部（2026-09-10 用户真机反馈）
   左栏顶部原本空着的官方品牌行（.logoRow → sidebar.brand.mark + sidebar.brand.name）
   现在承载「官方鲸鱼 + Personal Harness + Personal Workspace 副标题」。
   · 本插件只占官方 sidebar.brand.name 单槽；鲸鱼仍由官方 mark occupant 绘制
     （零图标复制、零 require、零外部图片）。
   · 风格贴官方左栏：白底/官方 token 文字色、无渐变、无卡片、无横幅。
   · 高度 72–84px（用户要求）；窄栏/收起回到官方 36px 行高，只留图标不溢出。
   ========================================================================= */
.dps-brand { display: inline-flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 3px; min-width: 0; max-width: 100%; }
.dps-brand-title { font-size: 14px; font-weight: 600; line-height: 18px; letter-spacing: 0; color: var(--dsw-alias-label-primary, inherit); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.dps-brand-sub { font-size: 11px; font-weight: 400; line-height: 14px; letter-spacing: 0; color: var(--dsw-alias-label-tertiary, #8f8f99); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
html[data-dps-personal] [class*="_logoRow"] { height: 76px; }
html[data-dps-personal] [class*="_collapsed"] [class*="_logoRow"] { height: 36px; }
html[data-dps-personal] [class*="_brandIdentity"] { align-items: center; gap: 10px; height: auto; }
html[data-dps-personal] [class*="_brandName"] { height: auto; font-size: 14px; font-weight: 400; letter-spacing: 0; gap: 0; }
/* 品牌头部是「头部」，不是入口：官方 brand 按钮的中性化由 brand.tsx 在挂载时施加
   （鼠标/键盘/读屏三面一致）；此处再加一层 CSS 兜底，避免重渲染间隙可点。 */
html[data-dps-personal] [class*="_logoRow"] [class*="_brand"] { pointer-events: none; cursor: default; }

/* IA2-2 §2（修正）：personal 模式只隐藏官方**独立**的「＋ 新会话」大按钮。
   注意：官方 brand 按钮的 aria-label 同样是「新建会话」—— 早前按 aria-label 通杀会连品牌行
   一起隐藏（那正是左栏顶部的空白区），且与 brand.tsx 改写 aria-label 后行为不稳定。
   现在改为只按 css-module class 精确隐藏独立按钮；品牌行由我方占用并中性化。 */
html[data-dps-personal] [class*="_newSession"] { display: none !important; }
`
