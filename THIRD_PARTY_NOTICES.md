# THIRD PARTY NOTICES

本发行版**不再分发任何第三方代码**。本文件说明为什么，以及构建/测试期用到了哪些第三方包及其许可。

> 作者自用界面上还装着若干**第三方插件**（侧边编辑器、左侧任务看板、费用模块、Git 图、快速重启按钮等）。它们**不在**本发行版内，也不随本仓库分发；各自的许可由各自作者给出。清单与逐项来源核查（含「本仓库不随包分发」的两项及原因）见 [OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md)。本文件只覆盖**随本仓库分发**的内容。

## 发行产物里有什么

三个 `.tgz` 内容**全部是本项目自研源码**经 esbuild 打包后的产物：

| 产物 | 内容 | 内联的第三方运行时代码 |
|---|---|---|
| dsh-personal-sidebar@0.1.24 | 自研 TypeScript/TSX 打包结果 | **无** |
| dsh-personal-workspace@0.1.20 | 同上 | **无** |
| dsh-personal-hud@0.1.3 | 同上 | **无** |

实测核对（对三个 `client.js` 全文搜索第三方标识）：`esbuild` / `jsdom` / `node_modules` 命中数均为 **0**。

React 与所有 `@deepseek-ai/*` 官方包都以**外部引用（external）**处理：由宿主 DSH Desktop 在运行时提供，我们不打包、不重分发。因此宿主自身的许可条款与本发行版无关。

## 被有意排除的官方同源代码

内部审计实测：`src/workstation/personal-agents/presets/**`（6 组 Agent 预设模板）与官方 `dsh-agent-presets` 的标准预设**逐行 99.6% 相同**。为免在许可含义不明确的情况下重分发官方代码，本次公开发行**不包含该目录**（并相应把 Agent 目录种子置空）。详见 [docs/PUBLIC_CODE_PROVENANCE.md](docs/PUBLIC_CODE_PROVENANCE.md)。

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
