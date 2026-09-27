# THIRD PARTY NOTICES

本发行版**不打包、不分发任何第三方代码**。本文件说明为什么、构建/测试期用到了哪些第三方包及其许可，以及**运行时会读到的第三方数据面**（代码不在我们这边，你装了它才会被读到——见下文那一节）。

> 作者自用界面上还装着若干**第三方插件**（侧边编辑器、左侧任务看板、费用模块、Git 图、快速重启按钮、远程访问等）。它们**不在**本发行版内，也不随本仓库分发；各自的许可由各自作者给出，**其行为与网络请求由各自作者负责**。清单与逐项来源核查（含「本仓库不随包分发」的两项及原因）见 [OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md)。其中 `ds-harness-remote`（第三方远程访问插件）**默认开启且固定连向作者服务器**，若不需要请按该文关闭。本文件只覆盖**随本仓库分发**的内容，加上下文那一处**运行时**读取。

## 发行产物里有什么

四个 `.tgz` 内容**全部是本项目自研源码**经 esbuild 打包后的产物（版本为本次发行 V1.2 / `public-v1.2`）：

| 产物 | 内容 | 内联的第三方运行时代码 |
|---|---|---|
| dsh-personal-sidebar@0.1.28 | 自研 TypeScript/TSX 打包结果 | **无** |
| dsh-personal-workspace@0.1.25 | 同上 | **无** |
| dsh-personal-hud@0.1.3 | 同上 | **无** |
| dsh-personal-quickstop@0.1.1 | 同上 | **无** |

实测核对（对四个 `client.js` 全文搜索第三方标识）：`esbuild` / `jsdom` / `node_modules` 命中数均为 **0**。

React 与所有 `@deepseek-ai/*` 官方包都以**外部引用（external）**处理：由宿主 DSH Desktop 在运行时提供，我们不打包、不重分发。因此宿主自身的许可条款与本发行版无关。

## 被有意排除的官方同源代码

内部审计实测：`src/workstation/personal-agents/presets/**`（6 组 Agent 预设模板）与官方 `dsh-agent-presets` 的标准预设**逐行 99.6% 相同**。为免在许可含义不明确的情况下重分发官方代码，本次公开发行**不包含该目录**（并相应把 Agent 目录种子置空）。详见 [docs/PUBLIC_CODE_PROVENANCE.md](docs/PUBLIC_CODE_PROVENANCE.md)。

## 运行时可选的第三方集成（**不随本发行版分发**）

上面「发行产物里有什么」说的是**打进包里**的东西。下面这一类不同：**代码不在我们这边**，但本发行版的某个界面会**在你已安装它时**去读它的数据；你不装，功能就如实降级。

### `personal-workspace` 的「任务看板」面 × 第三方插件 `@linxin666/dsh-client-ui-task-board`

| 项 | 事实 |
|---|---|
| 第三方插件 | `@linxin666/dsh-client-ui-task-board`（作者自用版本 0.3.16；核查时 npm 最新 0.3.20） |
| 许可证 | **Apache-2.0**（公开 npm 包） |
| 是否随本发行版分发 | **否**——本发行版**不打包、不分发**它，也未把它内联进任何 `.tgz`（见上方 `client.js` 第三方标识命中数为 0 的实测） |
| 本发行版读它的什么 | ① 它暴露的**本机同源** HTTP 接口：`GET /api/task-board/state`、`POST /api/task-board/action`、SSE `/api/task-board/events`（相对路径，接收方是本机宿主，不是外部服务器）；② 它的账本文件 `$HOME/.dsh/task-board/ledger-v2.json`（工作区维度任务面的读取路径之一，用于补齐 HTTP 快照覆盖不到的部分） |
| 未安装时会怎样 | 相关任务面**自动降级**：显示「取不到 / 无法清点」，**不会显示 0**（0 与「未知」是两件事，界面分开表述）。任务看板与 `@linxin666/dsh-client-ui-task-board` 的已有条目也**不会被改名或接管** |
| 许可证归属 | 该插件的版权与许可由**其作者**给出（Apache-2.0）；本发行版只按它的公开接口读取数据，不重分发其代码，因此**不在本文件的再分发清单内** |

**这是本发行版唯一读取第三方数据面的运行时集成。** 另有一处**可选接线**性质不同：`personal-workspace` 的 ChatGPT 标签是经第三方右栏面板的**公开 API**（`registerTab`）注册的，面板不在时就不注册（界面如实说明「未注册」），**不读它的数据面、不依赖它出功能**。

> 其它第三方插件（侧边编辑器、费用模块、Git 图、远程访问等）对你**没有本发行版侧的数据读取承诺**：本发行版的其它界面不依赖它们，装与不装都不影响本发行版的核心功能。它们的网络行为、账号与凭据处理**均不在本发行版的隐私承诺内**，清单与须知见 [OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md)。

## 构建期 / 测试期依赖（**不进入发行产物**）

```
devDependencies: esbuild ^0.25.0 (实际锁定 0.25.12) ／ jsdom ^24.1.3 (实际锁定 24.1.3)
```

它们只在 `npm install`（构建/自测）时被安装，不随 `packages/*.tgz` 分发。安装 Personal Harness 的普通使用者**不需要**安装它们。

许可分布（`package-lock.json` 全部 90 个传递依赖，均为 dev）：

| 许可 | 包数 |
|---|---|
| MIT | 83 |
| BSD-2-Clause | 2 |
| ISC | 2 |
| MIT-0 | 1 |
| BSD-3-Clause | 1 |
| Apache-2.0 | 1 |

全部为宽松许可（MIT / MIT-0 / BSD-2-Clause / BSD-3-Clause / ISC / Apache-2.0），与 MIT 分发兼容。

<details>
<summary>完整清单（90 个包）</summary>

| 包 | 版本 | 许可 |
|---|---|---|
| `@asamuzakjp/css-color` | 3.2.0 | MIT |
| `@csstools/color-helpers` | 5.1.0 | MIT-0 |
| `@csstools/css-calc` | 2.1.4 | MIT |
| `@csstools/css-color-parser` | 3.1.0 | MIT |
| `@csstools/css-parser-algorithms` | 3.0.5 | MIT |
| `@csstools/css-tokenizer` | 3.0.4 | MIT |
| `@esbuild/aix-ppc64` | 0.25.12 | MIT |
| `@esbuild/android-arm` | 0.25.12 | MIT |
| `@esbuild/android-arm64` | 0.25.12 | MIT |
| `@esbuild/android-x64` | 0.25.12 | MIT |
| `@esbuild/darwin-arm64` | 0.25.12 | MIT |
| `@esbuild/darwin-x64` | 0.25.12 | MIT |
| `@esbuild/freebsd-arm64` | 0.25.12 | MIT |
| `@esbuild/freebsd-x64` | 0.25.12 | MIT |
| `@esbuild/linux-arm` | 0.25.12 | MIT |
| `@esbuild/linux-arm64` | 0.25.12 | MIT |
| `@esbuild/linux-ia32` | 0.25.12 | MIT |
| `@esbuild/linux-loong64` | 0.25.12 | MIT |
| `@esbuild/linux-mips64el` | 0.25.12 | MIT |
| `@esbuild/linux-ppc64` | 0.25.12 | MIT |
| `@esbuild/linux-riscv64` | 0.25.12 | MIT |
| `@esbuild/linux-s390x` | 0.25.12 | MIT |
| `@esbuild/linux-x64` | 0.25.12 | MIT |
| `@esbuild/netbsd-arm64` | 0.25.12 | MIT |
| `@esbuild/netbsd-x64` | 0.25.12 | MIT |
| `@esbuild/openbsd-arm64` | 0.25.12 | MIT |
| `@esbuild/openbsd-x64` | 0.25.12 | MIT |
| `@esbuild/openharmony-arm64` | 0.25.12 | MIT |
| `@esbuild/sunos-x64` | 0.25.12 | MIT |
| `@esbuild/win32-arm64` | 0.25.12 | MIT |
| `@esbuild/win32-ia32` | 0.25.12 | MIT |
| `@esbuild/win32-x64` | 0.25.12 | MIT |
| `agent-base` | 7.1.4 | MIT |
| `asynckit` | 0.4.0 | MIT |
| `call-bind-apply-helpers` | 1.0.2 | MIT |
| `combined-stream` | 1.0.8 | MIT |
| `cssstyle` | 4.6.0 | MIT |
| `data-urls` | 5.0.0 | MIT |
| `debug` | 4.4.3 | MIT |
| `decimal.js` | 10.6.0 | MIT |
| `delayed-stream` | 1.0.0 | MIT |
| `dunder-proto` | 1.0.1 | MIT |
| `entities` | 6.0.1 | BSD-2-Clause |
| `es-define-property` | 1.0.1 | MIT |
| `es-errors` | 1.3.0 | MIT |
| `es-object-atoms` | 1.1.2 | MIT |
| `es-set-tostringtag` | 2.1.0 | MIT |
| `esbuild` | 0.25.12 | MIT |
| `form-data` | 4.0.6 | MIT |
| `function-bind` | 1.1.2 | MIT |
| `get-intrinsic` | 1.3.0 | MIT |
| `get-proto` | 1.0.1 | MIT |
| `gopd` | 1.2.0 | MIT |
| `has-symbols` | 1.1.0 | MIT |
| `has-tostringtag` | 1.0.2 | MIT |
| `hasown` | 2.0.4 | MIT |
| `html-encoding-sniffer` | 4.0.0 | MIT |
| `http-proxy-agent` | 7.0.2 | MIT |
| `https-proxy-agent` | 7.0.6 | MIT |
| `iconv-lite` | 0.6.3 | MIT |
| `is-potential-custom-element-name` | 1.0.1 | MIT |
| `jsdom` | 24.1.3 | MIT |
| `lru-cache` | 10.4.3 | ISC |
| `math-intrinsics` | 1.1.0 | MIT |
| `mime-db` | 1.52.0 | MIT |
| `mime-types` | 2.1.35 | MIT |
| `ms` | 2.1.3 | MIT |
| `nwsapi` | 2.2.27 | MIT |
| `parse5` | 7.3.0 | MIT |
| `psl` | 1.15.0 | MIT |
| `punycode` | 2.3.1 | MIT |
| `querystringify` | 2.2.0 | MIT |
| `requires-port` | 1.0.0 | MIT |
| `rrweb-cssom` | 0.8.0 | MIT |
| `rrweb-cssom` | 0.7.1 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `saxes` | 6.0.0 | ISC |
| `symbol-tree` | 3.2.4 | MIT |
| `tough-cookie` | 4.1.4 | BSD-3-Clause |
| `tr46` | 5.1.1 | MIT |
| `universalify` | 0.2.0 | MIT |
| `url-parse` | 1.5.10 | MIT |
| `w3c-xmlserializer` | 5.0.0 | MIT |
| `webidl-conversions` | 7.0.0 | BSD-2-Clause |
| `whatwg-encoding` | 3.1.1 | MIT |
| `whatwg-mimetype` | 4.0.0 | MIT |
| `whatwg-url` | 14.2.0 | MIT |
| `ws` | 8.21.3 | MIT |
| `xml-name-validator` | 5.0.0 | Apache-2.0 |
| `xmlchars` | 2.2.0 | MIT |

</details>

## 官方宿主（DSH Desktop）

DSH Desktop 是**前置条件**而非本发行版的一部分：请从官方渠道获取，并遵守其自身许可。本发行版不包含、不修改、不重分发其任何文件（兼容模式 = 只使用其公开扩展点）。
