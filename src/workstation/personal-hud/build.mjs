// dsh-personal-hud build — same machine-proven chain as personal-sidebar:
// esbuild client bundle wrapped in ModuleLoader.load -> flat root-level
// package -> npm pack tgz.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
// 产品版本 vs 组件版本（E5-3）：产品版本 = personal-version/product.json（单一事实源）；
//   组件版本 = 本包 package.json（注入，不再写死在 src 里）。
const product = JSON.parse(readFileSync(join(here, '..', 'personal-version', 'product.json'), 'utf8'))
const outFlat = join(here, 'build', 'flat')
const dist = join(here, 'dist')

rmSync(outFlat, { recursive: true, force: true })
rmSync(dist, { recursive: true, force: true })
mkdirSync(outFlat, { recursive: true })
mkdirSync(dist, { recursive: true })

const banner = {
  js: "window.__ModuleLoader__.load({ id: 'dsh-personal-hud', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
}
const footer = { js: 'return module.exports; } });' }

await build({
  entryPoints: [join(here, 'src/client/index.tsx')],
  outfile: join(outFlat, 'client.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  jsx: 'automatic',
  external: [
    '@deepseek-ai/*',
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'scheduler',
  ],
  loader: { '.css': 'text' },
  banner,
  footer,
  sourcemap: false,
  logLevel: 'info',
  define: {
    __DPS_VERSION__: JSON.stringify(pkg.version),
    __PRODUCT_NAME__: JSON.stringify(product.name),
    __PRODUCT_VERSION__: JSON.stringify(product.version),
  },
  minify: false,
})

cpSync(join(here, 'server/index.js'), join(outFlat, 'index.js'))
cpSync(join(here, 'cordis.patch.yml'), join(outFlat, 'cordis.patch.yml'))
cpSync(join(here, 'package.json'), join(outFlat, 'package.json'))
cpSync(join(repoRoot, 'LICENSE'), join(outFlat, 'LICENSE'))

execFileSync('npm', ['pack', '--pack-destination', dist], {
  cwd: outFlat,
  stdio: 'inherit',
  env: { ...process.env, npm_config_cache: join(repoRoot, '.npmcache') },
})

console.log(`[dsh-personal-hud build] done -> ${join(dist, `${pkg.name}-${pkg.version}.tgz`)}`)
