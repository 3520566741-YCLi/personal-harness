# PUBLIC EXPORT ALLOWLIST

本次「私人冻结版 → 公开发行」的**白名单导出**留档：只导出下列条目，其余一律不导出（**不是**先整体复制再删）。导出由 `tools/export-public.mjs` 执行，可重复运行（幂等）。

- 来源（只读）：内部私有冻结仓库（**不公开、不随发行、本仓库不含其任何提交或文件**），tag `v1.1.0`，源提交 `3f231ced163d997a72c748dac40f5aa51415061e`
- 目标：本仓库（独立 git 历史，**不含**上游任何提交）
- 导出条目数：**21**
- 逐次清洗命中：见 `export-transforms.log`（10 处，全部有记录）

## 白名单（唯一被允许导出的内容）

| 私人树路径 | 公开树路径 | 类型 |
|---|---|---|
| `src/workstation/personal-sidebar/src` | `personal-sidebar/src/` | 目录（递归） |
| `src/workstation/personal-sidebar/server` | `personal-sidebar/server/` | 目录（递归） |
| `src/workstation/personal-sidebar/build.mjs` | `personal-sidebar/build.mjs` | 文件 |
| `src/workstation/personal-sidebar/cordis.patch.yml` | `personal-sidebar/cordis.patch.yml` | 文件 |
| `src/workstation/personal-sidebar/package.json` | `personal-sidebar/package.json` | 文件 |
| `src/workstation/personal-workspace/src` | `personal-workspace/src/` | 目录（递归） |
| `src/workstation/personal-workspace/server` | `personal-workspace/server/` | 目录（递归） |
| `src/workstation/personal-workspace/build.mjs` | `personal-workspace/build.mjs` | 文件 |
| `src/workstation/personal-workspace/cordis.patch.yml` | `personal-workspace/cordis.patch.yml` | 文件 |
| `src/workstation/personal-workspace/package.json` | `personal-workspace/package.json` | 文件 |
| `src/workstation/personal-hud/src` | `personal-hud/src/` | 目录（递归） |
| `src/workstation/personal-hud/server` | `personal-hud/server/` | 目录（递归） |
| `src/workstation/personal-hud/build.mjs` | `personal-hud/build.mjs` | 文件 |
| `src/workstation/personal-hud/cordis.patch.yml` | `personal-hud/cordis.patch.yml` | 文件 |
| `src/workstation/personal-hud/package.json` | `personal-hud/package.json` | 文件 |
| `src/workstation/personal-registry/src` | `personal-registry/src/` | 目录（递归） |
| `src/workstation/personal-version/product.json` | `personal-version/product.json` | 文件 |
| `src/workstation/personal-projects/registry.json` | `personal-projects/registry.json` | 文件 |
| `src/workstation/personal-agents/registry.json` | `personal-agents/registry.json` | 文件 |
| `package.json` | `package.json` | 文件 |
| `LICENSE` | `LICENSE` | 文件 |

## 明确排除（NOT exported）

| 排除项 | 原因 |
|---|---|
| `.git/**` | 私人提交历史、作者信息、commit message |
| `docs/evidence/**` | 真实会话 id、任务 id、用户原文取证、逐条验收记录 |
| `DEVELOPMENT_LOG.md` / `docs/SESSION_TIMELINE.md` / `docs/CHANGELOG.md`(私人版) / `docs/ROADMAP.md` | 内部开发过程与阶段计划 |
| `docs/*.md`（除本仓库公开文档外） | E0–E5 各轮内部审计与实现报告 |
| `release/**` | 私人交付物（公开版重新构建，产物哈希不同） |
| `scripts/**`（私人版） | 私人运维 / 验收脚本：含真实会话 id 样例、用户原文样例、cookie / 会话库读取逻辑 |
| `src/workstation/personal-agents/presets/**` | 与官方 preset **逐行 99.6% 相同** → 许可含义不明确，不随发行 |
| `node_modules/**` `**/build/**` `**/dist/**` `*.tgz` | 依赖与构建产物（公开版重新构建） |
| `$HOME/.dsh/**` 任何内容 | 用户数据（会话 / 任务 / 项目 / 工作区 / 凭据），**从未进入导出流程** |

## 导出后施加的清洗（不是删除，是中性化）

| 类别 | 处理 |
|---|---|
| 用户私人需求原文（内嵌在 UI 输入框示例里） | 替换为中性示例 |
| 个人品牌串 / 姓名 / GitHub 账号 | 替换为 `Personal Harness` / `Personal Harness Authors` |
| 用户私有项目种子（含本机仓库路径提示） | **置空**：`projects: []` |
| Agent 目录种子 | **置空**：`agents: []` |
| 包描述中的内部阶段史与私人语境 | 改写为面向公众的简介 |

逐条 diff 与字节级证据见 [docs/PUBLIC_SANITIZATION_REPORT.md](docs/PUBLIC_SANITIZATION_REPORT.md)。
