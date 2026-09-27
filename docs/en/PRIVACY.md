# Privacy

In one sentence: **the four plugins in this release have no server, no account and no telemetry, make no requests to any external host apart from the single exception described below ("One honest disclosure"), and do not read files unrelated to the workbench.**

This release = **Personal Harness V1.2** (tag `public-v1.2`, macOS only), four plugin packages in total:

| Plugin package | Version |
|---|---|
| `dsh-personal-sidebar` | 0.1.28 |
| `dsh-personal-workspace` | 0.1.25 |
| `dsh-personal-hud` | 0.1.3 |
| `dsh-personal-quickstop` | 0.1.1 |

## What it reads and writes

| Location | Read | Write | Notes |
|---|---|---|---|
| `$HOME/.dsh/profiles/<profile>/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | ✓ | ✓ (during install/uninstall/rollback) | Declares the `file:` dependencies of the four plugins; backed up automatically before writing |
| `$HOME/.dsh/profiles/<profile>/node_modules/` | ✓ | ✓ | pnpm installs/removes the plugin packages |
| `$HOME/.dsh/cache/` | ✓ | ✓ | Install places the release `.tgz` files here |
| `$HOME/.dsh/guard-backups/personal-harness/` | ✓ | ✓ | Rollback points (`--purge-user-data` deletes this whole directory) |
| Official DSH storage (sessions / tasks / workspaces) | ✓ read-only | ✗ | Read and displayed through official services injected by the host; **we never use official write APIs to change your data** |
| Browser localStorage (key prefixes `dsh.personal.*` / `dsh.dps.*`) | ✓ | ✓ | Project-level and task supplement fields (due date / deliverables / constraints / notes) stay on your machine |

**Not read**: `~/.ssh`, the keychain, browser cookies / history, personal files outside `~/.dsh`, or credentials in any environment variable.

## Network behaviour (stated precisely)

**None of the four plugins makes requests to any external host.** More precisely:

- Every HTTP request the plugins make is **same-origin**, addressed to **DSH's own on-machine HTTP routes** (relative paths) such as `/personal-workspace/archive`, `/personal-workspace/memory/tree` and `/personal-workspace/context/state`; one `EventSource` points at `/api/task-board/events`, which is likewise same-origin with the DSH interface. The recipient is the host running on your machine, not an external server.
- Apart from the **single exception described at the end of this section**, the four packages contain **no external domain names**, and no self-hosted endpoint, reporting address or third-party analytics SDK.
- **No telemetry / no analytics / no crash reporting**.
- **No account and no API key required**: this release contains no model-calling logic; the AI capability comes from the DSH Desktop host.
- **Uploads nothing**: this project has no backend; no request carries any content off your machine.
- Data still lives in **official DSH storage** (sessions / tasks / workspaces) and in **browser localStorage**, in exactly the same places as without this release installed.

### One honest disclosure: the ChatGPT tab's embed probe (**happens only when you open that tab yourself**)

`dsh-personal-workspace` ships an optional "ChatGPT" right-panel tab (an "honest launcher": it does not pretend the site was embedded, it just shows you the real evidence). **Only when you open that tab yourself** does it do two things:

- read one piece of evidence from the on-machine route `/personal-workspace/chatgpt-embed-probe` (a same-origin request);
- the host side then makes **one anonymous read-only GET** to `https://chatgpt.com/`, purely to read back that site's response headers / status code in order to judge whether it can be framed in a page.

The bounds of that probe (code-level facts): `credentials: 'omit'` (no cookies and no authorisation header are sent), only a small whitelist of response headers is recorded (`set-cookie` is never recorded), the body is not kept, and **no** password / cookie / token / login state is read, recorded or uploaded. **If you never open that tab, it never happens.** Verified in both the source and the release artifact (`packages/dsh-personal-workspace-0.1.25-public-v1.2.tgz`): it is the only external domain name that appears anywhere in the four packages.

## Boundaries: what this promise covers and what it does not

1. **It covers these four packages only.** Any **third-party plugin** you install yourself is outside this promise: those are written and maintained by their own authors and **may have their own network requests, accounts, telemetry or credential behaviour**. Please read their own privacy statements and source. This release does not bundle or redistribute them and is not responsible for what they do.
2. **Main-model inference and image reading are provided by DSH official / a model service of your choosing.** That outbound traffic (session content, images you attach, and so on) is **not controlled by this release** and is governed by DSH official and whichever model provider you select; their privacy terms are not something this repository promises. By the same token, the network behaviour of the DSH Desktop host itself is not part of this release.
3. **This release itself needs no external network to install or run** (neither the install script nor the four plugins depends on any external service). But that **does not** mean "the whole application works fully offline": the main model is a cloud service, so with no network there is no model; the outbound traffic in point 2 still applies.

## What it does not do

- **It does not send data off your machine**: no self-hosted endpoint, no reporting, no cloud sync; cross-process data access goes through official services injected by the host.
- **It does not take over your data**: it does not use official write APIs to change sessions / tasks / workspaces (the only exception is the task supplement fields you fill in yourself, listed in the "what it reads and writes" table; they stay in local localStorage).
- **It does not phone home silently**: no background heartbeat, no reporting at startup; the one outbound call described above happens only when you open the corresponding tab.

## Whose data it is

Your session, task and workspace data belongs to **official DSH storage**. This release is only a reader and a presentation layer and **claims no ownership**:

- By default, uninstalling deletes **not a single row of data** (see [UNINSTALL.md](UNINSTALL.md));
- `--purge-user-data` deletes only the on-disk state this release wrote itself (rollback points, package cache), and requires you to type `PURGE` manually to confirm;
- The project/task supplement fields shown in the interface are yours to clean up inside the app (Inspector → reset local state).

## First install = blank user state

The public build **ships no pre-set content**: the project list is empty (`projects: []`), the agent catalog is empty (`agents: []`), and the sample text in the interface is neutral and generic. Everything you see was created by you (or comes from pre-existing data in official storage).

## Privacy audit for this public release

This repository scanned "every tracked file that is about to become public" one by one. Conclusion: **zero hits for personal identifiers / machine paths / usernames / email addresses / phone numbers / tokens / keys** (the single hit was a reference to an official storage path inside explanatory text, judged harmless and recorded in the report).

- docs/PUBLIC_PRIVACY_SCAN_REPORT.md — privacy scan (every hit and its verdict; currently Chinese-only)
- docs/PUBLIC_SECRET_SCAN_REPORT.md — secret scan (currently Chinese-only)
- docs/PUBLIC_SANITIZATION_REPORT.md — the point-by-point neutralization diff from the internal frozen build to the public build (currently Chinese-only)

## Not verified (**not a pass**)

| Item | Status |
|---|---|
| A **runtime packet-capture** check (proxy or tcpdump observation) that the four plugins make no external requests | **Not done** — the conclusion above comes from **static review of the source and the release artifacts**, not from traffic capture |
| Anything on Windows | **Not verified** |
| The network behaviour of third-party plugins you install yourself | **Outside this promise** (not audited and not tested by this repository) |

## Feedback

If you find any privacy problem (for example, something that still contains information identifying an individual), please open an issue; **do not** keep distributing that version until it is fixed.
