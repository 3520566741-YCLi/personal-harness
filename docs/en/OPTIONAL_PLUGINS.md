# Optional Plugins (OPTIONAL_PLUGINS)

**First, the most important thing: this repository distributes three plugins only** — `dsh-personal-sidebar`, `dsh-personal-workspace` and `dsh-personal-hud` (all inside `packages/*.tgz`).

Every other plugin mentioned here is **third-party work**, owned and maintained by its own author. This repository **does not bundle or redistribute them**. What this page does is tell you honestly: what they are, where their public sources are, what you should know before installing, and **which parts we have never verified**.

> Source check date: **2026-09-11**. Method: each package's `/latest` metadata on the public npm registry, plus the `package.json` of the copy installed on the author's machine (licence / repository fields). Plugins change quickly, so version numbers drift — always check for yourself.

---

## Group 1 — closer to the author's interface (complete-workstation prerequisites)

To get an interface close to the author's, these are the core pieces:

| Plugin | What it does | Author's version | If you skip it |
|---|---|---|---|
| `dsh-personal-sidebar`<br>`dsh-personal-workspace`<br>`dsh-personal-hud` | This repository's own three plugins: the left-hand navigation (Home / Conversations / New Task / Projects / Workspaces / Recent), the centre pages (including the Task Board), and the bottom HUD | 0.1.24 / 0.1.20 / 0.1.3 | — **these three come with the package**, no separate install |
| `dsh-better-sidebar` | Sidebar enhancements: editor and terminal side panels. "Open the real directory" in Workspaces **can only open a real editor window when this is available** | 0.17.1 | The Workspaces page honestly reports "cannot open in this environment" instead of pretending |
| `@linxin666/dsh-client-ui-task-board` | The "Task Board" entry on the left and its board page (that page is **its own**; this repository only attaches a real "needs attention" count badge to it — no renaming, no takeover) | 0.3.16 | This repository's own Task Board centre page still exists, but that left-hand entry will not appear |
| `dsh-cost-meter` | Bottom cost / balance / peak-off-peak pricing / plan-quota module | 1.7.10 | No balance or cost display |
| `dsh-restart-button` | A "quick restart" button | 0.0.1 (see the source check below) | You quit and reopen the host manually |
| `@linxin666/dsh-client-ui-git-graph` | Git branch / commit graph | 0.3.13 | No graphical Git view |
| `@duke-dsh-plugins/dsh-agent-approval` | The approval page and permission flow (approval requests are presented by it; **whether to allow them is still your click**) | 1.5.0 | Approval requests fall back to the host's default presentation |

### What this cannot guarantee

**Do not expect the result to look exactly like the author's.** Interface differences come from factors you cannot copy:

- your own **DSH Desktop version** (the author's verified environment is 2.0.5);
- **account state, model, plan, balance** (that data is yours, and it is never distributed with any repository);
- **theme, font size, window size and layout**;
- the **version** of each third-party plugin (their release cadence has nothing to do with this repository);
- **permissions and approval settings**.

This repository's three plugins are responsible only for the "Home / Conversations / New Task / Projects / Workspaces / Recent + centre pages" shell; the rest of the look comes from those third-party plugins and the host itself.

---

## Group 2 — closer to the author's workflow (optional enhancements)

None of these are required, and skipping them does not affect the interface above:

| Plugin | What it solves | What you need to provide |
|---|---|---|
| `@deepseek-ai/dsh-compaction-basic` | **Context compaction**: compresses context when a conversation gets long, so long work can continue | See the source check below (the author uses a community implementation, not the official package with the same name) |
| `@liustack/modlens` | **Image understanding**: hands screenshots, charts and photos to a vision model and gives the result back to the agent | Run its diagnostics once; if the machine has no usable vision model you must configure an engine (a free Gemini API key is the suggested default, or any OpenAI-compatible endpoint) |
| `@vectorize-io/hindsight-coding-agents` | **Long-term memory**: remembers what happened in this repository across conversations | One of three: cloud (needs an **API token**) / self-hosted (needs **your own URL**) / a local daemon |
| `dsh-notion-mcp` | Connects the agent to **Notion**: search, read and write pages | A one-time **browser OAuth authorisation** (the token is then stored in dsh's credential layer, i.e. **on your machine**) |
| `dsh-pocket` | **Phone access** to your dsh web, so you can continue from your phone | The default "quick tunnel" needs no account and no server; a **fixed public address** requires a Cloudflare account, your own domain, and a tunnel token |

---

## Group 3 — source, licence and version: the per-plugin check

For every plugin we checked: whether a public and accessible install source exists, what the licence is, whether an account or credential is needed, and **whether we ever tested it**.

| Plugin | Public source | Licence | Account / credentials | Clean-profile test |
|---|---|---|---|---|
| `dsh-better-sidebar` | Public npm package (latest at check time: 0.19.1) | MIT | None | **Not tested** |
| `@linxin666/dsh-client-ui-task-board` | Public npm package (latest: 0.3.20) | Apache-2.0 | None | **Not tested** |
| `@linxin666/dsh-client-ui-git-graph` | Public npm package (latest: 0.3.20) | Apache-2.0 | None | **Not tested** |
| `dsh-cost-meter` | Public npm package (latest: 1.7.21) | MIT | Reads **your own** account balance / plan quota (from your configuration) | **Not tested** |
| `dsh-restart-button` | Public npm package (latest: 0.1.2) | MIT | None | **Not tested** |
| `@duke-dsh-plugins/dsh-agent-approval` | Public npm package (1.5.0) | MIT | None | **Not tested** |
| `@deepseek-ai/dsh-compaction-basic` | Public npm package (official scope; latest: 0.0.1-rc.3) | BSD-3-Clause | None | **Not tested** |
| `dsh-compaction-instant` (what the author actually runs) | Public npm package (0.1.4) | MIT | None | **Not tested** |
| `@liustack/modlens` | Public npm package (latest: 3.26.1) | MIT | Optional: a vision engine (e.g. a free Gemini API key) | **Not tested** |
| `@vectorize-io/hindsight-coding-agents` | Public npm package (latest: 0.6.0) | **No licence field** | Required (cloud token / self-hosted URL / local daemon) | **Not tested** |
| `dsh-notion-mcp` | Public npm package (0.1.0) | MIT | Required: Notion browser OAuth | **Not tested** |
| `dsh-pocket` | Public npm package (latest: 2.10.6) | **GPL-2.0** | None by default; a fixed domain needs a Cloudflare account | **Not tested** |

The "clean-profile test" column is **"Not tested" for every single entry**: we checked sources and licences, and **we did not run install or uninstall tests for any of these third-party plugins**. Do not read this page as a compatibility promise.

### `dsh-agent-approval` and `dsh-restart-button`: the author's copies are local tarballs

In the author's own profile these two are installed from locally cached `.tgz` files rather than pulled straight from the registry. The per-plugin result:

- **`@duke-dsh-plugins/dsh-agent-approval`**: the sha1 of the local tarball and the official tarball digest of npm **1.5.0** are **identical** → it is the same published package (MIT, public repository).
- **`dsh-restart-button`**: locally it is **0.0.1** (that tarball has no repository field), while the public npm package is at **0.1.2** (MIT, with a public repository). The versions **differ**, and whether the two behave the same way is **not verified**.

Conclusion: both **have public sources**, so they can be recommended for a separate install; but because we **never** installed them in a clean profile, we do **not** describe them as "one-click installable".

### Specific notes on the plugins called out by the author

- **`dsh-cost-meter`**: the bottom module shows balance, today's spend, peak/off-peak pricing, plan quotas and so on. Those numbers come from **each user's own account or configuration** — they must **never** be distributed with a repository, and please do not share balance screenshots, tokens or account details with anyone.
- **`@duke-dsh-plugins/dsh-agent-approval`**: it affects the **approval page and permission flow** — approval requests are presented by it, but whether to allow them is still **your** decision. Installing it does not loosen any permission.
- **`dsh-restart-button`**: it only provides a "quick restart" button.
- **`@linxin666/dsh-client-ui-git-graph`**: it only provides a Git branch / commit graph view.
- **`dsh-better-sidebar` and `task-board` are important prerequisites for the complete workbench**: the former provides the side editor/terminal (Workspaces' "open the real directory" depends on it), the latter provides the left-hand task-board entry.
- **A trap with `@deepseek-ai/dsh-compaction-basic`**: the official scope does have this package (BSD-3-Clause), but **the author actually uses a community implementation** — an npm alias points that name at `dsh-compaction-instant@0.1.4` (MIT). They are not the same thing. To reproduce the author's behaviour, install `dsh-compaction-instant`; installing by name gets you the official package instead.

---

## Final classification

| Category | Plugins | Notes |
|---|---|---|
| **Comes with the package** | `dsh-personal-sidebar`, `dsh-personal-workspace`, `dsh-personal-hud` | Everything this repository contains; installing gives you these |
| **Closer to the author's interface: install separately** | `dsh-better-sidebar`, `@linxin666/dsh-client-ui-task-board`, `dsh-cost-meter`, `dsh-restart-button`, `@linxin666/dsh-client-ui-git-graph`, `@duke-dsh-plugins/dsh-agent-approval` | Third-party, each installed and licensed separately; the result is **not guaranteed** to match the author's interface |
| **Optional enhancements: install if you want them** | `@deepseek-ai/dsh-compaction-basic` (or the community `dsh-compaction-instant`), `@liustack/modlens`, `@vectorize-io/hindsight-coding-agents`, `dsh-notion-mcp`, `dsh-pocket` | Compaction / image reading / memory / Notion / phone access. Skipping them does not affect the core experience |
| **Source, licence or version still needs checking by you** | Every third-party plugin above; in particular `@vectorize-io/hindsight-coding-agents` (**no licence field** in the published package) and `dsh-pocket` (**GPL-2.0**) | We checked the sources and licences and recorded them; we did **not** test installation, and we cannot speak for any plugin's licensing beyond what its own package declares |
| **Not distributed by this repository** | All third-party plugins | This repository ships only its own three. Install third-party plugins from their own public sources |
| **Unsuitable for us to package and redistribute** (licence grounds) | `@vectorize-io/hindsight-coding-agents` (the published package has **no licence field**, so no redistribution grant is given) and `dsh-pocket` (**GPL-2.0**, which carries copyleft obligations) | Installing them yourself is fine; we cannot put them in a release package |

> Nothing here was judged "impossible to install". What was judged "this repository must not package or redistribute" is the last row.
> Also note that the published `@vectorize-io/hindsight-coding-agents` package **has no licence field** — among the third-party plugins listed, that is the one most in need of your own judgement: no explicit licence means the author has not granted redistribution or modification rights.

---

## How to install these plugins in general

```bash
cd "$HOME/.dsh/profiles/desktop"     # the default DSH Desktop profile on macOS
pnpm add <package-name>              # for example: pnpm add dsh-better-sidebar
```

- After installing, **fully quit DSH Desktop and open it again** so the plugin loads.
- Some plugins additionally need a line in the mount file of the relevant profile (for example `dsh-better-sidebar` has its own instructions for the `web` profile) — **follow that plugin's own README**; we do not make promises on its behalf.
- This repository's install script handles **only the three `dsh-personal-*` plugins**: it will not install, upgrade or uninstall any third-party plugin, and `bash scripts/uninstall.sh` will not touch them either.
- As with this repository, **back up your profile first** (`scripts/install.sh` creates an automatic rollback point before changing anything).

## Privacy red lines

- Any **token / API key / OAuth credential / balance or plan information** is yours: do not commit it to any git repository, do not paste it into a public issue, and do not send it to any AI unless you are sure of the purpose.
- The source code and release packages in this repository contain **no** accounts, balances or credentials, and no third-party plugin content.

## Not verified (**not a pass**)

| Item | Status |
|---|---|
| Installing / uninstalling these 11 third-party plugins in a clean profile | **Not tested** |
| How these plugins interact with this repository's plugins (upgrades, conflicts, layout pressure, duplicate entries) | **Not verified** |
| The author's versions behaving the same as the latest npm versions | **Not verified** (most versions differ) |
| Whether "it runs on the author's machine with DSH Desktop 2.0.5" equals "installation verified" | It does not — that is an observation of a running state, not an install test we performed |
| Anything on Windows | **Not verified** |
| Whether the result will look exactly like the author's screenshots after installing | **Not guaranteed** |

---

Related documents: [English README](../../README_EN.md) | [Feature Guide](FEATURE_GUIDE.md) | [Install on macOS](INSTALL_MACOS.md) | [Known Limitations](KNOWN_LIMITATIONS.md)
