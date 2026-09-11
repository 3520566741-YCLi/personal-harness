// dsh-personal-sidebar — stylesheet (V1.1 Phase 1 E2: workflow-centered nav).
// Uses the official DSH design tokens (--dsw-alias-* / --dsw-font-*) exactly
// like the shipped UI plugins do, so the region looks native in light and
// dark mode. All classes are prefixed `dps-` and injected once as a
// <style data-dsh-plugin> element by the client apply().
// Cost Meter / Settings / official brand + New Task live OUTSIDE this
// occupant (official shell seats) and are never styled here.

export const CSS = String.raw`
/* PHASE D：统一 Aux Tool Registry（右侧/底部同一注册表 + 同一能力元数据） */
.dps-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  user-select: none;
}
.dps-nav {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px 4px;
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
.dps-nav-item svg { flex: 0 0 auto; width: 18px; height: 18px; }
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
.dps-conv { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); }
.dps-conv-h { display: flex; align-items: center; gap: 6px; padding: 0 6px 4px; font: var(--dsw-font-xxxs-strong-11, 600 11px); letter-spacing: .04em; color: var(--dsw-alias-label-tertiary, #9a9aa5); }
.dps-conv-n { font: var(--dsw-font-xxxs-11, 11px); color: var(--dsw-alias-label-tertiary, #9a9aa5); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.12)); border-radius: 999px; padding: 0 6px; }
.dps-conv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
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
.dps-conv-run { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-ok-primary, #3ba272); }
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
