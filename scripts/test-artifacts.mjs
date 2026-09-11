// Personal Harness — artifact tests（公开版，无 host 也能跑）
//
// 覆盖三件事（都是对**公开发行物**的断言，不是对源码的断言）：
//   A. 发行物完整性：packages/*.tgz 的 sha256 与 manifest.json / checksums.sha256 一致
//   B. 产物契约：三个 bundle 具备官方扩展点所需的载荷形状（模块装载握手 id、DOM 契约标记、产品版本）
//   C. 产物干净：bundle 内不含私人数据（本机路径 / 个人品牌串 / 会话 id / 用户私有项目名）
//   D. 装载冒烟：bundle 的 factory 在 jsdom 里能执行且不抛（best-effort，覆盖「加载不崩」这一层）
//
// 用法：npm test ｜ NODE_ENV=production npm test
// 退出码：0 全部通过｜1 有失败

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const MODE = process.env.NODE_ENV === 'production' ? 'production' : 'development'

let failures = 0
let checks = 0
function check(name, cond, extra = '') {
  checks += 1
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.error(`  FAIL ${name} ${extra}`)
  }
}

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const manifest = JSON.parse(readFileSync(join(REPO, 'manifest.json'), 'utf8'))

// ---------------------------------------------------------------- A. 完整性
console.log(`\n[A] 发行物完整性（NODE_ENV=${MODE}）`)
for (const p of manifest.plugins) {
  const tgz = join(REPO, p.tgz)
  check(`${p.name}: tgz 存在`, existsSync(tgz), p.tgz)
  if (existsSync(tgz)) check(`${p.name}: tgz sha256 == manifest`, sha256(tgz) === p.tgzSha256)
}
for (const line of readFileSync(join(REPO, 'checksums.sha256'), 'utf8').split('\n')) {
  const m = line.match(/^([0-9a-f]{64}) {2}(.+)$/)
  if (!m) continue
  check(`checksums: ${m[2]}`, existsSync(join(REPO, m[2])) && sha256(join(REPO, m[2])) === m[1])
}
check('packages/ 只有 manifest 列出的包', readdirSync(join(REPO, 'packages')).filter((f) => f.endsWith('.tgz')).length === manifest.plugins.length)

// ---------------------------------------------------------------- 公开版纪律：首次安装 = 空白用户状态
// 目录种子必须为空；否则界面会展示我们并不拥有的预置内容（且会顺带带上他人/私人的命名）。
for (const [file, key] of [
  ['personal-projects/registry.json', 'projects'],
  ['personal-agents/registry.json', 'agents'],
]) {
  const reg = JSON.parse(readFileSync(join(REPO, 'src/workstation', file), 'utf8'))
  check(`${file} 种子为空（空白用户状态）`, Array.isArray(reg[key]) && reg[key].length === 0, `${key} 项数=${Array.isArray(reg[key]) ? reg[key].length : '(缺失)'}`)
}

// ---------------------------------------------------------------- B/C/D. 逐 bundle
const CONTRACTS = {
  'dsh-personal-sidebar': ['data-dps-brand', 'data-dps-conversations', '__ModuleLoader__'],
  'dsh-personal-workspace': ['data-dsh-main-host', '__ModuleLoader__'],
  'dsh-personal-hud': ['ph-shell', 'ph-inspector', '__ModuleLoader__'],
}
// 哪些产物真的把产品版本打进 bundle（实测，不是猜测）：sidebar / hud 有，workspace 没有
const PRODUCT_VERSION_IN_BUNDLE = ['dsh-personal-sidebar', 'dsh-personal-hud']

// 禁止出现在产物里的**通用**私人数据形态。
// 注意：这里刻意不写任何具体的个人标识（姓名 / 账号 / 私有项目名 / 本机目录名）作为测试夹具——
// 否则测试文件自身就成了需要被清洗的泄露点。品牌与种子的检查改用**结构性断言**（见下）。
const FORBIDDEN = [
  { name: '本机用户绝对路径', re: /\/Users\/(?!demo\b|<user>|\{user\}|you\b|yourname\b)[A-Za-z0-9._-]+/ },
  { name: '会话 UUID', re: /\bsession-[0-9a-f]{8}-[0-9a-f]{4}-/ },
  { name: 'API 密钥形态', re: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { name: 'GitHub token 形态', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: '邮箱地址', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
]

for (const p of manifest.plugins) {
  const bundlePath = join(REPO, 'src/workstation', p.dir, 'build/flat/client.js')
  console.log(`\n[B/C/D] ${p.name}@${p.componentVersion}`)
  if (!existsSync(bundlePath)) {
    check('bundle 存在（需要先 npm run build）', false, bundlePath)
    continue
  }
  const source = readFileSync(bundlePath, 'utf8')

  check('bundle sha256 == manifest', sha256(bundlePath) === p.clientJsSha256)

  const id = source.match(/__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/)
  check(`装载握手 id == ${p.name}`, id !== null && id[1] === p.name, id ? id[1] : '(未找到)')

  for (const marker of CONTRACTS[p.name] ?? []) {
    check(`DOM 契约标记 ${marker}`, source.includes(marker))
  }

  const product = JSON.parse(readFileSync(join(REPO, 'src/workstation/personal-version/product.json'), 'utf8'))
  check('含产品名串', source.includes(product.name))
  if (PRODUCT_VERSION_IN_BUNDLE.includes(p.name)) {
    check('含产品版本串', source.includes(product.version))
  } else {
    console.log(`  skip 含产品版本串（该产物按设计不显示产品版本）`)
  }

  const embed = source.match(/\b(?:DPS_SHA|BUILD_SHA)\s*=\s*"([0-9a-f]{7,40})"/)
  const embedded = embed ? embed[1] : null
  check('内嵌提交与 manifest 一致', embedded === p.embeddedCommit, `产物=${embedded ?? '(none)'} manifest=${p.embeddedCommit ?? '(null)'}`)

  for (const f of FORBIDDEN) {
    const hit = source.match(f.re)
    check(`不含 ${f.name}`, hit === null, hit ? `命中：${hit[0].slice(0, 40)}` : '')
  }

  // 品牌是结构性的：产物里的品牌常量必须**正好等于**产品名（不允许任何其它品牌串）。
  if (p.name === 'dsh-personal-sidebar') {
    const brand = source.match(/var BRAND_TITLE = "([^"]*)"/)
    check('品牌常量 == 产品名（无其它品牌串）', brand !== null && brand[1] === product.name, brand ? brand[1] : '(未找到)')
  }

  // D. 装载冒烟：factory 在带 DOM 的沙箱里执行不抛异常
  try {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/',
    })
    const noop = function () {
      return noopProxy
    }
    const noopProxy = new Proxy(noop, {
      get: (_t, prop) => (prop === 'default' || prop === 'then' ? noopProxy : noopProxy),
      apply: () => noopProxy,
      construct: () => ({}),
    })
    let captured = null
    const loader = { load: (m) => (captured = m) }
    dom.window.__ModuleLoader__ = loader   // bundle 通过 window.__ModuleLoader__ 握手
    const sandbox = {
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      localStorage: dom.window.localStorage,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame: (cb) => setTimeout(cb, 0),
      cancelAnimationFrame: clearTimeout,
      __ModuleLoader__: loader,
    }
    sandbox.globalThis = sandbox
    vm.createContext(sandbox)
    vm.runInContext(source, sandbox, { timeout: 8000 })
    check('装载握手被调用', captured !== null && typeof captured.factory === 'function')
    if (captured) {
      const exportsObj = captured.factory((name) => {
        if (name === 'react') return noopProxy
        if (name === 'react-dom' || name === 'react-dom/client') return noopProxy
        return noopProxy
      })
      check('factory 执行不抛异常且返回导出对象', exportsObj !== null && typeof exportsObj === 'object')
    }
  } catch (e) {
    check('装载冒烟（jsdom 执行 factory）', false, (e && e.message) || String(e))
  }
}

console.log(`\n[test] NODE_ENV=${MODE} —— 检查 ${checks} 项，失败 ${failures} 项`)
if (failures > 0) {
  console.error('[test] ✗ 有失败项')
  process.exit(1)
}
console.log('[test] ✓ 全部通过')
void statSync
void execFileSync
