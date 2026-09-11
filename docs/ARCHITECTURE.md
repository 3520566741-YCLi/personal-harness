# 架构（ARCHITECTURE）

## 一句话

Personal Harness 是**架在 DSH Desktop 官方扩展点上的展示与组织层**：它不接管官方功能，而是把「主页 / 会话 / 新任务 / 任务看板 / 项目 / 工作区 / 最近」重新组织成一套工作台导航，并用官方服务读写官方数据。

```
┌─────────────────────────────── DSH Desktop（宿主，零补丁）───────────────────────────────┐
│  官方外壳：侧栏槽位 / 中央视图槽位 / 底部区域 / 官方 storages（会话·任务·工作区）           │
└───────▲──────────────────────────────────────────────▲──────────────────────────────────┘
        │ 官方扩展点（slot 注入 + 官方 client/ui/api 服务 + cordis.patch.yml 声明）
        │
┌───────┴────────────┬─────────────────────────────┬──────────────────────────────────────┐
│ dsh-personal-hud   │ dsh-personal-sidebar        │ dsh-personal-workspace               │
│ 底部状态条 +        │ 侧栏导航外壳                 │ 中央视图：主页 / 新任务 / 任务看板 /   │
│ 可折叠 Inspector   │ 会话列表 / 最近 / 新任务入口  │ 项目中心 / 工作区中心                 │
└────────────────────┴──────────────┬──────────────┴──────────────────────────────────────┘
                                    │
                     ┌──────────────┴───────────────┐
                     │ personal-registry（共享层）   │  ← 三个插件复用的注册表 / 类型
                     └──────────────┬───────────────┘
                                    │
        ┌───────────────────────────┴────────────────────────────┐
        │ 数据来源（全部只读官方，写只写本机层）                      │
        │  · 官方：会话 / 任务（task board）/ 工作区 —— 经官方服务读取 │
        │  · 本机：项目关系层、任务补充字段 —— localStorage          │
        └────────────────────────────────────────────────────────┘
```

## 仓库结构

| 路径 | 作用 |
|---|---|
| `src/workstation/personal-sidebar/` | 侧栏插件：导航外壳 + 会话列表 + 「最近」面板 |
| `src/workstation/personal-workspace/` | 中央视图插件：主页 / 新任务输入 / 任务看板 / 项目中心 / 工作区中心 |
| `src/workstation/personal-hud/` | 底部 HUD + 可折叠 Inspector（诊断） |
| `src/workstation/personal-registry/` | 三插件共享的注册表与类型（项目、视图） |
| `src/workstation/personal-version/product.json` | 产品名与产品版本（构建期注入产物） |
| `src/workstation/personal-projects/registry.json` | 项目目录种子（**公开版为空**） |
| `src/workstation/personal-agents/registry.json` | Agent 目录种子（**公开版为空**） |
| `scripts/` | 本仓库的公开脚本：打包 / 校验 / 兼容性 / 产物测试 / 安装 / 卸载 / 回滚 |
| `packages/` | 预打包的发行物（三个 `.tgz`） |

每个插件目录的形状一致：

```
personal-<name>/
├── package.json        # 插件声明（name/版本/exports/dsh.bundle.patch/dsh.client.inject）
├── cordis.patch.yml     # 通过官方 patch 机制声明的接入点
├── build.mjs            # esbuild 打包脚本（官方包与 react 一律 external）
├── server/              # 宿主侧入口
└── src/client/          # 渲染侧源码（TS/TSX）
```

## 构建与发行链路

```
源码 (src/**)  ──build.mjs (esbuild)──▶  build/flat/client.js + index.js
                                              │  注入常量：__DPS_SHA__ / __DPS_VERSION__
                                              │            / __PRODUCT_NAME__ / __PRODUCT_VERSION__
                                              ▼
                                     npm pack → packages/<name>-<ver>-public-v1.1.tgz
                                              │
                                              ▼
                     manifest.json（逐包 sha256 / 内嵌提交 / 宿主兼容区间）
                              + checksums.sha256
                                              │
                                              ▼
                          scripts/install.sh（校验 → 备份 → pnpm add file: → 逐字节核对）
```

关键设计：

1. **官方包与 React 全部 external**：不把宿主依赖打进产物（所以产物只有 8 KB ~ 80 KB，也不存在「打包了官方代码」的许可问题）。
2. **可复现**：相同源码 + 相同提交 → `client.js` 字节相同；`.tgz` 因 `npm pack` 嵌入文件时间戳而不保证字节相同，因此**内容一致性以 `client.js` 的 sha256 判定**。
3. **产物内嵌提交用于溯源**：sidebar / workspace 内嵌构建提交，hud 的构建未注入该常量——这是实测事实，`manifest.json` 里逐包如实记录（`embeddedCommit: null` + 说明），**不用其它包的值填充**。
4. **文件名校验也用于安装**：包名带 `-public-v1.1` 后缀是刻意的——pnpm 对「同一 specifier 已满足」会跳过重装，带版本后缀的文件名确保重装真的发生。

## 数据模型（本机层）

| 键 | 内容 | 归属 |
|---|---|---|
| `dsh.personal.projects.v1` | 项目关系层：会话/任务与项目的归属关系 | 本机 localStorage |
| `dsh.personal.taskextras.v1` | 任务补充字段：截止时间 / 预期交付物 / 约束 / 备注 | 本机 localStorage |
| `dsh.personal.tasks.v1` | 本机任务投影缓存（展示用） | 本机 localStorage |
| `dsh.personal.mainview.v1` | 当前主视图（主页 / 任务看板 / 项目 / 工作区） | 本机 localStorage |

为什么补充字段在本机而不进官方任务账本：官方任务 create/update 是**白名单精确键集**（`title/description/prompt/workspaceId/mode/permission/model/schedule`），多写一个键整条请求会 HTTP 400。官方任务里没有「截止时间 / 交付物 / 约束 / 备注」的存储位，所以这些字段由本层在本机保存并在界面回显。**这是取舍，不是 bug**（见 [KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md) 设计取舍第 2 条）。

## 与官方的关系（纪律）

| 允许 | 禁止 |
|---|---|
| 用官方槽位渲染自己的 UI | 修改官方 DOM 结构 / 注入官方 CSS 覆盖 |
| 调官方 client/ui/api 服务读数据 | 用官方写接口改用户数据 |
| 读官方 storages | 复制官方源码进本仓库 |
| 通过 `cordis.patch.yml` 声明接入 | patch 官方应用包（本发行版零补丁） |

代码来源审计（含逐文件与官方包的相似度实测）见 [PUBLIC_CODE_PROVENANCE.md](PUBLIC_CODE_PROVENANCE.md)。
