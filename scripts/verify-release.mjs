#!/usr/bin/env node
// 发行校验入口（manifest.json 的 install.helpers.verify 指向本文件，`npm run verify` 等价）
//
// 校验内容（真正的实现只有一处，避免两套逻辑漂移）：
//   · packages/*.tgz 的 sha256 与 manifest.json 逐一致
//   · 仓库内 build/flat/client.js 与 manifest 记录一致（防止「打包含旧产物」）
//   · 产物内嵌提交 / embeddedCommitSource 与 manifest 自洽
//   · checksums.sha256 列出的文件存在且哈希相符
//   · manifest 承诺的每个 helper 路径真实存在
//   · 全树私人数据扫描无命中
//
// 用法：node scripts/verify-release.mjs      （等价于 node scripts/package-release.mjs --verify）

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const r = spawnSync(process.execPath, [join(REPO, 'scripts/package-release.mjs'), '--verify'], { stdio: 'inherit' })
process.exit(r.status ?? 1)
