// dsh-personal-quickstop build — same machine-proven chain as personal-sidebar / personal-hud:
// esbuild client bundle wrapped in the ModuleLoader.load host handshake -> flat root-level
// package -> npm pack tgz.
//
// 与 hud 的差异只有一处（如实标注，不是"照抄漏了"）：本包的**宿主半有相对 import**
// （`server/index.js` → `./interrupt-store.mjs`），故平包里必须带 `interrupt-store.mjs`
// （以及 I-D 编排层要用的 `stop-plan.mjs`），否则装机后宿主半 require 即断。
// 已同步写进 package.json 的 `files` —— 否则 npm pack 会把它们丢掉。
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
// 产品版本 vs 组件版本（E5-3）：与 hud/sidebar 同一条链，两个 define 都照带（本客户端不显示它们，
// 但保持"同一台机器验证过的构建链"这一性质）。
const product = JSON.parse(readFileSync(join(here, '..', 'personal-version', 'product.json'), 'utf8'))
const outFlat = join(here, 'build', 'flat')
const dist = join(here, 'dist')

rmSync(outFlat, { recursive: true, force: true })
rmSync(dist, { recursive: true, force: true })
mkdirSync(outFlat, { recursive: true })
mkdirSync(dist, { recursive: true })

const banner = {
  js: "window.__ModuleLoader__.load({ id: 'dsh-personal-quickstop', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
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
// 宿主半的相对依赖（见文件头）——少一个装机后宿主半就断在 require 上。
cpSync(join(here, 'server/routes.mjs'), join(outFlat, 'routes.mjs'))
cpSync(join(here, 'server/interrupt-store.mjs'), join(outFlat, 'interrupt-store.mjs'))
// I5 的交接落盘 store：`index.js` 默认装配它（官方无交接槽 ⇒ 自建），少一个 ⇒ 装机后落盘全断。
cpSync(join(here, 'server/checkpoint-store.mjs'), join(outFlat, 'checkpoint-store.mjs'))
cpSync(join(here, 'server/stop-plan.mjs'), join(outFlat, 'stop-plan.mjs'))
// I-D 的两层（编排 + 宿主薄绑定）与纯映射层：宿主半 index.js 直接 import 它们，
// 漏一个 ⇒ 装机后 ERR_MODULE_NOT_FOUND（I-D 侦查 §"打包缺口"已实测指出，此处补齐）。
cpSync(join(here, 'server/orchestrator.mjs'), join(outFlat, 'orchestrator.mjs'))
cpSync(join(here, 'server/discovery.mjs'), join(outFlat, 'discovery.mjs'))
cpSync(join(here, 'server/host-adapter.mjs'), join(outFlat, 'host-adapter.mjs'))
// I-D 任务源（D1 裁定 = 直读第三方账本）：host-adapter 直接 import 它 ⇒ 同样漏一个就装机即断。
cpSync(join(here, 'server/task-source.mjs'), join(outFlat, 'task-source.mjs'))
cpSync(join(here, 'cordis.patch.yml'), join(outFlat, 'cordis.patch.yml'))
cpSync(join(here, 'package.json'), join(outFlat, 'package.json'))
cpSync(join(repoRoot, 'LICENSE'), join(outFlat, 'LICENSE'))

execFileSync('npm', ['pack', '--pack-destination', dist], {
  cwd: outFlat,
  stdio: 'inherit',
  env: { ...process.env, npm_config_cache: join(repoRoot, '.npmcache') },
})

console.log(`[dsh-personal-quickstop build] done -> ${join(dist, `${pkg.name}-${pkg.version}.tgz`)}`)
