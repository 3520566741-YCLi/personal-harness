# PUBLIC PRIVACY SCAN REPORT

- 扫描对象：**将要公开的集合** = `git ls-files`（该仓库的全部被跟踪文件）
- 仓库：`personal-harness`（公开发行仓库，独立历史）｜HEAD `07086fe（自引用发行提交：产物内嵌短哈希 = 该提交自身短哈希）`｜扫描时间 2026-09-11T17:28:31.760Z
- 文本文件数：**93**｜文本总字节：908403
- 结论：**CLEAN（无 blocker）**

## 判定口径

| 判定 | 含义 |
|---|---|
| CLEAN | 未命中任何规则 |
| REDACTED | 命中但**已在导出阶段替换为中性的占位/示例值**（导出器留档见 `PUBLIC_EXPORT_ALLOWLIST.md`） |
| BLOCKER | 真实私人数据，**不得公开** |
| FALSE POSITIVE | 命中规则但经上下文确认为无害（例如 `/Users/demo` 占位、说明性文字） |

## 分类结果

| 类别 | 命中 | blocker | false positive |
|---|---|---|---|
| privacy（个人标识 / 路径） | 0 | 0 | 0 |
| secret（凭据） | 0 | 0 | 0 |
| userdata（用户数据引用） | 6 | 0 | 4 |
| license（许可相关） | 0 | 0 | 0 |

## 逐条命中

| path | line | 规则 | 命中 | 判定 | 处理 |
|---|---|---|---|---|---|
| `UNINSTALL.md` | 28 | U-03 个人数据目录引用 | `.dsh/.personal/` | FALSE POSITIVE | 文档/脚本里的通用占位写法 |
| `UNINSTALL.md` | 34 | U-03 个人数据目录引用 | `.dsh/sessions/` | FALSE POSITIVE | 文档/脚本里的通用占位写法 |
| `docs/PUBLIC_SANITIZATION_REPORT.md` | 86 | U-03 个人数据目录引用 | `.dsh/sessions/` | FALSE-POSITIVE-OK | 允许保留（说明见下） |
| `scripts/uninstall.sh` | 59 | U-03 个人数据目录引用 | `.dsh/.personal/` | FALSE POSITIVE | 文档/脚本里的通用占位写法 |
| `scripts/uninstall.sh` | 64 | U-03 个人数据目录引用 | `.dsh/sessions/` | FALSE POSITIVE | 文档/脚本里的通用占位写法 |
| `src/workstation/personal-workspace/src/client/task-extras.ts` | 4 | U-03 个人数据目录引用 | `task-board/ledger-v2.json` | FALSE-POSITIVE-OK | 允许保留（说明见下） |

## 导出阶段已完成的中性化（REDACTED）

| 原内容类型 | 处理后 | 证据 |
|---|---|---|
| 用户私人需求原文（作为新任务输入框示例） | 中性示例（团队周会议题清单） | `export-transforms.log`；产物 diff 证据见 `docs/PUBLIC_SANITIZATION_REPORT.md` |
| 个人品牌串（含个人姓名缩写） | 中性的产品名 `Personal Harness` | 同上 |
| 用户私有项目种子（含本机仓库路径提示） | 置空：`projects: []` | 同上 |
| Agent 目录种子（含 `~/.dsh` 叙述与授权矩阵） | 置空：`agents: []` | 同上 |
| 版权行中的真实姓名与账号 | `Copyright (c) 2026 Personal Harness Authors` | `LICENSE` |
| 包描述里的内部阶段史 | 面向公众的一句话描述 | 三个插件 `package.json` |
