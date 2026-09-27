# Feature Guide (FEATURE_GUIDE)

This guide explains **what each entry point on the left does, when to use it, and what it deliberately does not do**.

After installing you must **fully quit DSH Desktop and open it again** (⌘Q, a real quit — not minimising) before these entries appear: plugins load only when the host starts. For installation see [Install on macOS](INSTALL_MACOS.md). Windows is **Experimental / Untested** only, with no real-machine verification.

> A note on language: this document is in English, but in this release the plugin's own interface text is Chinese. Each label below is given in English with the original Chinese in parentheses so you can match it on screen. This is documentation only — the interface is not translated.

> This page describes only features that actually exist. Anything that has not been verified is written as **not verified**, here and in every other document in this repository — never as "works".

---

## First, tell these two apart: Conversations and New Task

This is the single most confusing point in the whole feature set. Remember this line:

| | Conversation | New Task |
|---|---|---|
| What it is | The ordinary chat DSH Desktop always had | A formal unit of work that needs to be followed up over time |
| Good for | Asking a question right now, editing while chatting, discussing an idea, handling something temporary | Building a feature, organising material, recurring checks — anything whose progress you want to track |
| Where | The Conversations entry / the sidebar conversation list / Recent | "＋ New Task" → Task Board |
| Whose data | The official conversation store | The official task ledger (this layer does not build a second one) |

**About "short work" and "long-running work"**: these are just informal descriptions. **There is no such switch in the software**, and nothing to configure.

- **Short work** = a small thing solved inside one ordinary conversation (asking a question, rewriting a paragraph, talking through an idea) → just start a conversation.
- **Long-running work** = something you need to follow, check progress on, maybe pause or re-run (building a feature, organising material, recurring checks) → create a formal task and track it on the Task Board.

In one sentence: **conversations solve the problem in front of you; New Task handles work that needs long-term follow-up.**

---

## Home (主页)

**What it is**: where you start, and your overview.

**What you see**:

1. **Quick Start**: an input box at the top — write down what you need and press "开始" (Start). It creates **a new official conversation** (not a formal task). To create a task, use "＋ New Task" instead.
2. **"AI 正在做什么" (What the AI is working on) · Running**: tasks currently executing. When the task data cannot be read from the host it **degrades** to "officially running conversations" and clearly labels itself as a degraded view.
3. **"需要你处理" (Needs your attention) · Needs Attention**: stuck, failed, awaiting approval or permission confirmation, waiting for your reply — anything that needs you to act.
4. **"最近完成" (Recently completed) · Done**: recently finished tasks; click one to locate it on the Task Board.
5. **"最近会话" (Recent conversations) · Can be continued**: official conversations you used recently and can still continue. **Archived conversations are not listed here** (the page separately tells you how many are archived).

**When to use it**: first thing every day — "what am I doing, what is the AI doing, is anything stuck waiting for me".

**What it does not do**: it never pretends an archived conversation is still active; when host data cannot be read it says so honestly ("task board host unreachable") instead of inventing content.

---

## Conversations (会话)

**What it is**: back to DSH Desktop's ordinary chat interface (in the centre area). Conversation state is saved by the official engine; this layer neither takes it over nor rewrites it.

- Asking a question right now, rewriting a paragraph, discussing an idea: use this.
- Continuing an earlier chat: click an entry in the sidebar conversation list or in Recent.
- The sidebar also has a "**切回官方会话浏览**" (back to the official conversation browser) button, which returns you to the official browser at any time.

**Boundary**: this area **does not show task progress**. Task status and things needing your attention live on the Task Board (this layer provides an entry point only; it does not keep a second copy of task state).

---

## New Task (＋)

**What it is**: how you create **a formal task that needs ongoing follow-up**.

**How it goes**:

1. Describe what you want in plain language (no task format needed — just say it normally);
2. Press "**识别任务**" (Identify task) → this only produces a **task draft**. This step does **not** create a conversation, does **not** start execution, and does **not** quietly begin working;
3. Review the draft (title, what to do, workspace, permission level …). If information is missing it tells you what is missing, and you cannot continue until it is filled in;
4. Then choose one of two:
   - "**仅创建任务**" (Create task only): record the task on the board first, and run it later when you decide to;
   - "**创建并开始**" (Create and start): create the task and start it immediately; the link between the task and its execution conversation is established and written back by the **official host**.

**About permissions**: task permission levels and approvals are **always gated by the official mechanism**. This layer does two things only: it honestly shows "this task needs you to confirm permissions", and it hands the confirmation action back to the official mechanism. It **never approves a high-permission operation for you**.

**What it does not do**: it will not create a task without a draft (it asks you to identify one first), and it will not start running just because you created a task — unless you press "Create and start".

---

## Task Board (任务看板)

**What it is**: the control panel for **formal tasks** (opened in the centre area; the page title is "任务看板").

**How to read the statuses** (this is the part this layer most wants to get right):

- **Task status**: Backlog / To do / Running / Done / Failed (待规划 / 待办 / 进行中 / 已完成 / 已失败);
- Three easily confused things are shown **separately**: **execution** (not executed / running / failed), **conversation** (whether an execution conversation is bound, and whether that conversation is archived), and **needs attention**;
- Why separately: **a finished task is not the same as a finished conversation**, and **archived is not deleted and not the same as done**. This layer never collapses those into one status.

**What you can see**: the task goal, the result of the most recent execution (a summary of the official execution record), the linked conversations / projects / workspaces, time information, and "missed times" (points at which execution should have happened but did not).

**What you can do**: run, stop, re-run, archive, restore, delete, move status, confirm permissions. These actions **all go through the official host**: when the host refuses, the error is shown as-is and success is never faked. Whether actions such as "stop" are available depends on the official capability being ready; when it is not, the interface says so plainly.

**When to use it**: when you need to answer "how far has the AI got, is it done, whose turn is it next".

**What it does not do**: it is not a generic to-do list, and this layer **does not keep a second set of task or archive states**. What the board shows is a true projection of the official task ledger.

> Where the entry points are: task rows on Home, and the Task Board's own entry. If you already have a common third-party task-board plugin installed, this layer does **not** rename or take over its entry — it only shows a "needs attention" count badge on its row (see "Relationship with plugins already in DSH Desktop" below).

---

## Projects (项目)

**What it is**: a way to group the tasks, conversations and workspaces that belong to **the same bigger thing**. Typical uses (examples only — make them your own): a thesis, a personal website, a travel plan.

**How to use it**: create a project under Projects, or **link** existing conversations / tasks / workspaces to a project. A project page shows that project's task count, workspace count, task list, related conversations and recent activity, plus an "unfiled" section listing active tasks that are not yet in any project.

**The important part is data ownership**: **creating a project does not move, copy or delete any official data.** A project is only a layer of **locally stored relationships** (kept in the local storage of your own DSH profile). The official conversation / task / workspace data is not changed by a single byte.

**What it does not do**: it does not copy official content, and something you deleted officially does not "come back" because a project page exists.

---

## Workspaces (工作区)

**What it is**: the **real working directories** already registered in DSH Desktop — so you can see which folder the AI is actually working in.

**What you can do**: "打开真实目录" (Open the real directory). When it can be opened, it uses the capability of plugins you already have in DSH Desktop (typically a better-sidebar style editor or folder window). **When it cannot be opened, the interface says honestly why** — if a path is missing it says "cannot open directory (path missing)" rather than inventing one.

**What it does not do**: it **never creates directories, moves, renames or deletes any of your files.** This page only displays and navigates.

---

## Recent (最近)

**What it is**: the official conversations you used most recently **that are not archived**.

**What you can do**:

- Open one to continue chatting;
- If a conversation has turned into long-term work, use "**从会话建任务**" (Create a task from this conversation): it carries that conversation into the New Task form. **This layer does not guess the content for you** — the draft is still yours to confirm;
- The page also states how many conversations are archived officially (archived ones are not mixed into Recent).

**What it does not do**: it never treats an archived conversation as active, and it never changes any task status (task status belongs to the host).

---

## Bottom status bar (HUD) and diagnostics panel

A one-line status bar at the bottom shows the current view, the current conversation and task statistics; next to it is a collapsible diagnostics panel — if something goes wrong, include its contents when you report the problem, which makes it much easier to locate.

---

## Relationship with plugins already in DSH Desktop (stated honestly)

- This layer renders its own pages using only DSH Desktop's **official extension points**; it does not change official code or the official DOM structure;
- If you already have common sidebar / task-board / editor plugins (for example better-sidebar and its task board), this layer will:
  - show a **real "needs attention" count badge** on its task-board entry row (without renaming, removing or taking it over);
  - route "Open the real directory" to its editor / folder window;
- If those plugins are **not** installed, this layer's pages still render normally through the official slots; only the small features that "borrow" those plugins' capabilities **honestly report being unavailable** instead of faking a result.

> Reproducing the author's full workbench (side editor, left-hand task board, cost/balance module, Git graph, quick-restart button …) requires **installing a number of third-party plugins separately** — they are not in this package. The list, public sources, licences, account requirements, and what we **have and have not tested** are in [Optional Plugins](OPTIONAL_PLUGINS.md), which also states plainly that the result is **not guaranteed** to match the author's interface.

---

## What it does not do (one line each)

- It does not take over, modify, delete or migrate any of your official DSH data;
- It does not approve permissions for you and does not run high-risk operations automatically;
- It does not present anything unverified as working (Windows remains **Experimental / Untested**);
- By default it makes no requests to any external host (the single exception: one anonymous read-only probe when you open the right-panel "ChatGPT" tab yourself), and it has no telemetry, no account and no keys (see [Privacy](PRIVACY.md)).

---

## Related documents

| To learn about | Read |
|---|---|
| Installing on macOS (verified) | [Install on macOS](INSTALL_MACOS.md) |
| Uninstall / rollback | [Uninstall](UNINSTALL.md) | [Rollback](ROLLBACK.md) |
| Compatibility scope and known limitations | [Compatibility](COMPATIBILITY.md) | [Known Limitations](KNOWN_LIMITATIONS.md) |
| What it is and how it is built | [English README](../../README_EN.md) |
