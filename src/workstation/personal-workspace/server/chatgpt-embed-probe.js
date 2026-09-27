// dsh-personal-workspace — V1.2-F1 · ChatGPT 诚实启动器（宿主半：**嵌入可行性真实探测**）
//
// 口径（F 裁定 F1 ＋ F3，`docs/V1_2_DECISIONS_VERDICTS.md` §三）：
//   F1 = 诚实启动器：**尝试嵌入 → 检测到被拒后说明原因 → 一键「在系统浏览器打开」**；
//        **不假装成功**、零凭据暴露。
//
// 为什么"是否被拒"必须由宿主半探测、而不是由客户端 iframe 猜：
//   跨域 iframe 被 `X-Frame-Options` / CSP `frame-ancestors` 拒时，父页面**读不到**任何可判定信号
//   （同源策略不允许读它的 document；`load`/`error` 事件在这种场景下不可靠）。若客户端"猜"一个结论，
//   那就是**假装**。所以：宿主半发一次**无凭据的公开 GET**，把**真实响应头与状态码**作为证据交给客户端；
//   客户端的职责只是把这些证据**如实翻译成人话**（见 `src/client/chatgpt-embed.ts`）。
//
// 安全红线（F 裁定的硬约束，逐条落在这里）：
//   · 绝不读取/记录/复制/上传 password、cookies、session token、OAuth token、authentication headers；
//   · **不实现 credential interception**；不给持久登录态自存 cookie（阶段宪法 §2.2）；
//   · 本探测 `credentials: 'omit'`、**不回传/不落盘任何 `Set-Cookie`**（响应头白名单见 HEADER_KEYS），
//     也不带任何用户身份头 —— 它只是一次匿名 GET，用户可见面会如实这么写。

/** 被探测的目标（ChatGPT Web 入口）。 */
export const EMBED_TARGET_URL = 'https://chatgpt.com/'

/** 我们的只读探测路由（客户端从这里取"被拒证据"）。 */
export const EMBED_PROBE_PATH = '/personal-workspace/chatgpt-embed-probe'

export const EMBED_PROBE_TIMEOUT_MS = 8000

/** 读体上限：只为识别挑战页特征，**不需要**整页正文（也避免把 1MB+ 页面留在内存里）。 */
export const EMBED_PROBE_MAX_BODY_BYTES = 64 * 1024

/** 透明标识自己（不是伪装成浏览器；也不带任何用户信息）。 */
export const EMBED_PROBE_USER_AGENT = 'dsh-personal-workspace/embed-feasibility-probe (no credentials; read-only GET)'

/**
 * 只记录这些响应头 —— 其余（尤其 `set-cookie`）**一律不进证据、不进日志**。
 * 这份白名单是"零凭据暴露"从口号变成代码的地方。
 */
export const EMBED_PROBE_HEADER_KEYS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cf-mitigated',
  'server',
  'content-type',
]

const CHALLENGE_PATTERN = /cf-challenge|challenge-platform|just a moment|cf_chl_/iu

function classifyFailure(error) {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'TimeoutError' || name === 'AbortError' || /abort|timeout/i.test(message)) return 'timeout'
  return 'network'
}

/**
 * 探测 ChatGPT Web 的**可嵌入性**（只读、无凭据、有界）。
 *
 * @returns {{ok:true, ...evidence}|{ok:false, reason:'timeout'|'network', message:string, ...}}
 *   `ok:false` 表示**我们没拿到证据**（不是"站点拒绝嵌入"）—— 调用方必须把两者分开说。
 */
export async function probeEmbedFeasibility(options = {}) {
  const {
    url = EMBED_TARGET_URL,
    timeoutMs = EMBED_PROBE_TIMEOUT_MS,
    maxBodyBytes = EMBED_PROBE_MAX_BODY_BYTES,
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
  } = options

  const startedAt = Date.now()
  const base = { targetUrl: url, fetchedAt: now().toISOString() }

  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'network', message: 'fetch 不可用（运行时形态变化）', ...base, elapsedMs: 0 }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      // 零凭据：不发送 cookie / 授权头；运行时也没有 cookie jar 参与。
      credentials: 'omit',
      headers: { accept: 'text/html', 'user-agent': EMBED_PROBE_USER_AGENT },
      signal: controller.signal,
    })

    let body = ''
    try {
      const raw = await res.text()
      body = raw.slice(0, maxBodyBytes)
    } catch {
      body = '' // 正文读不到不影响"响应头证据"成立（如实标 bytesRead: 0）
    }

    const headers = {}
    for (const key of EMBED_PROBE_HEADER_KEYS) {
      headers[key] = typeof res.headers?.get === 'function' ? (res.headers.get(key) ?? null) : null
    }

    return {
      ok: true,
      ...base,
      finalUrl: typeof res.url === 'string' && res.url !== '' ? res.url : url,
      status: typeof res.status === 'number' ? res.status : null,
      elapsedMs: Date.now() - startedAt,
      headers,
      /** 正文特征（只用于识别挑战页；不保存正文本身）。 */
      bodySignals: {
        bytesRead: body.length,
        cloudflareChallenge: CHALLENGE_PATTERN.test(body),
      },
      /** 让"没带凭据"成为可断言的事实，而不是文档里的一句承诺。 */
      request: { method: 'GET', credentials: 'omit', credentialHeadersSent: false },
    }
  } catch (error) {
    return {
      ok: false,
      reason: classifyFailure(error),
      message: error instanceof Error ? error.message : String(error),
      ...base,
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HTTP handler 工厂（host 校验 / JSON 输出**复用 index.js 那一份**，不复制第二份信任判断）。
 * 只接受 GET：这是只读证据面，**没有**任何写/登录/打开外部程序的副作用。
 */
export function createEmbedProbeHandler(deps) {
  const { isTrustedHost, sendJson, probe = probeEmbedFeasibility } = deps ?? {}

  return async function handleEmbedProbe(req, res) {
    if (typeof isTrustedHost !== 'function' || isTrustedHost(req) !== true) {
      sendJson(res, 403, { ok: false, message: 'untrusted Host header' })
      return
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, message: 'method not allowed（只接受 GET）' })
      return
    }

    let evidence
    try {
      evidence = await probe()
    } catch (error) {
      // 探测自身抛错也如实报（不吞成"没问题"）。
      sendJson(res, 200, {
        ok: true,
        probe: {
          ok: false,
          reason: 'network',
          message: error instanceof Error ? error.message : String(error),
          targetUrl: EMBED_TARGET_URL,
          fetchedAt: new Date().toISOString(),
        },
      })
      return
    }

    sendJson(res, 200, { ok: true, probe: evidence })
  }
}
