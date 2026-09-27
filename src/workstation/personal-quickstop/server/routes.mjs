// dsh-personal-quickstop — 路由常量（**零 import**）：客户端半与宿主半的契约**唯一 owner**
//
// 为什么单独一个文件（这是客户端半的硬约束，不是洁癖）：
//   客户端 bundle 由 esbuild 打给**浏览器**。只要客户端 import `server/index.js`，
//   esbuild 会把整条图（`index.js → interrupt-store.mjs → node:fs/promises|node:os|node:path`）
//   一起解析并打进产物 —— 实测（esbuild 0.25.12，platform=browser）**构建直接失败**：
//     ERROR: Could not resolve "node:fs/promises"（server/interrupt-store.mjs:16）
//   即便把 `node:*` 标成 external 让它"构建通过"，产物里仍会留下 eager
//   `require("node:fs/promises")` 与顶层 `defaultInterruptPath()` 调用 ⇒ 浏览器一加载就崩。
//   ⇒ 两侧要共用的契约常量必须是**能进浏览器的那一份**：本文件零依赖，谁都能 import。
//
// `server/index.js` 依旧导出同样的名字（从本文件 re-export）⇒ 既有的 import 面不变。

export const QUICKSTOP_PREFIX = '/api/personal/quickstop'
export const QUICKSTOP_STATE_PATH = `${QUICKSTOP_PREFIX}/state`
export const QUICKSTOP_READ_PATH = `${QUICKSTOP_PREFIX}/read`
/** I-A2 起宿主已实现：发现面未接线时**如实 501**（绝不拿空快照冒充"没有工作"）。 */
export const QUICKSTOP_PLAN_PATH = `${QUICKSTOP_PREFIX}/plan`
/**
 * 真编排入口。客户端照此 POST；拿不到 2xx 就**如实**显示失败，绝不显示"已停止"。
 * 宿主侧已于 I-A2 落地**接缝**：`orchestrate` 未接线时如实 **501 `orchestration-not-wired`**
 * （绝不返回看起来成功的空结果）；I-D 把官方取消/停止原语绑上去后走同一条路由，路径不变。
 */
export const QUICKSTOP_RUN_PATH = `${QUICKSTOP_PREFIX}/run`
/**
 * I13 续接入口（需求原文 G13「RESUME EXPERIENCE」）。客户端在会话被中断时显示续接条，
 * 点 `[继续]` POST 到本路径 ⇒ 宿主把**盘上那条续接点**构造成一段指令，经
 * `sessionController.prompt`（官方原语，出处见 `host-adapter.mjs` 的 `HOST_CALLS.resumePrompt`）
 * 投回该会话 —— 官方 `prompt` 自己就是 resolve-or-resume，冷/已停会话由它复位。
 *
 * **受理 ≠ 跑完**：200 只代表官方收下了这一轮；真机上"Agent 真的接着跑"仍未验证（未装机）。
 * 拿不到 2xx 一律如实当失败（缺续接点 404 / 无原语 501 / 投递失败 502），绝不显示"已续接"。
 */
export const QUICKSTOP_RESUME_PATH = `${QUICKSTOP_PREFIX}/resume`
