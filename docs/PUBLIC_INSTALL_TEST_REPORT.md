# PUBLIC INSTALL TEST REPORT

公开构建的**安装 → 重装 → 兼容性 → 卸载 → 回滚**全链路实测报告。所有测试都在**隔离的临时 HOME 与合成 profile** 中执行，真实用户的 DSH profile 全程未被触碰（有证据，见第 6 节）。

- 测试脚本：`tools/test-isolated-install.sh`（属于发行 staging 工具，不在本仓库内；脚本内的 `REPO` 指向本公开发行目录）
- 原始日志：完整 stdout 已留档（`isolated-test.log`）
- 结论：**PASS 26 / FAIL 0**

## 0. 隔离环境

| 项 | 值 |
|---|---|
| 临时 HOME | `<staging>/test-home`（`HOME=` 覆盖，脚本内所有路径由 `${HOME}` 派生） |
| profile | `<临时 HOME>/.dsh/profiles/desktop`（**合成的空 profile**，依赖为空 = 全新用户） |
| 用户数据哨兵 | 预置用户数据文件 + 一份用户自建 registry，用于验证「安装/卸载/回滚都不动用户数据」 |

| # | 断言 | 结果 |
|---|---|---|
| 1 | 临时 HOME 生效，真实 profile 未被触碰 | PASS |
| 2 | 合成 profile 就绪（依赖为空 = 全新用户） | PASS |

## 0.5 `--dry-run` 必须「什么都不改」

| # | 断言 | 结果 |
|---|---|---|
| 3 | `install.sh --dry-run` 退出码 0 | PASS |
| 4 | `--dry-run` 未创建回滚点目录（`~/.dsh/guard-backups`） | PASS |
| 5 | `--dry-run` 未创建缓存目录、未复制 `.tgz`（`~/.dsh/cache`） | PASS |
| 6 | `--dry-run` 未改动 profile 的依赖声明 | PASS |

> 说明：这四条是公开发行前审计中**修出来的**——修复前 `--dry-run` 仍会创建备份目录并复制 tgz 到缓存目录。现在它是真 dry-run：
> 只打印将要执行的动作，磁盘上零改动。Windows 侧同样的断言在脚本逻辑演练中另有两条（见 [WINDOWS_EXPERIMENTAL_STATUS.md](WINDOWS_EXPERIMENTAL_STATUS.md)）。

## 1. 干净安装（§18）

`HOME=<temp> bash scripts/install.sh`：

| # | 断言 | 结果 |
|---|---|---|
| 7 | `install.sh` 退出码 0 | PASS |
| 8 | 三个插件装机后的 `client.js` 与发行包**逐字节一致** | PASS |
| 9–11 | sidebar / workspace / hud 三者均已安装 | PASS |
| 12 | profile 依赖声明为三个 `file:` 公开包（文件名带 `public-v1.1` 标签） | PASS |
| 13 | 安装前已自动创建回滚点 | PASS |
| 14 | 用户数据哨兵文件未被触碰 | PASS |

## 2. 重复安装 / 重装（§9 create-if-missing）

再一次执行安装：

| # | 断言 | 结果 |
|---|---|---|
| 15 | 第二次安装退出码 0（幂等） | PASS |
| 16 | 用户自建 registry **未被覆盖**（create-if-missing 语义成立） | PASS |
| 17 | 每次安装都留下独立回滚点（实测 2 个） | PASS |

## 3. 兼容性门（§17）

| # | 断言 | 结果 |
|---|---|---|
| 18 | `compat-check` 退出码 0（判定 SUPPORTED） | PASS |

另在真实环境单独运行：`DSH Desktop 2.0.5 @ /Applications/DSH Desktop.app` → **SUPPORTED**。

## 4. 卸载（§20）

| # | 断言 | 结果 |
|---|---|---|
| 19 | `uninstall.sh` 退出码 0 | PASS |
| 20 | 三个插件已从 profile 移除 | PASS |
| 21 | 卸载后**用户数据仍在**（默认不 purge） | PASS |
| 22 | 卸载后用户 registry 未变 | PASS |

## 5. 回滚（§21）

重装后执行 `rollback.sh`：

| # | 断言 | 结果 |
|---|---|---|
| 23 | `rollback.sh` 退出码 0 | PASS |
| 24 | 回滚后 profile **不再声明** Personal Harness（恢复到安装前状态） | PASS |
| 25 | 回滚未触碰用户数据 | PASS |

回滚脚本自身也留了后路：回滚前把「当前」状态另存为 `<时间戳>-before-rollback/`，实测日志可见。

## 6. 真实环境未受影响的证据（§18 隔离性）

| # | 断言 | 结果 |
|---|---|---|
| 26 | 测试全程使用隔离 HOME | PASS |

真实 profile 的依赖声明在测试前后均为内部版本（`file:.../dsh-personal-*-v1.1.tgz`），**与本次公开测试无关、未被修改**：

```
REAL_PROFILE_DEPS = dsh-personal-hud/0.1.3, dsh-personal-sidebar/0.1.24, dsh-personal-workspace/0.1.20
                    （均为 file:$HOME/.dsh/cache/dsh-personal-*-v1.1.tgz，即内部安装）
```

## 7. 全新 clone 验证（模拟「朋友 clone 下来自己跑」）

在与本仓库无关的临时目录里 `git clone` 本发行提交（`3f22753`，1 个提交），然后：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 依赖 | `npm install --no-audit --no-fund` | 退出码 0 |
| 免构建校验 | `npm run verify`（此时仓库内**没有** `build/`） | PASS —— `scripts/materialize-build.mjs` 从 `packages/*.tgz` 还原 bundle，并逐字节核对 `manifest.json` 的 sha256 |
| 产物契约 | `npm test` / `NODE_ENV=production npm test` | 检查 57 项，失败 0 项（两次） |
| 源码重建 | `npm run build && npm run package && npm run verify` | PASS —— 重建后的三个 `client.js` 与发布版**逐字节一致**（内嵌提交同为 `3f22753`） |
| 一键安装 | `bash scripts/install.sh --dry-run` | PASS —— 打印动作清单，磁盘零改动 |

> 这一节回答一个具体问题：**别人拿到这个仓库，不编译能不能校验包没被改过？** 能。

## 8. 升级测试（§19）

**N/A —— 不适用，不是 PASS。**

本次是 Personal Harness 的**首个公开发行**，不存在「上一个公开版本」，因此没有从旧公开版升级的路径可测。测试中「重复安装」验证的是**幂等重装**（装两次结果一致、用户数据不被覆盖），它与「版本升级」不是同一件事，**不冒名顶替为升级测试**。

## 9. 本报告**没有**证明的事

| 未验证 | 原因 |
|---|---|
| 在真实桌面会话中打开并肉眼确认界面 | 需要真机重启宿主；本次发布未执行 |
| 在 2.0.5 以外的宿主上运行 | 无该环境 |
| 在 Windows 上安装 / 卸载 / 回滚 | 无 Windows 环境（Windows 版按 Experimental / 未验证发行） |
| 冷启动 / 停止时序 / 长时运行表现 | 属内部真机验收项，未覆盖 |

以上未验证项在 [../KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md) 中同样登记为「未验证」，**没有转换为 PASS**。
