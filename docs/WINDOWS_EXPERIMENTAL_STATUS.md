# WINDOWS EXPERIMENTAL STATUS

Windows 版的**验证状态报告**。本文件的目的只有一个：让任何人都能一眼看出 Windows 版**验证到了哪一步、没验证什么**，避免把「脚本写了」误读成「Windows 支持了」。

## 一句话结论

> **Windows = Experimental / 未验证版。本发行版没有在任何真实 Windows 环境（含 Windows 版 DSH Desktop）上做过安装、界面、卸载或回滚验证。**

## 验证到了什么（做了什么）

| 层次 | 做了什么 | 结果 |
|---|---|---|
| 1. 脚本语法 | 用 **PowerShell 7.4.6**（`[System.Management.Automation.Language.Parser]::ParseFile`）解析三个 `.ps1` | 三个脚本 **0 语法错误** |
| 2. 脚本逻辑 | 在**非 Windows** 环境下用 pwsh 7 运行完整生命周期（隔离 profile）：`install -DryRun → install → reinstall → uninstall → reinstall → rollback` | **PASS 27 / FAIL 0**；其中含「`-DryRun` 打印动作但零改动」两条断言（不建回滚点目录、不建缓存目录） |
| 3. 哈希核对 | 安装后比对 profile 内 `client.js` 与 `manifest.json` 的 sha256 | 与 macOS 版同一逻辑，实测逐字节一致 |
| 4. 用户数据安全 | 隔离 profile 内预置用户数据哨兵，检查安装/卸载/回滚前后是否变化 | 未变化 |

**这些验证证明的是「脚本逻辑正确」，不是「Windows 上可用」。** 第 2 层的运行环境不是 Windows，因此下列 Windows 专有行为**完全没有被覆盖**：`%USERPROFILE%` / `%APPDATA%` / `%LOCALAPPDATA%` 的真实取值、Windows 版 DSH Desktop 的安装位置与版本号读取、Windows 路径分隔符与 `file:` 依赖的真实行为、pnpm 在 Windows 上的符号链接策略、Windows 版宿主是否提供同样的官方扩展点。

## 没有验证什么（风险清单）

| 未验证项 | 影响 |
|---|---|
| Windows 10 / 11 上的安装 | 可能失败（路径假设、pnpm 行为） |
| Windows 版 DSH Desktop 的 profile 路径 | 若不是 `%USERPROFILE%\.dsh\profiles\desktop`，需用 `-Profile` 显式指定 |
| Windows 版宿主的插件加载与界面 | **完全未知**：三个插件声明 `platform: "web"`，理论上可能加载，但没有证据 |
| Windows 上的卸载与回滚 | 逻辑已演练，Windows 实际行为未知 |
| Windows 版 DSH Desktop 版本检测 | 无法可靠读取 → 判定恒为 UNTESTED（有意保守） |
| Windows 上的 node / pnpm 兼容性 | 未测（要求 Node ≥ 20 与 pnpm 可执行） |

## 因此本发行版对 Windows 的表述（全仓库统一）

| 平台 | 状态 |
|---|---|
| macOS + DSH Desktop 2.0.5 | **已验证** |
| 其他 macOS / DSH 版本 | UNTESTED |
| **Windows** | **Experimental / 未验证** |

`COMPATIBILITY.md`、`README.md`、`INSTALL_WINDOWS_EXPERIMENTAL.md`、三个 Windows 脚本的运行输出、以及 Windows Release 说明中，**均不得**把 Windows 写成 SUPPORTED 或「已支持」。三条 Windows 脚本每次运行都会打印完整警告块（含「不能保证 clone 后可直接安装」）。

## 如何让 Windows 变成「已验证」

需要有人在一台真实 Windows 机器上，对着已安装的 Windows 版 DSH Desktop 完成：

1. 记录环境：Windows 版本、DSH Desktop 版本、`node -v`、`pnpm -v`、真实 profile 绝对路径；
2. `install.ps1 -DryRun` 输出 → `install.ps1 -AllowUntested` 实际安装（含哈希核对输出）；
3. 完全退出并重开 DSH Desktop，确认三个插件加载、界面与 macOS 版一致（截图或逐项描述）；
4. `uninstall.ps1`（确认用户数据未变）+ `rollback.ps1`（确认回到安装前）；
5. 把上述输出附到 issue。

在这份证据出现之前，Windows 的状态**只能是** Experimental / 未验证。

## 本次发布对 Windows 文件的处置

- Windows 相关文件放在**独立目录** `scripts/windows/`，文档单独一份 `INSTALL_WINDOWS_EXPERIMENTAL.md`；
- Release 中作为**独立 asset** 发布，名称包含 `Windows Experimental`；
- 不与 macOS 的已验证产物混称同一个「稳定版」。
