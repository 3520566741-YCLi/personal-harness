# CONTRIBUTING

Personal Harness 是一个**个人工作站层插件包**，公开发行的目的是让人能用、能看、能改。欢迎 fork 与二次创作。

## 欢迎做的事

- **Fork 并改造成你自己的 Harness**：加入自己的工作流、界面、项目结构、任务系统或本地工具集；
- 报告 bug、适配问题、文档错误；
- 为新的 DSH Desktop 版本或新平台提交适配；
- 提交能提升数据安全性、可回滚性、隐私性的改动。

## 改之前请先做

1. **备份你的 DSH Desktop profile**（至少 `package.json` / lockfile / `pnpm-workspace.yaml`）。
   本仓库的安装脚本会先自动建回滚点（`~/.dsh/guard-backups/personal-harness/<时间戳>/`），但你自己改脚本时没有这层保护。
2. **先跑 `-DryRun`**（macOS：`bash scripts/install.sh --dry-run`；Windows：`install.ps1 -DryRun`）看清将要发生什么。
3. 任何改动之后，**自行核对安装 / 卸载 / 回滚三个动作**都仍然成立（这是本仓库的底线：能装、能卸、能回滚、不碰用户数据）。

## 提交适配（新平台 / 新 DSH 版本）时必须说明

| 必须写明 | 说明 |
|---|---|
| 测试环境 | 操作系统与版本、硬件架构（如 Windows 11 23H2 / arm64） |
| DSH Desktop 版本 | 精确版本号，以及从哪里读取到的 |
| profile 路径 | 实际使用的 profile 绝对路径（**不要**贴会话内容或令牌） |
| 实测了哪些动作 | install / reinstall / uninstall / rollback / 插件加载 / 界面 |
| 未验证项 | 明确列出**没有**验证的部分——未知就是未知，不要写成通过 |
| 产物哈希 | 如改动过产物，给出 `npm run verify` 与 `npm test` 的输出 |

## Windows 相关提交的硬性规则

- **不得移除 `Experimental / 未验证` 标记**：除非提交里附上了**真实 Windows 环境**的实测证据（安装 / 插件加载 / 卸载 / 回滚，含环境版本与输出）。
- 在这份证据出现之前，Windows 只能标记为 Experimental / 未验证，README、`COMPATIBILITY.md`、`INSTALL_WINDOWS_EXPERIMENTAL.md`、`docs/WINDOWS_EXPERIMENTAL_STATUS.md` 与三个 `.ps1` 的运行输出都必须保留完整警告块，**不得删减、弱化或隐藏**。
- 不要把 Windows 写成 SUPPORTED，也不要写「已支持 Windows」。

## 不允许做的事

- **不要重新分发官方 DSH Desktop 或官方代码**：本仓库不包含、不修改、不打包官方任何文件；插件只通过官方扩展点接入。
- **不要带入他人私密数据**：会话、任务、项目、日志、cookie / 浏览器存储、token、API key、私钥、真实绝对路径，一律不得进入仓库（包括测试夹具与文档示例——**测试里也不要写真实字符串**，请用结构性断言）。
- **不要提交许可不明确的第三方代码**：新增依赖必须许可清晰，且不建议把第三方代码打包进发行产物（本仓库产物只含自研代码）。
- **不要把私人开发历史、内部审计记录、验收证据带进公开仓库**：本仓库的历史是独立的，只有公开发行需要的提交。

## 发行物与提交的对应关系（改产物时必读）

本仓库的发行包是**自引用发行提交**：`packages/*.tgz` 内嵌的短提交哈希必须等于包含它们的那个提交自身的短哈希，且工作树必须干净。

```bash
DPS_SHA_OVERRIDE=<目标短哈希> npm run build     # 在创建发行提交之前打包，显式注入目标短哈希
npm run package
npm run verify                                   # 硬闸门：内嵌 ≠ HEAD 或工作树不干净 → 失败
npm test                                         # 产物契约测试
```

如果你只是改文档，**不要重建产物**（那会改变内嵌哈希并破坏「提交 ↔ 产物」对应关系）；改完直接提交即可，`npm run verify` 会告诉你对应关系是否还成立。

## 二次发布（fork 后的再分发）

二次发布者**自行负责**其改动、隐私处理、许可合规与兼容性声明：

- 请自行完成隐私、许可与安全审计（本仓库的 `docs/PUBLIC_*` 报告可作为方法参考，但不能代替你自己对**你的改动**的审计）；
- 请如实标注你验证过的平台与版本，以及未验证项；
- `LICENSE` 采用 MIT：你可以改版权持有者为你自己的名称/组织；
- 请勿使用户误以为你的 fork 是官方版本（也不要声称与 DSH Desktop 官方有隶属或背书关系）。
