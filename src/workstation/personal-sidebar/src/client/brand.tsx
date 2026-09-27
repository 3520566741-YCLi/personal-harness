// dsh-personal-sidebar — Personal 模式左侧栏「品牌头部」（official `sidebar.brand.name` seat）。
//
// 用户要求（2026-09-10 真机反馈）：
//   把自定义左栏**顶部的空白区域**做成简洁品牌头部 = 官方鲸鱼图标 + 主标题「Personal Harness」
//   + 小号灰色副标题「Personal Workspace · V<版本> (Beta)」；白底、克制、不做横幅/渐变/卡片；
//   图标与两行文字垂直居中；品牌区高度约 72–84px；窄栏/收起时只留图标、不得溢出。
//
// 实现方式（复用官方能力，零复制、零外部图片）：
//   · 这一片空白**本身就是官方侧栏的品牌行**（`ui-sidebar` 的 `.logoRow` →
//     `sidebar.brand.mark` + `sidebar.brand.name`）。它之所以空着，是因为 IA2-2 为消除
//     「第二份新会话入口」用 CSS 隐藏了该行的按钮（其 aria-label = 新建会话）。
//   · 因此这里**只占用 `sidebar.brand.name` 这一个官方单槽**（personal 模式挂载、官方模式卸载，
//     与 `sidebar.workspaces` 同一生命周期模型），官方 `sidebar.brand.mark` **保持原样** ——
//     鲸鱼图标由官方 occupant 自己绘制（`@deepseek-ai/dsh-client-ui-primitives` 的 FishLogo），
//     本插件不复制图标数据、不 require 官方内部模块、不引入任何外部图片。
//   · 官方行的 flex（`align-items:center`）负责「图标与两行文字垂直居中」；
//     窄栏（collapsed）时官方根本不渲染 brand 按钮、只在折叠按钮里渲染 mark → 自动「只留图标」。
//
// 边界（故意为之，验收报告写明）：
//   · 官方 brand 按钮在官方语义里是「新建会话」按钮。品牌头部不应是带副作用的一次性入口 →
//     本组件挂载时把该按钮中性化（tabindex=-1 / aria-label 改为品牌名 / pointer-events:none /
//     cursor:default），卸载时**逐项还原**（含原始 aria-label）。不改官方结构、不删官方节点。
//   · 「新会话」功能本身未被改动：官方独立的新会话按钮仍按 IA2-2 保持隐藏（见 styles.ts）。

import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

// 版本由 build.mjs 注入：__DPS_VERSION__ = 组件版本（package.json version）；
//   __PRODUCT_NAME__ / __PRODUCT_VERSION__ = **产品**版本（personal-version/product.json 单一事实源）。
//   语义分离（E5-3）：UI 优先显示**产品**版本；组件版本只用于 Debug/诊断，**绝不**冒充产品版本。
declare const __DPS_VERSION__: string
declare const __PRODUCT_NAME__: string
declare const __PRODUCT_VERSION__: string

const FALLBACK_VERSION = '0.1.24'
const FALLBACK_PRODUCT_NAME = 'Personal Harness'
const FALLBACK_PRODUCT_VERSION = 'V1.2'

/** 品牌主标题（用户指定文案）。 */
export const BRAND_TITLE = 'Personal Harness'

/** 产品名（如 `Personal Harness`）。 */
export function productName(): string {
  return typeof __PRODUCT_NAME__ === 'string' && __PRODUCT_NAME__.length > 0 ? __PRODUCT_NAME__ : FALLBACK_PRODUCT_NAME
}

/** 产品版本（如 `V1.1`）。 */
export function productVersion(): string {
  return typeof __PRODUCT_VERSION__ === 'string' && __PRODUCT_VERSION__.length > 0 ? __PRODUCT_VERSION__ : FALLBACK_PRODUCT_VERSION
}

/** 品牌副标题 = **产品**版本语义（不是组件版本；组件版本见诊断面板/Inspector）。 */
export function brandSubtitle(): string {
  return `${productName()} · ${productVersion()}`
}

/** 当前构建的**组件**版本（sidebar 包版本；注入缺失时回落已知版本，绝不显示 undefined）。 */
export function brandVersion(): string {
  return typeof __DPS_VERSION__ === 'string' && __DPS_VERSION__.length > 0 ? __DPS_VERSION__ : FALLBACK_VERSION
}

/**
 * 官方 brand 按钮中性化：把「新建会话」按钮变成纯品牌头部（鼠标/键盘/读屏三面一致）。
 * 卸载时逐项还原，官方 shell 不残留我方痕迹。
 */
function useBrandNeutralizer(): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const btn = ref.current?.closest('button') ?? null
    if (btn === null) return
    const prevLabel = btn.getAttribute('aria-label')
    const prevTab = btn.getAttribute('tabindex')
    const prevTitle = btn.getAttribute('title')
    const prevPointer = btn.style.pointerEvents
    const prevCursor = btn.style.cursor
    // aria-label 必须如实：这里是品牌区，不是「新建会话」（否则读屏会播报一个假入口）。
    //   读屏文案 = 品牌名 + **产品**版本 + **组件**版本（后者仅用于排障核对，不是产品版本）。
    btn.setAttribute('aria-label', `${BRAND_TITLE}｜${brandSubtitle()}（sidebar ${brandVersion()}）`)
    btn.setAttribute('tabindex', '-1')
    btn.removeAttribute('title')
    btn.style.pointerEvents = 'none'
    btn.style.cursor = 'default'
    return () => {
      if (prevLabel === null) btn.removeAttribute('aria-label')
      else btn.setAttribute('aria-label', prevLabel)
      if (prevTab === null) btn.removeAttribute('tabindex')
      else btn.setAttribute('tabindex', prevTab)
      if (prevTitle !== null) btn.setAttribute('title', prevTitle)
      btn.style.pointerEvents = prevPointer
      btn.style.cursor = prevCursor
    }
  }, [])
  return ref
}

/**
 * 品牌头部内容（两行：主标题 + 副标题）。
 * 渲染在官方 `.brandName` 内、官方 `.brandMark`（鲸鱼）之后 —— 图标由官方绘制。
 */
export function PersonalBrandName(): ReactNode {
  const ref = useBrandNeutralizer()
  const version = brandVersion()
  return (
    <span
      className="dps-brand"
      data-dps-brand="1"
      data-dps-brand-version={version}
      data-dps-product-version={productVersion()}
      ref={ref}
    >
      <span className="dps-brand-title" data-dps-brand-title="1">
        {BRAND_TITLE}
      </span>
      <span className="dps-brand-sub" data-dps-brand-sub="1">
        {brandSubtitle()}
      </span>
    </span>
  )
}
