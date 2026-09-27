# 兼容性（COMPATIBILITY）

## 判定规则

安装脚本与 `npm run compat` 使用同一套判定（同一常量 `TESTED = 2.0.5`）：

| 本机 DSH Desktop 版本 | 判定 | 行为 |
|---|---|---|
| **2.0.5** | **SUPPORTED** | 直接安装（这是本发行版实际验证过的版本） |
| 2.x 其它版本 | **UNTESTED** | **拒绝静默安装**，`install.sh` 退出码 1 并提示 `--allow-untested` |
| 1.x 或更早 | **INCOMPATIBLE** | 拒绝，除非显式 `--force` |
| 检测不到应用包（但 profile 存在） | **UNTESTED** | 同上，需 `--allow-untested` 或 `--force` |

```bash
node scripts/compat-check.mjs          # 人类可读
node scripts/compat-check.mjs --json   # 机器可读
```

退出码：`0` SUPPORTED｜`3` UNTESTED｜`4` INCOMPATIBLE｜`1` 环境错误

## 为什么 2.x 也算 UNTESTED

插件依赖官方扩展点（槽位注入、官方 client/ui/api 服务、`cordis.patch.yml` 声明）。官方在 2.x 内的小版本更新可能调整这些契约，而**我们没有在那些版本上跑过真机验证**。按本项目纪律：**未知 ≠ 通过**。所以判定为 UNTESTED 并要你显式确认，而不是替你假定「大概没问题」。

想在未验证版本上试：先 `--dry-run` 看动作，再 `--allow-untested`。装完若界面异常，回滚一条命令（见 [ROLLBACK.md](ROLLBACK.md)）。

## Windows：Experimental / 未验证

| 平台 | 状态 | 说明 |
|---|---|---|
| **Windows 10 / 11** | **Experimental / 未验证** | 提供 `scripts/windows/*.ps1`；**本发行版从未在真实 Windows 环境验证**。Windows 版宿主版本无法可靠读取 → 判定恒为 UNTESTED，必须显式 `-AllowUntested` 才继续 |

**Windows 不是 SUPPORTED 平台**，任何文档不得把它写成「已支持」。三个 PowerShell 脚本每次运行都会打印完整警告块；验证边界与风险清单见 [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md)。

## 实测环境（本次发布）

| 项目 | 值 |
|---|---|
| 宿主 | DSH Desktop **2.0.5** @ `/Applications/DSH Desktop.app` |
| 宿主集成方式 | compatibility mode —— **官方代码零补丁**（四个插件都通过官方扩展点接入） |
| 系统 | macOS |
| Node.js | ≥ 20（本次构建/测试用 24.16.0） |
| pnpm | 用于 profile 依赖管理（本次 11.8.0） |
| 组件（四个插件） | sidebar 0.1.28 ／ workspace 0.1.25 ／ hud 0.1.3 ／ quickstop 0.1.1 |

插件各自负责什么（`dsh-personal-quickstop` 是 0.1.1 新增）：`sidebar` = Personal 侧栏导航；`workspace` = 主页/会话/任务看板/项目/工作区等中央页面；`hud` = 底部状态条；**`quickstop` = Quick Stop／后台任务优雅中断与续接**。产品版本 **Personal Harness V1.2**（发行 tag `public-v1.2`，macOS 发行）。

## 覆盖到什么程度（诚实口径）

| 已验证 | 证据 |
|---|---|
| 在**隔离的合成 profile** 中完整走通 安装 → 复装（幂等）→ 兼容性门 → 卸载 → 回滚，共 22 项断言全通过（该报告出自 **V1.1** 公开发行；本仓库内**没有针对 V1.2 的同类报告**，所以 V1.2 的该项**未验证**） | [docs/PUBLIC_INSTALL_TEST_REPORT.md](docs/PUBLIC_INSTALL_TEST_REPORT.md) |
| 产物契约测试 **71 项**（四个包；`development` 与 `production` 两种 `NODE_ENV` 下各跑一遍，均 0 失败） | `npm run test` |
| 装机后 profile 内 `client.js` 与发行包**逐字节一致** | `install.sh` 第 7 步 / `npm run verify` |
| 发行包 sha256 与 `manifest.json` 一致 | `npm run verify` |

| **未验证**（不谎报为通过） | 说明 |
|---|---|
| 在**真实桌面会话**里打开公开构建并肉眼确认界面 | 需要真机重启宿主；本次发布未执行（见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)） |
| 在 2.0.5 以外的宿主版本上运行 | 无设备/无版本，判定一律 UNTESTED |
| **Windows 上的任何环节**（安装/界面/卸载/回滚） | 本机无 Windows 环境；只做了 PowerShell 语法解析 + 非 Windows 环境的逻辑演练（见 [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md)） |
| 从上一公开版本（V1.1）升级到 V1.2 | 本仓库内**没有**该升级路径的验证证据 → 按**未验证**处理（不写成 PASS） |
| 长时间使用下的内存/性能表现 | 未测量 |
