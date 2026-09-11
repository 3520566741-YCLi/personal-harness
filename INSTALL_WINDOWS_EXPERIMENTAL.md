# 安装 — Windows Experimental / 未验证版（INSTALL_WINDOWS_EXPERIMENTAL）

> ## ⚠️ Windows Experimental / 未验证版
>
> **此版本尚未在真实 Windows DSH Desktop 环境完成安装、界面、卸载与回滚验证。**
> 插件核心使用 web 平台接口，理论上可能兼容；但 DSH Desktop 的 Windows 版本、profile 路径、扩展接口和 pnpm 行为可能不同。
>
> 你可能需要根据自己安装的 DeepSeek Harness / DSH Desktop 实际情况修改路径、脚本或配置后才能使用。
> **不能保证 clone 后可直接安装，也不能保证与所有 Windows 版本兼容。**
>
> 请先备份自己的 DSH profile；如出现问题，请停止并恢复备份。

> 说明：这段警告在 `README.md`、本文件、三个 PowerShell 脚本的运行输出、以及 Windows Release 说明中**都会出现**，且不会被删减或弱化。**Windows 不是 SUPPORTED 平台**，任何地方都不应被写成「已支持 Windows」。

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
Experimental / 未验证
```

## 这个版本包含什么

| 项 | 内容 |
|---|---|
| 插件本身 | 与 macOS 版**完全相同**的三个 `.tgz`（`dsh-personal-sidebar` 0.1.24 / `dsh-personal-workspace` 0.1.20 / `dsh-personal-hud` 0.1.3） |
| 三个插件声明的平台 | `platform: "web"`（这是「理论上可能跨平台」的唯一依据，**不是** Windows 验证结论） |
| Windows 脚本 | `scripts/windows/install.ps1`、`scripts/windows/uninstall.ps1`、`scripts/windows/rollback.ps1`（PowerShell，不需要管理员权限） |
| 官方 DSH Desktop | **不修改、不打包**——必须由你自己按官方渠道安装 |

## 前置条件

| 条件 | 说明 |
|---|---|
| Windows | 10 / 11（**未验证**） |
| DSH Desktop | 需要你自己已安装 Windows 版 DSH Desktop，并**至少启动过一次**（本发行版要知道你的 profile 在哪） |
| Node.js | ≥ 20（`node --version` 能跑） |
| pnpm | 必须可用（`pnpm --version`）——DSH Desktop 用 pnpm 管理 profile 插件 |
| 管理员权限 | **不需要**（脚本不做任何提权；若你以管理员运行，脚本会提示建议改用普通 PowerShell） |
| 磁盘 | 约 5 MB |

## 怎么运行（PowerShell）

PowerShell 默认可能禁止运行脚本；用下面这条**不需要改系统策略**的方式直接调用：

```powershell
git clone <这个仓库的地址> personal-harness
cd personal-harness

# 1) 先干跑，看它到底要做什么（不写任何东西）
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -DryRun

# 2) 正式安装 —— 因为 Windows 未验证，必须显式确认
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -AllowUntested
```

如果你已经知道自己 profile 的确切路径（推荐，能排除路径探测的不确定性）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -AllowUntested -Profile "C:\Users\<你>\.dsh\profiles\desktop"
```

装完后**完全退出 DSH Desktop 再重新打开**（插件在宿主启动时加载）。

```powershell
# 卸载（默认完整保留你的数据）
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1

# 回滚到某次安装前
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -List
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1
```

## 脚本做什么（与 macOS 版语义一致）

| 步骤 | `install.ps1` |
|---|---|
| 1 | 打印上面的警告块（每次运行都打印） |
| 2 | 检查 node / pnpm；若以管理员运行会提示不建议 |
| 3 | **定位 profile**：`-Profile` 参数优先；否则依次尝试 `%USERPROFILE%\.dsh\profiles\desktop`、`%APPDATA%\.dsh\profiles\desktop`、`%LOCALAPPDATA%\.dsh\profiles\desktop`；都找不到就**报错并要求你显式指定**（不猜） |
| 4 | **兼容性门**：Windows 版 DSH Desktop 的版本号**无法可靠读取** → 一律判 UNTESTED，打印 `UNTESTED — continue only with explicit user confirmation`，**不加 `-AllowUntested` 就直接退出（退出码 1）** |
| 5 | **完整性校验**：用 `manifest.json` 的 sha256 逐个核对三个 `.tgz`（`Get-FileHash`），不符立即拒绝 |
| 6 | **备份（回滚点）**：`%USERPROFILE%\.dsh\guard-backups\personal-harness\<时间戳>\`，含 `package.json`、lockfile、`installed-before.json` |
| 7 | 复制包到 `%USERPROFILE%\.dsh\cache\`，在 profile 内执行 `pnpm add file:...` |
| 8 | **装机字节核对**：比对 profile 内 `client.js` 的 sha256 与 manifest；不符报错并提示回滚 |
| 9 | 任何一步失败 → 自动用回滚点还原（退出码 2） |

`uninstall.ps1`：只 `pnpm remove` 三个插件，**默认一行数据都不删**；`-PurgeUserData` 需手动输入大写 `PURGE`，删除范围仅回滚点目录、本发行版自己的包缓存、`%USERPROFILE%\.dsh\.personal`（若存在）。
`rollback.ps1`：恢复 profile 清单文件 + `pnpm install`；回滚前先把「当前」状态另存为 `<时间戳>-before-rollback`。

## 已知的 Windows 不确定性（请当作风险清单读）

1. **profile 路径**：Windows 版 DSH Desktop 的 profile 是否位于 `%USERPROFILE%\.dsh\profiles\desktop`，**未验证**。若不同，请用 `-Profile` 指定。
2. **pnpm `file:` 行为**：Windows 上 `file:` 依赖的路径分隔符与符号链接处理可能与 macOS 不同；脚本已把路径规范化为 `/`，但**未验证**。
3. **宿主扩展点**：三个插件通过官方扩展点接入（槽位 / 官方服务）。Windows 版宿主是否提供同样的扩展点，**未验证**。
4. **版本检测**：Windows 上的 DSH Desktop 版本号读取方式未知 → 判定恒为 UNTESTED（这是有意的保守设计，不是缺陷）。
5. **本机没有 Windows 环境**：本次发布**没有**在 Windows 上做过任何安装 / 界面 / 卸载 / 回滚验证。脚本只做了两个层次的验证：PowerShell 语法解析（pwsh 7.4.6）+ 在**非 Windows** 环境下的隔离逻辑演练（install → reinstall → uninstall → rollback，含哈希核对与用户数据哨兵）。详见 [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md)。

## 出问题怎么办

1. **先回滚**：`powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -List` 找到回滚点，再执行回滚。
2. 完全退出 DSH Desktop 再打开，确认官方界面正常。
3. 把**完整的 PowerShell 输出**（含报错原文）反馈到 issue，并注明：Windows 版本、DSH Desktop 版本、`node -v`、`pnpm -v`、你实际使用的 profile 路径。
4. 若脚本因路径假设失败：请把你的真实 profile 路径贴出来（**不要**贴会话内容或令牌），这能直接把 Windows 路径规则补正确。
