# 安全（SECURITY）

## 信任模型

Personal Harness 运行在**你自己的机器上、你自己的 DSH Desktop profile 里**，以你的用户身份执行。它没有提权设计：

- **绝不 sudo**：安装/卸载/回滚脚本全程只写 `$HOME`。脚本里没有 `sudo`、没有 `chmod +s`、没有修改官方应用包。
- **不修改官方代码**：三个插件都通过官方扩展点接入（槽位、官方 client/ui/api 服务、`cordis.patch.yml` 声明），宿主代码零补丁。因此卸载/回滚不会留下「改坏了的官方文件」。
- **不改官方数据**：不调用官方写接口修改你的会话/任务；只读取并渲染。
- **本地文件依赖安装**：`pnpm add file:...tgz`，不走 npm registry，不需要网络，不需要 token。
- **安装前校验**：`install.sh` 先用 `manifest.json` + `checksums.sha256` 校验三个包的 sha256，再安装；装完逐字节比对 profile 内 `client.js`。

## 数据流

```
本仓库 packages/*.tgz  ──pnpm add file:──▶  $HOME/.dsh/profiles/desktop/node_modules/
                                                     │  宿主启动时加载
                                                     ▼
                                  官方扩展点（槽位 / 官方服务）◀── 三个插件（本机 JS）
                                                     │
                                                     ▼
                                   官方存储（会话 / 任务 / 工作区）—— 只读
```

没有任何一条边指向外部网络。不存在本项目自建的服务器。

## 权限与攻击面

| 项 | 说明 |
|---|---|
| 网络 | 插件运行时不发起自建网络请求 |
| 文件系统 | 只读写上表中的路径；不遍历 `$HOME` |
| 凭据 | 不读取、不存储、不转发任何 API Key / cookie / token。仓库内不含 `.env`，`.gitignore` 已忽略常见凭据文件名 |
| 代码执行 | 插件在宿主渲染进程内以常规 JS 权限运行——这是 DSH 插件模型的固有前提：**装任何第三方插件都等于信任其作者**。所以请只安装你信任来源的 `.tgz` |
| 供应链 | 预打包 `.tgz` 的 sha256 记录在 `manifest.json` 与 `checksums.sha256`；想完全自己掌控，就 `npm run build && npm run package` 从源码构建 |

## 已知的非安全性偏差（有意为之，已登记）

**官方在某些失败路径上静默、我们在几处更响（会多打日志/多抛错）。** 这是有意的可见性提升（见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) KL-5）：出错时我们倾向让你知道，而不是无声失败。它不引入新的外部访问，只影响日志与提示的多少。

## 报告漏洞

请通过仓库的 issue 反馈，并在其中说明：版本（`npm run compat` 输出）、DSH Desktop 版本、复现步骤、期望与实际结果。

**请不要**在公开 issue 里贴你的私人数据（会话内容、令牌、绝对路径）。需要提供日志时，先自行删掉其中的个人内容。

发现「本发行版可能读取或外发你的数据」这一类问题，请**立即**停止使用并通过 [ROLLBACK.md](ROLLBACK.md) 回滚；这是一条不可协商的边界。
