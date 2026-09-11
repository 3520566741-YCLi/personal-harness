// dsh-personal-sidebar build — mirrors the machine-proven dsh-worktable
// build chain:
//   1. esbuild client bundle (browser, cjs) wrapped in the host
//      window.__ModuleLoader__.load({id, factory}) handshake
//   2. flat package (root-level index.js / client.js / cordis.patch.yml —
//      avoids the DSH Desktop pnpm `file:` install flattening quirk)
//   3. npm pack -> dist/dsh-personal-sidebar-<version>.tgz
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
// 产品版本 vs 组件版本（E5-3）：**产品**版本单一事实源 = personal-version/product.json；
//   **组件**版本 = 本包 package.json。二者语义不同、绝不混用（UI 优先显示产品版本）。
const product = JSON.parse(readFileSync(join(here, '..', 'personal-version', 'product.json'), 'utf8'))
const outFlat = join(here, 'build', 'flat')
const dist = join(here, 'dist')

rmSync(outFlat, { recursive: true, force: true })
rmSync(dist, { recursive: true, force: true })
mkdirSync(outFlat, { recursive: true })
mkdirSync(dist, { recursive: true })

const banner = {
  js: "window.__ModuleLoader__.load({ id: 'dsh-personal-sidebar', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
}
const footer = { js: 'return module.exports; } });' }

// 证据链：repo HEAD 短哈希注入 bundle（__DPS_SHA__），配合版本 define。
const gitSha = (() => {
  // 发行期可选覆盖：仓库在「创建发行提交之前」打包时，用 DPS_SHA_OVERRIDE 显式指定要内嵌的短提交哈希
  // （该值必须等于最终发行提交自身的短哈希；由 scripts/verify-release.mjs 事后核验，不一致即失败）。
  const override = process.env.DPS_SHA_OVERRIDE
  if (override) return override.trim()
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
})()

await build({
  entryPoints: [join(here, 'src/client/index.tsx')],
  outfile: join(outFlat, 'client.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  jsx: 'automatic',
  external: ['@deepseek-ai/*', 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  loader: { '.css': 'text' },
  banner,
  footer,
  sourcemap: false,
  logLevel: 'info',
  define: {
    __DPS_VERSION__: JSON.stringify(pkg.version),
    __DPS_SHA__: JSON.stringify(gitSha),
    __PRODUCT_NAME__: JSON.stringify(product.name),
    __PRODUCT_VERSION__: JSON.stringify(product.version),
  },
  // No minification: keep the artifact greppable/diffable.
  minify: false,
})

// Flat package layout (root-level files only).
cpSync(join(here, 'server/index.js'), join(outFlat, 'index.js'))
cpSync(join(here, 'cordis.patch.yml'), join(outFlat, 'cordis.patch.yml'))
cpSync(join(here, 'package.json'), join(outFlat, 'package.json'))
cpSync(join(repoRoot, 'LICENSE'), join(outFlat, 'LICENSE'))

execFileSync('npm', ['pack', '--pack-destination', dist], {
  cwd: outFlat,
  stdio: 'inherit',
  // ~/.npm is not writable in this environment; keep the cache in the repo.
  env: { ...process.env, npm_config_cache: join(repoRoot, '.npmcache') },
})

console.log(`[dsh-personal-sidebar build] done -> ${join(dist, `${pkg.name}-${pkg.version}.tgz`)}`)
