# 可选插件：复刻作者那套工作台（第三方，本仓库不分发）

**先说清最重要的一件事：本仓库只分发三个插件**——`dsh-personal-sidebar`、`dsh-personal-workspace`、`dsh-personal-hud`（都在 `packages/*.tgz` 里）。

本文件提到的其他插件**全部是第三方作品**，版权与维护属于各自作者。本仓库**不打包、不再分发**它们，只如实告诉你：它们是什么、公开来源在哪、装之前要知道什么、以及**哪些我们没验证过**。

> 本页的核查时间：**2026-09-11**。核查方法：查各包在公开 npm registry 上的 `/latest` 元数据，并读取本机已安装副本的 `package.json`（许可证 / 仓库字段）。插件更新很快，版本号随时会变，请以你自己查到的为准。

---

## Ⅰ. 「接近作者界面」的核心组合

想让界面长得接近作者那套，这些是核心：

| 插件 | 它负责什么 | 作者自用版本 | 没装会怎样 |
|---|---|---|---|
| `dsh-personal-sidebar`<br>`dsh-personal-workspace`<br>`dsh-personal-hud` | 本仓库自己的三个插件：左侧入口导航（主页 / 会话 / 新任务 / 项目 / 工作区 / 最近）、中央页面（含任务看板）、底部 HUD | 0.1.24 / 0.1.20 / 0.1.3 | ——**这三个由大安装包自带**，不用另装 |
| `dsh-better-sidebar` | 侧边栏增强：编辑器 / 终端等侧边能力。「工作区 → 打开真实目录」**只有在它可用时**才能真的以编辑器窗口打开 | 0.17.1 | 工作区页会如实显示「当前环境打不开」，而不是假装能开 |
| `@linxin666/dsh-client-ui-task-board` | 左侧那个「任务看板」入口与看板页（这是**它自己的**页面；本仓库只在它上面挂一个真实的「需要你处理」数量徽标，没有改名、没有接管） | 0.3.16 | 本仓库的中央页面仍有自己的任务看板，但左侧那个入口不会出现 |
| `dsh-cost-meter` | 底部费用 / 余额 / 峰谷计价 / 订阅额度模块 | 1.7.10 | 没有余额与花费显示 |
| `dsh-restart-button` | 「快速重启」按钮 | 0.0.1（见下方核查说明） | 只能手动退出再打开宿主 |
| `@linxin666/dsh-client-ui-git-graph` | Git 分支 / 提交图 | 0.3.13 | 没有图形化 Git 视图 |
| `@duke-dsh-plugins/dsh-agent-approval` | 审批页与权限流程（审批请求由它呈现，**是否放行仍然由你点**） | 1.5.0 | 审批请求改由宿主默认方式呈现 |

### 它不能保证什么

**不要期待「装完必然和作者完全一样」。** 界面差异来自很多你无法复制的因素：

- 你自己的 **DSH Desktop 版本**（作者验证环境是 2.0.5）；
- **账号状态、模型、套餐、余额**（这些数据是你自己的，且不会随任何仓库分发）；
- **主题、字号、窗口大小与布局**；
- 每个第三方插件的**版本**（它们的更新节奏与本仓库无关）；
- **权限与审批设置**。

本仓库那三个插件只负责「主页 / 会话 / 新任务 / 项目 / 工作区 / 最近 + 中央页面」这一层外壳；其余观感来自上面这些第三方插件与宿主本身。

---

## Ⅱ. 「更接近作者工作流」的可选组合

这些不是所有人都需要，缺了也不影响上面的界面：

| 插件 | 它解决什么 | 你需要准备什么 |
|---|---|---|
| `@deepseek-ai/dsh-compaction-basic` | **上下文压缩**：会话太长时压缩上下文，让长任务能继续 | 见下方核查说明（作者用的是社区实现，不是官方那个同名包） |
| `@liustack/modlens` | **图片理解**：把截图 / 图表 / 照片交给视觉模型读出来，再让 agent 用 | 先跑一次它的诊断；若本机没有可用的视觉模型，需要配一个引擎（官方建议用免费 Gemini API key，或任意 OpenAI 兼容端点） |
| `@vectorize-io/hindsight-coding-agents` | **长期记忆**：跨会话记住这个仓库里发生过什么 | 三选一：云端（需要 **API token**）／自建服务（需要**你自己的 URL**）／本地守护进程 |
| `dsh-notion-mcp` | 把 agent 连到 **Notion**：搜索、读写页面 | 一次性**浏览器 OAuth 授权**（授权后 token 存在 dsh 的凭据层，即**本机**） |
| `dsh-pocket` | **手机远程访问**你的 dsh web，在外面用手机继续 | 默认「快速隧道」无需账号、无需服务器；想要**固定公网地址**则需 Cloudflare 账号 + 自己的域名 + Tunnel Token |

---

## Ⅲ. 逐项来源核查（核查时间 2026-09-11）

对每一个插件核对：有没有公开可访问的安装来源、许可证是什么、是否需要账号或凭据、以及**我们是否实测过**。

| 插件 | 公开来源 | 许可证 | 需要账号 / 凭据 | 干净 profile 实测 |
|---|---|---|---|---|
| `dsh-better-sidebar` | npm 公开包（核查时最新 0.19.1） | MIT | 不需要 | **未实测** |
| `@linxin666/dsh-client-ui-task-board` | npm 公开包（核查时最新 0.3.20） | Apache-2.0 | 不需要 | **未实测** |
| `@linxin666/dsh-client-ui-git-graph` | npm 公开包（核查时最新 0.3.20） | Apache-2.0 | 不需要 | **未实测** |
| `dsh-cost-meter` | npm 公开包（核查时最新 1.7.21） | MIT | 读**你自己的**账号余额 / 订阅额度（凭据来自你的配置） | **未实测** |
| `dsh-restart-button` | npm 公开包（核查时最新 0.1.2） | MIT | 不需要 | **未实测** |
| `@duke-dsh-plugins/dsh-agent-approval` | npm 公开包（1.5.0） | MIT | 不需要 | **未实测** |
| `@deepseek-ai/dsh-compaction-basic` | npm 公开包（官方 scope，核查时最新 0.0.1-rc.3） | BSD-3-Clause | 不需要 | **未实测** |
| `dsh-compaction-instant`（作者实际使用的那个） | npm 公开包（0.1.4） | MIT | 不需要 | **未实测** |
| `@liustack/modlens` | npm 公开包（核查时最新 3.26.1） | MIT | 可选：视觉引擎（如免费 Gemini API key） | **未实测** |
| `@vectorize-io/hindsight-coding-agents` | npm 公开包（核查时最新 0.6.0） | **无 license 字段** | 需要（云端 token / 自建 URL / 本地 daemon） | **未实测** |
| `dsh-notion-mcp` | npm 公开包（0.1.0） | MIT | 需要：Notion 浏览器 OAuth | **未实测** |
| `dsh-pocket` | npm 公开包（核查时最新 2.10.6） | **GPL-2.0** | 默认不需要；固定域名需 Cloudflare 账号 | **未实测** |

「干净 profile 实测」这一列**全部是「未实测」**：本次只核对了来源与许可证，**没有**替这些第三方插件跑过安装 / 卸载验证。不要把这一页读成兼容性承诺。

### 关于 `dsh-agent-approval` 与 `dsh-restart-button` 的来源（作者自用是本地 tgz）

作者自用的 profile 里，这两个插件是从本机缓存的 `.tgz` 装的，不是直接从 registry 拉的。逐项核查结果：

- **`@duke-dsh-plugins/dsh-agent-approval`**：本机那个 tgz 的 sha1 与 npm 上 **1.5.0** 的官方 tarball 摘要**完全一致** → 就是公开包那一份（MIT，有公开仓库）。
- **`dsh-restart-button`**：本机是 **0.0.1**（该 tgz 内没有 repository 字段），而 npm 公开包最新是 **0.1.2**（MIT，有公开仓库）。**版本不同**，两者行为是否一致**未验证**。

结论：两项**都有公开来源**，因此可以照常推荐安装；但既然我们**没有**在干净 profile 里装过，就**不写成「可一键安装」**。

### 特别说明（作者点名的几项）

- **`dsh-cost-meter`**：底部模块显示余额、今日花费、峰谷价、订阅额度等。这些数字来自**每个用户自己的账号或配置**——**绝不能随仓库分发**，也不要把余额截图、token 或账号信息分享给别人。
- **`@duke-dsh-plugins/dsh-agent-approval`**：它影响**审批页与权限流程**——审批请求由它呈现，但放行与否仍然由**你**决定；装了它不等于放宽权限。
- **`dsh-restart-button`**：只提供一个「快速重启」按钮。
- **`@linxin666/dsh-client-ui-git-graph`**：只提供 Git 分支 / 提交图视图。
- **`dsh-better-sidebar` 与 `task-board` 是完整工作台体验的重要前置能力**：前者提供侧边编辑器/终端（工作区「打开真实目录」依赖它），后者提供左侧任务看板入口。
- **`@deepseek-ai/dsh-compaction-basic` 有个容易踩的坑**：官方 scope 下确有这个包（BSD-3-Clause），但**作者实际用的是社区实现**——通过 npm alias 让这个名字指向 `dsh-compaction-instant@0.1.4`（MIT）。两者不是同一个东西。想复刻作者的行为就装 `dsh-compaction-instant`；直接按名字装到的是官方那个。

---

## 最终分类表

| 分类 | 插件 | 说明 |
|---|---|---|
| **大安装包自带** | `dsh-personal-sidebar`、`dsh-personal-workspace`、`dsh-personal-hud` | 本仓库的全部内容，装完即得 |
| **想接近作者界面：需另装** | `dsh-better-sidebar`、`@linxin666/dsh-client-ui-task-board`、`dsh-cost-meter`、`dsh-restart-button`、`@linxin666/dsh-client-ui-git-graph`、`@duke-dsh-plugins/dsh-agent-approval` | 第三方，各自安装、各自许可；装完**不保证**与作者界面完全一致 |
| **可选：按需再装** | `@deepseek-ai/dsh-compaction-basic`（或社区实现 `dsh-compaction-instant`）、`@liustack/modlens`、`@vectorize-io/hindsight-coding-agents`、`dsh-notion-mcp`、`dsh-pocket` | 解决压缩 / 看图 / 记忆 / Notion / 手机访问，不用也不影响核心体验 |
| **本仓库不随包分发**（许可证原因） | `@vectorize-io/hindsight-coding-agents`（公开包**无 license 字段** → 没有给再分发授权）、`dsh-pocket`（**GPL-2.0** → 有传染性义务） | 你自己装没问题；我们不能把它们打进发行包 |
| **本仓库不随包分发的通用规则** | 全部第三方插件 | 本仓库只分发自己那三个；第三方插件请从它们的公开来源自行安装 |

> 没有任何一项被判定为「不能安装」；被判定为「本仓库不能打包分发」的是上面第 4 行的两项。
> 另外，`@vectorize-io/hindsight-coding-agents` 的公开包**没有许可证字段**——在上面列出的第三方插件里，这一项是最需要你自己判断的：没有明确许可，就意味着作者没有给出再分发或修改的授权。

---

## 安装这些插件的一般做法

```bash
cd "$HOME/.dsh/profiles/desktop"     # macOS 上 DSH Desktop 的默认 profile
pnpm add <包名>                       # 例如 pnpm add dsh-better-sidebar
```

- 装完**完全退出 DSH Desktop 再重新打开**，插件才会加载。
- 有些插件还需要在对应 profile 的挂载文件里加一行（例如 `dsh-better-sidebar` 对 `web` profile 有自己的说明）——**以该插件自己的 README 为准**，这里不替它们承诺。
- 本仓库的安装脚本**只处理那三个 `dsh-personal-*` 插件**：它不会安装、升级、也不会卸载任何第三方插件；`bash scripts/uninstall.sh` 同理，不会碰它们。
- 建议你像本仓库一样**先备份 profile**（本仓库的 `scripts/install.sh` 会在改动前自动留回滚点）。

## 隐私红线

- 任何 **token / API key / OAuth 凭据 / 余额与订阅信息**都是你自己的：不要提交进任何 git 仓库、不要贴到公开 issue、不要在不确定用途时发给任何 AI。
- 本仓库的源码与发行包里**没有**任何账号、余额、凭据，也没有任何第三方插件的内容。

## 未验证项（**不是 PASS**）

| 项 | 状态 |
|---|---|
| 在干净 profile 中安装 / 卸载这 11 个第三方插件 | **未实测** |
| 这些插件与本仓库插件之间的相互影响（升级、冲突、布局挤压、入口重复） | **未验证** |
| 作者自用版本与 npm 最新版本行为一致 | **未验证**（多数版本不同） |
| 作者自用版本在 DSH Desktop 2.0.5 上"能跑"是否等于"已安装验证" | 不等于——是**运行中**的状态观察，不是我们做过的安装验证 |
| Windows 上的一切 | **未验证** |
| 装完能否与作者截图完全一样 | **不保证** |

---

相关文档：[README.md](README.md)｜[FEATURE_GUIDE.md](FEATURE_GUIDE.md)（每个入口怎么用）｜[INSTALL_MACOS.md](INSTALL_MACOS.md)｜[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)
