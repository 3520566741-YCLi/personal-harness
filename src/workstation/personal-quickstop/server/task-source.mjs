/**
 * V1.2-I · I-D「任务」一路的取数层 —— **只读**直读第三方任务账本文件。
 *
 * ## 为什么是"读文件"而不是"发 HTTP"
 * `docs/V1_2_I_PENDING_DECISIONS.md` 的 **D1** 是本条路的硬阻塞，用户已裁定 **(b) 直读账本文件**。
 * 另一条路（`GET /api/task-board/state`）要在**宿主进程内伪造** `Origin` / `Sec-Fetch-Site` 等浏览器标记
 * 才能过 task-board 的守卫（`src/host-routes.ts:59-79`，其自述是「tripwire 不是权威」）——
 * 伪造安全标记这种事一旦成惯例，将来就没人分得清哪些头是真的。读盘则一个标记都不用碰。
 *
 * ## 这是**第三方能力**，不是官方契约（必须逐字标明）
 * 任务看板是第三方包 `@linxin666/dsh-client-ui-task-board`（本机装机 0.3.16），**没有 cordis 服务面**
 * ⇒ 我们只能按它的**磁盘格式**取数，这属于"依赖第三方实现细节"，不是"用官方 seam"。风险如实记在这里：
 * **上游一升级，账本路径或形状都可能变**；本文件下方逐条写了出处，且 `smoke-v12i-task-source.mjs`
 * 第 ① 组把路径推导规则钉成了"上游契约哨兵"（上游改规则 ⇒ 那组断言变红，逼我们重新核对）。
 *
 * 第三方真源（`.../node_modules/@linxin666/dsh-client-ui-task-board`）：
 *   · `lib/index.js:208-210` `dshHome()` → `resolveDshHome()`
 *   · `lib/index.js:196-206` `resolveDshHome(env, home)`：`DSH_HOME` 非空则用它（支持 `~` 展开、
 *     相对路径按 `process.cwd()` 解析），否则 `<homedir>/.dsh`
 *   · `lib/index.js:1451` `new TaskLedger(dir = join(dshHome(), "task-board"))`
 *   · `lib/index.js:1455` `this.file = join(dir, "ledger-v2.json")`
 * 本机实测该文件确实存在（`-rw-------`，同用户可读，3 条任务）。
 *
 * ## 只读纪律
 * 本文件**零写盘**（`smoke-v12i-task-source.mjs` ④ 组用源码字面量钉死）：账本是第三方的真源，
 * 我们越权写它会直接改坏用户数据。要"改任务"请走任务看板自己的面，不在这里开侧门。
 *
 * ## 诚实边界
 * · 读失败一律返回**真实原因**，绝不返回"0 个任务"（本仓硬纪律：未知 ≠ 0）。
 * · 本层**不解释**账本内容（不判断哪个任务在跑）：那是 `discovery.mjs` 的 `mapTaskLedger` 的职责。
 *   本层越权加工会让"账本里到底写了什么"再也无法从审计面复原。
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** 第三方账本文件名（`lib/index.js:1455` 逐字）。 */
export const TASK_LEDGER_FILENAME = 'ledger-v2.json'
/** 第三方账本目录名（`lib/index.js:1451` 逐字）。 */
export const TASK_LEDGER_DIRNAME = 'task-board'

/** `~` 展开 —— 只认开头的 `~` 或 `~/`（与第三方 `expandHome` 同义；不实现 `~user`）。 */
function expandHome(raw, home) {
  if (raw === '~') return home
  if (raw.startsWith('~/')) return join(home, raw.slice(2))
  return raw
}

/**
 * 解析 DSH 家目录。**规则照抄第三方 `resolveDshHome`（`lib/index.js:196-206`）**，
 * 不是我们自己拍的：路径不是我们的契约面，是它的。
 *
 * @param {Record<string, string|undefined>} [env] 默认 `process.env`
 * @param {string} [home] 默认 `os.homedir()`
 */
export function resolveDshHome(env = process.env, home = homedir()) {
  const raw = env?.DSH_HOME
  if (typeof raw === 'string' && raw.trim() !== '') {
    const expanded = expandHome(raw.trim(), home)
    // 相对路径按 cwd 解析（第三方同样如此，见 `lib/index.js:203`）。
    return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded)
  }
  return join(home, '.dsh')
}

/** 任务账本文件的默认绝对路径：`<dshHome>/task-board/ledger-v2.json`。 */
export function defaultTaskLedgerPath(env = process.env, home = homedir()) {
  return join(resolveDshHome(env, home), TASK_LEDGER_DIRNAME, TASK_LEDGER_FILENAME)
}

/**
 * 只读读取任务账本。
 *
 * @param {{path?: string, env?: Record<string,string|undefined>, home?: string}} [options]
 * @returns {Promise<{ok: true, ledger: object, path: string} | {ok: false, reason: string, path: string}>}
 *   `reason` 一律**点名**真实原因；失败时**不带** `ledger` 字段（不给空数组顶包）。
 */
export async function readTaskLedger(options = {}) {
  const path = typeof options.path === 'string' && options.path !== ''
    ? options.path
    : defaultTaskLedgerPath(options.env, options.home)

  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    const code = error?.code
    if (code === 'ENOENT') {
      // 文件不存在与"文件里一个任务都没有"是**两件事**，原因必须能区分开。
      return { ok: false, reason: `task-ledger-missing:${path}`, path }
    }
    const detail = code === undefined ? String(error?.message ?? error) : String(code)
    return { ok: false, reason: `task-ledger-unreadable:${detail}:${path}`, path }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { ok: false, reason: `task-ledger-unparsable:${String(error?.message ?? error)}`, path }
  }

  // 形状守卫：我们要的是**信封**（`{revision, tasks, scheduler, power}`），不是裸数组。
  // 裸数组说明上游换了格式 ⇒ 如实失败，**不**替它猜一个 `{tasks: parsed}`：
  // 猜错会让"账本里到底写了什么"永久失真，而这类错在真机上只表现为"任务数不对"，极难回溯。
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const observed = Array.isArray(parsed) ? 'array' : (parsed === null ? 'null' : typeof parsed)
    return { ok: false, reason: `task-ledger-envelope-unrecognized:${observed}:${path}`, path }
  }

  return { ok: true, ledger: parsed, path }
}
