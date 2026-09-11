# 安装 — macOS（INSTALL_MACOS）

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

```text
已验证：macOS + DSH Desktop 2.0.5
```

## 前置条件

| 条件 | 要求 | 不满足会怎样 |
|---|---|---|
| 操作系统 | macOS（仅在 macOS 上验证过） | 脚本只提示「结果未知」，不阻止 |
| DSH Desktop | **2.0.5** 已安装并至少启动过一次 | 判定为 UNTESTED / INCOMPATIBLE，**不会静默安装**（见 [COMPATIBILITY.md](COMPATIBILITY.md)） |
| Node.js | ≥ 20 | `install.sh` 直接退出（退出码 1），并提示缺 node |
| pnpm | 任意近期版本（DSH Desktop 用它管理 profile 插件） | `install.sh` 直接退出，并提示先装 pnpm |
| 磁盘 | 约 5 MB（三个包 + 缓存） | — |

不需要：管理员权限（**脚本绝不会 sudo**）、不需要改官方 DSH 安装目录、不需要网络（安装阶段全部走本地文件）。

## 一键安装

```bash
git clone <这个仓库的地址> dsh-personal-harness
cd dsh-personal-harness
bash scripts/install.sh
```

脚本按顺序做 7 件事，任一步失败都会明确报错：

1. **平台检查** — macOS / node / pnpm 是否具备
2. **定位 profile** — 默认 `$HOME/.dsh/profiles/desktop`，可用 `DSH_PROFILE=/path/to/profile` 覆盖；必须含 `package.json`
3. **兼容性门** — 读取 DSH Desktop 版本，判定 SUPPORTED / UNTESTED / INCOMPATIBLE 并打印；UNTESTED 需显式 `--allow-untested`，INCOMPATIBLE 需 `--force`
4. **发行物完整性** — 用 `manifest.json` + `checksums.sha256` 校验三个 `.tgz` 的 sha256（防下载损坏/被替换）
5. **创建回滚点** — 备份 profile 的 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis*.yml`，并记录「安装前已装了哪些 `dsh-personal-*`」到 `installed-before.json`
6. **安装** — 把 `packages/*.tgz` 复制到 `$HOME/.dsh/cache/`，再在 profile 内执行 `pnpm add file:$HOME/.dsh/cache/<包名>-public-v1.1.tgz`
7. **逐字节核对** — 比对 profile 内 `node_modules/<包>/client.js` 与 `manifest.json` 记录的 sha256；不一致就报错并提示回滚

成功后输出中会打印**回滚点的绝对路径**，请留一份。

最后一步必须手动做：**完全退出 DSH Desktop（⌘Q）再重新打开**。插件只在宿主启动时加载，热刷新看不到。

打开后应看到：左侧 Personal Harness 导航（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近）+ 底部 HUD。

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
npm run build          # 三个插件各自 esbuild 打包
npm run package        # 重新生成 packages/*.tgz、manifest.json、checksums.sha256、VERSION
npm run verify         # 自查：哈希 / 装机一致性 / 无私人数据
npm run test           # 产物契约测试（57 项）
```

补充两点：

- 只是想在 clone 后**校验**随仓库发布的包，不必先构建：`npm run verify` / `npm test` 会在发现
  `src/workstation/*/build/` 缺失时，自动从 `packages/*.tgz` 还原 bundle 并逐字节核对 `manifest.json` 的 sha256。
- 重新构建会写入**当前 HEAD 的短哈希**到产物内嵌值。在本仓库的发行提交上重建，三个 `client.js` 与发布版**逐字节一致**
  （已实测）；如果你在上面追加了自己的提交，内嵌短哈希随之改变，此时 `client.js` 与发布版会仅在这一处不同——
  `npm run verify` 会告诉你是否自洽。

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
pnpm add file:"$HOME/.dsh/cache/dsh-personal-sidebar-0.1.24-public-v1.1.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-workspace-0.1.20-public-v1.1.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-hud-0.1.3-public-v1.1.tgz"
```

手动装没有回滚点，也没有装机字节核对——出问题请用 `bash scripts/rollback.sh` 之前先确认自己备份过 profile 的 `package.json`。
