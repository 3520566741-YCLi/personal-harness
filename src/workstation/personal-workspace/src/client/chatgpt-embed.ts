// dsh-personal-workspace — V1.2-F1 · ChatGPT 诚实启动器（**纯判断层**，headless 可测）
//
// 本层只做一件事：把宿主半探测回来的**真实响应头/状态码**翻译成"人话 + 状态"。
// 三条纪律（与记忆树视图同源）：
//   ① **没证据 ≠ 被拒**：探测失败只能说"没拿到证据"，绝不写成"站点拒绝嵌入"（未知 ≠ 结论）；
//   ② **不猜**：客户端 iframe 读不到跨域文档，所以这里的结论**必须**来自宿主半的响应头证据；
//   ③ 文案里不出现"登录/保存凭据"这类承诺 —— 我们**不做** credential interception（F 裁定硬约束）。

/** 探测路由（与宿主半 `server/chatgpt-embed-probe.js` 的 `EMBED_PROBE_PATH` 必须一致，套件有漂移断言）。 */
export const CHATGPT_EMBED_PROBE_ROUTE = '/personal-workspace/chatgpt-embed-probe'

/** 目标站点（与宿主半的 `EMBED_TARGET_URL` 一致，套件有漂移断言）。 */
export const CHATGPT_TARGET_URL = 'https://chatgpt.com/'

/** 右栏标签元信息（经第三方右栏的**公开 API** `registerTab` 注册，不是打补丁）。 */
export const CHATGPT_TAB_ID = 'personal-workspace:chatgpt'
export const CHATGPT_TAB_TITLE = 'ChatGPT'
export const CHATGPT_TAB_ORDER = 60

export type ProbeEvidence =
  | {
      ok: true
      targetUrl?: string
      finalUrl?: string
      fetchedAt?: string
      status?: number | null
      elapsedMs?: number
      headers?: Record<string, string | null>
      bodySignals?: { bytesRead?: number; cloudflareChallenge?: boolean }
      request?: { method?: string; credentials?: string; credentialHeadersSent?: boolean }
    }
  | {
      ok: false
      reason?: 'timeout' | 'network' | string
      message?: string
      targetUrl?: string
      fetchedAt?: string
      elapsedMs?: number
    }

export type EmbedVerdictState = 'refused' | 'challenged' | 'inconclusive' | 'no-evidence'

export interface EmbedVerdict {
  state: EmbedVerdictState
  /** 一句话结论（不夸大，也不掩盖）。 */
  headline: string
  /** 判定依据（逐条来自真实证据；空数组表示"本次没有可引用的证据"）。 */
  reasons: string[]
  /** 展示用的原始证据行（状态码 / 关键响应头 / 抓取时间）。 */
  evidence: string[]
  /** 站点自身给出的框架限制头（有值才给，便于界面直接标注）。 */
  refusals: { header: string; value: string }[]
  /** 是否观察到 Cloudflare 挑战（与"框架限制"是两件不同的事，分开如实说）。 */
  challenge: boolean
}

const has = (v: string | null | undefined): v is string => typeof v === 'string' && v.trim() !== ''

/** `x-frame-options` 是否**限制**了我们的嵌入（ALLOWALL 是显式放行）。 */
function frameOptionsRefuses(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v === 'allowall') return false
  return v.startsWith('deny') || v.startsWith('sameorigin') || v.includes('allow-from')
}

/** CSP 里 `frame-ancestors` 是否限制了嵌入（`*` 视为放行；其余一律视为限制）。 */
function frameAncestorsOf(csp: string): string | null {
  const m = /(?:^|;)\s*frame-ancestors\s+([^;]+)/iu.exec(csp)
  return m === null ? null : m[1].trim()
}

/**
 * 把探测证据翻译成结论。**没有证据时绝不下"被拒"的结论**。
 */
export function readEmbedVerdict(probe: ProbeEvidence | null | undefined): EmbedVerdict {
  if (probe === null || probe === undefined) {
    return {
      state: 'no-evidence',
      headline: '还没有探测结果 —— 尚不知道能不能嵌入',
      reasons: ['还没有向宿主半取过证据（未探测 ≠ 被拒）'],
      evidence: [],
      refusals: [],
      challenge: false,
    }
  }

  if (probe.ok !== true) {
    const why = probe.reason === 'timeout' ? '探测超时' : '探测未能建立连接'
    return {
      state: 'no-evidence',
      headline: `${why} ⇒ 这次**没有**拿到证据`,
      reasons: [
        `${why}（${probe.message ?? '原因未提供'}）`,
        '这**不等于**"站点拒绝嵌入" —— 我们只是这次没拿到它的响应头',
      ],
      evidence: [
        `目标：${probe.targetUrl ?? CHATGPT_TARGET_URL}`,
        `抓取时间：${probe.fetchedAt ?? '（未提供）'}`,
      ],
      refusals: [],
      challenge: false,
    }
  }

  const headers = probe.headers ?? {}
  const refusals: { header: string; value: string }[] = []
  if (has(headers['x-frame-options'])) refusals.push({ header: 'x-frame-options', value: headers['x-frame-options'] })
  // 两个 CSP 头分别解析（合并成一条字符串会把两个 frame-ancestors 粘连、判错）。
  for (const key of ['content-security-policy', 'content-security-policy-report-only'] as const) {
    const raw = headers[key]
    if (!has(raw)) continue
    const ancestors = frameAncestorsOf(raw)
    if (has(ancestors)) refusals.push({ header: `${key}: frame-ancestors`, value: ancestors })
  }

  const blocking = refusals.filter((r) =>
    r.header === 'x-frame-options' ? frameOptionsRefuses(r.value) : r.value.trim() !== '*',
  )
  const challenge =
    probe.bodySignals?.cloudflareChallenge === true ||
    has(headers['cf-mitigated']) ||
    probe.status === 403

  const evidence = [
    `HTTP 状态码：${probe.status ?? '（未提供）'}`,
    `抓取时间：${probe.fetchedAt ?? '（未提供）'}`,
    has(headers['server']) ? `server：${headers['server']}` : null,
    ...refusals.map((r) => `${r.header}：${r.value}`),
    probe.bodySignals?.cloudflareChallenge === true ? '正文命中 Cloudflare 挑战页特征' : null,
    probe.request?.credentials === 'omit' ? '本次探测未携带任何凭据（credentials: omit）' : null,
  ].filter(has)

  if (blocking.length > 0) {
    return {
      state: 'refused',
      headline: '站点自己不允许被嵌进别人的页面 ⇒ 右侧直接聊天这条路，插件层走不通',
      reasons: [
        ...blocking.map((r) => `${r.header}: ${r.value} —— 这是**站点自己**的响应头，不是我们能力不足，也不是浏览器策略问题`),
        '绕过它（代理改写/剥离响应头）被项目章程 §2.1 明确禁止，我们不做',
        ...(challenge ? ['另外观察到 Cloudflare 挑战：即使框架限制放开，自动化会话也过不了这一关'] : []),
      ],
      evidence,
      refusals: blocking,
      challenge,
    }
  }

  if (challenge) {
    return {
      state: 'challenged',
      headline: '站点给出了挑战（本次没有发现框架限制头）⇒ 仍无法直接嵌入聊天',
      reasons: [
        `HTTP ${probe.status ?? '?'} + 挑战特征 ⇒ 返回的不是可用页面，嵌入进去也只是一张挑战页`,
        '本次**未**观察到 x-frame-options / frame-ancestors 的限制 —— 但挑战本身已足以否决"直接在右侧聊天"',
      ],
      evidence,
      refusals: [],
      challenge: true,
    }
  }

  return {
    state: 'inconclusive',
    headline: '本次探测**没有**发现禁止嵌入的响应头 —— 但这不等于"可以嵌入"',
    reasons: [
      '站点的响应可能随 UA / 地区 / 会话状态不同而变化，一次匿名探测不足以证明可嵌入',
      '真正决定权在站点；本工具不会替你"假装成功"',
    ],
    evidence,
    refusals: [],
    challenge: false,
  }
}

/** 硬约束声明（界面必须显示 —— 这是 F 裁定里"零凭据暴露"的用户可见落点）。 */
export const NO_CREDENTIAL_NOTICE =
  '本页**不**读取、不记录、不上传任何密码 / cookie / token，也不做凭据代填；不保存登录态。'

/**
 * 「在系统浏览器打开」的诚实说明。
 * 官方桌面壳把 `target="_blank"` 的 http(s) 链接交给系统浏览器（`setWindowOpenHandler` → `shell.openExternal`）；
 * 但第三方右栏面板有一个"接管 GUI 内链接"的设置，开着时点击可能被它接进右栏浏览器标签 ——
 * 我们无法替用户判断，所以**如实说明 + 提供复制链接兜底**，而不是承诺"一定开在系统浏览器"。
 */
export const OPEN_EXTERNAL_NOTICE =
  '「在系统浏览器打开」由桌面壳支持；但如果你在面板设置里开了"接管 GUI 内链接"，点击可能被接进右栏浏览器标签 —— 可用下面的复制链接兜底。'

/** 探测结果为空时的重试文案（不含任何"稍后自动成功"的假承诺）。 */
export const RETRY_HINT = '可以点「重新探测」再取一次证据（探测失败只说明这一次没拿到响应头）。'
