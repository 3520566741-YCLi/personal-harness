# CHANGELOG

本文件只记录**公开发行**的历史。内部开发过程（阶段编号、内部验收记录）不在本仓库内，也不对外表达。

## v1.2.0-docs.1 — public-v1.2-docs.1（文档版：**产品功能未变**）

**这是 V1.2 的文档版发行：只改文档，产品功能未变。** 与 V1.1 的 `v1.1.0-macos-docs.1` / `.2` 属于同一性质。

改了什么：

- **仓库首页（`README.md`）重做**：改用本项目自己的「版本地图 / 时间线」写法 —— ⚡ 5 秒结论（我想做什么 → 去哪）、🌳 版本树（谁从谁来）、🧭 版本导航（我要哪一版）、🕰️ 时间线（公开发行），并加一条「本仓库的纪律」与页内跳转导航。英文镜像 `README_EN.md` 同步重写。
- **修掉指向不存在 tag 的引用**：文档原写「V1.1 发行 tag `v1.1.0`」，但**本公开仓库没有 `v1.1.0` 这个 tag**（那是内部私有冻结仓的 tag）；已全部改为公开仓真实存在的 **`v1.1.0-macos`**。
- **公开仓历史如实说明**：本仓库的提交历史**不是一条单链** —— `v1.1.0-macos`（`3f22753`）与 `v1.1.0-macos-docs.1`（`07086fe`）是**各自独立的根提交**，只能通过它们自己的 tag 取到；`main` 的线自 `v1.1.0-macos-docs.2`（`a4a2092`）延伸。已登记进 [docs/PUBLIC_V1_2_RELEASE_AUDIT.md](docs/PUBLIC_V1_2_RELEASE_AUDIT.md)（D7 / D8）与本版提交信息。
- **审计补记 A9**：对**发行包内部**做了独立核对（本仓库的扫描器只读文本文件，**不解析 `.tgz`**），并把这个工具缺口如实登记；详见 [docs/PUBLIC_V1_2_RELEASE_AUDIT.md](docs/PUBLIC_V1_2_RELEASE_AUDIT.md) A9。

**产品未变（可核对）**：

- `src/**`（插件源码）**逐字节未改**；
- `scripts/install.sh` / `uninstall.sh` / `rollback.sh` **逐字节未改**（装机行为不变）；
- 发行产物按既有流程**重新构建**（未手改一个字节）：与 `public-v1.2` 的资产相比，`dsh-personal-hud` 与 `dsh-personal-quickstop` 的 `.tgz` **逐字节相同**（这两个包的产物不含内嵌短哈希字面量）；`dsh-personal-sidebar` 与 `dsh-personal-workspace` 的差异**只有内嵌的那个短哈希字面量本身**（各 1 行），产品代码无其他变化。上一次 V1.2 发行（`public-v1.2`）的 Release 与资产**保留、不覆盖**。

产物哈希（`client.js` 的 sha256，实测回填；完整值见 `manifest.json`）：

| 包 | 版本 | 公开 `sha256(client.js)` | 与内部冻结版的关系 |
|---|---|---|---|
| dsh-personal-sidebar | 0.1.28 | `42bbb753c5cf41c8…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-workspace | 0.1.25 | `05c64f5829fbbc5d…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-hud | 0.1.3 | `56afe08499d2f585…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-quickstop | 0.1.1 | `ba9748698e0b7c9b…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |

本版本是**自引用发行提交**：`packages/*.tgz` 内嵌的短提交哈希（`8838cdb`）== 包含它们的那个提交自身的短哈希。`npm run verify` 会强制核验，不一致即失败。

发行范围：**仅 macOS**（同 V1.2）。

---

## v1.2.0 — public-v1.2（macOS）

**定位：功能最全，但未做系统性验收。** V1.2 是「功能最全、但没有做过系统性验收」的版本，它**带有若干已知问题**，这些问题**计划在 V1.3 修复**；完整清单（现象 / 影响面 / 当前状态 / 规避方式）见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。**要稳定请用 V1.1（发行 git tag `v1.1.0-macos`）；要功能最全并接受已知问题，用 V1.2（本次发行，git tag `public-v1.2`）。**

新增：

- **Quick Stop** 在官方会话头部提供「优雅中断 + 续接」。它是本次新增的**第四个包** `dsh-personal-quickstop` **0.1.1**（V1.1 是三个包）。
- 其余三个包为版本更新：`dsh-personal-sidebar` 0.1.28、`dsh-personal-workspace` 0.1.25、`dsh-personal-hud` 0.1.3。

组件版本（本版发行物）：

| 包 | 版本 |
|---|---|
| `dsh-personal-sidebar` | 0.1.28 |
| `dsh-personal-workspace` | 0.1.25 |
| `dsh-personal-hud` | 0.1.3 |
| `dsh-personal-quickstop` | 0.1.1 |

`scripts/install.sh` 会**自动发现并安装 `packages/` 下的全部四个 `.tgz`**，无需改参数。完整哈希见 `manifest.json` 与 `checksums.sha256`。

发行物哈希（`client.js` 的 sha256，实测回填；完整值见 `manifest.json`）：

| 包 | 版本 | 公开 `sha256(client.js)` | 与内部冻结版的关系 |
|---|---|---|---|
| dsh-personal-sidebar | 0.1.28 | `6a0886038128fec2…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-workspace | 0.1.25 | `34c992e21de70c5c…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-hud | 0.1.3 | `56afe08499d2f585…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-quickstop | 0.1.1 | `ba9748698e0b7c9b…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |

本版本是**自引用发行提交**：`packages/*.tgz` 内嵌的短提交哈希（`ba9a5bb`）== 包含它们的那个提交自身的短哈希。`npm run verify` 会强制核验，不一致即失败。

发行范围：**仅 macOS**。本次发行只提供 macOS 安装路径；仓库里保留的 Windows 脚本与文档仍是**上一版 V1.1 的实验性材料**，**未用 V1.2 的包验证过**，**不要用它们安装 V1.2 的包**（见 [INSTALL_WINDOWS_EXPERIMENTAL.md](INSTALL_WINDOWS_EXPERIMENTAL.md) 顶部声明）。Windows 不属于本发行范围。

公开版清洗说明：

- 发行物**不含任何私人数据**：无本机路径、无账号、无密钥、无会话 id；
- 公开版的**项目种子为空**——首次安装即空白状态（项目、Agent 目录都由你自己填）；
- `quickstop` 新增了一行**产品归属标注**（悬停可见）。

已知问题摘要（最重的几条，详表见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)）：

1. Quick Stop 的续接卡片在显示「已受理」后**永不消失**，界面上没有关闭手段（重启 DSH Desktop 可让它消失）；
2. 「记忆每 30 分钟自动整理」**从来没有成功跑过一次**，而且界面**不会告诉你它没成功**；
3. 界面上的**产品版本显示可能与实际安装的产品版本不一致**；
4. Quick Stop / 续接的**像素与手感从未在真机复核**（自动化套件证明不了手感）；
5. Quick Stop 停掉的任务在看板上**没有「被中断」这个状态**，只能落到官方五个状态。

诚实说明（本次发行**没有**做的事）：

- **未做**真机肉眼验收（没有在真实桌面会话里逐项看过界面）；
- **未验证** V1.1 → V1.2 的升级路径；
- **未测**四个包的**可复现构建**（源码能否逐字节重建出这四个 `.tgz`）。

## v1.1.0-macos-docs.2 — 英文文档版（产品功能未变）

**这不是功能更新，也不是安全修复，更与 Windows 支持无关。** 产品功能、界面行为与源码都没有变化；本次只新增了一整套英文使用文档，让英文用户从 GitHub 首页进入后可以全程用英文阅读和安装。

**这不是界面国际化**：插件界面本身仍是中文，英文文档里给出的按钮名称会同时标注屏幕上的中文原文，方便对照。

改了什么：

| 文件 | 变化 |
|---|---|
| `README_EN.md` | **新增**：英文首页，含英文文档目录（Install on macOS / Feature Guide / Optional Plugins / Uninstall / Rollback / Compatibility / Known Limitations / Security / Privacy）。标题旁只有一处语言入口 `[中文](README.md) · English` |
| `README.md` | 标题旁只加一处 `中文 · [English](README_EN.md)`，其余中文内容不变 |
| `docs/en/INSTALL_MACOS.md` | **新增**：前置条件、推荐让 AI 协助安装（含边界）、手动安装、脚本七步、参数与退出码、失败处理、从源码构建、不使用脚本的手动安装 |
| `docs/en/FEATURE_GUIDE.md` | **新增**：主页 / 会话 / 新任务 / 短任务与长任务 / 任务看板 / 项目 / 工作区 / 最近，以及每个入口「不会做什么」 |
| `docs/en/OPTIONAL_PLUGINS.md` | **新增**：第三方插件三组分类、逐项来源与许可证核查、账号需求、实测状态、最终分类表 |
| `docs/en/UNINSTALL.md`、`ROLLBACK.md`、`COMPATIBILITY.md`、`KNOWN_LIMITATIONS.md`、`SECURITY.md`、`PRIVACY.md` | **新增**：与中文版逐条对应，未验证项一律保留为未验证 |
| `docs/PUBLIC_V1_1_RELEASE_AUDIT.md` | 新增 H 节：英文文档版的登记 |

保持不变的边界（英文文档同样写明）：

- macOS + DSH Desktop 2.0.5 是**已验证**范围，其他宿主版本 **UNTESTED**；
- Windows 一律写作 **Experimental / Untested**，不写成 supported / verified / ready / works；
- 「在浏览器里单独运行 Harness Web UI」不是已验证安装方式；
- 大安装包只自带三个插件，第三方插件一律不打包、不再分发；
- 未验证项继续写成未验证。

产物：与上一次文档版同理，自引用规则要求「产物内嵌的短哈希 == 包含它的提交自身的短哈希」，故三个产物按标准流程重新构建；与上一版相比差异只有内嵌的那个短哈希字面量（`dsh-personal-hud` 不含该字面量，其 `.tgz` 与上一版逐字节相同）。完整哈希见 `checksums.sha256` 与 `manifest.json`。

> 仍为**中文 only** 的文档：`CHANGELOG.md`、`CONTRIBUTING.md`、`THIRD_PARTY_NOTICES.md`、`PUBLIC_EXPORT_ALLOWLIST.md`、`INSTALL_WINDOWS_EXPERIMENTAL.md`、`docs/ARCHITECTURE.md`、`docs/WINDOWS_EXPERIMENTAL_STATUS.md`、`docs/PUBLIC_*.md`。英文首页已逐个列出并给出英文说明。

## v1.1.0-macos-docs.1 — 文档更新（产品功能未变）

**这不是功能更新，也不是安全修复，更与 Windows 支持无关。** 产品功能、界面行为与源码都没有变化，改的只有文档。

改了什么：

| 文件 | 变化 |
|---|---|
| `README.md`、`INSTALL_MACOS.md` | 补上「最推荐安装方式」：把仓库交给一个你信任、且能访问你终端的 AI，让它读安装文档、先检查前置条件（DSH Desktop / Node.js / pnpm）、说明会改哪个 profile 与备份位置、等你确认后再动手；并写明这种方式的前提与边界。手动安装仍然可用，但更容易出错 |
| `FEATURE_GUIDE.md` | **新增**：用大白话讲清每个入口（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近）是什么、什么时候用、以及它刻意**不**做什么 |
| `CONTRIBUTING.md`、`docs/*` | 二次创作说明、只改文档时的自引用规则，以及审计/扫描/安装测试报告的同步更新 |

产物变化（如实说明）：

因为自引用规则要求「产物内嵌的短哈希 == 包含它们的那个提交自身的短哈希」，而本次提交必须使用**新的**短哈希（旧的 `3f22753` 仍被保留下来的 tag 指向，git 在前缀歧义时会把缩写自动延长到 8 位，那会让 `npm run verify` 在任何 fetch 了 tag 的 clone 里失败），所以三个产物按标准流程**重新构建**。

- 与上一版相比，产物的**唯一差异就是内嵌的那个短哈希字面量**：sidebar 1 行、workspace 1 行；
- `dsh-personal-hud` 0.1.3 不含该字面量，`.tgz` 与上一版**逐字节相同**；
- 产品代码、依赖、清单结构、脚本行为均无其他变化。

| 产物 | sha256（前 16 位） |
|---|---|
| dsh-personal-sidebar 0.1.24 | `7186a2645ea18965…` |
| dsh-personal-workspace 0.1.20 | `359db5ad71d4d79f…` |
| dsh-personal-hud 0.1.3 | `c70fa861201ea3e3…`（与上一版相同） |
| manifest.json | `b22d663454dbe869…` |
| checksums.sha256 | `99886a18f0f1fa29…` |

完整值见 `checksums.sha256` 与 `manifest.json`。**Windows 版状态不变**：`Experimental / 未验证`。

## v1.1.0 — public-v1.1（首个公开发行）

**这是 Personal Harness 的第一个公开发行版。** 在此之前没有公开版本，因此没有「从旧公开版升级」这一说（升级路径不适用，而非未测试）。

包含：

- 三个插件：`dsh-personal-sidebar` 0.1.24、`dsh-personal-workspace` 0.1.20、`dsh-personal-hud` 0.1.3
- 侧栏导航外壳（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近）
- 项目关系层（本机持久化）
- 任务补充字段（截止时间 / 预期交付物 / 约束 / 备注，本机持久化并回显）
- 底部 HUD 与可折叠 Inspector
- 安装 / 卸载 / 回滚脚本 + 兼容性门 + 完整性校验 + 产物契约测试

相对内部版本的变化（即「为公开而做的事」）：

| 类别 | 变化 |
|---|---|
| 用户数据 | 项目种子与 Agent 目录种子**置空**：首次安装是空白用户状态 |
| 隐私 | 移除内嵌的私人需求原文示例、个人品牌串、姓名与账号；`LICENSE` 持有者改为中性名称 |
| 许可 | 不随发行分发与官方预设 99.6% 同源的模板目录（见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)） |
| 历史 | 全新 git 历史，不含任何上游提交、作者信息或内部记录 |
| 文档 | 本仓库的文档全部为公开发行重写（面向使用者，不表达内部过程） |
| 产品语义 | **零变更**：插件行为、界面、数据键均与内部冻结版一致（除上表所列内容性/隐私性差异） |

产物哈希（`sha256(client.js)` 前 16 位）：

| 包 | 版本 | client.js | 与内部冻结版的关系 |
|---|---|---|---|
| dsh-personal-sidebar | 0.1.24 | `9df77ae3e639c4d5…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-workspace | 0.1.20 | `22fa0b73ec80f855…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-hud | 0.1.3 | `76824e80b273adda…` | **与内部冻结版逐字节相同**（该插件不含任何需要中性化的内容） |

完整哈希见 `manifest.json` 与 `checksums.sha256`。

> 注：这里列的是**当前**产物的哈希。最初一次公开发行（Release `v1.1.0-macos`）的同版本资产哈希与上表不同，两者只差产物内嵌的那个短哈希字面量，见本文件顶部的「文档更新」一节。旧 Release 与旧 tag 都保留，随时可下载。

### 发布前审计中修掉的公开发行侧问题（如实登记）

公开发行审计不是一次通过。以下两条是在「模拟一个陌生人 clone 这个仓库」的复验里发现并修复的，均在修复后重新验证：

| 问题 | 修复前行为 | 现状 |
|---|---|---|
| `--dry-run` 不是真 dry-run | `install.sh --dry-run` / `install.ps1 -DryRun` 仍会创建回滚点目录并复制 `.tgz` 到缓存目录 | 严格零改动：只打印将要执行的动作；隔离测试与 Windows 演练各有断言把关 |
| 全新 clone 直接 `npm run verify` 会失败 | `src/workstation/*/build/` 不进 git，缺失时报「缺少构建产物」 | 新增 `scripts/materialize-build.mjs`：从随仓库发布的 `packages/*.tgz` 还原 bundle 并逐字节核对 `manifest.json` 的 sha256；不编译也能校验包是否被改过 |

### Windows Experimental / 未验证版

同一版本内新增 Windows 支持尝试：

- `scripts/windows/install.ps1` / `uninstall.ps1` / `rollback.ps1`（PowerShell，不需要管理员权限，语义与 macOS 版一致）
- `INSTALL_WINDOWS_EXPERIMENTAL.md` 与 [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md)（验证边界 + 风险清单）
- **状态：Experimental / 未验证** —— 从未在真实 Windows DSH Desktop 上验证；只有 PowerShell 7 语法解析 + 非 Windows 环境的逻辑演练（PASS 27 / FAIL 0）。**不得写成「已支持 Windows」**
- 插件产物本身与 macOS 版**完全相同**（同一批 `.tgz`，同一哈希）

### 发行包与提交的对应（自引用发行提交）

本版本是**自引用发行提交**：`packages/*.tgz` 内嵌的短提交哈希（`a4a2092`）== 包含它们的那个提交自身的短哈希。`npm run verify` 会强制核验，不一致即失败。

### 已知限制

见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)：6 项产品级限制 + 5 项未验证项。**没有一项被谎报为通过。**
