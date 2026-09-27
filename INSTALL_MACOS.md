# 安装 — macOS（INSTALL_MACOS）

## 三层关系（先读这一段，装之前必须搞清）

```text
Harness Web UI
    ↓ 由 DSH Desktop 承载并加载
DSH Desktop
    ↓ 安装四个 Personal Harness 插件
Personal Harness
```

1. 你必须**先安装并能正常启动 DSH Desktop**——这是前提，不是可选步骤；
2. **DSH Desktop 负责承载 Harness Web UI**，并提供本地插件加载环境；
3. **Personal Harness 不是独立 App，不是浏览器扩展，也不替代 Harness 或 DSH Desktop**；它只是装进 DSH Desktop 的一层界面/组织插件；
4. 你下载或 clone 本仓库后，运行**对应平台**的安装脚本（macOS 用 `scripts/install.sh`；Windows 用 `scripts/windows/install.ps1`，但 **Windows 材料不属于 V1.2 发行范围**，见本页顶部提示）；
5. 安装脚本会把四个 `.tgz` 插件装进 **DSH Desktop 的本地 profile**（默认 `~/.dsh/profiles/desktop`）；
6. 装完必须**完全退出并重新启动 DSH Desktop**（⌘Q / 完全关闭，不是最小化），插件界面才会出现——插件只在宿主启动时加载；
7. **在浏览器里单独运行的 Harness Web UI 不属于已验证的安装方式**，也不能承诺把本仓库直接套用上去就能工作（本发行版验证的是「DSH Desktop 加载本地插件」这一条路径）。

装完不知道从哪开始用？看 [FEATURE_GUIDE.md](FEATURE_GUIDE.md)（每个入口是干什么的、什么时候用、不会做什么）。

```text
已验证：macOS + DSH Desktop 2.0.5
```

> **本版本是 macOS 发行版**：Personal Harness **V1.2**（发行 tag `public-v1.2`），本次只发 macOS 版。仓库里保留的 Windows 脚本与文档**不属于本次发行范围**，也不能用来安装本版本的包（见 [INSTALL_WINDOWS_EXPERIMENTAL.md](INSTALL_WINDOWS_EXPERIMENTAL.md) 顶部说明）。

## 前置条件

| 条件 | 要求 | 不满足会怎样 |
|---|---|---|
| 操作系统 | macOS（仅在 macOS 上验证过） | 脚本只提示「结果未知」，不阻止 |
| DSH Desktop | **2.0.5** 已安装并至少启动过一次 | 判定为 UNTESTED / INCOMPATIBLE，**不会静默安装**（见 [COMPATIBILITY.md](COMPATIBILITY.md)） |
| Node.js | ≥ 20 | `install.sh` 直接退出（退出码 1），并提示缺 node |
| pnpm | 任意近期版本（DSH Desktop 用它管理 profile 插件） | `install.sh` 直接退出，并提示先装 pnpm |
| 磁盘 | 约 6 MB（四个包 + 缓存） | — |

不需要：管理员权限（**脚本绝不会 sudo**）、不需要改官方 DSH 安装目录、不需要网络（安装阶段全部走本地文件）。

## 一键安装

### 最推荐：让 AI 帮你装（它读文档，你点确认）

> 把本仓库链接发给你**自己信任、并且能访问你电脑终端**的 AI，让它阅读本文档后协助下载、检查前置条件、创建备份并安装。
> 手动安装也可以，但需要自己逐条执行命令，容易漏步骤。

可以直接把下面这段连同仓库地址发给它：

```text
这是我给你的一个开源仓库：<本仓库地址>
请先完整读 README.md 和 INSTALL_MACOS.md，然后：
1) 按「前置条件」表逐条检查我的机器：macOS、DSH Desktop 2.0.5 是否已装并能启动、Node.js ≥ 20、pnpm 是否可用；
2) 明确告诉我：这次会改哪个 profile 目录（默认 ~/.dsh/profiles/desktop）、备份（回滚点）会放在哪里；
3) 先跑一次 bash scripts/install.sh --dry-run 给我看它打算做什么；
4) 等我确认后，再执行真正的安装；
5) 装完提醒我完全退出（⌘Q）并重新打开 DSH Desktop；
6) 把每一步的完整输出给我看，失败就停下来说明原因，不要自己绕过兼容性门。
```

为什么推荐：命令本身不多，但**漏一步就会让人以为"插件没用"**——最常见的是装完没有重启宿主。

边界（请一并对齐）：

- AI **必须能访问你的本机终端**，才可能替你下载和安装；做不到时它只能给你命令清单，由你自己执行；
- AI 应在安装**之前**检查 DSH Desktop、Node.js、pnpm，并说明**将修改哪个 profile**、**备份放在哪里**，然后**等你确认**；
- 装完要提醒你**完全退出再重启 DSH Desktop**；
- 备份、安装、系统权限提示仍然要**你自己确认**；
- **在浏览器里单独运行 Harness Web UI 不属于已验证的安装方式**（本发行版验证的是「DSH Desktop 加载本地插件」）。

### 手动安装

```bash
git clone <这个仓库的地址> dsh-personal-harness
cd dsh-personal-harness
bash scripts/install.sh --dry-run   # 先看它打算做什么（真 dry-run：不建目录、不复制、不安装）
bash scripts/install.sh
```

脚本按顺序做 7 件事，任一步失败都会明确报错：

1. **平台检查** — macOS / node / pnpm 是否具备
2. **定位 profile** — 默认 `$HOME/.dsh/profiles/desktop`，可用 `DSH_PROFILE=/path/to/profile` 覆盖；必须含 `package.json`
3. **兼容性门** — 读取 DSH Desktop 版本，判定 SUPPORTED / UNTESTED / INCOMPATIBLE 并打印；UNTESTED 需显式 `--allow-untested`，INCOMPATIBLE 需 `--force`
4. **发行物完整性** — 用 `manifest.json` + `checksums.sha256` 校验四个 `.tgz` 的 sha256（防下载损坏/被替换）
5. **创建回滚点** — 备份 profile 的 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis*.yml`，并记录「安装前已装了哪些 `dsh-personal-*`」到 `installed-before.json`
6. **安装** — 把 `packages/*.tgz` 复制到 `$HOME/.dsh/cache/`，再在 profile 内执行 `pnpm add file:$HOME/.dsh/cache/<包名>-public-v1.2.tgz`
   （脚本**自动发现 `packages/*.tgz`**，四个包都会装，不需要传任何包名或版本参数）
7. **逐字节核对** — 比对 profile 内 `node_modules/<包>/client.js` 与 `manifest.json` 记录的 sha256；不一致就报错并提示回滚

成功后输出中会打印**回滚点的绝对路径**，请留一份。

最后一步必须手动做：**完全退出 DSH Desktop（⌘Q）再重新打开**。插件只在宿主启动时加载，热刷新看不到。

打开后应看到：

- **左侧**多出一组 Personal Harness 导航：**新任务（＋）/ 主页 / 项目 / 工作区 / 最近 / 会话**（另有「切回官方会话浏览」按钮随时回官方界面）；
- **中央区域**可以打开主页、新任务、**任务看板**、项目、项目详情、工作区等页面（「任务看板」是中央页面，从主页的任务行等处进入）；
- **底部**多一条 HUD 状态条（带可折叠诊断面板）。

如果你已经装了常见的第三方任务板插件，本层会在它既有的「任务看板」入口行上显示**真实的"需要处理"计数徽标**——**不改名、不删除、不接管**它的入口。

每个入口具体是干什么的、什么时候用：[FEATURE_GUIDE.md](FEATURE_GUIDE.md)。

## 参数

```bash
bash scripts/install.sh --allow-untested   # 宿主版本 ≠ 2.0.5（但同属 2.x）时继续
bash scripts/install.sh --force            # 忽略兼容性判定（含 1.x：强烈不建议）
bash scripts/install.sh --dry-run          # 只打印将要做什么，不写 profile
bash scripts/install.sh --no-backup        # 不建回滚点（不建议：失败就无法自动回滚）
DSH_PROFILE=/path/to/profile bash scripts/install.sh
```

退出码：`0` 成功｜`1` 环境或兼容性拒绝｜`2` 安装失败（脚本已尝试自动回滚）

## 安装失败怎么办

| 现象 | 处理 |
|---|---|
| `兼容性：UNTESTED` 且退出 | 这是有意设计（不静默安装）。确认宿主是 2.x 后加 `--allow-untested` |
| `发行包校验失败` | 重新 clone；或用 `npm run verify` 看是哪个包哈希不符 |
| 某步失败后输出「已回滚」 | profile 已还原到安装前状态；把完整输出反馈给作者 |
| 安装成功但界面没有变化 | 99% 是没重启宿主：⌘Q 完全退出再开；仍无变化则看 `bash scripts/rollback.sh` 回滚并反馈 |
| 想先试后装 | 用 `--dry-run` 看完整动作清单 |

## 从源码构建（可选）

预打包的 `.tgz` 已经过本次发布的完整验证，通常直接用即可。想自己构建：

```bash
npm install            # 仅构建期依赖（esbuild / jsdom），不进发行产物
npm run build          # 四个插件各自 esbuild 打包（含 build:quickstop）
npm run package        # 重新生成 packages/*.tgz、manifest.json、checksums.sha256、VERSION
npm run verify         # 自查：哈希 / 装机一致性 / 无私人数据
npm run test           # 产物契约测试（71 项，四个包）
```

补充两点：

- 只是想在 clone 后**校验**随仓库发布的包，不必先构建：`npm run verify` / `npm test` 会在发现
  `src/workstation/*/build/` 缺失时，自动从 `packages/*.tgz` 还原 bundle 并逐字节核对 `manifest.json` 的 sha256。
- 重新构建会写入**当前 HEAD 的短哈希**到产物内嵌值。「在发行提交上重建，`client.js` 与发布版**逐字节一致**」这一结论是在 **V1.1**
  的公开产物上**实测**过的；**V1.2 的四个包没有重做这项实测（未验证）**——`npm run verify` 只告诉你产物是否自洽，不等于本机重建比对。
  如果你在发行提交之上追加了自己的提交，内嵌短哈希随之改变，此时 `client.js` 与发布版会仅在这一处不同。

安装自定义构建：

```bash
bash scripts/install.sh    # 会先校验你新生成的 manifest/checksums，再装
```

## 手动安装（不使用脚本）

```bash
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$HOME/.dsh/cache"
cp packages/*.tgz "$HOME/.dsh/cache/"
cd "$PROFILE"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-sidebar-0.1.28-public-v1.2.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-workspace-0.1.25-public-v1.2.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-hud-0.1.3-public-v1.2.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-quickstop-0.1.1-public-v1.2.tgz"
```

四个包都要装（缺任何一个，对应那部分界面就不会出现）：`sidebar` 0.1.28 ／ `workspace` 0.1.25 ／ `hud` 0.1.3 ／ `quickstop` 0.1.1（本版新增）。

手动装没有回滚点，也没有装机字节核对——出问题请用 `bash scripts/rollback.sh` 之前先确认自己备份过 profile 的 `package.json`。
