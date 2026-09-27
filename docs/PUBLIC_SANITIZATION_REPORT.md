# PUBLIC SANITIZATION REPORT — Personal Harness **V1.2**

从「内部 Personal Harness V1.2 冻结版」到「本公开发行」的**逐处差异**记录。原则：**不新增功能、不改产品语义**；只做隐私中性化、用户数据置空、许可风险规避与面向公众的重写。

- 来源（只读引用，未修改）：内部私有冻结仓库（**不公开**）；冻结 tag `v1.2-freeze-2026-09-21`；导出时该仓库工作树干净，源提交 `d7d7cccf7e67b5a692cc13ceb27caa9b0d11ebac`（该提交相对冻结 tag 只多出 4 个**仅文档**提交；`git diff --stat v1.2-freeze-2026-09-21..HEAD -- src/workstation/` 为空 ⇒ 导出涉及的插件源码与冻结 tag 逐字节相同）。
- 导出范围：`personal-sidebar`、`personal-workspace`、`personal-hud`、`personal-quickstop` 四个插件（V1.1 为三个；V1.2 新增 Quick Stop）。
- 组件版本：sidebar `0.1.28` · workspace `0.1.25` · hud `0.1.3` · quickstop `0.1.1`。

---

## 1. 源码级差异（公开树 vs 冻结版，逐文件）

除下表 14 个文件外，导出范围内的**其余源码文件与冻结版逐字节相同**（可用 `diff -r` 复核）。其中第 13、14 条只改**构建脚本的发行能力**（普通构建行为不变），不影响任何插件在界面上的行为。

| # | 文件 | 差异行数 | 差异内容 | 理由 |
|---|---|---|---|---|
| 1 | `personal-sidebar/package.json` | 2 | `description` 重写为面向公众的一句话 | 原文含内部阶段编号与内部修复代号 |
| 2 | `personal-sidebar/src/client/brand.tsx` | 6 | 品牌主标题**去掉原文里的个人品牌串，改为中性产品名** `Personal Harness`（含 1 处注释）；产品版本兜底 `V1.1` → `V1.2` | 去个人品牌串（按零出现清单移除；**本报告刻意不引用原文**，否则报告自己会把该串带进公开树）；产品版本随本次发行（**功能性最小改动**） |
| 3 | `personal-sidebar/src/client/index.tsx` | 2 | 注释中的品牌串同步改名 | 同上 |
| 4 | `personal-sidebar/src/client/styles.ts` | 2 | 注释中的品牌串同步改名 | 同上 |
| 5 | `personal-workspace/package.json` | 2 | `description` 重写 | 原文含内部阶段史与内部裁决编号 |
| 6 | `personal-workspace/src/client/newtask.tsx` | 2 | 输入框示例文本替换为中性示例 | 原文用的是私人需求原文（个人物品采购清单与预算） |
| 7 | `personal-workspace/src/client/workspace-tasks.ts` | 4 | 注释里的本机绝对路径改为 `$HOME` / `~` | 去本机路径 |
| 8 | `personal-workspace/src/server/memory-context.ts` | 2 | 删去「某真实工作区路径 → 其哈希」的实证样例，改为口径说明 | 去本机路径（并去掉可由路径反推的样例） |
| 9 | `personal-hud/package.json` | 2 | `description` 重写 | 原文含内部阶段编号 |
| 10 | `personal-hud/src/client/product.ts` | 2 | 产品版本兜底 `V1.1` → `V1.2` | 产品版本随本次发行（**功能性最小改动**，仅在产品版本文件缺失时生效） |
| 11 | `personal-quickstop/package.json` | 2 | `description` 重写 | 原文含内部阶段编号与内部裁决编号 |
| 12 | `personal-quickstop/src/client/quick-stop-ui.tsx` | 7 | 新增 1 个导出常量 + 2 处 `title`（悬停可见的产品归属标注） | **发行契约要求每个插件的产物都带产品名串**（`npm run test` 的产物契约项）。这是**为满足契约而做的最小补充**，如实登记 |
| 13 | `personal-sidebar/build.mjs` | 5 | 构建脚本支持 `DPS_SHA_OVERRIDE`：**发行时**可把产物内嵌的短哈希注入为指定值（目标值不合法或未设置时，行为与冻结版完全一致 = 取当前 `HEAD`） | 自引用发行提交要求「产物内嵌短哈希 == 提交自身短哈希」，而提交哈希由内容决定 ⇒ 必须**先定目标值再搜索 nonce**，否则重建产物无法承载新的自身短 id（V1.2 发行时踩到：旧编排的该变量从未被构建脚本采纳）。**这是发行工具能力，不是产品功能改动** |
| 14 | `personal-workspace/build.mjs` | 5 | 同上（`personal-workspace` 的产物同样内嵌短哈希） | 同上（本仓库只有 `sidebar` 与 `workspace` 的产物内嵌该字面量；`hud` / `quickstop` 不内嵌） |

## 2. 构建产物级差异（公开 `.tgz` vs 冻结版）

`build/flat/client.js` 的 sha256 与逐字节差异（下表由发行工具按**实测**写入）：

| 插件 | 公开 `sha256(client.js)` | 冻结版 | diff 行数 | 差异内容 |
|---|---|---|---|---|
| sidebar 0.1.28 | `42bbb753c5cf41c8…` | `e3b8e3b3d63c9a66…` | **10** | 差异为 §1 登记的改动与**内嵌短哈希字面量**（逐条见 §1；不含功能/语义改动） |
| workspace 0.1.25 | `05c64f5829fbbc5d…` | `8d5b0612d41d94f6…` | **273** | 差异为 §1 登记的改动与**内嵌短哈希字面量**（逐条见 §1；不含功能/语义改动） |
| hud 0.1.3 | `56afe08499d2f585…` | `63d5cc3ef1abde6b…` | **4** | 差异为 §1 登记的改动与**内嵌短哈希字面量**（逐条见 §1；不含功能/语义改动） |
| quickstop 0.1.1 | `ba9748698e0b7c9b…` | `04c8debbbd340dfc…` | **5** | 差异为 §1 登记的改动与**内嵌短哈希字面量**（逐条见 §1；不含功能/语义改动） |

产物大小：sidebar 162,096 B（冻结版 162,088 B）｜workspace 543,048 B（冻结版 555,158 B）｜hud 24,262 B（冻结版 24,262 B）｜quickstop 34,473 B（冻结版 34,364 B）

> 差异来源：§1 的中性化改动、产品版本兜底、quickstop 归属标注，以及 **内嵌构建提交哈希（`bcf7e4a` = 本发行提交自身）**。

## 3. 用户数据置空

| 数据 | 冻结版 | 公开版 |
|---|---|---|
| 项目种子 | 有内部种子项目条目 | **空**（`personal-projects/registry.json` 的 `projects: []`，并写明「首次安装是空白状态，请自行新建」） |
| Agent 预置 | 有内部 preset | **不导出** |
| 任务 / 会话 / 工作区数据 | 只存在于本机 | **不发运**（本发行版不含任何用户数据文件） |
| 浏览器存储键 | `dsh.personal.*` / `dsh.dps.*` | 与冻结版相同（全新安装不会产生任何测试键） |

## 4. 文档级差异

| # | 处理 | 理由 |
|---|---|---|
| 1 | 全文去除个人品牌串与个人标识（品牌名、账号、本机路径、私人项目名） | 公开发行不得携带个人数据 |
| 2 | 「已知问题」按 V1.2 实际状态重写（`KNOWN_LIMITATIONS.md`），并写明**计划在 V1.3 修复** | V1.2 是「功能最全、未做系统性验收」的版本，必须如实告知 |
| 3 | 隐私表述按**实测**收窄：默认不向外部主机发请求；唯一例外是 `personal-workspace` 的右栏 ChatGPT 标签探测（仅当你主动打开该标签时发生一次匿名只读 GET） | 原「无网络请求」的绝对表述**不成立**（源码与产物中确有该域名） |
| 4 | Windows 材料统一标注：**不属于 V1.2 发行范围**；仓库内保留者是 V1.1 实验性材料、从未用 V1.2 的包验证 | 本次只发 macOS |
| 5 | 产品版本单一事实源改为 `V1.2`（`product.json`），组件版本号保持独立语义 | 公开版按 V1.2 标注（用户裁定） |
| 6 | 第三方插件告知新增 `ds-harness-remote` 一项（默认开启、固定指向其作者服务器、如何禁用） | 对用户信任面影响最大的一条，属**事实告知** |
| 7 | 安装 / 兼容 / 可选插件等文档中的版本号与包数按本次发行更正（四个包、`-public-v1.2` 文件名标签） | 防止文档与产物漂移 |
| 8 | 文档中不再出现内部私有仓库名（改为「内部私有冻结仓库（不公开）」） | 公开集合要求该字符串出现次数为 0 |
| 9 | 脚本内的插件清单不再硬编码，改为从 `manifest.json` 派生（`install.sh` 本就自动发现 `packages/*.tgz`） | 防止「新增插件后装了却卸不掉」；本次即由隔离测试抓出 |

## 5. 本次发行**没有**做的事（不冒名顶替）

| 项 | 状态 |
|---|---|
| 从上一公开版本（V1.1）升级到 V1.2 的路径 | **未验证**（无证据） |
| 真机肉眼验收（含 Quick Stop 的像素与手感） | **未验证**（需使用者本人在真机确认） |
| 运行时抓包验证「无外部请求」 | **未做**（结论来自源码 + 发行产物静态核对） |
| 在 DSH Desktop 2.0.5 以外版本上运行 | **未验证** |
| Windows 的安装 / 界面 / 卸载 / 回滚 | **未验证，且不属于本次发行范围** |
| 本次四个 `.tgz` 的可复现构建（重建逐字节一致） | **未验证**（V1.1 的同类结论不适用于 V1.2） |

## 6. 可复核命令

```bash
# 源码级差异（需要内部冻结仓库；公开侧用本仓库即可）
diff -r --exclude=build --exclude=dist <冻结仓库>/src/workstation/personal-sidebar \
        src/workstation/personal-sidebar

# 产物契约（四个包；development 与 production 两种模式均应为 71 项 / 0 失败）
npm run test
NODE_ENV=production npm test

# 发行物自洽（哈希 / 内嵌提交 / 装机一致性 / 无私人数据）
npm run verify

# 反查是否夹带私人数据（0 命中为合格）
grep -rn "/Users/<user>\|YCLi\|Harness工作区" . --include="*.md" --include="*.json" --include="*.ts" --include="*.tsx"
```
