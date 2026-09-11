# 卸载（UNINSTALL）

```bash
cd dsh-personal-harness
bash scripts/uninstall.sh
```

装完重启宿主后，官方界面应恢复原样：Personal Harness 导航与 HUD 消失。

## 默认行为：只卸插件，**数据一行不动**

脚本对三个包逐个执行 `pnpm remove`（在 profile 内），然后检查 `node_modules/<包>` 是否真的消失。退出码 `0` = 全部移除且无残留；`2` = 卸载后仍能检测到插件目录。

**默认不删除任何用户数据**：你的会话、任务、工作区、项目数据全部属于 DSH 官方存储，本发行版只是读取方，没有所有权，也不代你清理。

## `--purge-user-data`：只删「本发行版自己写下的磁盘状态」

```bash
bash scripts/uninstall.sh --purge-user-data
```

执行前会打印**确切**的删除清单，并要求你手动输入大写 `PURGE` 才继续（输入其它任何内容 = 取消，插件卸载仍然完成）。

| 会删除 | 说明 |
|---|---|
| `$HOME/.dsh/guard-backups/personal-harness/` | 安装脚本创建的回滚点 |
| `$HOME/.dsh/cache/dsh-personal-*-public-v*.tgz` | 安装时放进缓存的发行包 |
| `$HOME/.dsh/.personal/` | 仅在存在时删除；本发行版不写这个目录 |

| **不会**删除 | 说明 |
|---|---|
| `$HOME/.dsh/profiles/desktop/node_modules/**` | 官方插件与其它第三方插件 |
| `$HOME/.dsh/profiles/desktop/storages/**` | 会话 / 任务 / 工作区数据 |
| `$HOME/.dsh/sessions/**` | 会话落盘目录 |

`--purge-user-data` **不会**、也无法清理浏览器端存储（那是运行中应用的 localStorage）。界面上的项目 / 任务补充字段由你在应用内清理：打开 Personal Harness 的 Inspector → 「重置本地状态」，或在项目/任务界面逐个删除。本发行版写入的浏览器存储键前缀为 `dsh.personal.*` 与 `dsh.dps.*`。

## Windows（Experimental / 未验证）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1 -PurgeUserData
```

语义与 macOS 版一致（默认保留全部用户数据；`-PurgeUserData` 需手动输入 `PURGE`，范围仅回滚点目录、本发行版自己的包缓存、`%USERPROFILE%\.dsh\.personal`）。**Windows 未经验证**，见 [INSTALL_WINDOWS_EXPERIMENTAL.md](INSTALL_WINDOWS_EXPERIMENTAL.md)。

## 卸载后想回来

重新跑 `bash scripts/install.sh` 即可——卸载不会破坏任何官方状态，重装是幂等的（重复安装不会重置你的数据，见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) 与 [docs/PUBLIC_INSTALL_TEST_REPORT.md](docs/PUBLIC_INSTALL_TEST_REPORT.md) 的实测证据）。

## 卸载失败

| 现象 | 处理 |
|---|---|
| 退出码 2：`仍存在：.../node_modules/<包>` | 在 profile 内手动 `pnpm remove dsh-personal-sidebar dsh-personal-workspace dsh-personal-hud`，再 `pnpm install` |
| `缺少 pnpm` | 先安装 pnpm |
| `找不到 DSH profile` | 用 `DSH_PROFILE=/path/to/profile bash scripts/uninstall.sh` |
| 卸载后界面没变化 | ⌘Q 完全退出 DSH Desktop 再打开（插件在启动时加载） |
