# PUBLIC CODE PROVENANCE

- 目的：确认公开集合里**哪些是我们自己的代码、哪些只是调用官方 API、有没有把官方代码复制进来**。
- 方法：
  1. 逐文件检查模块引用：官方能力一律以 `@deepseek-ai/*` 裸模块名**外部引用**（宿主注入），构建时被 esbuild 标为 external；
  2. **相似度实测**：把每个被跟踪文本文件的非注释有效行，与官方包目录（`$HOME/.dsh/profiles/desktop/node_modules`，含 `@deepseek-ai/*`）中所有文本文件做行集合重合度比较，取最大值；
  3. 参考：内部审计曾标记的两类高风险文件（官方 preset 衍生模板、官方 primitives 复刻 stub）在本次导出的**允许清单中已被排除**。
- 扫描时间：2026-09-11T18:02:35.056Z｜HEAD `a4a2092（自引用发行提交：产物内嵌短哈希 = 该提交自身短哈希）`｜对比的官方文本文件数：**7361**

## 逐文件最高相似度（仅列出 > 0.20 的）

| 文件 | 与官方某文件的最高行重合度 | 对应官方文件 | 判定 |
|---|---|---|---|
| `src/workstation/personal-hud/package.json` | 75.0% | `dsh-restart-button/package.json` | FALSE POSITIVE（官方契约，见下） |
| `src/workstation/personal-sidebar/package.json` | 75.0% | `dsh-restart-button/package.json` | FALSE POSITIVE（官方契约，见下） |
| `src/workstation/personal-workspace/package.json` | 75.0% | `dsh-restart-button/package.json` | FALSE POSITIVE（官方契约，见下） |
| `package-lock.json` | 28.6% | `decamelize/package.json` | UPSTREAM API ONLY / 自研 |
| `src/workstation/personal-sidebar/src/client/styles.ts` | 27.7% | `dsh-better-sidebar/src/client/SubagentView.module.css` | UPSTREAM API ONLY / 自研 |
| `package.json` | 25.0% | `dsh-restart-button/package.json` | FALSE POSITIVE（官方契约，见下） |
| `src/workstation/personal-sidebar/src/client/PersonalBrowser.tsx` | 22.2% | `dsh-better-sidebar/src/client/settings-nav-icon.ts` | UPSTREAM API ONLY / 自研 |

## 分类结论

| 类别 | 内容 | 判定 |
|---|---|---|
| **OWN CODE** | 三个插件的 `src/**`、`server/index.js`、`build.mjs`、`cordis.patch.yml`、`personal-registry/src/**`、`personal-version/product.json`、`scripts/**`（本仓库新写的公开脚本） | 自研（MIT，见 `LICENSE`） |
| **UPSTREAM API ONLY** | 所有官方能力调用：`@deepseek-ai/dsh-*`（宿主注入的 client/ui/api 服务）、官方 storages 与官方 HTTP 动作 | 只调用，不复制；未打包官方代码 |
| **UPSTREAM COPIED** | **无**（相似度 ≥0.6 且无法解释的文件：0） | — |
| — 其中「已解释误报」 | 3 个文件：`src/workstation/personal-hud/package.json`、`src/workstation/personal-sidebar/package.json`、`src/workstation/personal-workspace/package.json` —— 均为插件清单 JSON，重合的是官方契约键名，非代码 | 保留 |
| **THIRD PARTY** | 构建期依赖 `esbuild`；测试期依赖 `jsdom`（均为 devDependency，**不进入发行产物**） | 见 `THIRD_PARTY_NOTICES.md` |

## 未随发行分发的内部资产（有意排除）

| 资产 | 为什么排除 |
|---|---|
| `src/workstation/personal-agents/presets/**`（6 组 `agent.cordis.yml` + `preset.yml`） | 内部审计实测其与官方 `dsh-agent-presets` 标准 preset **逐行 99.6% 相同** → 属官方代码再分发，需要额外的版权声明与许可全文；本次选择**不随发行**（同时把 Agent 目录种子置空，避免 UI 展示不存在的 Agent） |
| 内部 `scripts/lib/primitives-stub.mjs` 等测试替身 | 自述「照抄官方渲染路径/DOM 形状」→ 同样不随发行 |
| 内部验收/运维脚本（`realdevice-*`、`harness-guard.sh`、`read-acceptance-results.mjs` 等） | 含真实会话 id、用户原文样例、cookie 库读取逻辑 → 属私人数据与凭据触达工具 |
| `docs/evidence/**`、`DEVELOPMENT_LOG.md`、`docs/SESSION_TIMELINE.md`、各轮验收报告 | 真实会话 / 任务 / 原文取证与内部过程记录 |

## 官方能力引用清单（示例，非穷举）

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-api-remotes`
- `@deepseek-ai/dsh-api-session-controller`
- `@deepseek-ai/dsh-api-workspace-controller`
- `@deepseek-ai/dsh-client-locale`
- `@deepseek-ai/dsh-client-store`
- `@deepseek-ai/dsh-client-ui-primitives`
- `@deepseek-ai/dsh-client-ui-renderer`
- `@deepseek-ai/dsh-client-ui-session`
- `@deepseek-ai/dsh-client-ui-sidebar`
- `@deepseek-ai/dsh-client-ui-slots`
