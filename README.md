# Personal Harness V1.1

**给 DSH Desktop 加一层「个人工作站」外壳的插件集合。** 装完后左侧会多出一套工作台导航（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近），底部多一条状态 HUD。

- 不改官方 DSH Desktop 一行代码（纯官方扩展点，compatibility mode）
- 只读、只用官方存储与官方 API；**你的会话、任务、项目数据始终属于 DSH 官方存储**，本发行版不接管、不复制、不上传
- 装/卸/回滚都是一条命令，安装前自动留回滚点，安装失败自动回滚
- 无网络请求、无遥测、无账号、无密钥

👉 **第一次用，先看 [FEATURE_GUIDE.md](FEATURE_GUIDE.md)**：用大白话讲清「主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近」每个入口是干什么的、什么时候用、不会做什么。

## 三层关系（先读这一段，装之前必须搞清）

```text
Harness Web UI
    ↓ 由 DSH Desktop 承载并加载
DSH Desktop
    ↓ 安装三个 Personal Harness 插件
Personal Harness
```

1. 你必须**先安装并能正常启动 DSH Desktop**——这是前提，不是可选步骤；
2. **DSH Desktop 负责承载 Harness Web UI**，并提供本地插件加载环境；
3. **Personal Harness 不是独立 App，不是浏览器扩展，也不替代 Harness 或 DSH Desktop**；它只是装进 DSH Desktop 的一层界面/组织插件；
4. 你下载或 clone 本仓库后，运行**对应平台**的安装脚本（macOS 用 `scripts/install.sh`，Windows 用 `scripts/windows/install.ps1`）；
5. 安装脚本会把三个 `.tgz` 插件装进 **DSH Desktop 的本地 profile**（默认 `~/.dsh/profiles/desktop`）；
6. 装完必须**完全退出并重新启动 DSH Desktop**（⌘Q / 完全关闭，不是最小化），插件界面才会出现——插件只在宿主启动时加载；
7. **在浏览器里单独运行的 Harness Web UI 不属于已验证的安装方式**，也不能承诺把本仓库直接套用上去就能工作（本发行版验证的是「DSH Desktop 加载本地插件」这一条路径）。

## 平台状态（先看这个）

| 平台 | 状态 |
|---|---|
| **macOS + DSH Desktop 2.0.5** | **已验证**（安装 / 重装 / 卸载 / 回滚全链路实测） |
| 其他 macOS / DSH 版本 | **UNTESTED**（安装脚本会先拒绝静默安装，需显式确认） |
| **Windows** | **Experimental / 未验证**（脚本已提供，但从未在真实 Windows DSH Desktop 上验证） |

> ## ⚠️ Windows Experimental / 未验证版
>
> **此版本尚未在真实 Windows DSH Desktop 环境完成安装、界面、卸载与回滚验证。**
> 插件核心使用 web 平台接口，理论上可能兼容；但 DSH Desktop 的 Windows 版本、profile 路径、扩展接口和 pnpm 行为可能不同。
>
> 你可能需要根据自己安装的 DeepSeek Harness / DSH Desktop 实际情况修改路径、脚本或配置后才能使用。
> **不能保证 clone 后可直接安装，也不能保证与所有 Windows 版本兼容。**
>
> 请先备份自己的 DSH profile；如出现问题，请停止并恢复备份。

Windows 的验证边界见 [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md)：**脚本语法与逻辑已在 pwsh 7 下演练通过，但 Windows 真机未测试。**

> 这是一个**个人自用工具**的公开发行版，不是商业产品。请先读 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)：它能用、能卸干净，但有几处已知限制没有修。

---

## 它到底加了什么（只有这些）

| 能力 | 说明 |
|---|---|
| **侧栏导航外壳** | 把「主页 / 会话列表 / 新任务 / 任务看板 / 项目 / 工作区 / 最近」渲染进官方侧栏槽位；窄栏时自动折返，不抢官方布局 |
| **项目层** | 把会话/任务归入「项目」的关系层，本机持久化（键 `dsh.personal.projects.v1`）。公开版**初始为空**，项目由你自己建 |
| **任务补充字段** | 官方任务账本只接受 `title/description/prompt/workspaceId/mode/permission/model/schedule`（白名单精确键集，多写一个键整条请求 400）。所以「截止时间 / 预期交付物 / 约束 / 备注」由本层在**本机**保存并在界面上回显 |
| **Agent 目录** | 目录界面可用，但公开版**不含任何预设 Agent**（初始为空），目录内容由你自己填 |
| **底部 HUD** | 一行状态条（当前视图 / 会话 / 任务统计） |

**它不是什么：** 不是 DSH Desktop 的替代或分支；不含任何官方源码；不含 AI 模型、API Key、账号或凭据；不修改、不删除、不迁移你的任何 DSH 数据。

---

## 想复刻作者那套完整工作台？（第三方可选插件）

**本仓库只分发上面那三个插件。** 作者自己的 DSH Desktop 里还装着若干**第三方**插件，界面观感与工作流有相当一部分来自它们——但它们**不在本发行包里**，本仓库也不打包、不再分发它们。完整清单、来源核查（公开来源 / 许可证 / 是否需要账号或 token）与实测状态见 **[OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md)**。

三类一句话版：

| 分类 | 有哪些 | 说明 |
|---|---|---|
| **接近作者界面（需另装）** | `dsh-better-sidebar`、`@linxin666/dsh-client-ui-task-board`、`dsh-cost-meter`、`dsh-restart-button`、`@linxin666/dsh-client-ui-git-graph`、`@duke-dsh-plugins/dsh-agent-approval` | 第三方作品，各自安装、各自许可。`better-sidebar` 与 `task-board` 是完整工作台体验的重要前置能力 |
| **可选：更接近作者工作流（按需再装）** | `@deepseek-ai/dsh-compaction-basic`（作者实际用的是社区实现 `dsh-compaction-instant`）、`@liustack/modlens`、`@vectorize-io/hindsight-coding-agents`、`dsh-notion-mcp`、`dsh-pocket` | 分别解决上下文压缩 / 图片理解 / 长期记忆 / Notion 连接 / 手机远程访问，不用也不影响核心体验 |
| **本仓库不分发** | 以上全部第三方插件；其中 `@vectorize-io/hindsight-coding-agents`（公开包**无 license 字段**）与 `dsh-pocket`（**GPL-2.0**）**依许可证也**不适合由我们打包分发 | 想装请从它们各自的公开来源安装 |

**不要期待「装完必然和作者完全一样」。** 你自己的 DSH Desktop 版本、账号状态、主题、窗口布局、模型、余额、套餐、权限以及各第三方插件的版本都会造成差异；本仓库只负责它自己那三个插件的界面与行为。

> 这些第三方插件的来源与许可证我们**核对过并如实登记**，但**没有**在干净 profile 里替它们跑过安装 / 卸载验证——`OPTIONAL_PLUGINS.md` 里每一项都标注了实测状态，未实测就是未实测。

---

## 快速开始（macOS）

前置：macOS + 已安装 **DSH Desktop 2.0.5**（其他 2.x 版本见 [COMPATIBILITY.md](COMPATIBILITY.md)）+ Node.js ≥ 20 + `pnpm`。

### 最推荐的方式：让 AI 帮你装（它读文档，你点确认）

> 把本仓库链接发给你**自己信任、并且能访问你电脑终端**的 AI，让它阅读安装文档后协助下载、检查前置条件、创建备份并安装。
> 手动安装也可以，但需要自己逐条执行命令，容易漏步骤。

可以把下面这段连同仓库地址一起发给它：

```text
这是我给你的一个开源仓库：<本仓库地址>
请先完整读 README.md 和 INSTALL_MACOS.md，然后：
1) 检查我的机器是否满足前置条件：DSH Desktop 版本、Node.js ≥ 20、pnpm 是否可用；
2) 告诉我这次会改哪个 profile 目录、备份会放在哪里；
3) 等我确认后再执行安装；
4) 安装完提醒我完全退出并重启 DSH Desktop（插件只在宿主启动时加载）；
5) 每一步的输出都给我看一遍。
不满足条件或不确定的地方请直接说，不要替我猜、不要跳过检查。
```

为什么推荐这么做：安装本身只有几条命令，但**漏一步就会让人误以为"插件没用"**（最常见的就是装完没有重启宿主）。AI 可以逐条帮你核对。

也请你和 AI 都清楚这些边界：

- AI **必须能访问你的本机终端**，才可能替你下载和安装；做不到时它只能给你命令清单，由你自己执行；
- AI 应在安装**之前**检查 DSH Desktop、Node.js、pnpm，并说明**将要修改哪个 profile**、**备份放在哪里**，然后**等你确认**；
- 装完应提醒你**完全退出再重启 DSH Desktop**；
- 备份、安装、系统权限提示仍然要**你自己确认**；
- **在浏览器里单独运行 Harness Web UI 不属于本发行版已验证的安装方式**——本发行版验证的是「DSH Desktop 加载本地插件」这一条路径。

### 手动安装

```bash
git clone <这个仓库的地址> dsh-personal-harness
cd dsh-personal-harness
bash scripts/install.sh --dry-run   # 先看它要做什么（真 dry-run：不建目录、不复制、不安装）
bash scripts/install.sh             # 装进 $HOME/.dsh/profiles/desktop
```

然后**完全退出 DSH Desktop 再重新打开**（插件在宿主启动时加载）。

```bash
bash scripts/uninstall.sh        # 卸载（默认完整保留你的数据）
bash scripts/rollback.sh         # 回到本次安装前的状态
bash scripts/rollback.sh --list  # 看看有哪些回滚点
```

细节：[INSTALL_MACOS.md](INSTALL_MACOS.md)｜[UNINSTALL.md](UNINSTALL.md)｜[ROLLBACK.md](ROLLBACK.md)

Windows（**Experimental / 未验证**）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -AllowUntested
```

细节：[INSTALL_WINDOWS_EXPERIMENTAL.md](INSTALL_WINDOWS_EXPERIMENTAL.md)

---

## 完整性可自查

发行包含 `manifest.json`（每个包的 sha256、内嵌提交、宿主兼容区间）与 `checksums.sha256`。安装脚本在装之前会先校验，装之后会**逐字节比对** profile 内的 `client.js` 与发行包。

```bash
npm run verify     # 包哈希 / 装机一致性 / 无私人数据 全量自查
npm run test       # 产物契约测试（57 项）
npm run compat     # 打印本机宿主兼容性判定
```

想自己从源码构建，而不是用预打包的 `.tgz`：

```bash
npm install        # 只装构建期依赖（esbuild / jsdom），它们不进发行产物
npm run verify     # 校验随仓库发布的三个 .tgz（哈希 / 内嵌提交 / 装机一致性 / 无私人数据）
npm test           # 产物契约测试（57 项）
npm run compat     # 打印本机宿主兼容性判定
```

说明（避免误解）：

- 刚 clone 下来时还没有 `src/workstation/*/build/`（构建产物目录，按约定不进 git），`npm run verify` / `npm test`
  会**自动从 `packages/` 里随仓库发布的 `.tgz` 还原**这几个 bundle，再逐字节核对 `manifest.json` 的 sha256。
  也就是说：**不编译也能校验你拿到的包是否被改过。**
- 想验证「源码能重新编译出同样的包」：
  `npm run build && npm run package && npm run verify`（重建后 `client.js` 应与发布版逐字节一致）。

---

## 版本与构成

| 项目 | 值 |
|---|---|
| 产品版本 | **Personal Harness V1.1**（发行标签 `public-v1.1`） |
| 组件 | `dsh-personal-sidebar` 0.1.24 ／ `dsh-personal-workspace` 0.1.20 ／ `dsh-personal-hud` 0.1.3 |
| 宿主 | DSH Desktop **2.0.5**（compatibility mode，零补丁） |
| 安装方式 | 把三个 `.tgz` 以 `file:` 依赖装进 DSH Desktop 的 profile |
| 许可 | MIT（见 [LICENSE](LICENSE)、[NOTICE](NOTICE)） |

组件版本号（0.1.x）与产品版本号（V1.1）是两套语义，故意不同：组件独立演进，产品按阶段发布。详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 文档

| 文档 | 内容 |
|---|---|
| [FEATURE_GUIDE.md](FEATURE_GUIDE.md) | **功能导览（大白话）**：每个入口是什么、什么时候用、不会做什么 |
| [OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md) | **可选的第三方插件**：哪些要另装才能接近作者界面、各自来源与许可证、需要什么账号、哪些未实测 |
| [INSTALL_MACOS.md](INSTALL_MACOS.md) | **macOS 安装**（已验证） |
| [INSTALL_WINDOWS_EXPERIMENTAL.md](INSTALL_WINDOWS_EXPERIMENTAL.md) | **Windows Experimental / 未验证版** 安装说明 |
| [UNINSTALL.md](UNINSTALL.md) | 卸载（含 `--purge-user-data` 的确切删除范围） |
| [ROLLBACK.md](ROLLBACK.md) | 回滚点机制与自动回滚 |
| [COMPATIBILITY.md](COMPATIBILITY.md) | SUPPORTED / UNTESTED / INCOMPATIBLE 判定规则 |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) | **请务必读**：已知限制与未验证项 |
| [SECURITY.md](SECURITY.md) | 安全边界、数据流、漏洞反馈 |
| [PRIVACY.md](PRIVACY.md) | 本工具碰什么数据、不碰什么数据 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方组件与许可 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 参与 / fork / 二次创作与平台适配的规则 |
| [PUBLIC_EXPORT_ALLOWLIST.md](PUBLIC_EXPORT_ALLOWLIST.md) | 本次公开发行**逐文件**的导出与排除清单 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构与扩展点 |
| [docs/PUBLIC_CODE_PROVENANCE.md](docs/PUBLIC_CODE_PROVENANCE.md) | 代码来源审计（自研 / 官方 API / 无复制） |
| [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) | 从内部冻结版到公开版的逐处差异 |
| [docs/PUBLIC_PRIVACY_SCAN_REPORT.md](docs/PUBLIC_PRIVACY_SCAN_REPORT.md) | 隐私扫描报告 |
| [docs/PUBLIC_SECRET_SCAN_REPORT.md](docs/PUBLIC_SECRET_SCAN_REPORT.md) | 密钥扫描报告 |

---

## 发行包与提交的对应关系（可验证）

本仓库的发行包是**自引用发行提交**：`packages/*.tgz` 里内嵌的短提交哈希，**就是包含这些发行包的那个提交自身**（而不是父提交）。

```bash
git rev-parse --short HEAD                       # 与下面一致
node -p "require('./manifest.json').plugins[0].embeddedCommit"
npm run verify                                   # 不一致会直接失败（硬闸门）
```

一个 git 提交无法内嵌自己的 40 位完整哈希（提交内容决定提交哈希，属自引用不可能），所以提交信息末尾有一个 `Self-id-Nonce:` 尾注——那是让「提交哈希的前 7 位 == 内嵌值」成立的搜索 nonce。`npm run verify` 会强制核验二者一致，并核验工作树干净。

## 参与 / 二次创作

这是**初版**。不同设备、不同 DSH Desktop 版本、不同运行环境都可能出现适配问题，这很正常。

遇到适配问题时，你可以让**你自己的 DeepSeek 或其他 AI** 在本地读完这个仓库后，帮你修改和适配（我在本地就是这么用的）。两点先说清：**改完不保证直接就能用**，而且**动手前请先备份自己的 DSH profile**，改完也请自己核对安装、卸载与回滚是否正常。

也欢迎大家在这个大插件包的基础上，**创造属于自己的 Harness**——换一套自己的工作流、界面、项目结构、任务系统或本地工具集都行。

要守住的边界（不变）：

- macOS + DSH Desktop 2.0.5 是**已验证**范围，其他宿主版本仍是 **UNTESTED**；
- Windows 仍是 **Experimental / 未验证**，不要写成"支持 Windows"或"可直接使用"；
- 未验证项继续写成"未验证"，不要写成通过。

请勿重新分发官方 DSH Desktop、官方代码、他人私密数据、token、cookie 或许可不明确的第三方代码；二次发布前请自行完成隐私、许可与安全审计。

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 免责声明

本软件按 MIT 许可「按现状」提供，不附带任何明示或暗示的担保。它操作的是你自己的 DSH Desktop profile（写入 `package.json` / lockfile / `node_modules`），**安装前请确保你能接受 profile 被修改**——所有修改都有回滚点，且官方数据存储不在修改范围内。作者不对数据丢失或宿主异常负责。
