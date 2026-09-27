#!/usr/bin/env node
// 目的：让「刚 clone 下来的仓库」不用先 npm run build，也能校验/测试**随仓库发布的那些包**。
//
// 背景：src/workstation/*/build/ 是构建产物目录，被 .gitignore 忽略，因此 clone 后并不存在；
// 而 npm run verify / npm test 需要读 build/flat/client.js 才能核对哈希与 DOM 契约。
//
// 做法：若 build/flat/client.js 缺失，就从 packages/ 里随仓库发布的 tgz 中还原它，并逐字节
// 核对 manifest.json 记录的 sha256（不一致直接失败）。还原目标在 .gitignore 覆盖范围内，
// 不会弄脏工作树。
//
// 注意（诚实说明）：还原出来的字节来自**发行包**，不是本次 clone 现场重新编译的结果；
// 若要验证「源码能重新编译出同样的包」，请依次跑 npm run build && npm run package && npm run verify。

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

const manifestPath = join(REPO, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error('[materialize] x 找不到 manifest.json（请在发行仓库根目录运行）')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

let restored = 0
let reused = 0
let bad = 0

for (const p of manifest.plugins) {
  const destDir = join(REPO, 'src/workstation', p.dir, 'build/flat')
  const destClient = join(destDir, 'client.js')

  if (existsSync(destClient)) {
    const ok = sha256(destClient) === p.clientJsSha256
    console.log(`[materialize] ${p.dir}：本地构建产物已存在${ok ? '（与 manifest 一致）' : '（⚠ 与 manifest 不一致，请重跑 npm run build）'}`)
    reused += 1
    if (!ok) bad += 1
    continue
  }

  const tgz = join(REPO, p.tgz)
  if (!existsSync(tgz)) {
    console.error(`[materialize] x 缺少 ${p.tgz}：既没有本地构建产物，也没有可还原的发行包`)
    bad += 1
    continue
  }

  const tmp = mkdtempSync(join(tmpdir(), 'ph-materialize-'))
  let failed = false
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'inherit' })
    mkdirSync(destDir, { recursive: true })
    for (const f of ['client.js', 'index.js']) {
      const src = join(tmp, 'package', f)
      if (!existsSync(src)) {
        console.error(`[materialize] x ${p.tgz} 内缺少 ${f}`)
        failed = true
        continue
      }
      cpSync(src, join(destDir, f))
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (failed || !existsSync(destClient)) {
    bad += 1
    continue
  }

  const got = sha256(destClient)
  if (got !== p.clientJsSha256) {
    console.error(`[materialize] x ${p.dir}：从 tgz 还原的 client.js 与 manifest 不符（实测 ${got.slice(0, 16)}… 期望 ${p.clientJsSha256.slice(0, 16)}…）`)
    bad += 1
    continue
  }
  console.log(`[materialize] ${p.dir}：已从 ${p.tgz} 还原 build/flat/（client.js sha256 与 manifest 一致）`)
  restored += 1
}

if (bad > 0) {
  console.error(`[materialize] ✗ 有 ${bad} 个插件未能就绪`)
  process.exit(1)
}
if (restored > 0) {
  console.log(`[materialize] 已还原 ${restored} 个构建产物：字节来自随仓库发布的 tgz（非本次现场重编译）`)
} else {
  console.log(`[materialize] 无需还原（${reused} 个本地构建产物可用于校验）`)
}
