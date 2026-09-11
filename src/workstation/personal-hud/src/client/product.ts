// dsh-personal-hud — 版本语义（E5-3）。
//
// 产品版本 vs 组件版本**语义分离**（见 docs/E5_FINAL_SOURCE_OF_TRUTH_AUDIT.md 与 ROADMAP §1）：
//   · 产品版本 = 「Personal Harness · V1.1」→ 单一事实源 `src/workstation/personal-version/product.json`，
//     由 build.mjs 注入（`__PRODUCT_NAME__` / `__PRODUCT_VERSION__`）；
//   · 组件版本 = 本插件 package.json version（注入为 `__DPS_VERSION__`）。
// UI 优先显示**产品**版本；组件版本只在 Debug/Inspector 里出现，**绝不**冒充产品版本。

declare const __PRODUCT_NAME__: string
declare const __PRODUCT_VERSION__: string
declare const __DPS_VERSION__: string

const FALLBACK_PRODUCT_NAME = 'Personal Harness'
const FALLBACK_PRODUCT_VERSION = 'V1.1'
const FALLBACK_COMPONENT_VERSION = '0.1.3'

/** 产品名（如 `Personal Harness`）。 */
export function productName(): string {
  return typeof __PRODUCT_NAME__ === 'string' && __PRODUCT_NAME__.length > 0 ? __PRODUCT_NAME__ : FALLBACK_PRODUCT_NAME
}

/** 产品版本（如 `V1.1`）。 */
export function productVersion(): string {
  return typeof __PRODUCT_VERSION__ === 'string' && __PRODUCT_VERSION__.length > 0 ? __PRODUCT_VERSION__ : FALLBACK_PRODUCT_VERSION
}

/** HUD 组件版本（本包 package.json version）。 */
export function hudComponentVersion(): string {
  return typeof __DPS_VERSION__ === 'string' && __DPS_VERSION__.length > 0 ? __DPS_VERSION__ : FALLBACK_COMPONENT_VERSION
}

/** Inspector 用的产品标签，例如 `Personal Harness V1.1`。 */
export const PRODUCT_LABEL = `${productName()} ${productVersion()}`

/** Inspector 用的组件标签，例如 `hud 0.1.3`。 */
export const HUD_COMPONENT_VERSION = `hud ${hudComponentVersion()}`
