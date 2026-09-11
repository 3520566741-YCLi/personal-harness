# PUBLIC SANITIZATION REPORT

从「内部 Personal Harness V1.1 冻结版」到「本公开发行」的**逐处差异**记录。原则：**不新增功能、不改产品语义**；只做隐私中性化、用户数据置空、许可风险规避与面向公众的重写。

- 来源（只读引用，未修改）：内部私有冻结仓库（**不公开**），tag `v1.1.0`，源提交 `3f231ced163d997a72c748dac40f5aa51415061e`，工作树干净
- 导出方式：白名单导出（`tools/export-public.mjs`，非「整体复制后删除」），逐条清洗带日志
- 导出条目：21（详见 [../PUBLIC_EXPORT_ALLOWLIST.md](../PUBLIC_EXPORT_ALLOWLIST.md)）
- 清洗命中：10 处（`export-transforms.log`）

## 1. 源码级差异（公开树 vs 冻结版，逐文件）

对全部被导出的源码做 `diff`，**有内容差异的文件只有 9 个**（其余全部逐字节相同）：

| 文件 | 差异行数 | 差异内容 |
|---|---|---|
| `personal-projects/registry.json` | 61 | 用户私有项目种子 → **置空** `projects: []` |
| `personal-agents/registry.json` | 91 | Agent 目录种子 → **置空** `agents: []` |
| `personal-sidebar/src/client/brand.tsx` | 4 | 品牌串含个人标识 → `Personal Harness` |
| `personal-sidebar/src/client/index.tsx` | 2 | 同上（注释） |
| `personal-sidebar/src/client/styles.ts` | 2 | 同上（注释） |
| `personal-workspace/src/client/newtask.tsx` | 2 | 内嵌的用户私人需求原文示例 → 中性通用示例 |
| `personal-sidebar/package.json` | 2 | 描述中的内部阶段史与私人语境 → 面向公众的一句话 |
| `personal-workspace/package.json` | 2 | 同上 |
| `personal-hud/package.json` | 2 | 同上 |

**未列入上表的源码文件 = 与冻结版逐字节相同。** 唯一被整体排除的源码目录是 `personal-agents/presets/**`（见第 4 节）。

## 2. 构建产物级差异（公开 `.tgz` vs 冻结版 `.tgz`）

同一份 esbuild 版本（0.25.12）构建，逐行 diff 内嵌的 `client.js`：

| 插件 | 公开 `sha256(client.js)` | 冻结版 | diff 行数 | 差异内容 |
|---|---|---|---|---|
| sidebar 0.1.24 | `04b5f593b256cb38…` | `a4ef3f80017abac7…` | **6** | 1 处注释、`BRAND_TITLE` 常量、内嵌构建提交哈希 |
| workspace 0.1.20 | `df2a50187ec52de3…` | `2076f1d76e3680d5…` | **156** | 项目种子数据块、Agent 目录数据块、输入框示例文本、内嵌构建提交哈希 |
| hud 0.1.3 | `76824e80b273adda…` | `76824e80b273adda…` | **0** | **逐字节相同**（该插件不含任何需要中性化的内容） |

产物大小：sidebar 85,219 B（冻结版 85,211 B）｜workspace 380,151 B（冻结版 386,280 B）｜hud 23,819 B（不变）

**结论**：差异全部可归因于上表列出的内容性/隐私性改动，**没有一行逻辑改动**；hud 产物可证明「清洗流程未无差别改写代码」。

## 3. 用户数据置空（首次安装 = 空白状态）

| 数据 | 冻结版 | 公开版 |
|---|---|---|
| 项目（projects） | 含 4 个用户真实项目（含本机仓库路径提示） | `projects: []` + 说明字段 |
| Agent 目录 | 含预置条目 | `agents: []` + 说明字段 |

置空文件内保留了 `note` 字段，明确写出「公开发行有意为空，首次安装从空白用户状态开始，请自行添加」——**不假装数据存在，也不留占位假数据**。

## 4. 有意排除（许可风险）

`src/workstation/personal-agents/presets/**`（6 组 `agent.cordis.yml` + `preset.yml`）与官方 `dsh-agent-presets` 的标准预设**逐行 99.6% 相同**。重分发官方代码需要额外的版权声明与许可全文，而该情形的许可含义并不明确 → **本次不随发行分发**，并把 Agent 目录种子置空以免界面展示不存在的 Agent。

同类排除：内部自述「照抄官方渲染路径/DOM 形状」的测试替身脚本、读取浏览器 cookie / 会话库的内部运维脚本。

## 5. 面向公众的重写（不是导出，而是新写）

| 内容 | 说明 |
|---|---|
| 本仓库全部文档 | README / INSTALL_MACOS / INSTALL_WINDOWS_EXPERIMENTAL / UNINSTALL / ROLLBACK / COMPATIBILITY / SECURITY / PRIVACY / CHANGELOG / KNOWN_LIMITATIONS / NOTICE / THIRD_PARTY_NOTICES / CONTRIBUTING / docs/*（含三层关系说明、初版发行与二次创作声明） |
| `scripts/install.sh` `uninstall.sh` `rollback.sh` | 公开版重写（不复制内部脚本，内部脚本含真实会话 id 与用户原文样例） |
| `scripts/package-release.mjs` `compat-check.mjs` `test-artifacts.mjs` `verify-release.mjs` `materialize-build.mjs` | 公开版新写：打包、兼容性门、产物契约测试、发行校验、以及「clone 后从随包 tgz 还原 bundle 以便免构建校验」 |
| `scripts/windows/install.ps1` `uninstall.ps1` `rollback.ps1` | 公开版新写（PowerShell）：宿主任意 Windows 环境下的实验性安装/卸载/回滚，逻辑演练见 [WINDOWS_EXPERIMENTAL_STATUS.md](WINDOWS_EXPERIMENTAL_STATUS.md) |
| 根 `package.json` `LICENSE` `VERSION` `manifest.json` `checksums.sha256` `.gitignore` | 公开发行新增 |
| git 历史 | `git init` 全新历史，首个提交为 `chore: initial public release of Personal Harness V1.1 (sanitized source)`；**不含**任何上游提交、作者信息或内部提交信息 |

## 6. 保留未改动项（如实登记）

| 项 | 说明 |
|---|---|
| 源码注释中引用内部文档路径（如 `docs/E5_*.md`、`docs/E4_*.md`） | 这些注释解释了「为什么需要这一层」（例如官方任务账本是白名单精确键集）。它们不含个人数据，改注释会改动源码文本、偏离「最小改动」原则 → **原样保留**，在此登记为已知的文档引用悬空 |
| `personal-workspace/src/client/conversations.ts` 注释里提到内部 smoke 脚本名 | 同上：纯注释，无个人数据 |
| `dps.debug` 诊断开关与 `z-index` 例外（KL-8） | 产品既有行为，属登记的已知限制，不改 |
| 组件版本号（0.1.x）与产品版本（V1.1）的语义分离 | 冻结版既有语义，不改；公开发行用文件名 `-public-v1.1` 与 sha256 与内部产物区分 |

## 8. 审计期间发现并修复的两处泄露点（自查记录）

公开发行审计**不是一次通过**。以下两处是在把文档与脚本纳入被跟踪集合后、由「公开集合扫描器」复查时发现的真实泄露点，已修复并复验：

| # | 泄露点 | 性质 | 修复 | 复验 |
|---|---|---|---|---|
| 1 | `scripts/test-artifacts.mjs` 的负向测试夹具内嵌了真实私人标识（个人品牌串、私有项目名、本机工作区目录名、用户名） | **脚本自身成了私人数据副本**——因为「测试产物里不含 X」最直白的写法就是把 X 写进测试 | 改为**结构性断言**：产物内品牌常量必须**等于**产品名；项目/Agent 目录种子必须为空；禁止模式只保留通用形态（本机绝对路径、会话 UUID、API Key / GitHub token 形态、邮箱） | 负向测试证明有效（把品牌常量改成别的值 → 测试 FAIL）；修复后公开集合扫描 blocker = 0；独立字面量复核（直接 grep 品牌串 / 账号 / 用户名 / 私有项目名 / 本机路径）全部 **0 命中** |
| 2 | 扫描报告正文原样复述了 blocker 的命中样本 | **报告自身成了私人数据副本**（自指泄露） | blocker 样本一律打码（保留前 2 字符 + 长度）；由扫描器生成的派生报告不再参与扫描（避免自指） | 重新生成后报告内含 0 处私人字面量 |

保留的 8 处非阻断命中（全部为误报，逐条列于 [PUBLIC_PRIVACY_SCAN_REPORT.md](PUBLIC_PRIVACY_SCAN_REPORT.md)）：3 处是文档在**说明导出留档**时提到内部仓库名；4 处是文档/脚本引用**官方通用存储路径**（`.dsh/sessions/`、`.dsh/.personal/`）；1 处是源码注释解释官方任务账本路径。**没有一处包含个人标识、本机路径或用户内容。**

## 9. 公开发行重建（第二次）——历史泄漏修复带来的新增差异

第一次公开发行 staging 的 git 历史在 diff 中可恢复出私人字符串（测试夹具被引入又删除），因此该历史整体弃用，公开仓库改为**新建目录 + 全新 `git init` + 只复制干净 tracked 文件**。重建过程中相对第一次公开发行的新增差异：

| # | 变化 | 原因 |
|---|---|---|
| 1 | `INSTALL.md` → `INSTALL_MACOS.md` | 公开发行需要明确区分 macOS（已验证）与 Windows（Experimental） |
| 2 | 新增 `INSTALL_WINDOWS_EXPERIMENTAL.md`、`scripts/windows/{install,uninstall,rollback}.ps1`、`docs/WINDOWS_EXPERIMENTAL_STATUS.md` | Windows Experimental 版（插件产物本身不变，仅新增 Windows 生命周期脚本与文档） |
| 3 | 文档中不再出现内部私有仓库名（改为「内部私有冻结仓库（不公开）」） | 公开集合要求该字符串出现次数为 0 |
| 4 | `src/workstation/*/build.mjs` 增加 `DPS_SHA_OVERRIDE` 环境变量覆盖 | 支持**自引用发行提交**：在创建发行提交之前打包，显式注入目标短哈希（发行期构建参数，不改变产品行为） |
| 5 | `scripts/package-release.mjs`：`commitAtPackaging` 记录发行提交短哈希 + 新增 `releaseCommitSelfEmbedded`；`workingTreeDirtyAtPackaging` 按 `--untracked-files=no` 判定 | 自引用提交语义（40 位完整哈希不可能内嵌，属自引用不可能）；并新增硬闸门：内嵌提交 ≠ HEAD 或工作树不干净即失败 |
| 6 | 产物重新构建（新仓库、新提交 → 内嵌哈希变化） | 发行包必须与公开仓库的提交逐一对齐 |

## 10. 自动化核验（本报告结论的可复现依据）

| 核验 | 方法 | 结果 |
|---|---|---|
| 无私人数据 | `npm run verify` 的全树扫描 + [PUBLIC_PRIVACY_SCAN_REPORT.md](PUBLIC_PRIVACY_SCAN_REPORT.md) / [PUBLIC_SECRET_SCAN_REPORT.md](PUBLIC_SECRET_SCAN_REPORT.md) | 命中 0（唯一命中为无害的说明性路径引用，已记录判定） |
| 无官方代码被复制 | [PUBLIC_CODE_PROVENANCE.md](PUBLIC_CODE_PROVENANCE.md) 的逐文件相似度实测 | 无 ≥0.6 且无法解释的文件 |
| 产物可安装且字节一致 | `scripts/install.sh` 第 7 步 / [PUBLIC_INSTALL_TEST_REPORT.md](PUBLIC_INSTALL_TEST_REPORT.md) | 逐字节一致 |
| 从源码可重建 | `npm install && npm run build && npm run package`（esbuild 版本与冻结版一致 0.25.12） | 通过；`npm run verify` 自洽 |
