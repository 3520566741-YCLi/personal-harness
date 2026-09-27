# Personal Harness V1.2

[中文](README.md) · English

> ## ⚠️ Read this first: V1.2 has the most features, but **no systematic acceptance testing was done**
>
> **This release (Personal Harness V1.2) is the "most features, but never systematically accepted" version. It ships with several known problems, and those problems are planned to be fixed in V1.3.**
>
> - **Want stability** → use **V1.1** (release git tag `v1.1.0-macos`). **Want the most features and accept the known problems** → use **V1.2** (this release).
> - **Read [Known Limitations](docs/en/KNOWN_LIMITATIONS.md) before installing** — every item there is a **logged fact** (symptom / scope / current status / workaround), and anything unverified is written as unverified.
> - This release ships a **macOS install path only**; **Windows is out of scope for V1.2** (see "Platform status" below).
> - Nothing here is exaggerated and nothing is hidden: it installs and it uninstalls cleanly, but the problems in that list are real, and **no real-machine visual acceptance was performed** for this release.

**A plugin pack that adds a personal-workstation shell to DSH Desktop.** After installing, you get a workbench navigation rail on the left (Home / Conversations / New Task / Task Board / Projects / Workspaces / Recent) and a status HUD at the bottom.

- Does not change a single line of official DSH Desktop code (pure official extension points, compatibility mode)
- Read-only with respect to official data: your conversations, tasks and projects stay in **DSH's own storage**. This release never takes them over, copies them or uploads them
- Install / uninstall / rollback are one command each; a rollback point is created before installing, and a failed install rolls back automatically
- **Privacy**: by default the four plugins in this release make **no requests to any external host**; apart from the one exception below, every HTTP request they issue is **same-origin**, targeting DSH's own local routes.
- **The one exception**: the "ChatGPT" tab in the right-hand column of `personal-workspace` — **only when you open it yourself** does the host-side half send **one anonymous, read-only GET** to `https://chatgpt.com/` (solely to read the response headers and decide whether embedding is possible; anonymous, no credentials, no cookies recorded, no page body stored).
- No telemetry, no account, no keys, and your data is never uploaded. See [Privacy](docs/en/PRIVACY.md).

👉 **New here? Read the [Feature Guide](docs/en/FEATURE_GUIDE.md) first**: plain-language explanations of what each entry point is for, when to use it, and what it deliberately does not do.

## Documentation

| Document | What it covers |
|---|---|
| [Install on macOS](docs/en/INSTALL_MACOS.md) | Requirements, the recommended install path, manual install, install failure recovery |
| [Feature Guide](docs/en/FEATURE_GUIDE.md) | Every entry point: Home, Conversations, New Task, Task Board, Projects, Workspaces, Recent |
| [Optional Plugins](docs/en/OPTIONAL_PLUGINS.md) | The third-party plugins that make up the author's full workbench: what to install separately, sources, licences, what was never tested |
| [Uninstall](docs/en/UNINSTALL.md) | How to remove it, including the exact scope of `--purge-user-data` |
| [Rollback](docs/en/ROLLBACK.md) | Rollback points and automatic rollback |
| [Compatibility](docs/en/COMPATIBILITY.md) | How SUPPORTED / UNTESTED / INCOMPATIBLE is decided |
| [Known Limitations](docs/en/KNOWN_LIMITATIONS.md) | **Please read**: known limitations and untested items |
| [Security](docs/en/SECURITY.md) | Security boundaries, data flow, how to report a problem |
| [Privacy](docs/en/PRIVACY.md) | What this tool touches and what it never touches |

## The three layers (read this before installing)

```text
Harness Web UI
    ↓ hosted and loaded by
DSH Desktop
    ↓ with four Personal Harness plugins installed
Personal Harness
```

1. You must **install DSH Desktop first and be able to start it** — this is a precondition, not an optional step;
2. **DSH Desktop hosts the Harness Web UI** and provides the local plugin loading environment;
3. **Personal Harness is not a standalone app and not a browser extension**, and it does not replace Harness or DSH Desktop. It is a UI / organisation layer installed into DSH Desktop;
4. After cloning this repository, run the **macOS** install script `scripts/install.sh` (this release, V1.2, ships a macOS install path only; the Windows scripts kept in the repository are **out of scope for V1.2** — see "Platform status" below);
5. The script **discovers all four `.tgz` files under `packages/` automatically** and installs them into **your DSH Desktop profile** (by default `~/.dsh/profiles/desktop`); **no extra arguments are needed**;
6. You must then **fully quit and restart DSH Desktop** (⌘Q, a real quit — not minimising). Plugins are only loaded when the host starts;
7. **Running the Harness Web UI in a browser on its own is not a verified install path** for this release; this release verifies the "DSH Desktop loads local plugins" path.

## Platform status

| Platform | Status |
|---|---|
| **macOS + DSH Desktop 2.0.5** | **Verified** (install / reinstall / uninstall / rollback tested end to end) |
| Other macOS or DSH Desktop versions | **UNTESTED** (the installer refuses to install silently and asks for explicit confirmation) |
| **Windows** | **Out of scope for this release** (the Windows material kept in the repository is experimental material from the previous release, V1.1, and was never verified with V1.2) |

> ## ⚠️ Windows: out of scope for this (V1.2) release
>
> **This release (V1.2) is macOS only.** The `scripts/windows/*.ps1` files and Windows documentation kept in the repository are **experimental material from the previous release, V1.1**, and **have never been verified with the V1.2 packages**.
>
> - **Do not use them to install the V1.2 packages.**
> - Even in the V1.1 era, this material was **never verified on a real Windows DSH Desktop** — not installation, not the UI, not uninstall, not rollback. Only PowerShell 7 syntax parsing and logic dry-runs in a non-Windows environment were done. **No real Windows machine was ever tested.**
> - The plugins are built against the web platform interfaces, so they may be compatible in theory; but the Windows build of DSH Desktop, its profile paths, extension interfaces and pnpm behaviour may all differ.
> - You may need to change paths, scripts or configuration to match your actual DeepSeek Harness / DSH Desktop installation before anything could work.
> - **There is no guarantee that a clone can be installed as-is, and no guarantee of compatibility with any particular Windows version.**
> - If you still want to try it on Windows: **back up your DSH profile first**, and if something goes wrong, **stop immediately and restore the backup**. You carry the risk yourself.

The exact verification boundary for the Windows material is recorded in [docs/WINDOWS_EXPERIMENTAL_STATUS.md](docs/WINDOWS_EXPERIMENTAL_STATUS.md) (a document from the V1.1 era): the script syntax and logic were exercised under pwsh 7, **but no real Windows machine was tested, and it was never verified with the V1.2 packages.**

> This is the public release of a **personal tool**, not a commercial product. Please read [Known Limitations](docs/en/KNOWN_LIMITATIONS.md): it works and it uninstalls cleanly, but **several known problems were left unfixed** in this release (no systematic acceptance testing was done — see the warning at the top of this page).

---

## What it actually adds (this is all of it)

| Capability | Description |
|---|---|
| **Sidebar navigation shell** | Renders Home / Conversations / New Task / Task Board / Projects / Workspaces / Recent into the official sidebar slots; it collapses automatically in a narrow sidebar and does not fight the official layout |
| **Project layer** | A relationship layer that groups conversations and tasks under "projects", persisted locally (key `dsh.personal.projects.v1`). The public release starts **empty** — you create your own projects |
| **Extra task fields** | The official task ledger only accepts `title/description/prompt/workspaceId/mode/permission/model/schedule` (a strict key whitelist; one extra key rejects the whole request with a 400). So due date / expected deliverable / constraints / notes are stored **locally** by this layer and echoed back in the UI |
| **Agent directory** | The directory UI works, but the public release ships **no preset agents** (it starts empty). You fill it yourself |
| **Bottom HUD** | A one-line status bar (current view / conversation / task counts) |
| **Quick Stop** | Provides "graceful interrupt + resume" in the official session header (the fourth package added by this release, `dsh-personal-quickstop`). One known problem around the resume bar is documented in [Known Limitations](docs/en/KNOWN_LIMITATIONS.md) |

**What it is not:** not a replacement for or fork of DSH Desktop; it contains no official source code; it contains no AI model, API key, account or credential; it never modifies, deletes or migrates any of your DSH data.

---

## Want the author's full workbench? (optional third-party plugins)

**This repository only distributes the four plugins listed above.** The author's own DSH Desktop also has a number of **third-party** plugins installed, and a fair amount of the look and workflow comes from them — but they are **not in this package**, and this repository does not bundle or redistribute them. The full list, the source check (public source / licence / whether an account or token is needed) and the test status are in **[Optional Plugins](docs/en/OPTIONAL_PLUGINS.md)**.

The three groups in one line each:

| Group | Which plugins | Notes |
|---|---|---|
| **Closer to the author's interface (install separately)** | `dsh-better-sidebar`, `@linxin666/dsh-client-ui-task-board`, `dsh-cost-meter`, `dsh-restart-button`, `@linxin666/dsh-client-ui-git-graph`, `@duke-dsh-plugins/dsh-agent-approval` | Third-party work, each installed and licensed separately. `better-sidebar` and `task-board` are important prerequisites for the complete-workstation experience |
| **Optional enhancements (install if you want them)** | `@deepseek-ai/dsh-compaction-basic` (the author actually runs the community implementation `dsh-compaction-instant`), `@liustack/modlens`, `@vectorize-io/hindsight-coding-agents`, `dsh-notion-mcp`, `dsh-pocket` | These cover context compaction / image understanding / long-term memory / Notion connection / phone access. Skipping them does not affect the core experience |
| **Not distributed by this repository** | All of the above; and `@vectorize-io/hindsight-coding-agents` (the public package has **no licence field**) and `dsh-pocket` (**GPL-2.0**) are **also** unsuitable for us to package and redistribute on licence grounds | Install them from their own public sources |

**Do not expect the result to look exactly like the author's.** Differences come from your DSH Desktop version, account state, theme, window layout, model, balance, plan, permissions, and the version of each third-party plugin. This repository is only responsible for the interface and behaviour of its own four plugins.

> The sources and licences of those third-party plugins were **checked and recorded honestly**, but **no clean-profile install or uninstall test was run for them** — every entry in `OPTIONAL_PLUGINS.md` states its test status, and "not tested" is written as not tested.

---

## Quick start (macOS)

Requirements: macOS + **DSH Desktop 2.0.5** installed (other 2.x versions: see [Compatibility](docs/en/COMPATIBILITY.md)) + Node.js ≥ 20 + `pnpm`.

### Recommended: let an AI install it for you (it reads the docs, you approve)

> Send your AI **one you trust, which can reach your computer's terminal**, the link to this repository, and let it read the install documentation, then help you download, check prerequisites, create a backup and install.
> Installing manually works too, but you have to run every command yourself and it is easy to miss a step.

You can send it the text below together with the repository address:

```text
This is an open-source repository I'm giving you: <repository address>
Please read README_EN.md and docs/en/INSTALL_MACOS.md in full first, then:
1) Check whether my machine meets the prerequisites: DSH Desktop version, Node.js >= 20, and whether pnpm is available;
2) Tell me which profile directory this will modify and where the backup will be stored;
3) Wait for my confirmation before running the install;
4) After installing, remind me to fully quit and restart DSH Desktop (plugins load only when the host starts);
5) Show me the output of every step.
If something is missing or you are unsure, say so directly — do not guess on my behalf and do not skip checks.
```

Why this is the recommended route: the install itself is only a few commands, but **missing one step makes people conclude "the plugin doesn't work"** — the most common cause is not restarting the host. An AI can walk you through it step by step.

You and the AI should both be clear about these boundaries:

- The AI **must have access to your local terminal** to download and install for you; if it cannot, it can only hand you a command list to run yourself;
- The AI should check DSH Desktop, Node.js and pnpm **before** installing, state **which profile will be modified** and **where the backup goes**, and then **wait for your confirmation**;
- After installing it should remind you to **fully quit and restart DSH Desktop**;
- Backups, installation and any system permission prompts are still **yours to confirm**;
- **Running the Harness Web UI in a browser on its own is not a verified install path for this release** — this release verifies the "DSH Desktop loads local plugins" path.

### Manual install

```bash
git clone <the address of this repository> dsh-personal-harness
cd dsh-personal-harness
bash scripts/install.sh --dry-run   # see what it plans to do first (a real dry run: no directories, no copies, no installs)
bash scripts/install.sh             # install into $HOME/.dsh/profiles/desktop
```

Then **fully quit DSH Desktop and open it again** (plugins load when the host starts).

```bash
bash scripts/uninstall.sh        # uninstall (keeps all of your data by default)
bash scripts/rollback.sh         # return to the state before this install
bash scripts/rollback.sh --list  # list the available rollback points
```

More detail: [Install on macOS](docs/en/INSTALL_MACOS.md) | [Uninstall](docs/en/UNINSTALL.md) | [Rollback](docs/en/ROLLBACK.md)

Windows: **out of scope for this (V1.2) release**. The `scripts/windows/*.ps1` files kept in the repository are **experimental material from the previous release, V1.1**, and **were never verified with the V1.2 packages** — **do not use them to install the V1.2 packages**.

```powershell
# The commands below belong to the experimental V1.1 material; they are out of scope for V1.2
# and were never verified with the V1.2 packages.
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install.ps1 -AllowUntested
```

The Windows install guide is currently available in Chinese only (material from the V1.1 era; its "unverified" statements are kept exactly as they were).

---

## Verifying the package yourself

The release includes `manifest.json` (sha256 per package, the embedded commit, the host compatibility range) and `checksums.sha256`. The installer verifies them before installing and **compares byte for byte** the `client.js` inside your profile against the released package afterwards.

```bash
npm run verify     # package hashes / install consistency / no private data
npm run test       # artifact contract tests (71 checks / 0 failures; the same in both development and production mode)
npm run compat     # print the host compatibility verdict for this machine
```

If you would rather build from source than use the pre-packaged `.tgz` files:

```bash
npm install        # build-time dependencies only (esbuild / jsdom); they are not part of the released artifacts
npm run build
npm run package
npm run verify     # verify the four .tgz files shipped in this repository (hashes / embedded commit / install consistency / no private data)
```

Two notes, to avoid confusion:

- A fresh clone has no `src/workstation/*/build/` (build outputs are deliberately not committed). `npm run verify` and `npm test` **restore those bundles from the `.tgz` files shipped in `packages/`** and then check them byte for byte against the sha256 values in `manifest.json`. In other words: **you can verify that the package you received was not modified without compiling anything.**
- To check that the source code still compiles to the same package: `npm run build && npm run package && npm run verify` (after rebuilding, `client.js` should be byte-identical to the released one on this release commit).

---

## Version and composition

| Item | Value |
|---|---|
| Product version | **Personal Harness V1.2** (release tag `public-v1.2`) |
| Components | `dsh-personal-sidebar` 0.1.28 / `dsh-personal-workspace` 0.1.25 / `dsh-personal-hud` 0.1.3 / `dsh-personal-quickstop` 0.1.1 |
| Release scope | **macOS only** (Windows is out of scope for this release — see "Platform status") |
| Host | DSH Desktop **2.0.5** (compatibility mode, zero patches) |
| Install method | The four `.tgz` files are installed as `file:` dependencies into the DSH Desktop profile (`scripts/install.sh` discovers all four under `packages/` automatically; no extra arguments needed) |
| Licence | MIT (see `LICENSE` and `NOTICE`) |

Component versions (0.1.x) and the product version (V1.2) are deliberately separate schemes: components evolve independently, while the product is released by stage.

---

## Documentation that is currently Chinese only

This edition adds English versions of the user-facing documents listed at the top. The following are still Chinese only — they are named here so you know they exist and what they cover:

- `INSTALL_WINDOWS_EXPERIMENTAL.md` — Windows install notes (**experimental material from V1.1; never verified with V1.2, and out of scope for the V1.2 release**)
- `CHANGELOG.md` — release history, including the documentation-only releases
- `CONTRIBUTING.md` — contributing, forking, adapting to other platforms, and the rules for derivative releases
- `THIRD_PARTY_NOTICES.md` — third-party components and licences for what this repository distributes
- `PUBLIC_EXPORT_ALLOWLIST.md` — the file-by-file export and exclusion list for this public release
- `docs/ARCHITECTURE.md`, `docs/WINDOWS_EXPERIMENTAL_STATUS.md`, `docs/PUBLIC_*.md` — architecture, Windows verification boundary, code provenance, sanitisation, privacy and secret scan reports, and the release audit

If you need one of them in English, ask an AI to translate it locally — see "Contributing / derivative work" below.

---

## Release artifacts and commits (verifiable)

The release artifacts in this repository form a **self-referential release commit**: the short commit hash embedded in `packages/*.tgz` **is the hash of the very commit that contains them** (not of the parent commit).

```bash
git rev-parse --short HEAD                       # equals the value below
node -p "require('./manifest.json').plugins[0].embeddedCommit"
npm run verify                                   # fails loudly if they disagree (hard gate)
```

A git commit cannot embed its own full 40-character hash (the content determines the hash, so it is impossible by construction), so the commit message ends with a `Self-id-Nonce:` trailer — that is the search nonce which makes "the first 7 characters of the commit hash equal the embedded value" hold. `npm run verify` enforces both this equality and a clean working tree.

## Contributing / derivative work

This is an **initial release**. Adaptation problems across different machines, DSH Desktop versions and environments are normal.

When you hit one, you can have **your own DeepSeek or another AI** read this repository locally and help you adapt it (that is how it is used locally). Two things up front: **there is no guarantee that your changes will work as-is**, and **back up your DSH profile before you start**; afterwards, check install, uninstall and rollback yourself.

You are also welcome to **build your own Harness** on top of this plugin pack — a different workflow, interface, project structure, task system or set of local tools.

Boundaries that do not change:

- macOS + DSH Desktop 2.0.5 is the **verified** scope; other host versions remain **UNTESTED**;
- Windows material remains **Experimental / Untested** (and it is **V1.1-era** material, **never verified with the V1.2 packages**) — do not describe it as supported or ready to use;
- Unverified items stay written as unverified, never as passing.

Please do not redistribute official DSH Desktop, official code, other people's private data, tokens, cookies, or third-party code with unclear licensing. Before republishing, run your own privacy, licence and security review.

## Disclaimer

This software is provided under the MIT licence "as is", without warranty of any kind. It operates on your own DSH Desktop profile (writing to `package.json`, the lockfile and `node_modules`), so **make sure you are comfortable with your profile being modified before installing** — every change has a rollback point, and official data storage is out of scope. The author is not liable for data loss or host failures.
