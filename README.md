# Personal Harness V1.1

**给 DSH Desktop 加一层「个人工作站」外壳的插件集合。** 装完后左侧会多出一套工作台导航（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近），底部多一条状态 HUD。

- 不改官方 DSH Desktop 一行代码（纯官方扩展点，compatibility mode）
- 只读、只用官方存储与官方 API；**你的会话、任务、项目数据始终属于 DSH 官方存储**，本发行版不接管、不复制、不上传
- 装/卸/回滚都是一条命令，安装前自动留回滚点，安装失败自动回滚
- 无网络请求、无遥测、无账号、无密钥

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

## 快速开始（macOS）

前置：macOS + 已安装 **DSH Desktop 2.0.5**（其他 2.x 版本见 [COMPATIBILITY.md](COMPATIBILITY.md)）+ Node.js ≥ 20 + `pnpm`。

```bash
git clone <这个仓库的地址> dsh-personal-harness
cd dsh-personal-harness
bash scripts/install.sh          # 装进 $HOME/.dsh/profiles/desktop
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

这是 Personal Harness 的初版发行。不同设备、DSH Desktop 版本或运行环境可能出现适配问题。

如遇到适配问题，你可以把本仓库和报错信息交给你自己的 DeepSeek，按自己的 DSH Desktop 环境修改、调试并继续适配；但请先备份自己的 DSH profile，并自行核对修改后的安装、卸载与回滚行为。

欢迎大家在 Personal Harness 这个大插件包的基础上，创造属于自己的 Harness：加入自己的工作流、界面、项目结构、任务系统或本地工具集。

请勿重新分发官方 DSH Desktop、官方代码、他人私密数据、token、cookie 或许可不明确的第三方代码；二次发布前请自行完成隐私、许可与安全审计。

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 免责声明

本软件按 MIT 许可「按现状」提供，不附带任何明示或暗示的担保。它操作的是你自己的 DSH Desktop profile（写入 `package.json` / lockfile / `node_modules`），**安装前请确保你能接受 profile 被修改**——所有修改都有回滚点，且官方数据存储不在修改范围内。作者不对数据丢失或宿主异常负责。
