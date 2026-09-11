# 隐私（PRIVACY）

一句话：**本发行版没有服务器、没有账号、没有遥测，不发送任何数据，也不读取与工作台无关的文件。**

## 它读写什么

| 位置 | 读 | 写 | 说明 |
|---|---|---|---|
| `$HOME/.dsh/profiles/desktop/package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | ✓ | ✓（安装/卸载/回滚时） | 声明三个插件的 `file:` 依赖；写入前自动备份 |
| `$HOME/.dsh/profiles/desktop/node_modules/` | ✓ | ✓ | pnpm 安装/移除插件包 |
| `$HOME/.dsh/cache/` | ✓ | ✓ | 安装时把发行 `.tgz` 放到这里 |
| `$HOME/.dsh/guard-backups/personal-harness/` | ✓ | ✓ | 回滚点（`--purge-user-data` 会删除整个目录） |
| DSH 官方存储（会话 / 任务 / 工作区） | ✓ 只读 | ✗ | 通过宿主注入的官方服务读取并展示；**不使用官方写接口去改你的数据** |
| 浏览器 localStorage（键前缀 `dsh.personal.*` / `dsh.dps.*`） | ✓ | ✓ | 项目层与任务补充字段（截止时间 / 交付物 / 约束 / 备注）落在本机 |

**不读取**：`~/.ssh`、钥匙串、浏览器 cookie / 历史、`~/.dsh` 以外的个人文件、任何环境变量里的凭据。

## 它不做什么

- **不发网络请求**：插件代码里没有 fetch/XHR 到任何自建端点；所有数据访问都经宿主注入的官方服务。
- **无遥测 / 无埋点 / 无崩溃上报**。
- **不需要账号、不需要 API Key**：本发行版不含任何模型调用逻辑，AI 能力由宿主 DSH Desktop 提供。
- **不上传任何内容**：本项目没有后端。

## 你的数据是谁的

你的会话、任务、工作区数据属于 **DSH 官方存储**，本发行版只是读取方与展示层，**没有所有权**：

- 卸载默认**一行数据都不删**（见 [UNINSTALL.md](UNINSTALL.md)）；
- `--purge-user-data` 只删本发行版自己写下的磁盘状态（回滚点、包缓存），并需手动输入 `PURGE` 确认；
- 界面上的项目/任务补充字段由你在应用内清理（Inspector → 重置本地状态）。

## 首次安装 = 空白用户状态

公开版**不含任何预置内容**：项目列表为空（`projects: []`）、Agent 目录为空（`agents: []`）、界面示例文本为中性通用示例。你看到的一切都是你自己创建的（或来自官方存储的既有数据）。

## 本次公开发行的隐私审计

本仓库对「将要公开的全部被跟踪文件」做了逐条扫描，结论：**个人标识 / 本机路径 / 用户名 / 邮箱 / 手机号 / 令牌 / 密钥 命中数为 0**（唯一命中是说明文字里对官方存储路径的引用，已判定为无害并记录在报告内）。

- [docs/PUBLIC_PRIVACY_SCAN_REPORT.md](docs/PUBLIC_PRIVACY_SCAN_REPORT.md) —— 隐私扫描（逐条命中与判定）
- [docs/PUBLIC_SECRET_SCAN_REPORT.md](docs/PUBLIC_SECRET_SCAN_REPORT.md) —— 密钥扫描
- [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) —— 从内部冻结版到公开版的逐处中性化差异

## 反馈

发现任何隐私问题（例如某处仍含可定位个人的信息），请开 issue；在修复前**不要**继续分发该版本。
