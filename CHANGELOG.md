# CHANGELOG

本文件只记录**公开发行**的历史。内部开发过程（阶段编号、内部验收记录）不在本仓库内，也不对外表达。

## v1.1.0 — public-v1.1（首个公开发行）

**这是 Personal Harness 的第一个公开发行版。** 在此之前没有公开版本，因此没有「从旧公开版升级」这一说（升级路径不适用，而非未测试）。

包含：

- 三个插件：`dsh-personal-sidebar` 0.1.24、`dsh-personal-workspace` 0.1.20、`dsh-personal-hud` 0.1.3
- 侧栏导航外壳（主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近）
- 项目关系层（本机持久化）
- 任务补充字段（截止时间 / 预期交付物 / 约束 / 备注，本机持久化并回显）
- 底部 HUD 与可折叠 Inspector
- 安装 / 卸载 / 回滚脚本 + 兼容性门 + 完整性校验 + 产物契约测试

相对内部版本的变化（即「为公开而做的事」）：

| 类别 | 变化 |
|---|---|
| 用户数据 | 项目种子与 Agent 目录种子**置空**：首次安装是空白用户状态 |
| 隐私 | 移除内嵌的私人需求原文示例、个人品牌串、姓名与账号；`LICENSE` 持有者改为中性名称 |
| 许可 | 不随发行分发与官方预设 99.6% 同源的模板目录（见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)） |
| 历史 | 全新 git 历史，不含任何上游提交、作者信息或内部记录 |
| 文档 | 本仓库的文档全部为公开发行重写（面向使用者，不表达内部过程） |
| 产品语义 | **零变更**：插件行为、界面、数据键均与内部冻结版一致（除上表所列内容性/隐私性差异） |

产物哈希（`sha256(client.js)` 前 16 位）：

| 包 | 版本 | client.js | 与内部冻结版的关系 |
|---|---|---|---|
| dsh-personal-sidebar | 0.1.24 | `04b5f593b256cb38…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-workspace | 0.1.20 | `df2a50187ec52de3…` | 与内部版差异见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md) |
| dsh-personal-hud | 0.1.3 | `76824e80b273adda…` | **与内部冻结版逐字节相同**（该插件不含任何需要中性化的内容） |

完整哈希见 `manifest.json` 与 `checksums.sha256`。

### 发布前审计中修掉的公开发行侧问题（如实登记）

公开发行审计不是一次通过。以下两条是在「模拟一个陌生人 clone 这个仓库」的复验里发现并修复的，均在修复后重新验证：

| 问题 | 修复前行为 | 现状 |
|---|---|---|
| `--dry-run` 不是真 dry-run | `install.sh --dry-run` / `install.ps1 -DryRun` 仍会创建回滚点目录并复制 `.tgz` 到缓存目录 | 严格零改动：只打印将要执行的动作；隔离测试与 Windows 演练各有断言把关 |
| 全新 clone 直接 `npm run verify` 会失败 | `src/workstation/*/build/` 不进 git，缺失时报「缺少构建产物」 | 新增 `scripts/materialize-build.mjs`：从随仓库发布的 `packages/*.tgz` 还原 bundle 并逐字节核对 `manifest.json` 的 sha256；不编译也能校验包是否被改过 |

### Windows Experimental / 未验证版

同一版本内新增 Windows 支持尝试：

- `scripts/windows/install.ps1` / `uninstall.ps1` / `rollback.ps1`（PowerShell，不需要管理员权限，语义与 macOS 版一致）
- `INSTALL_WINDOWS_EXPERIMENTAL.md` 与 [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md)（验证边界 + 风险清单）
- **状态：Experimental / 未验证** —— 从未在真实 Windows DSH Desktop 上验证；只有 PowerShell 7 语法解析 + 非 Windows 环境的逻辑演练（PASS 27 / FAIL 0）。**不得写成「已支持 Windows」**
- 插件产物本身与 macOS 版**完全相同**（同一批 `.tgz`，同一哈希）

### 发行包与提交的对应（自引用发行提交）

本版本是**自引用发行提交**：`packages/*.tgz` 内嵌的短提交哈希（`3f22753`）== 包含它们的那个提交自身的短哈希。`npm run verify` 会强制核验，不一致即失败。

### 已知限制

见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)：6 项产品级限制 + 5 项未验证项。**没有一项被谎报为通过。**
