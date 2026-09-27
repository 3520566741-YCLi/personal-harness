# PUBLIC V1.2 RELEASE AUDIT（发行前自审计）

本文件记录 **V1.2 公开发行前**做过的检查与**没有做**的检查。口径：只写**实测过**的；未做的一律写「未做」，**不冒名顶替为通过**。

- 产品版本：Personal Harness **V1.2**｜发行 tag：`public-v1.2`｜平台：**仅 macOS**
- 发行物：四个插件包（sidebar `0.1.28` · workspace `0.1.25` · hud `0.1.3` · quickstop `0.1.1`）

## A. 私人数据（本次发行的红线）

| # | 检查 | 结果 | 证据 |
|---|---|---|---|
| A1 | 全树不存在本机用户目录绝对路径（`/Users/<真实用户名>`） | PASS | 独立扫描器 `scan-public.mjs`（见 [PUBLIC_PRIVACY_SCAN_REPORT.md](PUBLIC_PRIVACY_SCAN_REPORT.md)）；命中为 0 |
| A2 | 全树不存在个人品牌串与账号名 | PASS | 同上 |
| A3 | 全树不存在私人项目名 / 私人工作区名 | PASS | 同上（**初稿曾命中 5 处：4 个包的 `description` 与 1 处代码注释，已全部中性化**） |
| A4 | 全树不存在密钥、token、会话 id 形态 | PASS | 见 [PUBLIC_SECRET_SCAN_REPORT.md](PUBLIC_SECRET_SCAN_REPORT.md) |
| A5 | 发行物内不含用户数据（项目种子为空、无任务/会话/工作区数据、无 Agent 预置） | PASS | 见 [PUBLIC_SANITIZATION_REPORT.md](PUBLIC_SANITIZATION_REPORT.md) §3 |
| A6 | 源码与冻结版差异**逐文件可枚举**（11 处中性化 + 2 处发行工具能力 + 1 处契约补充 = 14 个文件） | PASS | 同上 §1（含逐条理由） |
| A7 | 扫描器覆盖「将要公开的集合」= 已跟踪 ∪ 未忽略的未跟踪文件（不是只扫已提交的） | PASS | 扫描器实现口径 |
| A8 | **运行时抓包**证明无外部出站 | **未做** | 结论来自源码 + 产物静态核对 |
| A9 | **发行包内部**是否含私人数据 / 密钥 / 外域（**发行后补做**） | PASS（**工具缺口，已登记**） | 人为解包四个 `.tgz` 逐项核对：私人标识（本机路径 / 账号 / 私人仓名 / 私人工作区名 / 私人项目名）**0 命中**；密钥形态 `sk-[A-Za-z0-9_-]{20,}` **0 命中**（另有 2 处 `sk-` 命中实为 `task-ledger-…`、`task-status-…` 误报）；外域字面量仅 `https://chatgpt.com`（2 处 = [../PRIVACY.md](../PRIVACY.md) 登记的那条例外）与 `localhost` / `127.0.0.1`。**缺口**：`tools/scan-public.mjs` 与本仓库 `npm run verify` 的私人数据扫描都按扩展名只读文本文件，**不解析 `.tgz`** ⇒ 这一项目前**必须人工补做**，计划修复（本次未改工具，以保持「文档版：产品未变」的边界） |

## B. 发行物自洽

| # | 检查 | 结果 |
|---|---|---|
| B1 | `npm run build` 四个包全部产出 `.tgz` | PASS |
| B2 | `npm run package` 生成 `manifest.json` / `checksums.sha256` / `VERSION`，且**私人数据闸门**通过 | PASS |
| B3 | 产物契约 `npm run test` | PASS（**71 项 / 0 失败**，development 模式） |
| B4 | 同上，`NODE_ENV=production` | PASS（**71 项 / 0 失败**） |
| B5 | 产物契约首次运行时抓到 1 处真失败（quickstop 缺产品归属串） | **已修**（加 `Personal Harness · Quick Stop` 悬停归属标注，非放宽判据），修后 71/0 |
| B6 | `npm run verify`（哈希 / 内嵌提交 / 装机一致性 / 无私人数据） | 见发行提交上的实测（本文件随发行更新） |
| B7 | 四个 `.tgz` 的**可复现构建**（重建逐字节一致） | **未验证** |

## C. 安装链路（隔离环境）

| # | 检查 | 结果 |
|---|---|---|
| C1 | 安装 / 幂等重装 / 兼容门 / 卸载 / 回滚全链路，隔离 HOME，不触碰真实 profile | PASS（**27 项 / 0 失败**，见 [PUBLIC_INSTALL_TEST_REPORT.md](PUBLIC_INSTALL_TEST_REPORT.md)） |
| C2 | 首次运行时抓到 **2 处真缺陷**（`uninstall.sh` / `rollback.sh` 把插件清单硬编码成三个包 ⇒ 第四个包卸不掉、回滚核对漏项） | **已修**（清单改为从 `manifest.json` 派生），修后 27/0 |
| C3 | 在**真机**上启动并肉眼确认界面 | **未做** |
| C4 | 从 V1.1 升级到 V1.2 | **未验证**（无证据） |

## D. 文档一致性

| # | 检查 | 结果 |
|---|---|---|
| D1 | 版本/包数/文件名标签与产物一致（四个包、`-public-v1.2`） | PASS（文档与 `manifest.json` 交叉核对） |
| D2 | 隐私表述与实测一致（默认无外站请求；唯一例外 = 右栏 ChatGPT 标签探测） | PASS（初稿的「无网络请求」绝对表述**已按实测收窄**） |
| D3 | 「已知问题」如实登记并写明计划在 V1.3 修复 | PASS（[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)） |
| D4 | Windows 材料明确标注**不属于本发行范围** | PASS |
| D5 | 中英文档同步 | PASS（`docs/en/**` 对应文件逐节等价） |
| D6 | 脚本与文档里不再硬编码插件数量 | PASS（改为从 `manifest.json` 派生） |
| D7 | 文档指向的 **V1.1 发行 tag 真实存在** | **曾为缺陷，已修**：README / KNOWN_LIMITATIONS（中英）/ CHANGELOG 原写「发行 tag `v1.1.0`」，但**本公开仓库没有 `v1.1.0` 这个 tag**（那是内部私有仓的 tag）；已全部改为公开仓真实存在的 `v1.1.0-macos` |
| D8 | 本次发行的 tag 命名与 V1.1 的历史命名不一致，如实登记 | V1.1 的公开 tag 为 `v1.1.0-macos`（＋ 文档版 `v1.1.0-macos-docs.1` / `.2`、Windows 材料 `v1.1.0-windows-experimental`）；本次发行的 git tag 为 `public-v1.2`，**与资产文件名后缀 `-public-v1.2` 一致**。两版命名规则不同，此处**登记而不掩饰** |

## E. 本审计没有覆盖的范围

- `app.asar` 等宿主侧实现（本发行版不修改宿主，也未审计宿主）；
- 第三方插件（含 `ds-harness-remote`）的行为与网络面 —— 只做了**事实告知**（见 [../OPTIONAL_PLUGINS.md](../OPTIONAL_PLUGINS.md)），**未审计、不背书**；
- 运行时行为（交互手感、像素、时序）——属真机验收项，本次未做；
- Windows 全链路 —— 不属于本发行范围。
