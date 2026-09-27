// dsh-personal-workspace — V1.2-F1 · ChatGPT 诚实启动器（右栏 Aux 标签）
//
// 裁定（F1）：**尝试嵌入 → 检测到被拒后说明原因 → 一键「在系统浏览器打开」**；不假装成功、零凭据暴露。
// 分层：判断全在 `chatgpt-embed.ts`（纯函数，headless 可测）；本文件只做「取证据 + 渲染 + 交互」。
//
// 为什么这里要"尝试嵌入"却**不**从 iframe 下结论：
//   跨域 iframe 被 `X-Frame-Options` / CSP `frame-ancestors` 拒绝时，父页面读不到它的 document，
//   也拿不到可靠的 load/error 信号 ⇒ 任何"我检测到它被拒了"都是编的。所以我们：
//     ① 真的把 iframe 放上去（这就是"尝试"）；
//     ② 结论只引用宿主半**真实探测**回来的响应头/状态码（这是"检测"）；
//     ③ 探测失败时只说"这次没拿到证据"，绝不改口成"站点拒绝嵌入"。
//
// 零凭据：本组件没有任何输入框、不读 cookie/localStorage、不代填、不保存登录态（F 裁定硬约束）。

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CHATGPT_EMBED_PROBE_ROUTE,
  CHATGPT_TAB_TITLE,
  CHATGPT_TARGET_URL,
  NO_CREDENTIAL_NOTICE,
  OPEN_EXTERNAL_NOTICE,
  RETRY_HINT,
  readEmbedVerdict,
  type EmbedVerdict,
  type ProbeEvidence,
} from './chatgpt-embed'

const PROBE_TIMEOUT_MS = 12_000

type Load = { phase: 'loading' } | { phase: 'ok'; verdict: EmbedVerdict; evidence: ProbeEvidence } | { phase: 'failed'; reason: string }

function diag(patch: Record<string, unknown>): void {
  try {
    const w = window as unknown as { __dshDiag?: Record<string, unknown> }
    if (!w.__dshDiag) w.__dshDiag = {}
    w.__dshDiag.chatgpt = patch
  } catch {
    // diag best-effort
  }
}

export function ChatGptLauncher(): ReactNode {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [copied, setCopied] = useState<false | 'ok' | 'fail'>(false)
  const [showFrame, setShowFrame] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const probe = useCallback((): void => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
    setLoad({ phase: 'loading' })
    setCopied(false)
    void fetch(CHATGPT_EMBED_PROBE_ROUTE, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`探测路由返回 HTTP ${res.status}`)
        const body = (await res.json()) as { ok?: boolean; probe?: ProbeEvidence; message?: string }
        if (body.ok !== true || body.probe === undefined) throw new Error(body.message ?? '探测响应形态异常')
        const verdict = readEmbedVerdict(body.probe)
        setLoad({ phase: 'ok', verdict, evidence: body.probe })
        diag({ state: verdict.state, status: body.probe.ok === true ? body.probe.status : null, challenge: verdict.challenge })
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted) return
        const reason = error instanceof Error ? error.message : String(error)
        // 取数失败 ⇒ 如实说"读不到证据"，**不**渲染成结论。
        setLoad({ phase: 'failed', reason })
        diag({ state: 'failed', reason })
      })
      .finally(() => clearTimeout(timer))
  }, [])

  useEffect(() => {
    probe()
    return () => {
      abortRef.current?.abort()
    }
  }, [probe])

  const copy = useCallback((): void => {
    void navigator.clipboard
      ?.writeText(CHATGPT_TARGET_URL)
      .then(() => setCopied('ok'))
      .catch(() => setCopied('fail'))
  }, [])

  return (
    <div className="cgpt-root">
      <div className="cgpt-h">{CHATGPT_TAB_TITLE}</div>
      <div className="cgpt-sub">
        这是**诚实启动器**：右侧不会假装把 ChatGPT 嵌进来了。站点是否允许被嵌入由**它的响应头**决定，
        所以我们把真实证据摆出来，并给你一键外部打开。
      </div>

      {load.phase === 'loading' && <div className="cgpt-note">正在取嵌入可行性证据…</div>}

      {load.phase === 'failed' && (
        <div className="cgpt-panel cgpt-err">
          <div className="cgpt-headline">读不到探测证据（{load.reason}）</div>
          <div className="cgpt-note">读不到 ≠ 站点拒绝嵌入 —— 这只是我们这次没拿到它的响应头。</div>
          <div className="cgpt-actions">
            <button type="button" className="cgpt-btn" onClick={probe}>
              重新探测
            </button>
          </div>
        </div>
      )}

      {load.phase === 'ok' && (
        <>
          <div className={`cgpt-panel ${load.verdict.state === 'refused' || load.verdict.state === 'challenged' ? 'cgpt-blocked' : ''}`}>
            <div className="cgpt-headline">{load.verdict.headline}</div>
            <ul className="cgpt-list">
              {load.verdict.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="cgpt-meta">
              {load.verdict.evidence.map((e) => (
                <div key={e} className="cgpt-ev">
                  {e}
                </div>
              ))}
            </div>
            <div className="cgpt-actions">
              <button type="button" className="cgpt-btn" onClick={probe}>
                重新探测
              </button>
              <button type="button" className="cgpt-btn" onClick={() => setShowFrame((v) => !v)}>
                {showFrame ? '收起嵌入尝试' : '显示嵌入尝试'}
              </button>
            </div>
            <div className="cgpt-note">{RETRY_HINT}</div>
          </div>

          {/* ②「尝试嵌入」：真的放一个 iframe。它的失败在跨域下**不可读**，所以结论不引用它。 */}
          {showFrame && (
            <div className="cgpt-frameWrap">
              <div className="cgpt-frameNote">
                下面是**真实的嵌入尝试**。跨域被拒时浏览器不会给父页面可读信号（同源策略），
                因此上面的结论只引用宿主半探测到的真实响应头，而不是"我从 iframe 看出来了"。
              </div>
              <iframe
                className="cgpt-frame"
                title={`${CHATGPT_TAB_TITLE} 嵌入尝试`}
                src={CHATGPT_TARGET_URL}
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-forms allow-popups"
              />
            </div>
          )}

          <div className="cgpt-panel">
            <div className="cgpt-headline">继续用 ChatGPT 的合规方式</div>
            <div className="cgpt-actions">
              <a className="cgpt-btn" href={CHATGPT_TARGET_URL} target="_blank" rel="noreferrer noopener">
                在系统浏览器打开
              </a>
              <button type="button" className="cgpt-btn" onClick={copy}>
                复制链接
              </button>
              {copied === 'ok' && <span className="cgpt-note">已复制。</span>}
              {copied === 'fail' && <span className="cgpt-note cgpt-errline">复制失败（浏览器不给剪贴板权限）—— 链接：{CHATGPT_TARGET_URL}</span>}
            </div>
            <div className="cgpt-note">{OPEN_EXTERNAL_NOTICE}</div>
          </div>
        </>
      )}

      <div className="cgpt-note cgpt-hard">{NO_CREDENTIAL_NOTICE}</div>
    </div>
  )
}

export const CSS_CHATGPT_LAUNCHER = String.raw`
.cgpt-root{display:flex;flex-direction:column;gap:10px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);height:100%;min-height:0;overflow:auto;}
.cgpt-h{font:var(--dsw-font-s-strong-14,600 14px);color:var(--dsw-alias-label-primary,#e8e8ec);}
.cgpt-sub{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.7;}
.cgpt-panel{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
.cgpt-blocked{border-color:rgba(235,180,90,.5);}
.cgpt-err{border-color:rgba(235,90,90,.5);}
.cgpt-headline{font:var(--dsw-font-xxs-12,12px);line-height:1.6;color:var(--dsw-alias-label-primary,#e8e8ec);}
.cgpt-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;color:var(--dsw-alias-label-secondary,#c8c8d0);line-height:1.6;}
.cgpt-meta{display:flex;flex-direction:column;gap:2px;}
.cgpt-ev{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);word-break:break-word;}
.cgpt-note{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);line-height:1.7;}
.cgpt-hard{border-top:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3));padding-top:8px;}
.cgpt-errline{color:#ffb4b4;}
.cgpt-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.cgpt-btn{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-secondary,#c8c8d0);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08)) 60%,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;padding:3px 9px;cursor:pointer;text-decoration:none;}
.cgpt-frameWrap{display:flex;flex-direction:column;gap:6px;}
.cgpt-frameNote{font:var(--dsw-font-xxxs-11,11px);color:var(--dsw-alias-label-tertiary,#9a9aa5);line-height:1.7;}
.cgpt-frame{width:100%;height:260px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)) 50%,transparent);}
`
