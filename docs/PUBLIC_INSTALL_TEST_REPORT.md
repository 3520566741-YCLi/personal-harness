# PUBLIC INSTALL TEST REPORT — Personal Harness **V1.2**

公开构建的**安装 → 重装 → 兼容性 → 卸载 → 回滚**全链路实测报告（V1.2 四个包）。所有测试都在**隔离的临时 HOME 与合成 profile** 中执行，真实用户的 DSH profile 全程未被触碰（见第 6 节）。

- 测试脚本：`tools/test-isolated-install.sh`（发行 staging 工具，不随公开发行；脚本内 `REPO` 指向本公开发行目录）
- 本次结果：**PASS 27 / FAIL 0**（V1.1 那次为 PASS 26 / FAIL 0；本次多出的一条来自第四个包）
- 原始日志：`isolated-test.log`（完整 stdout）——**该日志与脚本一样属于发行 staging，不随本仓库分发**，本仓库内没有这两个文件；要复核请按下方命令重跑脚本，而不是引用本页数字

> 本文件描述的是 **V1.2** 这一次实测。V1.1 的同类报告（PASS 26 / FAIL 0、三个包）保存在 git 历史里。

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

## 1. 干净安装

| # | 断言 | 结果 |
|---|---|---|
| 7 | `install.sh` 退出码 0 | PASS |
| 8 | **四个插件**装机 `client.js` 与发行包**逐字节一致**（逐个比对 `manifest.plugins[].clientJsSha256`） | PASS |
| 9–12 | 四个包全部安装到位（sidebar 0.1.28 / workspace 0.1.25 / hud 0.1.3 / quickstop 0.1.1） | PASS ×4 |
| 13 | profile 依赖声明 = 四个 `file:` 公开发行包（文件名带 `public-v1.2` 标签） | PASS |
| 14 | 安装前已创建回滚点 | PASS |
| 15 | 用户数据哨兵文件未被触碰 | PASS |

## 2. 重复安装（幂等 / 重装）

| # | 断言 | 结果 |
|---|---|---|
| 16 | 第二次安装退出码 0（幂等） | PASS |
| 17 | 用户 registry 未被覆盖（create-if-missing 语义） | PASS |
| 18 | 每次安装都留下独立回滚点 | PASS |

> 这是**幂等重装**测试，**不是版本升级测试**（见第 9 节）。

## 3. 兼容性门

| # | 断言 | 结果 |
|---|---|---|
| 19 | `compat-check.mjs` 退出码 0（SUPPORTED） | PASS |

## 4. 卸载（默认保留用户数据）

| # | 断言 | 结果 |
|---|---|---|
| 20 | `uninstall.sh` 退出码 0 | PASS |
| 21 | **四个插件全部**从 profile 移除 | PASS |
| 22 | 卸载后用户数据仍在（未 purge） | PASS |
| 23 | 卸载后用户 registry 未变 | PASS |

## 5. 重装后回滚

| # | 断言 | 结果 |
|---|---|---|
| 24 | `rollback.sh` 退出码 0 | PASS |
| 25 | 回滚后 profile 不再声明 Personal Harness（回到安装前状态） | PASS |
| 26 | 回滚未触碰用户数据 | PASS |

## 6. 真实环境未被触碰的证据

| # | 断言 | 结果 |
|---|---|---|
| 27 | 测试全程使用隔离 HOME（真实 profile 未被读写） | PASS |

## 7. 本次实测**抓到并修掉的两个真缺陷**（如实登记）

第一次运行时结果是 **PASS 25 / FAIL 2**，两个失败都是同一个根因：**脚本里把插件清单硬编码成了三个包**（V1.1 时代的写法）。

| 现象 | 根因 | 修法 |
|---|---|---|
| `uninstall.sh` 跑完，`dsh-personal-quickstop` **仍留在 profile 里**（用户会「卸不干净」） | `uninstall.sh:17` 的 `PLUGINS` 写死三个包名 | 清单改为**从 `manifest.json` 派生**（单一事实源），读不到即报错退出；新增插件不会再漏卸 |
| `rollback.sh` 回滚后 profile **仍声明 Personal Harness** | `rollback.sh` 的核对循环同样写死三个包名 | 同样改为从 `manifest.json` 派生（带明确兜底清单） |

修后复跑：**PASS 27 / FAIL 0**。修法本身也在《PUBLIC_SANITIZATION_REPORT.md》§4 登记（防漂移：脚本不再硬编码包数）。

## 8. 本报告**没有**证明的事

| 未验证 | 原因 |
|---|---|
| 在真实桌面会话中打开并**肉眼确认界面**（含 Quick Stop 的像素与手感） | 需要真机重启宿主并由使用者本人确认；本次发布未执行 |
| 在 DSH Desktop 2.0.5 以外的宿主上运行 | 无该环境 |
| **从 V1.1 升级到 V1.2** | 本仓库内没有该路径的证据；测试中的「重复安装」是**幂等重装**，**不冒名顶替为升级测试** |
| 在 Windows 上安装 / 卸载 / 回滚 | 无 Windows 环境；Windows **不属于本发行范围**（保留材料为 V1.1 实验性材料） |
| 冷启动 / 停止时序 / 长时运行表现 | 属真机验收项，未覆盖 |

以上未验证项在 [../KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md) 中同样登记为「未验证」，**没有转换为 PASS**。
