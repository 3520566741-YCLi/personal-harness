# 回滚（ROLLBACK）

回滚 = 把 DSH profile 的**清单文件**恢复到某个回滚点的状态，再让 pnpm 按该清单重算依赖树。它不碰用户数据。

## 回滚点从哪来

`scripts/install.sh` 每次安装前都会自动创建一个回滚点：

```
$HOME/.dsh/guard-backups/personal-harness/<YYYYMMDD-HHMMSS>/
├── package.json            profile 安装前的插件清单
├── pnpm-lock.yaml          安装前的锁定文件（若当时存在）
├── pnpm-workspace.yaml     安装前的工作区配置（若当时存在）
├── cordis.yml / cordis.patch.yml   安装前的宿主配置（若当时存在）
└── installed-before.json   安装前已装的 dsh-personal-* 及版本（含「空」的情形）
```

安装过程中任何一步失败，`install.sh` 会**自动**用这份回滚点还原，然后以退出码 2 结束。

## 用法

```bash
bash scripts/rollback.sh              # 用最新回滚点
bash scripts/rollback.sh --list       # 列出所有回滚点（按时间倒序）
bash scripts/rollback.sh <备份目录>    # 指定回滚点（绝对路径）
DSH_PROFILE=/path/to/profile bash scripts/rollback.sh
```

退出码：`0` 成功｜`1` 环境错误（找不到回滚点 / profile / pnpm）｜`2` 清单已恢复但 `pnpm install` 失败

## 它做什么 / 不做什么

| 做 | 说明 |
|---|---|
| 恢复 `package.json` | 声明回到回滚点状态（可能含旧版本插件，也可能完全没有 Personal Harness） |
| 恢复 `pnpm-lock.yaml` / `pnpm-workspace.yaml` | 仅当回滚点里有这两个文件；没有则保持现状并明确打印 |
| `pnpm install` | 按恢复后的清单重算 `node_modules` |
| **回滚前先自救** | 回滚动作本身也会先把你「当前」状态另存到 `<时间戳>-before-rollback/`，回滚错了还能再回滚回来 |

| 不做 | 说明 |
|---|---|
| 不动用户数据 | 会话 / 任务 / 项目 / 工作区一律不触碰 |
| 不删你的项目 | 浏览器端 `dsh.personal.*` 状态不会被回滚（它不属于 profile 清单） |
| 不需要 sudo | 全程只写你的 `$HOME` |

## Windows（Experimental / 未验证）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -List
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1
```

回滚点位于 `%USERPROFILE%\.dsh\guard-backups\personal-harness\<时间戳>\`，回滚前同样会把「当前」状态另存为 `<时间戳>-before-rollback`。**Windows 未经验证**，见 [INSTALL_WINDOWS_EXPERIMENTAL.md](INSTALL_WINDOWS_EXPERIMENTAL.md)。

## 回滚后

**完全退出 DSH Desktop（⌘Q）再重新打开**，然后确认界面符合回滚点对应的状态。

结果不对时，用脚本最后打印的 `...-before-rollback` 目录再回滚一次即可。

## 常见场景

| 场景 | 做法 |
|---|---|
| 装完发现界面不对 | `bash scripts/rollback.sh`（回到安装前），然后反馈 |
| 想回退到更早的某个点 | `bash scripts/rollback.sh --list`，挑一个目录传参 |
| **没有**回滚点（当时用了 `--no-backup`） | 只能手动：`pnpm remove dsh-personal-sidebar dsh-personal-workspace dsh-personal-hud`（等价于卸载） |
| 只想临时关掉而不卸载 | 目前没有开关；请用卸载/回滚（见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)） |
