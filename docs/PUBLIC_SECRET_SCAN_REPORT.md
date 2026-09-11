# PUBLIC SECRET SCAN REPORT

- 扫描对象：同 `PUBLIC_PRIVACY_SCAN_REPORT.md`（全部被跟踪文本文件）
- 扫描时间：2026-09-11T16:35:59.400Z｜HEAD `3f22753`
- 工具：`tools/scan-public.mjs` 的 secret 规则集（S-01…S-06：OpenAI 形态密钥 / GitHub token / AWS key id / 私钥块 / 凭据赋值 / Bearer 头）
- 结论：**CLEAN（无 secret）**

## 额外人工核对项

| 项目 | 结果 |
|---|---|
| `.env` / `.env.*` | 仓库内不存在；`.gitignore` 已忽略 |
| `.npmrc`（可能含 registry token） | 仓库内不存在；`.gitignore` 已忽略 |
| `package-lock.json` 内的 registry 凭据 | 仅含 `https://registry.npmjs.org/` 公共地址与 integrity 哈希，无 token |
| git remote 凭据 | 公开仓库将为**新建 remote**；导出目录内无 `.git/config` 凭据（本阶段未创建 remote） |
| 运行时凭据读取（cookie / 会话库） | 本发行版**不含**任何读取宿主 cookie / 会话库的代码（那类脚本是内部工具，未导出） |
| 官方 DSH 托管端点凭据 | 无：插件只通过宿主注入的官方服务访问，不自行持有端点凭据 |

## 逐条命中

_无命中。_
