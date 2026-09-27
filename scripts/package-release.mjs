// Personal Harness — public release packager.
//
// 汇总各插件的构建产物（按 PLUGINS 清单），生成公开发行物：
//   packages/*.tgz            安装对象（file: 安装用；文件名带公开发行标签，避免 pnpm 复用旧 specifier）
//   manifest.json             逐包 sha256 / 版本 / 宿主兼容 / 产物内嵌提交（逐包如实）
//   checksums.sha256          tgz + manifest 自身
//   VERSION                   人读摘要
//
// 纪律：
//   ① 产物必须来自**本仓库的源码**（先 `npm run build`）；不从别处拷贝 tgz。
//   ② 内置「私人数据闸门」：命中本机用户路径 / 会话 UUID / 密钥 / 私钥块 → 失败并删除刚生成的发行物。
//   ③ 内嵌提交逐包如实：某些产物没有内嵌标记时写 null，**不得**用别的包的值填充。
//
// 用法：node scripts/package-release.mjs [--verify]

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VERIFY_ONLY = process.argv.includes('--verify')

const PRODUCT = JSON.parse(readFileSync(join(REPO, 'src/workstation/personal-version/product.json'), 'utf8'))
const PUBLIC_RELEASE_TAG = `public-v${String(PRODUCT.version).replace(/^v/i, '')}`
const PLUGINS = ['personal-sidebar', 'personal-workspace', 'personal-hud', 'personal-quickstop']
const PACKAGES_DIR = join(REPO, 'packages')
const HOST = { app: 'DSH Desktop', supported: '2.0.5', testedRange: '2.0.x (compatibility mode)' }

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const log = (m) => console.log(`[package] ${m}`)

// ------------------------------------------------------------------ 私人数据闸门
// 只匹配**真实的私人数据形态**；占位写法（/Users/demo、<user>、$HOME）不算命中。
const PRIVATE_PATTERNS = [
  { kind: '本机用户绝对路径', re: /\/Users\/(?!demo\b|<user>|\{user\}|xxx\b|you\b|yourname\b)[A-Za-z0-9._-]+/ },
  { kind: '会话 UUID', re: /\bsession-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/ },
  { kind: 'API 密钥形态', re: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { kind: '私钥块', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: '凭据赋值', re: /\b(?:api[_-]?key|access[_-]?token|password|passwd|secret)\s*[:=]\s*["'][^"'\s]{12,}["']/i },
]
const TEXT_EXT = /\.(?:json|js|mjs|cjs|ts|tsx|md|txt|yml|yaml|sh|html|css|gitignore|VERSION)$/i

function scanPrivateData(root) {
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) {
        walk(p)
        continue
      }
      if (!TEXT_EXT.test(name) && !name.startsWith('.')) continue
      if (st.size > 2_000_000) continue
      const text = readFileSync(p, 'utf8')
      for (const { kind, re } of PRIVATE_PATTERNS) {
        const m = text.match(re)
        if (m) hits.push({ file: relative(root, p), kind, sample: m[0].slice(0, 40) })
      }
    }
  }
  walk(root)
  return hits
}

// ------------------------------------------------------------------ 产物读取
function embeddedCommit(bundlePath) {
  // build.mjs 用 esbuild define 注入 __DPS_SHA__，client 源码把它落成常量。
  // 返回 null 表示该产物**没有**内嵌构建提交（合法事实，不得用别的包的值补）。
  try {
    const m = readFileSync(bundlePath, 'utf8').match(/\b(?:DPS_SHA|BUILD_SHA)\s*=\s*"([0-9a-f]{7,40})"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function git(args) {
  try {
    // stdio: 吞掉 git 自身在「非 git 目录 / 无 HEAD」时打到 stderr 的提示，避免干扰使用者
    return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function collect() {
  const out = []
  for (const dir of PLUGINS) {
    const pluginDir = join(REPO, 'src/workstation', dir)
    const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
    const tgz = join(pluginDir, 'dist', `${pkg.name}-${pkg.version}.tgz`)
    const flatClient = join(pluginDir, 'build/flat/client.js')
    const flatEntry = join(pluginDir, 'build/flat/index.js')
    const missing = [tgz, flatClient, flatEntry].filter((p) => !existsSync(p))
    if (missing.length > 0) {
      throw new Error(`${dir} 产物不全，先跑构建：npm run build\n  缺失：${missing.map((p) => relative(REPO, p)).join(', ')}`)
    }
    out.push({
      dir,
      name: pkg.name,
      version: pkg.version,
      tgz,
      tgzName: `${pkg.name}-${pkg.version}-${PUBLIC_RELEASE_TAG}.tgz`,
      tgzSha256: sha256(tgz),
      tgzBytes: statSync(tgz).size,
      clientJsSha256: sha256(flatClient),
      entryJsSha256: sha256(flatEntry),
      embeddedCommit: embeddedCommit(flatClient),
    })
  }
  return out
}

// ------------------------------------------------------------------ 组装
function build() {
  log(`组装公开发行物：${PRODUCT.name} ${PRODUCT.version}（release tag ${PUBLIC_RELEASE_TAG}）`)
  const packages = collect()
  // 打包时的「干净」判定忽略 untracked：本仓库的发行物是**自引用发行提交**——
  // 打包发生在创建该提交之前，打包内容经 `git add -A` 后与提交的 tree 完全一致，
  // 因此「没有提交之外的改动」是准确含义（scripts/verify-release.mjs 事后核验 `git status` 为空）。
  const commit = git(['rev-parse', 'HEAD'])
  const trackedChanges = git(['status', '--porcelain', '--untracked-files=no'])
  const dirty = trackedChanges.length > 0

  rmSync(PACKAGES_DIR, { recursive: true, force: true })
  mkdirSync(PACKAGES_DIR, { recursive: true })
  for (const p of packages) cpSync(p.tgz, join(PACKAGES_DIR, p.tgzName))

  const embedders = packages.filter((p) => p.embeddedCommit !== null)
  const nonEmbedders = packages.filter((p) => p.embeddedCommit === null)
  const embeddedCommits = [...new Set(embedders.map((p) => p.embeddedCommit))]

  const manifest = {
    product: PRODUCT.name,
    productVersion: PRODUCT.version,
    releaseTag: PUBLIC_RELEASE_TAG,
    releaseKind: 'public distribution (source-available, install from this repository)',
    builtAt: new Date().toISOString(),
    builtFrom: {
      repository: 'this repository',
      // 自引用发行提交：产物内嵌的短哈希**就是**本发行提交自身的短哈希（不是父提交）。
      // 40 位完整哈希无法内嵌（提交内容决定其自身哈希，属自引用不可能），故此处记录短哈希；
      // 完整哈希由 `git rev-parse HEAD` 得到，并由 scripts/verify-release.mjs 强制核验两者一致。
      commitAtPackaging: embedders.length > 0 ? `${embeddedCommits[0]} (this release commit itself; full id = git rev-parse HEAD)` : commit || '(not a git checkout)',
      releaseCommitSelfEmbedded: embedders.length > 0,
      workingTreeDirtyAtPackaging: dirty,
      note: '自引用发行提交：打包在提交创建之前完成，打包内容即该提交的 tree；产物内嵌短哈希 = 该提交自身短哈希（逐包实测，见 plugins[].embeddedCommit）。workingTreeDirtyAtPackaging=false 的含义是：不存在提交之外的任何 tracked 改动。',
    },
    sourceDerivation: 'Derived from the internal Personal Harness V1.1 freeze; sanitized for public distribution (see PUBLIC_EXPORT_ALLOWLIST.md and docs/PUBLIC_SANITIZATION_REPORT.md).',
    hostCompat: HOST,
    install: {
      mode: 'pnpm add file:<packages/*.tgz> inside the DSH Desktop profile',
      profileDefault: '$HOME/.dsh/profiles/desktop',
      script: 'scripts/install.sh',
      helpers: { uninstall: 'scripts/uninstall.sh', rollback: 'scripts/rollback.sh', verify: 'scripts/verify-release.mjs' },
    },
    plugins: packages.map((p) => ({
      dir: p.dir,
      name: p.name,
      componentVersion: p.version,
      tgz: `packages/${p.tgzName}`,
      tgzBytes: p.tgzBytes,
      tgzSha256: p.tgzSha256,
      clientJsSha256: p.clientJsSha256,
      entryJsSha256: p.entryJsSha256,
      embeddedCommit: p.embeddedCommit,
      embeddedCommitSource: p.embeddedCommit === null ? 'not-embedded' : 'artifact-embedded',
      embeddedCommitNote:
        p.embeddedCommit === null
          ? '该产物未内嵌构建提交（其 build 未注入构建哈希）——这是实测事实，不得用其它包的值填充。'
          : '内嵌于产物（构建时注入）。',
    })),
    checksums: 'checksums.sha256',
    verify: 'npm run verify',
    reproducibility: {
      clientJs: 'Deterministic: same source + same commit → identical bytes (see docs/PUBLIC_SANITIZATION_REPORT.md for the byte-level equivalence proof against the internal freeze).',
      tgz: 'Not guaranteed byte-identical across runs (npm pack embeds file timestamps) → compare clientJsSha256 for content identity.',
    },
  }
  writeFileSync(join(REPO, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const sums = [
    ...packages.map((p) => `${p.tgzSha256}  packages/${p.tgzName}`),
    `${sha256(join(REPO, 'manifest.json'))}  manifest.json`,
  ]
  writeFileSync(join(REPO, 'checksums.sha256'), `${sums.join('\n')}\n`)

  const versionLines = [
    `${PRODUCT.name} ${PRODUCT.version}`,
    `release tag: ${PUBLIC_RELEASE_TAG}`,
    `built: ${manifest.builtAt}`,
    `host: ${HOST.app} ${HOST.supported} (compatibility mode; no official code patched)`,
    '',
    'packages (component versions are intentionally separate from the product version):',
    ...packages.map(
      (p) =>
        `  ${p.name}  ${p.version}  sha256(client.js)=${p.clientJsSha256.slice(0, 16)}…  sha256(tgz)=${p.tgzSha256.slice(0, 16)}…`,
    ),
    '',
    `embedded build commits: ${packages.map((p) => `${p.name.replace('dsh-personal-', '')}=${p.embeddedCommit ?? '(not embedded)'}`).join('  ')}`,
    '',
    'install:   bash scripts/install.sh',
    'verify:    npm run verify',
    'uninstall: bash scripts/uninstall.sh',
    'rollback:  bash scripts/rollback.sh',
    '',
  ]
  writeFileSync(join(REPO, 'VERSION'), versionLines.join('\n'))

  const hits = scanPrivateData(PACKAGES_DIR)
  const manifestHits = scanPrivateData(REPO).filter((h) => !h.file.startsWith('node_modules') && !h.file.startsWith('.git/'))
  const allHits = [...hits, ...manifestHits.filter((h) => h.file === 'manifest.json' || h.file === 'VERSION' || h.file === 'checksums.sha256')]
  if (allHits.length > 0) {
    rmSync(PACKAGES_DIR, { recursive: true, force: true })
    rmSync(join(REPO, 'manifest.json'), { force: true })
    rmSync(join(REPO, 'checksums.sha256'), { force: true })
    console.error('[package] ✗ 私人数据闸门拦截，已删除发行物：')
    for (const h of allHits) console.error(`   · ${h.file} → ${h.kind}（${h.sample}）`)
    process.exit(1)
  }

  log('✓ 私人数据闸门通过（发行物目录无本机路径 / 无会话 UUID / 无密钥）')
  log(`✓ packages/：${packages.map((p) => p.tgzName).join('  ')}`)
  log(`✓ manifest.json / checksums.sha256 / VERSION 已写入仓库根`)
  log(`   产物内嵌提交：${packages.map((p) => `${p.name.replace('dsh-personal-', '')}=${p.embeddedCommit ?? '(not embedded)'}`).join('  ')}`)
  log(`   下一步：npm run verify`)
}

// ------------------------------------------------------------------ 校验
function verify() {
  const manifestPath = join(REPO, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('没有 manifest.json —— 先跑 `npm run package`')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const problems = []

  for (const p of manifest.plugins) {
    const tgz = join(REPO, p.tgz)
    if (!existsSync(tgz)) {
      problems.push(`缺包：${p.tgz}`)
      continue
    }
    if (sha256(tgz) !== p.tgzSha256) problems.push(`${p.tgz} sha256 不符`)
    const flat = join(REPO, 'src/workstation', p.dir, 'build/flat/client.js')
    if (existsSync(flat)) {
      const got = sha256(flat)
      if (got !== p.clientJsSha256) problems.push(`repo 内 ${p.dir}/build/flat/client.js 与 manifest 不一致（打包含旧产物？）`)
      const actual = embeddedCommit(flat)
      if (actual !== p.embeddedCommit) {
        problems.push(`${p.dir} 内嵌提交不一致：manifest=${p.embeddedCommit ?? '(null)'} 产物实测=${actual ?? '(null)'}`)
      }
      const expectedSource = actual === null ? 'not-embedded' : 'artifact-embedded'
      if (p.embeddedCommitSource !== expectedSource) {
        problems.push(`${p.dir} embeddedCommitSource 应为 ${expectedSource}`)
      }
    } else {
      problems.push(`缺少构建产物：${p.dir}/build/flat/client.js`)
    }
  }

  // 顶层字段必须与逐包事实自洽
  const embeddedNames = manifest.plugins.filter((p) => p.embeddedCommit !== null).map((p) => p.name)
  const notEmbedded = manifest.plugins.filter((p) => p.embeddedCommit === null).map((p) => p.name)
  const distinct = [...new Set(manifest.plugins.map((p) => p.embeddedCommit).filter((c) => c !== null))]
  if (distinct.length > 1) problems.push(`不同产物内嵌了不同提交：${JSON.stringify(distinct)}`)
  if (notEmbedded.length > 0 && !manifest.plugins.some((p) => p.embeddedCommit === null && /不得用其它包/.test(p.embeddedCommitNote ?? ''))) {
    problems.push('存在未内嵌提交的产物，但逐包说明缺失（必须写明「这是实测事实，不得填充」）')
  }
  void embeddedNames

  const sumsPath = join(REPO, 'checksums.sha256')
  if (existsSync(sumsPath)) {
    for (const line of readFileSync(sumsPath, 'utf8').split('\n')) {
      const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/)
      if (!m) continue
      const f = join(REPO, m[2])
      if (!existsSync(f)) problems.push(`checksums 列出的文件不存在：${m[2]}`)
      else if (sha256(f) !== m[1]) problems.push(`checksums 不符：${m[2]}`)
    }
  } else {
    problems.push('缺少 checksums.sha256')
  }

  // manifest 里承诺的每个 helper 路径都必须真实存在（否则照做的使用者会 file-not-found）
  const promisedPaths = [
    manifest.checksums,
    manifest.install?.script,
    ...Object.values(manifest.install?.helpers ?? {}),
  ].filter((v) => typeof v === 'string' && v.length > 0)
  for (const rel of promisedPaths) {
    const target = rel.startsWith('npm ') ? null : join(REPO, rel)
    if (target && !existsSync(target)) problems.push(`manifest 声明的 helper 不存在：${rel}`)
  }

  // 自引用发行提交的强制闸门：产物内嵌短哈希必须**等于当前 HEAD 的短哈希**。
  // 这一条把「发行包可追溯到本仓库的哪一个提交」从一句声明变成可验证事实。
  const liveShort = git(['rev-parse', '--short', 'HEAD'])
  const embeddedList = [...new Set(manifest.plugins.filter((p) => p.embeddedCommit !== null).map((p) => p.embeddedCommit))]
  if (liveShort && embeddedList.length > 0) {
    if (embeddedList.length !== 1) problems.push(`产物内嵌了多个不同提交，无法与 HEAD 对应：${JSON.stringify(embeddedList)}`)
    else if (embeddedList[0] !== liveShort) problems.push(`产物内嵌提交(${embeddedList[0]}) ≠ 当前 HEAD 短哈希(${liveShort}) —— 发行包与本次提交不对应`)
    // 源码必须干净：排除发行产物本身（在 clone 里重新打包会合法地重写 manifest 的 builtAt 与 checksums）
    const ARTIFACT_PATHS = [':(exclude)manifest.json', ':(exclude)checksums.sha256', ':(exclude)VERSION', ':(exclude)packages']
    const sourceDirty = git(['status', '--porcelain', '--', '.', ...ARTIFACT_PATHS])
    if (sourceDirty.length > 0) {
      problems.push(`源码工作树不干净（发行包必须与提交逐一对齐）：\n${sourceDirty.split('\n').slice(0, 10).map((l) => `       ${l}`).join('\n')}`)
    }
    if (manifest.builtFrom?.releaseCommitSelfEmbedded !== true) problems.push('manifest 缺少 releaseCommitSelfEmbedded 标记（自引用发行提交必须显式声明）')
    // 发行产物与提交内容有差异 = 本仓库被重新打过包（builtAt 时间戳等）；只提示，不失败
    const artifactDrift = git(['status', '--porcelain', '--', 'manifest.json', 'checksums.sha256', 'VERSION', 'packages'])
    if (artifactDrift.length > 0) {
      console.log('[package] 注意：发行产物与提交内容有差异（通常是本地重新打包导致 builtAt/时间戳变化）。')
      console.log('[package]       内容一致性以 clientJsSha256 为准；内嵌提交与 HEAD 已强制核验一致。')
    }
  }

  const hits = scanPrivateData(REPO).filter((h) => !h.file.startsWith('node_modules'))
  problems.push(...hits.map((h) => `私人数据：${h.file} → ${h.kind}（${h.sample}）`))

  if (problems.length > 0) {
    console.error('[package] ✗ 校验未通过：')
    for (const p of problems) console.error(`   · ${p}`)
    process.exit(1)
  }
  console.log(`[package] ✓ 校验通过：${manifest.product} ${manifest.productVersion}（${manifest.plugins.length} 个包 sha256 逐一致，无私人数据）`)
  console.log(
    `[package]   产物内嵌提交：${manifest.plugins.map((p) => `${p.name.replace('dsh-personal-', '')}=${p.embeddedCommit ?? '(not embedded)'}`).join('  ')}`,
  )
}

try {
  if (VERIFY_ONLY) verify()
  else build()
} catch (e) {
  console.error('[package] 失败：', e?.message ?? e)
  process.exitCode = 1
}
