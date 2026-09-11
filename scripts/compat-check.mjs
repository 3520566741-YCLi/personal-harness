// Personal Harness — compatibility gate（公开版）
//
// 检查本机环境是否满足本发行版的兼容性声明，并给出 SUPPORTED / UNTESTED / INCOMPATIBLE。
// 安装脚本 scripts/install.sh 使用同一判定（这里是可单独运行的版本，便于先看结果再决定是否安装）。
//
// 用法：node scripts/compat-check.mjs [--json]
// 退出码：0 SUPPORTED｜3 UNTESTED｜4 INCOMPATIBLE｜1 环境错误

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TESTED = '2.0.5'

function appVersion() {
  const cands = [
    '/Applications/DSH Desktop.app',
    join(homedir(), 'Applications/DSH Desktop.app'),
    '/Applications/DeepSeek Harness.app',
  ]
  for (const c of cands) {
    if (existsSync(`${c}/Contents/Info.plist`)) {
      try {
        const out = execFileSync('defaults', ['read', `${c}/Contents/Info.plist`, 'CFBundleShortVersionString'], {
          encoding: 'utf8',
        }).trim()
        return { path: c, version: out || '(unknown)' }
      } catch {
        return { path: c, version: '(unknown)' }
      }
    }
  }
  return { path: null, version: null }
}

function profileInfo(profile) {
  const pkgPath = join(profile, 'package.json')
  if (!existsSync(pkgPath)) return { exists: false, profile }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const deps = pkg.dependencies ?? {}
  const ours = {}
  for (const [k, v] of Object.entries(deps)) if (k.startsWith('dsh-personal-')) ours[k] = v
  const installed = {}
  for (const name of ['dsh-personal-sidebar', 'dsh-personal-workspace', 'dsh-personal-hud']) {
    const p = join(profile, 'node_modules', name, 'package.json')
    if (existsSync(p)) installed[name] = JSON.parse(readFileSync(p, 'utf8')).version
  }
  return { exists: true, profile, declared: ours, installed }
}

function manifest() {
  try {
    return JSON.parse(readFileSync(join(REPO, 'manifest.json'), 'utf8'))
  } catch {
    return null
  }
}

const app = appVersion()
const profile = process.env.DSH_PROFILE || join(homedir(), '.dsh', 'profiles', 'desktop')
const pinfo = profileInfo(profile)
const man = manifest()

let verdict
if (!app.version) verdict = 'INCOMPATIBLE'
else if (app.version === TESTED) verdict = 'SUPPORTED'
else if (/^2\./.test(app.version)) verdict = 'UNTESTED'
else verdict = 'INCOMPATIBLE'

const report = {
  host: { app: 'DSH Desktop', appPath: app.path, appVersion: app.version, testedVersion: TESTED },
  verdict,
  profile: pinfo,
  release: man
    ? {
        product: man.product,
        productVersion: man.productVersion,
        releaseTag: man.releaseTag,
        packages: man.plugins.map((p) => ({ name: p.name, version: p.componentVersion, tgz: p.tgz })),
      }
    : null,
  notes: [],
}
if (verdict === 'UNTESTED') report.notes.push(`宿主版本 ${app.version} ≠ 已测试的 ${TESTED}：可能可用，但未经验证（安装需 --allow-untested）。`)
if (verdict === 'INCOMPATIBLE' && !app.version) report.notes.push('未检测到 DSH Desktop 应用包：本发行版只支持 DSH Desktop。')
if (verdict === 'INCOMPATIBLE' && app.version) report.notes.push(`宿主版本 ${app.version} 不在支持范围（本发行版测试于 ${TESTED}）。`)
if (!pinfo.exists) report.notes.push(`profile 不存在：${profile}（请先安装并启动一次 DSH Desktop）`)
if (Object.keys(pinfo.installed).length > 0) report.notes.push('profile 中已存在 Personal Harness 插件（安装脚本会先备份再覆盖）。')

// 官方插件目录抽样（仅用于说明「我们不影响官方」）
try {
  const nm = join(profile, 'node_modules')
  if (existsSync(nm)) {
    report.officialPluginsSample = readdirSync(nm)
      .filter((n) => n.startsWith('@deepseek-ai') || n.startsWith('dsh-'))
      .filter((n) => !n.startsWith('dsh-personal-'))
      .slice(0, 8)
  }
} catch {
  /* 只读探测失败不影响判定 */
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const line = (k, v) => console.log(`  ${k.padEnd(16)} ${v}`)
  console.log('Personal Harness — 兼容性检查')
  line('宿主', `${report.host.app} ${app.version ?? '(未检测到)'}${app.path ? `  @ ${app.path}` : ''}`)
  line('已测试版本', TESTED)
  line('判定', verdict)
  line('profile', pinfo.exists ? profile : `${profile}（不存在）`)
  if (pinfo.exists) {
    line('已声明依赖', Object.keys(pinfo.declared).length ? JSON.stringify(pinfo.declared) : '（无 Personal Harness）')
    line('已安装版本', Object.keys(pinfo.installed).length ? JSON.stringify(pinfo.installed) : '（无）')
  }
  if (report.release) line('发行物', `${report.release.product} ${report.release.productVersion}（${report.release.releaseTag}）`)
  if (report.notes.length) {
    console.log('  说明：')
    for (const n of report.notes) console.log(`    · ${n}`)
  }
}

const code = verdict === 'SUPPORTED' ? 0 : verdict === 'UNTESTED' ? 3 : 4
process.exit(code)
