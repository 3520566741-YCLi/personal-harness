# PUBLIC V1.1 RELEASE AUDIT

公开发行前的**放行闸门**审计。每一项都给出判定与证据位置；**不能验证的项一律写「未验证」**，绝不转换为 PASS。

- 审计对象：本仓库（Personal Harness V1.1 Public Distribution，发行标签 `public-v1.1`，另含 Windows Experimental 目录）
- 审计时间：2026-09-12（SGT）
- 公开历史：**全新仓库**，只有一个**初始提交**，且该提交即**自引用发行提交**（产物内嵌短哈希 == HEAD 短哈希）；旧 staging 的 git 历史**已废弃、未推送**（其 diff 可恢复出私人字符串，见"旧历史泄漏"一节）
- 来源（只读）：内部私有冻结仓库（不公开）@ tag `v1.1.0` / `3f231ced163d997a72c748dac40f5aa51415061e`（工作树干净、未被本次工作修改）

## A. 纪律闸门（最高原则）

| # | 闸门 | 判定 | 证据 |
|---|---|---|---|
| A1 | **不是**「私有仓库直接转公开」 | PASS | 白名单导出（`tools/export-public.mjs`，21 条），见 [../PUBLIC_EXPORT_ALLOWLIST.md](../PUBLIC_EXPORT_ALLOWLIST.md) |
| A2 | **不含**私有提交历史 / 作者信息 / commit message | PASS | `git log` 只有本仓库自己的初始提交及其后继；`.git/**` 在排除清单内 |
| A3 | **不含** `$HOME/.dsh` 用户数据 | PASS | 导出白名单从未引用 `$HOME/.dsh`；仓库内无 sessions / storages / 任务账本数据 |
| A4 | **不含**任何真实会话 / 任务 / 项目数据 | PASS | 项目种子 `projects: []`、Agent 种子 `agents: []`；[PUBLIC_PRIVACY_SCAN_REPORT.md](PUBLIC_PRIVACY_SCAN_REPORT.md) 命中 0 |
| A5 | **不含** `/Users/<真实用户名>` 等本机绝对路径 | PASS | 扫描命中 0；脚本一律用 `$HOME` / `os.homedir()`（`install.sh`/`uninstall.sh`/`rollback.sh`/`compat-check.mjs`）；唯一 `/Users/` 字面量出现在一条**注释**里，用于说明「`/Users/demo` 这类占位不算命中」 |
| A6 | **不含** cookie / token / key / 凭据 | PASS | [PUBLIC_SECRET_SCAN_REPORT.md](PUBLIC_SECRET_SCAN_REPORT.md)；无 `.env`，`.gitignore` 忽略凭据类文件名 |
| A7 | **不含**用户私有项目名作为预置内容 | PASS | 隐私扫描 P-06 规则命中 0 |
| A8 | **不含**上游专有产物 / 官方源码再分发 | PASS | 官方包与 react 全部 `external`；与官方包逐文件相似度实测无 ≥0.6 且无法解释者；与官方 preset 99.6% 同源的模板目录**已排除** → [PUBLIC_CODE_PROVENANCE.md](PUBLIC_CODE_PROVENANCE.md) |
| A9 | **不含**许可不明来源的第三方代码 | PASS | 发行产物内第三方标识命中 0；devDependencies 全部宽松许可且不随发行 → [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| A10 | 未改变冻结 V1.1 的产品语义 | PASS | 源码 diff 仅 9 个文件有内容差异，全部为隐私中性化 / 种子置空 / 描述文案；产物 diff 仅 6 行（sidebar）与 156 行（workspace）且可逐条归因；hud 产物**逐字节相同** → [PUBLIC_SANITIZATION_REPORT.md](PUBLIC_SANITIZATION_REPORT.md) |
| A11 | 未修改私有冻结仓库 | PASS | 本次全部工作在 staging 目录（私有仓库之外）；私有仓库无新提交、无新 tag、HEAD/tag 未变 |
| A12 | **旧 staging 的 git 历史未被公开** | PASS | 旧 staging diff 中可恢复私人字符串（`git log -p` 各出现 2–4 次）→ 该历史整体弃用；公开仓库为**新建目录 + 全新 `git init`**，只复制干净的 tracked 文件，历史中不存在任何旧提交 |
| A13 | Windows 表述未被写成支持 | PASS | README 平台表、`COMPATIBILITY.md`、`INSTALL_WINDOWS_EXPERIMENTAL.md`、三个 `.ps1` 运行输出、`docs/WINDOWS_EXPERIMENTAL_STATUS.md` 一律标 **Experimental / 未验证**；Release 资产名含 `Windows Experimental` |

## B. 发行技术闸门

| # | 闸门 | 判定 | 证据 |
|---|---|---|---|
| B1 | 公开构建可从净化源码编译（§13） | PASS | **全新 clone** → `npm install` → `npm run build` → `npm run package` → `npm run verify` → `npm test` 全通过；重建的三个 `client.js` 与**随仓库发布**的产物 **sha256 逐字节一致**（自引用发行提交的效果：内嵌短哈希 == 该提交自身短哈希，所以在本提交上重建即可复现发布字节）；与内部冻结版的差异为 sidebar 6 行 / workspace 156 行 / hud 0 行（品牌与审计修复，见 [PUBLIC_CODE_PROVENANCE.md](PUBLIC_CODE_PROVENANCE.md)） |
| B2 | 产物契约测试（两种 `NODE_ENV`） | PASS | 各 57 项，失败 0（`npm run test`） |
| B3 | 发行完整性自查 | PASS | `npm run verify`：3 个包 sha256 逐一致 + 装机一致性 + 无私人数据 + manifest 承诺的 helper 路径存在 |
| B4 | 清洁安装测试（隔离 HOME / 合成 profile，§18） | PASS | [PUBLIC_INSTALL_TEST_REPORT.md](PUBLIC_INSTALL_TEST_REPORT.md)：**PASS 26 / FAIL 0**，装机字节逐一致 |
| B5 | 升级测试（§19） | **N/A** | 首个公开发行，无上一个公开版本（**不是 PASS**）；「重复安装」只证明幂等，不冒名顶替升级 |
| B6 | 卸载测试（§20） | PASS | 同上报告第 4 节：插件全移除、用户数据保留 |
| B7 | 回滚测试（§21） | PASS | 同上报告第 5 节：profile 回到安装前状态、用户数据未触碰 |
| B8 | 安装失败自动回滚（§16） | PASS（代码路径 + 隔离测试可见回滚点被真实使用） | `install.sh` 第 6 节 `rollback_now()`；日志显示 rollback 使用真实回滚点并成功 |
| B9 | 兼容性门，不静默安装（§17） | PASS | `compat-check` 在真实环境判 **SUPPORTED**；`install.sh` 对 UNTESTED/INCOMPATIBLE 一律拒绝并提示显式开关 |
| B10 | 首次安装 = 空白用户状态（§8） | PASS | `projects: []` / `agents: []`；隔离测试断言「合成 profile 依赖为空 = 全新用户」后安装不产生任何预置内容 |
| B11 | 只 create-if-missing、绝不覆盖用户 registry（§9） | PASS | 隔离测试断言「用户 registry 未被覆盖」 |
| B12 | `--purge-user-data` 仅按需、双重确认、范围最小（§15） | PASS | 需手动输入大写 `PURGE`；删除范围仅回滚点目录 + 本发行版自己的包缓存 + `$HOME/.dsh/.personal`（若存在）；官方 storages / sessions 明确排除 |
| B13 | **产物内嵌提交 == 仓库 HEAD** | PASS | 自引用发行提交：短哈希由 nonce 搜索使其等于内嵌值；`npm run verify` 新增**硬闸门**（内嵌 ≠ HEAD 或工作树不干净 → 失败） |
| B14 | **打包时无提交之外的 tracked 改动** | PASS | `workingTreeDirtyAtPackaging=false`，并由 verify 事后核验 `git status --porcelain` 为空 |
| B15 | Windows 脚本语法 + 逻辑 | **部分验证**（不是 Windows 验证） | PowerShell 7.4.6 解析 3 个脚本 0 错误；非 Windows 环境隔离演练 **PASS 27 / FAIL 0**（含拒绝静默安装、`-DryRun` 零改动、哈希核对、备份、幂等重装、卸载保数据、回滚自救副本）。**Windows 真机未测试** |
| B16 | **clone 后免构建也能校验发布的包** | PASS | `npm run verify` / `npm test` 在 `src/workstation/*/build/` 缺失时，由 `scripts/materialize-build.mjs` 从 `packages/*.tgz` 还原 bundle 并逐字节核对 `manifest.json`，随后 57 项契约测试全过（审计中修出来的能力：修复前全新 clone 直接 `npm run verify` 会失败） |
| B17 | **`--dry-run` 真的零改动** | PASS | 隔离测试断言：`--dry-run` 后不创建 `~/.dsh/guard-backups`、不创建 `~/.dsh/cache`、不改 profile 依赖（修复前会真的建目录并复制 tgz）；Windows 侧同样两条断言在演练中通过 |

## C. 公开发行物闸门

| # | 闸门 | 判定 | 证据 |
|---|---|---|---|
| C1 | 公开 README 面向朋友、只讲真实功能（§22） | PASS | [../README.md](../README.md)：能力表逐条可对应源码/产物；含「它不是什么」 |
| C2 | 安装文档（§23） | PASS | [../INSTALL_MACOS.md](../INSTALL_MACOS.md)（+ [SECURITY](../SECURITY.md) / [PRIVACY](../PRIVACY.md) / [ROLLBACK](../ROLLBACK.md) / [UNINSTALL](../UNINSTALL.md) / [COMPATIBILITY](../COMPATIBILITY.md) / [KNOWN_LIMITATIONS](../KNOWN_LIMITATIONS.md)） |
| C3 | 不含内部开发文档（§24） | PASS | `docs/evidence/**`、`DEVELOPMENT_LOG.md`、内部各轮报告与路线图均未导出（排除清单见 `PUBLIC_EXPORT_ALLOWLIST.md`） |
| C4 | 全新 git 历史，首个提交信息符合要求（§25） | PASS | `git init -b main`；首个提交 `chore: initial public release of Personal Harness V1.1 (sanitized source)` |
| C5 | 审计时点：未创建任何远端、未推送（§26/§27） | PASS（**指审计时点**） | 审计时 `git remote -v` 为空、未执行任何 `git push`；推送是用户在本次任务中**明确授权**后的独立动作，顺序见 §F |
| C6 | 审计时点：未创建 GitHub Release / 未公开发布（§28） | PASS（**指审计时点**） | 审计时未执行任何发布动作；Release 创建同样属授权后的动作，见 §F |
| C7 | 未擅自选择许可证（§12） | **需用户确认**（已按保守选择放行） | 本次沿用内部版本既有的 **MIT**，持有者改为中性名 `Personal Harness Authors`；**许可证的最终选择与持有者名称属用户决定**，公开推送前请确认（见 `PRE_PUBLIC_PUSH_CHECKLIST`） |
| C9 | **三层关系已在三处文档讲清**（Harness Web UI ← DSH Desktop ← Personal Harness；脚本装进本地 profile；必须重启宿主；浏览器单独运行不在已验证路径内） | PASS | README 顶部、[INSTALL_MACOS.md](../INSTALL_MACOS.md)、[INSTALL_WINDOWS_EXPERIMENTAL.md](../INSTALL_WINDOWS_EXPERIMENTAL.md) 均含同一张层级图与 7 条说明 |
| C10 | **平台标记就位** | PASS | macOS 文档标记 `已验证：macOS + DSH Desktop 2.0.5`；Windows 文档标记 `Experimental / 未验证` |
| C11 | **初版发行与二次创作声明** | PASS | README「参与 / 二次创作」+ [CONTRIBUTING.md](../CONTRIBUTING.md)（含「不得移除 Windows 未验证标记，除非附真实 Windows 实测证据」） |
| C12 | 禁止动作未发生（§30） | PASS | 审计与发布全程：未修改私有冻结仓库、未改冻结产物字节、未复用旧 staging 的 git 历史、未新增产品功能代码、未删除任何用户数据 |

## F. 发布动作（已获用户授权；在发行提交冻结之后执行）

本文件 A–E 节描述的是**审计时点**的状态。用户在本次任务中明确授权「新建公开仓库 + 完成公开 Release」，因此下列动作在发行提交冻结后按序执行：

| # | 动作 | 具体内容 |
|---|---|---|
| F1 | 新建**公开**仓库并添加远端 | 仓库名 `personal-harness`；`git remote add origin <本托管平台的仓库地址>`（**本仓库文件内刻意不写自身 URL**：该 URL 含发布者账号标识，属 §1 零出现清单范围） |
| F2 | 推送 `main` | 只推这 1 个发行提交；旧 staging 的 7 个提交**不推送**、也不存在于本仓库历史中 |
| F3 | macOS Release | tag `v1.1.0-macos`；资产 = 三个 `.tgz` + `manifest.json` + `checksums.sha256` + 安装/卸载/回滚说明 + 各包 SHA-256 + 兼容区间（**仅 macOS + DSH Desktop 2.0.5 已验证**）+ 未验证项清单 |
| F4 | Windows Experimental Release | tag `v1.1.0-windows-experimental`；独立资产，名含 `Windows Experimental`；正文含完整警告块；**标记 Experimental / 未验证**，不得读作 SUPPORTED |
| F5 | 发布后复验 | 从远端克隆 → `npm install` → `npm run verify` → `npm test`；确认远端内容与本地发行提交一致（`git rev-parse HEAD` 相同） |
| F6 | 私有冻结仓库核查 | 复核 HEAD `3f231ce`、tag `v1.1.0`、工作树干净——发布动作**没有**触碰它 |

## G. 文档更新版发行（docs-only，产品功能未变）

在首个公开发行之后，用户授权做了一次**只改文档**的发行：把说明写得更像正常人能看懂的使用说明。边界与结果如下。

| # | 项 | 事实 |
|---|---|---|
| G1 | 改动范围 | **仅 Markdown 与 Release 文案**：`README.md`（推荐安装方式 + 二次创作措辞 + 可选插件分类）、`INSTALL_MACOS.md`、新增 `FEATURE_GUIDE.md` 与 `OPTIONAL_PLUGINS.md`、`CONTRIBUTING.md`、`CHANGELOG.md`、`THIRD_PARTY_NOTICES.md`、`docs/*` 报告 |
| G2 | **产品源码** | `src/**` **逐字节未改**（`git diff` 为空） |
| G3 | **安装/卸载/回滚脚本行为** | `scripts/**` **逐字节未改**（行为不变） |
| G4 | **发行产物** | 为让「提交 ↔ 产物」硬校验成立，产物按**既有流程重新构建**（未手改一个字节）：与上一版相比，全部差异只有**自引用短哈希字面量本身**——sidebar 1 行、workspace 1 行（`DPS_SHA` / `BUILD_SHA`）；`dsh-personal-hud` 不含该字面量，`.tgz` 与上一版**逐字节相同**（`c70fa861…`）。产品代码、依赖、清单结构、脚本行为均无其他变化 |
| G5 | 自引用对应关系如何维持 | `npm run verify` 硬要求 `git rev-parse --short HEAD` == 产物内嵌短哈希。旧 tag 必须保留 ⇒ 旧提交仍可达 ⇒ **新提交若沿用旧短哈希，git 会因前缀歧义把缩写延长到 8 位**，任何 fetch 了 tag 的 clone 都会校验失败。故本次改用**全新的唯一 7 位目标**（`07086fe`）重新构建 + nonce 搜索，让新提交短哈希唯一且等于内嵌值 |
| G6 | 发行方式 | **旧 Release / tag 不删除、不覆盖**（`v1.1.0-macos` 仍可访问且保持 Latest）；新建文档版 macOS Release（标题标注 Documentation Update）。受 G5 约束，新资产与旧版**只差自引用字面量**——Release 说明中已如实写明 |
| G7 | Windows | 状态**不变**：`Experimental / 未验证`，仍为 Pre-release；本次未新建、未覆盖、未改标为 Latest |
| G8 | 未验证项 | **不变**——同 D 节；文档措辞不得把未验证项写成通过 |
| G9 | 新增 `OPTIONAL_PLUGINS.md`（作者界面的第三方插件） | 只登记**有证据**的事实：逐个查公开 npm registry 的 `/latest`（名称 / 版本 / 许可 / 仓库）并读本机已安装副本的 `package.json`；逐项标注「干净 profile 实测 = 未实测」；明确「本仓库不分发任何第三方插件」；两项标明**不随本仓库分发**（`hindsight-coding-agents` 公开包无 license 字段、`dsh-pocket` 为 GPL-2.0）；`dsh-agent-approval` 本机 tgz 与 npm 1.5.0 的 tarball sha1 相同、`dsh-restart-button` 本机 0.0.1 与 npm 0.1.2 版本不同（如实写明「未验证是否等价」）；**不写任何账号、余额、token、本机路径** |

给二次创作者的一条实践规则（已写入 `CONTRIBUTING.md`）：只改文档时**优先让新提交的短哈希去匹配产物里已有的内嵌值**——这样发行的 `.tgz` 与上一版逐字节相同，可以正当地说「产品未变」。但如果那个短哈希已被必须保留的历史提交占用，就别硬凑：**换一个全新且唯一的 7 位短哈希重新构建**，并如实说明产物差异只有内嵌字面量。本次发行正是后者。



## D. 明确**未验证**（不得视为通过）

| 项 | 状态 |
|---|---|
| 在真实桌面会话中打开公开构建并肉眼确认界面 | **未验证**（需真机重启宿主） |
| 在 DSH Desktop 2.0.5 以外的宿主版本运行 | **未验证** |
| 从上一个公开版本升级 | **N/A**（无上一个公开版本） |
| 冷启动耗时 / 停止操作 settle 时序 / 长时运行资源占用 | **未验证** |
| 公开构建在真实 profile 上的安装（真实 profile 当前装的是内部版） | **未执行**（有意：避免触碰用户真实环境；安装链路已在隔离环境完整验证） |
| Windows 上的安装 / 插件加载 / 界面 / 卸载 / 回滚 | **未验证**（无 Windows 环境；只有语法解析与逻辑演练，见 [WINDOWS_EXPERIMENTAL_STATUS.md](WINDOWS_EXPERIMENTAL_STATUS.md)） |

## E. 放行结论

| 项 | 值 |
|---|---|
| A 纪律闸门 | 13/13 PASS |
| B 技术闸门 | 15 PASS ／ 1 N/A（B5 升级）／ 1 部分验证（B15 Windows 脚本逻辑——不是 Windows 验证） |
| C 发行物闸门 | 9 PASS ／ 1 需用户确认（C7 许可证持有者） |
| D 未验证项 | 5 项如实登记，未转换为 PASS |
| 阻断性问题 | **0** |

**判定：PUBLIC EXPORT READY**（审计结论）。许可证持有者名称（C7）**仍保留给用户决定**；公开推送与 Release 已在用户授权下按 §F 执行。

**发布后的最终状态：`macOS: RELEASED` ／ `Windows: EXPERIMENTAL / UNTESTED`。**
