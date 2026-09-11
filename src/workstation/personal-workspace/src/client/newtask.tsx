// dsh-personal-workspace — 「新任务」= **自然语言创建任务**入口（2026-09-10 用户重新定义）。
//
// 产品定义（用户原话要点）：
//   ① 不是传统表单：用户先在顶部大输入框里用自然语言把需求讲清楚；
//   ② 点「识别任务」→ 只做**识别并生成任务草稿**，**绝不**启动 Agent、**绝不**创建会话；
//   ③ 识别结果落在一个**紧凑的草稿确认区**，字段可直接编辑；
//   ④ 只有「任务目标」永远必填；其余字段仅在「没有它就无法明确执行或验收」时才标
//      「需要补充」并给一句人读原因；没提到的项目/重复/预算/格式一律可选，不逼用户填表；
//   ⑤ 「仅创建任务」= 只建真实任务（不建会话）；「创建并开始」= 建任务 → 由官方 Host 建立
//      真实任务—执行会话关系 → 再启动执行（本页**从不**自己建会话，也不静默启动 Agent）；
//   ⑥ 原文永不丢：`原始需求`逐字保留、可展开查看；`备注`只放原文里未被结构化字段覆盖的句子。
//
// 诚实边界（审计实证，见 draft.ts / task-extras.ts 头注释）：
//   · 官方任务只有 title/description/prompt/workspaceId/mode/permission/model/schedule 这些字段
//     ——「截止时间/交付物/约束/备注」官方**没有存储位**，本页把它们组合进 description（人读）
//     与 prompt（唯一会到 agent 手里的正文），并在本机 Personal 层（dsh.personal.taskextras.v1）
//     保留结构化副本与逐字原文，刷新后可回显；
//   · 识别引擎**如实标注**：本机没有「一次性模型调用」能力时，用本地规则识别并在页面写明
//     「未使用模型」，绝不把规则识别说成 AI 识别成功；
//   · 权限高于宿主会话默认时，官方 Host 会拒绝 run —— 本页只如实提示并要求到官方任务板人工确认，
//     不绕过、不伪造「已开始」。
//
// 语义（SPEC §5，用户 2026-09-07 E4 决策 A/A/A/A）：
//   输入一句话 → 规则推荐（项目/Agent preset/权限档，recommend.ts 纯函数）→ 摘要（默认不露技术参数）
//   → [开始]：
//     · read-only（≤会话默认）→ 经 task-board Host create+run → 真实执行（新会话+preset+/permission+queue）
//     · workspace-write / danger-full-access → 只 create，不自动 run —— 宿主确认门拒绝高于会话默认的
//       绑定（手动 run 会被拒），交任务板人工「确认权限绑定」后由 Host 放行（R-PM 形态，尊重不旁路）。
//   Host 不可用/失败 → 诚实错误 +「复制并前往官方 New Task」fallback（§5.5）。
// 真实数据 > 空态 > mock；推荐永远可改可覆盖；不做任何本地“成功”假象。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { projectRegistry } from '../../../personal-registry/src/projects'
import { exceedsSessionDefault, TaskBoardClient, TASK_PERMISSIONS, type TaskBoardTaskRow, type TaskPermission } from './taskboard'
import { catalogAgents, guessPermission, recommendAgentId } from './recommend'
import { ProjectSelect, useProjects, WorkspaceSelect } from './selectors'
import { useWorkspaceCatalog } from './workspace-catalog'
import { describeRule, ruleToCron } from './schedule'
import { personalTasksStore } from './task-model'
import { taskExtrasStore, type TaskExtraRecord } from './task-extras'
import {
  buildTaskPayload,
  draftEdited,
  ENGINE_DETAIL_AI_UNAVAILABLE,
  ENGINE_DETAIL_RULES,
  groundAiDraft,
  liveNeeds,
  NEED_REASON,
  recognizeByRules,
  type DraftFieldKey,
  type DraftNeed,
  type DraftRecognition,
  type TaskDraftFields,
} from './draft'

// ---------------------------------------------------------------------------
// CSS —— 与 Home(dhm-)/dashboard 同一设计语言：安静、留白、官方 --dsw-* token + fallback。
export const CSS_NEWTASK = String.raw`
.dnt-root{display:flex;flex-direction:column;gap:12px;padding:12px 14px 18px;font:var(--dsw-font-xxs-12,12px);color:var(--dsw-alias-label-primary,#e8e8ec);user-select:none;}
.dnt-h{font:var(--dsw-font-s-strong-14,600 14px);margin:0;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dnt-k{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dnt-line{display:flex;gap:8px;align-items:center;}
.dnt-in{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 50%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:7px 10px;width:100%;box-sizing:border-box;outline:none;}
.dnt-in:focus{border-color:rgba(120,150,255,.6);}
.dnt-in::placeholder{color:var(--dsw-alias-label-dimmed,#7c7c88);}
.dnt-in[aria-invalid="true"]{border-color:rgba(235,90,90,.75);background:color-mix(in srgb,rgba(235,90,90,.10) 60%,transparent);}
.dnt-origin{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid rgba(120,150,255,.35);border-radius:8px;background:color-mix(in srgb,rgba(120,150,255,.10) 60%,transparent);padding:6px 9px;}
.dnt-origin-k{font:var(--dsw-font-xxxs-strong-11,600 11px);color:var(--dsw-alias-label-secondary,#c8c8d0);}
.dnt-origin-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dnt-origin-x{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);padding:2px 8px;cursor:pointer;}
.dnt-req{margin-left:6px;padding:1px 6px;border-radius:999px;border:1px solid rgba(235,90,90,.45);color:#eb5a5a;font:var(--dsw-font-xxs-12,12px);}
.dnt-go[data-dnt-invalid="1"]:not(:disabled){border-color:rgba(235,90,90,.55);color:#f0a0a0;}
.dnt-go{border:1px solid rgba(120,150,255,.55);border-radius:8px;background:rgba(120,150,255,.14);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-strong-12,600 12px);padding:6px 16px;cursor:pointer;flex:none;}
.dnt-go:hover{background:rgba(120,150,255,.22);}
.dnt-go:disabled{opacity:.55;cursor:default;}
.dnt-chip{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:20px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);padding:2px 10px;cursor:pointer;}
.dnt-chip:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dnt-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 40%,transparent);padding:8px 10px;display:flex;flex-direction:column;gap:5px;}
.dnt-pair{display:flex;gap:8px;align-items:baseline;}
.dnt-plabel{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);width:74px;flex:none;}
.dnt-pvalue{color:var(--dsw-alias-label-secondary,#c8c8d0);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dnt-pvalue b{color:var(--dsw-alias-label-primary,#e8e8ec);font-weight:600;}
.dnt-select{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.05)) 60%,transparent);color:var(--dsw-alias-label-primary,#e8e8ec);font:var(--dsw-font-xxs-12,12px);padding:2px 6px;}
.dnt-adv summary{cursor:pointer;color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);}
.dnt-adv[open] summary{margin-bottom:6px;}
.dnt-advrow{display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;}
.dnt-note{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);line-height:1.55;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dnt-ok{color:var(--dsw-alias-label-primary,#e8e8ec);border:1px solid rgba(55,200,113,.45);background:rgba(55,200,113,.1);border-radius:8px;padding:7px 10px;font:var(--dsw-font-xxs-12,12px);line-height:1.55;}
.dnt-warn{border:1px solid rgba(240,180,60,.5);background:rgba(240,180,60,.1);border-radius:8px;padding:7px 10px;font:var(--dsw-font-xxs-12,12px);line-height:1.55;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dnt-err{border:1px solid rgba(235,90,90,.5);background:rgba(235,90,90,.1);border-radius:8px;padding:7px 10px;font:var(--dsw-font-xxs-12,12px);line-height:1.55;color:var(--dsw-alias-label-primary,#e8e8ec);}
.dnt-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px;}
.dnt-link{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxs-12,12px);padding:2px 9px;cursor:pointer;}
.dnt-link:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
/* ---- 2026-09-10「自然语言创建任务」新增：顶部大输入框 + 紧凑草稿确认区 ---- */
.dnt-hint{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);}
.dnt-topline{align-items:flex-start;gap:8px;}
.dnt-topline>textarea{flex:1;min-width:0;resize:vertical;line-height:1.6;font:var(--dsw-font-xxs-12,12px);}
.dnt-actions{display:flex;flex-direction:column;gap:6px;flex:none;align-items:stretch;}
.dnt-actions>button{white-space:nowrap;}
.dnt-draft{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 34%,transparent);padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
.dnt-dhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:var(--dsw-font-s-strong-14,600 14px);color:var(--dsw-alias-label-primary,#e8e8ec);}
.dnt-edited{border:1px solid rgba(120,150,255,.45);border-radius:999px;padding:1px 8px;font:var(--dsw-font-xxxs-11,11px);color:#a9c0ff;}
.dnt-field{display:flex;flex-direction:column;gap:3px;}
.dnt-field-row{flex-direction:row;align-items:center;gap:8px;flex-wrap:wrap;}
.dnt-flabel{font:var(--dsw-font-xxxs-strong-11,600 11px);letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#9a9aa5);}
.dnt-field textarea,.dnt-field input{resize:vertical;}
.dnt-needinput{border-color:rgba(235,140,60,.8);background:color-mix(in srgb,rgba(235,140,60,.10) 60%,transparent);}
.dnt-needline{display:flex;gap:6px;align-items:baseline;margin-top:-4px;}
.dnt-needtag{border:1px solid rgba(235,140,60,.6);border-radius:999px;padding:0 6px;color:#f0a860;font:var(--dsw-font-xxxs-11,11px);flex:none;}
.dnt-needreason{color:#f0b070;font:var(--dsw-font-xxxs-11,11px);line-height:1.5;}
.dnt-needul{margin:4px 0 0;padding-left:18px;line-height:1.6;}
.dnt-engine{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;border-left:2px solid rgba(120,150,255,.4);padding:2px 0 2px 8px;}
.dnt-engine b{color:var(--dsw-alias-label-primary,#e8e8ec);font-weight:600;}
.dnt-engine>span{color:var(--dsw-alias-label-tertiary,#9a9aa5);font:var(--dsw-font-xxxs-11,11px);}
.dnt-original pre,.dnt-pre{margin:4px 0 0;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08)) 55%,transparent);color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;}
.dnt-more{align-self:flex-start;border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#c8c8d0);font:var(--dsw-font-xxxs-11,11px);padding:3px 10px;cursor:pointer;}
.dnt-more:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(128,128,128,.06)) 60%,transparent);}
.dnt-advbox{display:flex;flex-direction:column;gap:2px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));padding-top:8px;}
`

// ---------------------------------------------------------------------------
// 预填通道（Home ① / Sidebar CTA → 本面板）：面板可能未打开，或已打开需即时更新输入。
type PrefillListener = (text: string) => void
const prefillListeners = new Set<PrefillListener>()
let lastPrefill = ''

export function subscribeStartPrefill(listener: PrefillListener): () => void {
  prefillListeners.add(listener)
  if (lastPrefill !== '') {
    try {
      listener(lastPrefill)
    } catch {
      // ignore listener failure
    }
  }
  return () => {
    prefillListeners.delete(listener)
  }
}

/** 预填新目标文本（空串 = 只聚焦不预填）。 */
export function pushStartPrefill(text: string): void {
  lastPrefill = text
  prefillListeners.forEach((fn) => {
    try {
      fn(text)
    } catch {
      // ignore listener failure
    }
  })
}

// ---------------------------------------------------------------------------
// TASK-7：来源会话引用通道（Recent「从会话建任务」→ 本面板）。
//   只传官方会话 id + 标题（引用，不复制正文）；面板可能未开（缓存）/已开（即时）。
type SessionOrigin = { sessionId: string; title?: string }
type SessionOriginListener = (origin: SessionOrigin | null) => void
const sessionOriginListeners = new Set<SessionOriginListener>()
let lastSessionOrigin: SessionOrigin | null = null

export function subscribeStartSession(listener: SessionOriginListener): () => void {
  sessionOriginListeners.add(listener)
  if (lastSessionOrigin !== null) {
    try {
      listener(lastSessionOrigin)
    } catch {
      // ignore
    }
  }
  return () => {
    sessionOriginListeners.delete(listener)
  }
}

/** Recent 行「建任务」→ 通知本面板（可先于面板挂载，缓存兜底）。 */
export function pushNewTaskSession(origin: SessionOrigin): void {
  if (origin === null || typeof origin !== 'object' || typeof origin.sessionId !== 'string' || origin.sessionId === '') return
  lastSessionOrigin = { sessionId: origin.sessionId, ...(origin.title ? { title: origin.title } : {}) }
  sessionOriginListeners.forEach((fn) => {
    try {
      fn(lastSessionOrigin!)
    } catch {
      // ignore
    }
  })
}

/** 已消费/放弃后清缓存，避免误挂到后续手动任务。 */
export function clearPendingSessionOrigin(): void {
  lastSessionOrigin = null
  sessionOriginListeners.forEach((fn) => {
    try {
      fn(null)
    } catch {
      // ignore
    }
  })
}

// ---------------------------------------------------------------------------
// IA2-6：Project Detail「＋ 在此项目新建任务」→ 打开 NewTask 面板并预选该项目。
//   事件跨模块通信（同窗口 CustomEvent；NewTaskTab 挂载时监听）。面板未开 → 事件
//   丢失 → 面板内 ProjectSelect 仍可手工选（诚实降级，无假状态）。
export const NEWTASK_PROJECT_EVENT = 'dsh:newtask-preset-project'

/**
 * E4-FIX-IA-2 FINAL · PHASE E 缺陷修复（§3.4）：
 *   原先只靠 CustomEvent 传项目预选 —— 而「＋ 在此项目新建任务」的顺序是
 *   pushStartPrefill('') → 打开 Main new-task → NewTaskTab 挂载。新面板挂载时会**先**跑
 *   subscribeStartPrefill 回调（把 projectSel 重置为 null），再收到（或根本没收到）事件 →
 *   预选被清掉（真实 bug：Project Detail → 新任务 丢失项目）。
 *   修复：项目预选存**模块态**（挂载时读取并消费），事件仍保留用于面板已挂载的情形。
 */
let lastProjectPreset: string | null = null
const projectPresetListeners = new Set<(id: string | null) => void>()

/** NewTaskTab 挂载时**读取并消费**项目预选（避免被后续预填回调清掉）。 */
function consumeProjectPreset(): string | null {
  const id = lastProjectPreset
  lastProjectPreset = null
  return id
}

export function pushNewTaskProject(projectId: string | null): void {
  lastProjectPreset = projectId
  projectPresetListeners.forEach((fn) => {
    try {
      fn(projectId)
    } catch {
      // ignore
    }
  })
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent<string | null>(NEWTASK_PROJECT_EVENT, { detail: projectId }))
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
const EXAMPLES = ['帮我写一个 Python 脚本', '调研一下 M5Stack 生态', '总结这份学习资料', '检查一下工作区']
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  return false
}

// module-scope client：每个面板实例复用同一传输（无状态）。
const client = new TaskBoardClient()

export type AiRecognizer = (text: string) => Promise<unknown>

export interface NewTaskTabProps {
  /**
   * 可选：一次性 AI 识别通道。运行时若真有「不建会话就能调模型」的能力，从这里注入；
   * **缺省 = 未提供** → 用本地规则识别并在页面如实标注「未使用模型」（绝不假装 AI 成功）。
   */
  aiRecognize?: AiRecognizer
}

type Outcome =
  | { kind: 'created'; task: TaskBoardTaskRow; projectId: string | null; relationNote: string | null; extras: TaskExtraRecord | null; recurring: boolean }
  | { kind: 'launched'; task: TaskBoardTaskRow; projectId: string | null; relationNote: string | null; extras: TaskExtraRecord | null; executionSessionId: string | null }
  | { kind: 'need-confirm'; task: TaskBoardTaskRow; permission: TaskPermission; projectId: string | null; relationNote: string | null }
  | { kind: 'error'; message: string }

const AI_UNAVAILABLE_NOTE =
  '本机没有可用的「一次性模型调用」能力：客户端插件只能通过会话使用模型，而识别阶段按要求**不创建会话** → 本次识别未使用 AI。'

export function NewTaskTab(props: NewTaskTabProps = {}): ReactNode {
  const aiRecognize = props.aiRecognize
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  // ---- 自然语言输入 + 识别状态 ----
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'idle' | 'recognizing' | 'ready'>('idle')
  const [recognition, setRecognition] = useState<DraftRecognition | null>(null)
  const [fields, setFields] = useState<TaskDraftFields | null>(null)
  const [recognizedFields, setRecognizedFields] = useState<TaskDraftFields | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [attempted, setAttempted] = useState(false)
  // ---- 执行档位（补充选项内；真实通道不变）----
  const [agentSel, setAgentSel] = useState<string | null>(null)
  const [permSel, setPermSel] = useState<TaskPermission | null>(null)
  const [workspaceSel, setWorkspaceSel] = useState<string | null>(null)
  const [projectSel, setProjectSel] = useState<string | null>(null)
  // 项目选择是否已被显式设置过（用户手选 / Project Detail 预选）—— 用 ref：识别回调要读
  // 「此刻」的值，而不是被闭包固定的旧值。
  const projectTouchedRef = useRef(false)
  // ---- 创建结果 ----
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [copied, setCopied] = useState(false)
  // TASK-7：来源会话（Recent「从会话建任务」）——只做引用，创建后登记 origin。
  const [pendingOrigin, setPendingOrigin] = useState<{ sessionId: string; title?: string } | null>(null)

  useEffect(() => subscribeStartSession((origin) => {
    setPendingOrigin(origin)
  }), [])

  const projects = useProjects()
  const wsCat = useWorkspaceCatalog()

  const resetDraft = (): void => {
    setPhase('idle')
    setRecognition(null)
    setFields(null)
    setRecognizedFields(null)
    setShowMore(false)
  }

  // Home ① / CTA 预填订阅：只改「与文本相关」的东西；项目选择是用户的显式关系选择，**不清**
  //（PHASE E 修复的真实缺陷：预填曾把 Project Detail 的预选清掉）。
  useEffect(() => subscribeStartPrefill((next) => {
    setText(next)
    setAgentSel(null)
    setPermSel(null)
    setWorkspaceSel(null)
    setOutcome(null)
    setCopied(false)
    setAttempted(false)
    resetDraft()
  }), [])

  // IA2-6 + PHASE E：Project Detail「在此项目新建任务」的预选必须活到面板可交互。
  useEffect(() => {
    const preset = consumeProjectPreset()
    if (preset !== null) {
      setProjectSel(preset)
      projectTouchedRef.current = true
    }
    const onProject = (e: Event): void => {
      const id = (e as CustomEvent<string | null>).detail ?? null
      setProjectSel(id)
      projectTouchedRef.current = true
      setOutcome(null)
    }
    const offLocal = ((): (() => void) => {
      projectPresetListeners.add(onProject)
      return () => projectPresetListeners.delete(onProject)
    })()
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener(NEWTASK_PROJECT_EVENT, onProject)
      return () => {
        offLocal()
        window.removeEventListener(NEWTASK_PROJECT_EVENT, onProject)
      }
    }
    return offLocal
  }, [])

  const trimmed = text.trim()
  const agents = catalogAgents()
  const permissionGuess = trimmed !== '' ? guessPermission(trimmed) : null
  const agent = agentSel ?? recommendAgentId(trimmed)
  const permission: TaskPermission | null = permSel ?? (permissionGuess !== null ? permissionGuess.permission : null)
  const projectOptions = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name })), [projects])

  // 「需要补充」= 识别时判出来的项 ∩ 用户还没填的项（补齐即刻消失，绝不死锁）。
  const needs = useMemo(
    () => (recognition !== null && fields !== null ? liveNeeds(recognition.needs, fields) : []),
    [recognition, fields],
  )
  const needOf = (key: TaskDraftFields extends never ? never : DraftFieldKey): DraftNeed | undefined => needs.find((n) => n.key === key)
  const blocked = needs.length > 0
  const payload = useMemo(() => (fields !== null ? buildTaskPayload(fields) : null), [fields])
  const edited = fields !== null && recognizedFields !== null ? draftEdited(recognizedFields, fields) : false
  const recurrenceRule = fields !== null ? fields.recurrence : null
  const cron = recurrenceRule !== null ? ruleToCron(recurrenceRule) : null
  const permLabel: Record<TaskPermission, string> = {
    'read-only': '只读（read-only）',
    'workspace-write': '工作区可写（workspace-write）',
    'danger-full-access': '危险（danger-full-access）',
  }
  const WEEK = ['一', '二', '三', '四', '五', '六', '日']
  const HOURS: number[] = Array.from({ length: 24 }, (_, i) => i)
  const MINUTES: number[] = Array.from({ length: 60 }, (_, i) => i)

  const patchField = <K extends keyof TaskDraftFields>(key: K, value: TaskDraftFields[K]): void => {
    setFields((prev) => (prev === null ? prev : { ...prev, [key]: value }))
    setOutcome(null)
  }
  const focusTarget = (): void => {
    try {
      inputRef.current?.focus()
    } catch {
      // best-effort
    }
  }

  // ---- 识别（**只**生成草稿：不建会话、不启动 Agent、不写任何官方数据）----
  const recognize = async (): Promise<void> => {
    setAttempted(true)
    if (trimmed === '') {
      setOutcome({ kind: 'error', message: NEED_REASON.goal })
      focusTarget()
      return
    }
    setPhase('recognizing')
    setOutcome(null)
    setCopied(false)
    const rules = recognizeByRules(trimmed, { projects: projectOptions })
    let result: DraftRecognition = rules
    if (typeof aiRecognize === 'function') {
      try {
        const raw = await aiRecognize(trimmed)
        const grounded = groundAiDraft((raw ?? {}) as Record<string, unknown>, trimmed, { projects: projectOptions })
        result = {
          fields: grounded.fields,
          // 「需要补充」由**接地后的**字段重算：模型没提到 = 不因为模型一句话就逼用户填表。
          needs: rules.needs,
          notes: [...grounded.notes, ...rules.notes],
          engine: 'ai',
          engineDetail: 'AI 识别（模型由宿主提供）',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result = { ...rules, aiUnavailableReason: `AI 识别调用失败（${message}）→ ${ENGINE_DETAIL_AI_UNAVAILABLE}` }
      }
    } else {
      result = { ...rules, aiUnavailableReason: AI_UNAVAILABLE_NOTE }
    }
    setRecognition(result)
    setFields(result.fields)
    setRecognizedFields(result.fields)
    // 项目预选只在用户「还没自己动过项目选择」时才被识别结果填入。
    // 用 ref 读当前值（而不是在 setState 更新函数里再 setState —— 更新函数必须是纯的）。
    if (!projectTouchedRef.current) setProjectSel(result.fields.projectId)
    setPhase('ready')
  }

  /** TASK-7：把来源会话引用登记到新建的任务（官方会话正文不复制；取消创建即清缓存）。 */
  const attachOrigin = (taskId: string): void => {
    const o = pendingOrigin
    if (o !== null) {
      try {
        personalTasksStore.markOrigin(taskId, { sessionId: o.sessionId, ...(o.title ? { title: o.title } : {}), at: Date.now() })
      } catch {
        // origin is a best-effort personal reference
      }
    }
    setPendingOrigin(null)
    clearPendingSessionOrigin()
  }

  // ---- 创建（`start=false` = 仅创建任务：**不建会话**；`start=true` = 创建并开始）----
  const createTask = async (start: boolean): Promise<void> => {
    setAttempted(true)
    if (fields === null) {
      setOutcome({ kind: 'error', message: '请先点「识别任务」生成草稿（识别阶段不会创建会话）。' })
      return
    }
    if (blocked) {
      setOutcome({ kind: 'error', message: `请先补齐高亮项：${needs.map((n) => n.reason).join('；')}` })
      return
    }
    const built = buildTaskPayload(fields)
    if (built.title.trim() === '') {
      setOutcome({ kind: 'error', message: NEED_REASON.goal })
      return
    }
    if (recurrenceRule !== null && cron === null) {
      setOutcome({ kind: 'error', message: NEED_REASON.recurrence })
      return
    }
    setBusy(true)
    setOutcome(null)
    setCopied(false)
    try {
      const snapshot = await client.state()
      if (!snapshot || snapshot.error) throw new Error(snapshot?.error ?? '任务板服务返回异常')
      const sessionDefault = snapshot.sessionDefaultPermission ?? 'read-only'
      const effective: TaskPermission = permission ?? 'workspace-write'
      const created = await client.create({
        title: built.title,
        description: built.description,
        prompt: built.prompt,
        mode: agent ?? undefined,
        permission: effective,
        ...(cron !== null ? { schedule: { enabled: true, cron } } : {}),
        ...(workspaceSel !== null && workspaceSel.length > 0 ? { workspaceId: workspaceSel } : {}),
      })
      const row = latestCreated(created.tasks)
      if (row === undefined) {
        throw new Error('任务已请求但宿主未返回任务行，请到官方任务板查看或重试。')
      }
      attachOrigin(row.id)
      // 官方任务里没有「截止/交付物/约束/备注/原文」的存储位 → 本机 Personal 层留结构化副本
      //（description/prompt 里已有同内容的人读/执行版本；这里只是让页面刷新后仍能回显与再编辑）。
      let extras: TaskExtraRecord | null = null
      try {
        taskExtrasStore.save({
          taskId: row.id,
          original: fields.original,
          notes: fields.notes,
          deliverable: fields.deliverable,
          constraints: fields.constraints,
          background: fields.background,
          dueAt: fields.dueAt,
          duePhrase: fields.duePhrase,
          engine: recognition?.engine ?? 'rules',
          engineDetail: recognition?.engineDetail ?? ENGINE_DETAIL_RULES,
          recognizedAt: Date.now(),
        })
        extras = taskExtrasStore.get(row.id) ?? null
      } catch {
        extras = null
      }
      // 项目归属 = 真实关系层（失败必须如实，不再静默吞掉）
      let relationNote: string | null = null
      if (projectSel !== null) {
        try {
          projectRegistry.assignTask(row.id, projectSel)
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          relationNote = `项目归属未能写入（任务本身已创建）：${msg}`
        }
      }
      if (cron !== null) personalTasksStore.markArmed(row.id, Date.now())
      if (!start) {
        setOutcome({ kind: 'created', task: row, projectId: projectSel, relationNote, extras, recurring: cron !== null })
        return
      }
      if (exceedsSessionDefault(effective, sessionDefault)) {
        setOutcome({ kind: 'need-confirm', task: row, permission: effective, projectId: projectSel, relationNote })
        return
      }
      // 创建并开始：由官方 Host 建立**真实任务—执行会话关系**（executions[].sessionId 由 Host 回写），
      // 再启动执行 —— 本页不自己建会话、不伪造执行。
      const afterRun = await client.run(row.id)
      const ranRow = afterRun.tasks.find((t) => t.id === row.id) ?? row
      const lastExec = ranRow.executions.length > 0 ? ranRow.executions[ranRow.executions.length - 1] : undefined
      setOutcome({ kind: 'launched', task: ranRow, projectId: projectSel, relationNote, extras, executionSessionId: lastExec?.sessionId ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setOutcome({ kind: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  const fallbackGoOfficial = async (): Promise<void> => {
    const ok = await copyText(fields !== null ? fields.original : trimmed)
    setCopied(ok)
  }

  const needLine = (key: DraftFieldKey): ReactNode => {
    const need = needOf(key)
    if (need === undefined) return null
    return (
      <div className="dnt-needline" data-dnt-need={key}>
        <span className="dnt-needtag">需要补充</span>
        <span className="dnt-needreason" data-dnt-need-reason={key}>
          {need.reason}
        </span>
      </div>
    )
  }
  const fieldClass = (key: DraftFieldKey): string => (needOf(key) !== undefined ? 'dnt-in dnt-needinput' : 'dnt-in')

  return (
    <div className="dnt-root" data-dsh-plugin="dsh-personal-workspace" data-e4-panel="1">
      <div className="dnt-h">
        你想让 Harness 做什么？
        <span className="dnt-req" data-dnt-required="1">
          必填
        </span>
        <span className="dnt-hint" style={{ marginLeft: 8 }}>
          用自然语言把需求讲清楚就行；点「识别任务」后先生成草稿，确认无误再创建。
        </span>
      </div>

      {/* PHASE H（§4/§22）：从会话「建任务」是**人工转换**，只带官方会话 id + 标题作为引用。 */}
      {pendingOrigin !== null ? (
        <div className="dnt-origin" data-dnt-origin="1">
          <span className="dnt-origin-k">来源会话</span>
          <span className="dnt-origin-t" title={pendingOrigin.title ?? pendingOrigin.sessionId}>
            {pendingOrigin.title ?? pendingOrigin.sessionId}
          </span>
          <span className="dnt-note" style={{ borderLeft: 'none', padding: 0 }}>
            仅作为来源引用登记（不复制会话内容、未做自动识别）；任务正文 = 你在下面写的内容。
          </span>
          <button
            type="button"
            className="dnt-origin-x"
            data-dnt-origin-clear="1"
            onClick={() => {
              setPendingOrigin(null)
              clearPendingSessionOrigin()
            }}
          >
            取消引用
          </button>
        </div>
      ) : null}

      <div className="dnt-line dnt-topline">
        <textarea
          ref={inputRef}
          className={fieldClass('goal')}
          data-dnt-target="1"
          data-dnt-field="original"
          rows={3}
          value={text}
          placeholder="像聊天一样把需求讲完，例如：下周三前帮我整理一份团队周会的议题清单，并给出一份可直接发送的会议邀请。"
          onChange={(e) => {
            setText(e.target.value)
            setOutcome(null)
            if (phase === 'ready') resetDraft()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (phase === 'ready') void createTask(true)
              else void recognize()
            }
          }}
          aria-label="自然语言任务描述"
          aria-required="true"
          aria-invalid={attempted && trimmed === '' ? 'true' : 'false'}
          aria-describedby="dnt-reason"
          required
        />
        {phase === 'ready' ? (
          <div className="dnt-actions">
            <button
              type="button"
              className="dnt-go"
              data-dnt-create-run="1"
              data-dnt-submit="1"
              data-dnt-invalid={blocked ? '1' : '0'}
              title={blocked ? needs.map((n) => n.reason).join('；') : '创建真实任务，并让宿主建立执行会话后开始执行'}
              onClick={() => void createTask(true)}
              disabled={busy || blocked}
            >
              {busy ? '创建中…' : '创建并开始'}
            </button>
            <button
              type="button"
              className="dnt-link"
              data-dnt-create-only="1"
              title={blocked ? needs.map((n) => n.reason).join('；') : '只创建真实任务与字段，不启动任何会话'}
              onClick={() => void createTask(false)}
              disabled={busy || blocked}
            >
              仅创建任务
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dnt-go"
            data-dnt-recognize="1"
            data-dnt-submit="1"
            data-dnt-invalid={attempted && trimmed === '' ? '1' : '0'}
            onClick={() => void recognize()}
            disabled={busy || phase === 'recognizing'}
          >
            {phase === 'recognizing' ? '识别中…' : '识别任务'}
          </button>
        )}
      </div>

      <div className="dnt-line" style={{ flexWrap: 'wrap' }}>
        {EXAMPLES.map((c) => (
          <button
            type="button"
            key={c}
            className="dnt-chip"
            onClick={() => {
              setText(c)
              resetDraft()
              setOutcome(null)
            }}
          >
            {c}
          </button>
        ))}
        <span className="dnt-note" style={{ borderLeft: 'none', padding: 0 }}>
          示例只填入输入框，不会自动识别，也不创建任何东西。
        </span>
      </div>

      {/* 不静默失败：目标为空 → 明确原因；有「需要补充」→ 写明补齐后两个按钮才可用。 */}
      {attempted && trimmed === '' ? (
        <div className="dnt-err" id="dnt-reason" role="alert" data-dnt-blocked="1">
          还不能识别：{NEED_REASON.goal}
        </div>
      ) : null}
      {phase === 'ready' && blocked ? (
        <div className="dnt-warn" data-dnt-blocked="1" data-dnt-needlist="1" role="alert">
          还有需要补充的信息，补齐后「创建并开始 / 仅创建任务」才可用：
          <ul className="dnt-needul">
            {needs.map((n) => (
              <li key={n.key}>{n.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 识别引擎：如实标注（AI / 本地规则），永远可核对识别依据 */}
      {recognition !== null ? (
        <div className="dnt-engine" data-dnt-engine={recognition.engine} data-dnt-engine-line="1">
          <span className="dnt-k">识别引擎</span>
          <b>{recognition.engine === 'ai' ? 'AI 识别' : '本地规则识别'}</b>
          <span>{recognition.engineDetail}</span>
          {recognition.aiUnavailableReason !== undefined ? (
            <span className="dnt-note" data-dnt-ai-unavailable="1" style={{ borderLeft: 'none', padding: 0 }}>
              {recognition.aiUnavailableReason}
            </span>
          ) : null}
          {recognition.notes.length > 0 ? (
            <details className="dnt-adv" data-dnt-recog-notes="1">
              <summary>识别依据（{recognition.notes.length}）</summary>
              <ul className="dnt-needul">
                {recognition.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {/* ================= 任务草稿确认区（紧凑；字段可直接编辑） ================= */}
      {fields !== null ? (
        <div className="dnt-draft" data-dnt-draft="1">
          <div className="dnt-dhead">
            任务草稿
            <span className="dnt-hint">（识别结果可任意修改；只有「任务目标」必填）</span>
            {edited ? <span className="dnt-edited" data-dnt-edited="1">已按你的编辑重建执行指令</span> : null}
          </div>

          <div className="dnt-field">
            <label className="dnt-flabel" htmlFor="dnt-f-goal">
              任务目标
            </label>
            <textarea
              id="dnt-f-goal"
              className={fieldClass('goal')}
              data-dnt-field="goal"
              rows={2}
              value={fields.goal}
              onChange={(e) => patchField('goal', e.target.value)}
            />
          </div>
          {needLine('goal')}

          <div className="dnt-field">
            <label className="dnt-flabel" htmlFor="dnt-f-background">
              背景与补充说明
            </label>
            <textarea
              id="dnt-f-background"
              className="dnt-in"
              data-dnt-field="background"
              rows={2}
              value={fields.background}
              placeholder="原文没提到就留空（不做任何补写）"
              onChange={(e) => patchField('background', e.target.value)}
            />
          </div>

          <div className="dnt-field">
            <label className="dnt-flabel" htmlFor="dnt-f-deliverable">
              预期交付物
            </label>
            <textarea
              id="dnt-f-deliverable"
              className={fieldClass('deliverable')}
              data-dnt-field="deliverable"
              rows={2}
              value={fields.deliverable}
              placeholder="完成后你要拿到什么（原文没提到就留空）"
              onChange={(e) => patchField('deliverable', e.target.value)}
            />
          </div>
          {needLine('deliverable')}

          {fields.dueAt !== '' || needOf('dueAt') !== undefined || showMore ? (
            <>
              <div className="dnt-field">
                <label className="dnt-flabel" htmlFor="dnt-f-due">
                  截止时间
                </label>
                <input
                  id="dnt-f-due"
                  className={fieldClass('dueAt')}
                  data-dnt-field="dueAt"
                  value={fields.dueAt}
                  placeholder="YYYY-MM-DD 或 YYYY-MM-DD HH:mm（留空 = 没有截止时间）"
                  onChange={(e) => patchField('dueAt', e.target.value)}
                />
                {fields.duePhrase !== '' ? (
                  <span className="dnt-hint" data-dnt-due-phrase="1">
                    原文说法：{fields.duePhrase}
                  </span>
                ) : null}
              </div>
              {needLine('dueAt')}
            </>
          ) : null}

          <div className="dnt-field dnt-field-row">
            <span className="dnt-flabel">项目归属</span>
            <ProjectSelect
              value={projectSel}
              onChange={(id) => {
                setProjectSel(id)
                projectTouchedRef.current = true
                setOutcome(null)
              }}
              hint={projectSel === null && fields.projectId !== null ? '识别命中原文里的项目名' : undefined}
            />
            <span className="dnt-hint" data-dnt-project-note="1">
              {projectSel === null ? '暂不归类（可随时改）' : '创建后写入真实项目关系层'}
            </span>
          </div>

          {recurrenceRule !== null || needOf('recurrence') !== undefined || showMore ? (
            <div className="dnt-field" data-tk-kind="1">
              <span className="dnt-flabel">重复规则</span>
              <div className="dnt-line" style={{ flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="dnt-chip"
                  style={recurrenceRule === null ? { borderColor: 'rgba(120,150,255,.6)', color: '#e8e8ec' } : undefined}
                  onClick={() => patchField('recurrence', null)}
                >
                  单次（不重复）
                </button>
                <button
                  type="button"
                  className="dnt-chip"
                  style={recurrenceRule !== null ? { borderColor: 'rgba(120,150,255,.6)', color: '#e8e8ec' } : undefined}
                  onClick={() =>
                    patchField('recurrence', recurrenceRule ?? { frequency: 'daily', hour: 20, minute: 0 })
                  }
                >
                  定期（到点执行）
                </button>
                {recurrenceRule !== null ? (
                  <>
                    {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className="dnt-chip"
                        style={recurrenceRule.frequency === f ? { borderColor: 'rgba(120,150,255,.6)', color: '#e8e8ec' } : undefined}
                        onClick={() =>
                          patchField('recurrence', {
                            frequency: f,
                            ...(f === 'weekly'
                              ? { weekdays: recurrenceRule.frequency === 'weekly' ? recurrenceRule.weekdays ?? [1] : [1] }
                              : {}),
                            ...(f === 'monthly'
                              ? { dayOfMonth: recurrenceRule.frequency === 'monthly' ? recurrenceRule.dayOfMonth ?? 1 : 1 }
                              : {}),
                            hour: recurrenceRule.hour,
                            minute: recurrenceRule.minute,
                          })
                        }
                      >
                        {f === 'daily' ? '每天' : f === 'weekly' ? '每周' : '每月'}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
              {recurrenceRule !== null ? (
                <div data-tk-recurring-editor="1">
                  {recurrenceRule.frequency === 'weekly' ? (
                    <div className="dnt-line" style={{ flexWrap: 'wrap' }}>
                      <span className="dnt-k">星期几</span>
                      {WEEK.map((name, i) => {
                        const day = i + 1
                        const active = (recurrenceRule.weekdays ?? []).includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            className="dnt-chip"
                            style={active ? { borderColor: 'rgba(120,150,255,.6)', color: '#e8e8ec' } : undefined}
                            onClick={() => {
                              const days = [...(recurrenceRule.weekdays ?? [])]
                              const at = days.indexOf(day)
                              if (at >= 0) days.splice(at, 1)
                              else days.push(day)
                              patchField('recurrence', { ...recurrenceRule, weekdays: days.sort((a, b) => a - b) })
                            }}
                          >
                            周{name}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {recurrenceRule.frequency === 'monthly' ? (
                    <div className="dnt-line">
                      <span className="dnt-k">每月</span>
                      <select
                        className="dnt-select"
                        value={recurrenceRule.dayOfMonth ?? 1}
                        onChange={(e) => patchField('recurrence', { ...recurrenceRule, dayOfMonth: Number(e.target.value) })}
                        aria-label="每月几号"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            {d} 号
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="dnt-line">
                    <span className="dnt-k">时间</span>
                    <select
                      className="dnt-select"
                      value={recurrenceRule.hour}
                      onChange={(e) =>
                        patchField('recurrence', { ...recurrenceRule, hour: Number(e.target.value) })
                      }
                      aria-label="小时"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {(h < 10 ? '0' : '') + h}
                        </option>
                      ))}
                    </select>
                    <span>:</span>
                    <select
                      className="dnt-select"
                      value={recurrenceRule.minute}
                      onChange={(e) =>
                        patchField('recurrence', { ...recurrenceRule, minute: Number(e.target.value) })
                      }
                      aria-label="分钟"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {(m < 10 ? '0' : '') + m}
                        </option>
                      ))}
                    </select>
                    <span className="dnt-hint">执行计划：{describeRule(recurrenceRule) ?? '规则不完整'}</span>
                  </div>
                  {fields.recurrenceTimeMissing ? (
                    <span className="dnt-hint" data-dnt-recur-time-missing="1">
                      原文只说了「重复」，没给时间 —— 上面的时间默认值**尚未确认**，请选一个或改成单次。
                    </span>
                  ) : null}
                  <span className="dnt-hint">
                    定期任务仅在 DeepSeek Harness 运行时执行；关着应用时错过的到点不会补跑（可在任务板补执行）。
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          {needLine('recurrence')}

          <div className="dnt-field">
            <label className="dnt-flabel" htmlFor="dnt-f-constraints">
              约束与注意事项
            </label>
            <textarea
              id="dnt-f-constraints"
              className="dnt-in"
              data-dnt-field="constraints"
              rows={2}
              value={fields.constraints}
              placeholder="预算 / 格式 / 必须或禁止的做法（原文没提到就留空）"
              onChange={(e) => patchField('constraints', e.target.value)}
            />
          </div>

          <div className="dnt-field">
            <label className="dnt-flabel" htmlFor="dnt-f-notes">
              备注
            </label>
            <textarea
              id="dnt-f-notes"
              className="dnt-in"
              data-dnt-field="notes"
              rows={2}
              value={fields.notes}
              placeholder="原文里没归入上面字段的句子（逐字保留，不做生成式总结）"
              onChange={(e) => patchField('notes', e.target.value)}
            />
          </div>

          <details className="dnt-adv dnt-original" data-dnt-original="1">
            <summary>原始需求（逐字保留，可展开核对）</summary>
            <pre className="dnt-pre" data-dnt-original-text="1">
              {fields.original}
            </pre>
          </details>

          <button
            type="button"
            className="dnt-more"
            data-dnt-more="1"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? '收起补充选项' : '补充选项（截止时间 / 重复规则 / Agent / 权限 / 工作区）'}
          </button>

          {showMore ? (
            <div className="dnt-advbox" data-dnt-more-box="1">
              <div className="dnt-advrow">
                <label className="dnt-plabel" htmlFor="dnt-agent">
                  Agent
                </label>
                <select id="dnt-agent" className="dnt-select" value={agent ?? ''} onChange={(e) => setAgentSel(e.target.value)}>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}（{a.zh}）
                    </option>
                  ))}
                </select>
                <span className="dnt-hint">任务由宿主在独立会话中执行；模型沿用宿主默认。</span>
              </div>
              <div className="dnt-advrow">
                <label className="dnt-plabel" htmlFor="dnt-perm">
                  权限档
                </label>
                <select
                  id="dnt-perm"
                  className="dnt-select"
                  value={permission ?? 'workspace-write'}
                  onChange={(e) => setPermSel(e.target.value as TaskPermission)}
                >
                  {TASK_PERMISSIONS.map((id) => (
                    <option key={id} value={id}>
                      {permLabel[id]}
                    </option>
                  ))}
                </select>
                <span className="dnt-hint">
                  高于宿主会话默认的档位，宿主会拒绝自动执行，需到官方任务板人工「确认权限绑定」。
                </span>
              </div>
              <div className="dnt-advrow">
                <WorkspaceSelect value={workspaceSel} onChange={setWorkspaceSel} items={wsCat.items} ready={wsCat.ready} probing={wsCat.probing} />
                <span className="dnt-hint">{workspaceSel === null ? '未选 = 沿用宿主默认工作区' : '任务将在该工作区执行'}</span>
              </div>
              <div className="dnt-advrow">
                <span className="dnt-plabel">建议 Agent / 权限</span>
                <span className="dnt-hint">
                  {agents.find((a) => a.id === agent)?.name ?? agent ?? '—'} ·{' '}
                  {permission !== null ? permLabel[permission] : '按会话默认'}
                  {permissionGuess !== null ? '（由目标文本推断，可改）' : ''}
                </span>
              </div>
            </div>
          ) : null}

          <details className="dnt-adv" data-dnt-payload="1">
            <summary>将写入任务的内容（描述 / 执行指令）</summary>
            <div className="dnt-pre" data-dnt-payload-description="1">
              {payload !== null ? payload.description : ''}
            </div>
            <div className="dnt-k" style={{ marginTop: 6 }}>
              执行指令（唯一会发给执行会话的正文）
            </div>
            <div className="dnt-pre" data-dnt-payload-prompt="1">
              {payload !== null ? payload.prompt : ''}
            </div>
            <span className="dnt-hint">
              官方任务没有「截止时间/交付物/约束/备注」字段，它们会写进上面这段描述与执行指令；逐字原文也附在执行指令里。
            </span>
          </details>
        </div>
      ) : null}

      {/* ================= 创建结果（只报真实发生的事） ================= */}
      {outcome !== null ? (
        outcome.kind === 'launched' ? (
          <div className="dnt-ok" data-e4-result="launched" data-dnt-result="launched">
            已创建并请求执行 ✓ 官方 Host 已接受执行请求，并在独立会话中启动本任务。
            <div style={{ marginTop: 4 }}>任务：{outcome.task.title}</div>
            {outcome.projectId !== null ? <div style={{ marginTop: 4 }}>已归入项目：{projectNameOf(outcome.projectId, projects)}</div> : null}
            <div style={{ marginTop: 4 }} data-dnt-exec-session="1">
              执行会话：{outcome.executionSessionId !== null ? outcome.executionSessionId : '宿主尚未回写 sessionId（稍后可在任务详情看到）'}
            </div>
            {outcome.relationNote !== null ? <div className="dnt-warn" style={{ marginTop: 4 }}>{outcome.relationNote}</div> : null}
          </div>
        ) : outcome.kind === 'created' ? (
          <div className="dnt-ok" data-e4-result="created" data-dnt-result="created">
            已创建任务 ✓（未启动执行、未创建会话{outcome.recurring ? '；已按周期规则挂号，到点由宿主执行' : ''}）
            <div style={{ marginTop: 4 }}>任务：{outcome.task.title}</div>
            {outcome.projectId !== null ? <div style={{ marginTop: 4 }}>已归入项目：{projectNameOf(outcome.projectId, projects)}</div> : null}
            {outcome.relationNote !== null ? <div className="dnt-warn" style={{ marginTop: 4 }}>{outcome.relationNote}</div> : null}
          </div>
        ) : outcome.kind === 'need-confirm' ? (
          <div className="dnt-warn" data-e4-result="need-confirm" data-dnt-result="need-confirm">
            任务已创建，但权限档（{permLabel[outcome.permission]}）高于会话默认 —— 宿主拒绝自动执行，需人工确认。
            请到官方任务看板找到任务「{outcome.task.title}」→ 点「确认权限绑定」，确认后即自动开始执行。
            {outcome.projectId !== null ? <div style={{ marginTop: 4 }}>已归入项目：{projectNameOf(outcome.projectId, projects)}</div> : null}
            {outcome.relationNote !== null ? <div style={{ marginTop: 4 }}>{outcome.relationNote}</div> : null}
          </div>
        ) : (
          <div className="dnt-err" data-e4-result="error" data-dnt-result="error">
            {outcome.message}
            <div className="dnt-foot">
              <button type="button" className="dnt-link" onClick={() => void fallbackGoOfficial()}>
                {copied ? '已复制 ✓' : '复制原始需求，前往官方 New Task'}
              </button>
            </div>
          </div>
        )
      ) : null}

      {outcome !== null && (outcome.kind === 'created' || outcome.kind === 'launched') && outcome.extras !== null ? (
        <div className="dnt-note" data-dnt-extras="1">
          本机补充字段已保存（Personal 层，刷新后仍在）：原始需求 {outcome.extras.original.length} 字 · 备注{' '}
          {outcome.extras.notes !== '' ? '有' : '无'} · 交付物 {outcome.extras.deliverable !== '' ? '有' : '无'} · 截止{' '}
          {outcome.extras.dueAt !== '' ? outcome.extras.dueAt : '未设'} · 识别引擎{' '}
          {outcome.extras.engine === 'ai' ? 'AI' : '本地规则'}。
        </div>
      ) : null}

      <div className="dnt-foot" style={{ marginTop: 4 }}>
        <span className="dnt-k">官方兼容</span>
        <button type="button" className="dnt-link" onClick={() => void fallbackGoOfficial()}>
          {copied ? '已复制 ✓' : '用官方 New Task 打开'}
        </button>
        <span className="dnt-note" style={{ borderLeft: 'none', padding: 0 }}>
          （复制原始需求后，经「返回官方」→ 官方 ＋新任务 粘贴使用）
        </span>
      </div>
    </div>
  )
}

function latestCreated(rows: readonly TaskBoardTaskRow[]): TaskBoardTaskRow | undefined {
  if (rows.length === 0) return undefined
  let best = rows[0]
  for (const r of rows) {
    if ((r.createdAt ?? 0) > (best.createdAt ?? 0)) best = r
  }
  return best
}

function projectNameOf(projectId: string, projects: readonly { id: string; name: string; glyph?: string }[]): string {
  return projects.find((p) => p.id === projectId)?.name ?? projectId
}
