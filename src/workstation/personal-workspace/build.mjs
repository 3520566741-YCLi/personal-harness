// dsh-personal-workspace build — machine-proven chain (esbuild -> flat -> tgz).
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
// 产品版本 vs 组件版本（E5-3）：产品版本 = personal-version/product.json（单一事实源）；
//   组件版本 = 本包 package.json（诊断用，注入后不再写死在代码里）。
const product = JSON.parse(readFileSync(join(here, '..', 'personal-version', 'product.json'), 'utf8'))
const outFlat = join(here, 'build', 'flat')
const dist = join(here, 'dist')

rmSync(outFlat, { recursive: true, force: true })
rmSync(dist, { recursive: true, force: true })
mkdirSync(outFlat, { recursive: true })
mkdirSync(dist, { recursive: true })

const banner = {
  js: "window.__ModuleLoader__.load({ id: 'dsh-personal-workspace', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
}
const footer = { js: 'return module.exports; } });' }

// 证据链：repo HEAD 短哈希注入 bundle（__DPS_SHA__，client 诊断模块读取）。
// 发行时可注入目标短哈希（DPS_SHA_OVERRIDE）：自引用发行提交要求「产物内嵌的短哈希 == 提交自身的
// 短哈希」，而提交哈希由内容决定 —— 所以必须**先定目标值**，把产物做成承载该目标值，再搜索提交里的
// nonce 让提交哈希落在目标值上。普通构建（无该变量）行为不变：一律取当前 HEAD 的短哈希。
const gitSha = (() => {
  const override = (process.env.DPS_SHA_OVERRIDE ?? '').trim()
  if (/^[0-9a-f]{7}$/.test(override)) return override
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
  external: ['@deepseek-ai/*', 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  loader: { '.css': 'text' },
  banner,
  footer,
  sourcemap: false,
  logLevel: 'info',
  define: {
    __DPS_SHA__: JSON.stringify(gitSha),
    __DPS_VERSION__: JSON.stringify(pkg.version),
    __PRODUCT_NAME__: JSON.stringify(product.name),
    __PRODUCT_VERSION__: JSON.stringify(product.version),
  },
  minify: false,
})

// 宿主半（V1.2-B）：纯投影层 src/server/project-context.ts 打包为 ESM 供 index.js import。
//   与 client 同一条 esbuild 链，避免「源码改了、产物没跟上」的静默漂移。
await build({
  entryPoints: [join(here, 'src/server/project-context.ts')],
  outfile: join(outFlat, 'project-context.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['es2022'],
  sourcemap: false,
  logLevel: 'info',
  minify: false,
})

// 宿主半（V1.2-D）：记忆投影层 src/server/memory-context.ts 同链打包（依赖 project-context 的 estimateTokens）。
await build({
  entryPoints: [join(here, 'src/server/memory-context.ts')],
  outfile: join(outFlat, 'memory-context.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['es2022'],
  sourcemap: false,
  logLevel: 'info',
  minify: false,
})

// 宿主半（V1.2-E2）：记忆树投影层 src/server/memory-graph.ts 同链打包
//   （树路由 memory-tree.js 以 './memory-graph.mjs' 引用；E1 时无消费者故未产物化，E2 接线时入链）。
await build({
  entryPoints: [join(here, 'src/server/memory-graph.ts')],
  outfile: join(outFlat, 'memory-graph.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['es2022'],
  sourcemap: false,
  logLevel: 'info',
  minify: false,
})

// 宿主半（V1.2-E4）：Memory Curator 纯引擎 src/server/memory-curator.ts 同链打包
//   （承载 memory-curator.js 以 './memory-curator.mjs' 引用；漏入链 ⇒ 装机后 import 必崩）。
await build({
  entryPoints: [join(here, 'src/server/memory-curator.ts')],
  outfile: join(outFlat, 'memory-curator.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['es2022'],
  sourcemap: false,
  logLevel: 'info',
  minify: false,
})

cpSync(join(here, 'server/index.js'), join(outFlat, 'index.js'))
// 宿主半的兄弟模块（保持相对 import 路径不变；见 server/context.js 与 server/mirror.js）
cpSync(join(here, 'server/context.js'), join(outFlat, 'context.js'))
cpSync(join(here, 'server/mirror.js'), join(outFlat, 'mirror.js'))
cpSync(join(here, 'server/memory-source.js'), join(outFlat, 'memory-source.js'))
cpSync(join(here, 'server/memory-tree.js'), join(outFlat, 'memory-tree.js'))
cpSync(join(here, 'server/memory-curator.js'), join(outFlat, 'memory-curator.js'))
// 宿主半（V1.2-F1）：ChatGPT 嵌入可行性探测（只读 GET，零凭据）—— 漏拷 ⇒ 装机后 index.js import 必崩。
cpSync(join(here, 'server/chatgpt-embed-probe.js'), join(outFlat, 'chatgpt-embed-probe.js'))
cpSync(join(here, 'cordis.patch.yml'), join(outFlat, 'cordis.patch.yml'))
cpSync(join(here, 'package.json'), join(outFlat, 'package.json'))
cpSync(join(repoRoot, 'LICENSE'), join(outFlat, 'LICENSE'))

execFileSync('npm', ['pack', '--pack-destination', dist], {
  cwd: outFlat,
  stdio: 'inherit',
  env: { ...process.env, npm_config_cache: join(repoRoot, '.npmcache') },
})

console.log(`[dsh-personal-workspace build] done -> ${join(dist, `${pkg.name}-${pkg.version}.tgz`)}`)
