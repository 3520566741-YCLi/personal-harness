# Known Limitations (KNOWN_LIMITATIONS)

> ## ⚠️ Read this part first
>
> **V1.2 is the "most feature-complete, but never systematically accepted" release. It carries a number of known issues, and those issues are planned to be fixed in V1.3.**
>
> - **Want the most features** → V1.2 (this release). **Want the most stable** → V1.1 (release git tag `v1.1.0-macos`). **The only baseline that has been fully accepted and rollback-verified is V1.1**.
> - Every entry on this page is a **logged fact from real measurement** (symptom + scope of impact + current status + workaround). None of it is "probably fine", and none of it is guesswork. Anything unverified is written as **Unverified**, and is **never misreported as passing**.
> - This release (V1.2) **ships a macOS installation path only**; Windows is not part of the V1.2 release scope — see the statement at the top of [INSTALL_WINDOWS_EXPERIMENTAL.md](../INSTALL_WINDOWS_EXPERIMENTAL.md) (currently Chinese-only).
> - For privacy and outbound-traffic wording see [PRIVACY.md](PRIVACY.md); for the third-party plugin boundary see [OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md).

---

## 1. Things that affect normal use (6 items)

| # | What you will see | Scope of impact | Current status | Workaround |
|---|---|---|---|---|
| **A1** | The **product version shown in the interface may not match the product version actually installed** (this mismatch already existed in the V1.1 release) | All users | This release changed the "single source of truth for the product version" to **V1.2**; but **product version ≠ component version** still holds (see 6.1 below) | When checking versions, treat release metadata such as `manifest.json` / a `VERSIONS` file as authoritative; component versions are in the diagnostics panel |
| **A2** | The **"tidy up memory every 30 minutes" job has never once run successfully**, and the interface **does not tell you that it failed** — you think it is running, but it has never succeeded even once | Users who rely on "memory tidy-up" | Not fixed in V1.2 (feature freeze). Measured: the schedule fired on time **131 times / 0 successes** (129 × "response body too large" + 2 × timeout); the root cause is that a single fetch returns **4,596,189 bytes > the 4 MiB transfer gate**, so it is **arithmetically impossible** to pass | Do not depend on automatic tidy-up; when you need it, trigger it manually and watch the result. The fix is planned for V1.3 (paged fetching + failure reasons recorded + visible in the interface) |
| **A3** | After Quick Stop, clicking **[继续] (Continue)** on the continuation bar makes the card show "accepted", but **the card then never disappears, and the interface offers no way at all to dismiss it** | Users of Quick Stop / continuation (the headline feature of V1.2's I phase) | Not fixed in V1.2 (`dsh-personal-quickstop` 0.1.1): after accepting successfully it **never writes the "read" marker**, so the record stays in the to-do side forever; and the accepted state greys the button out ⇒ the interface has no means to dismiss it | Restarting DSH Desktop makes that card disappear (the state lives in the session layer and is not deleted). The fix is planned for V1.3 (write the read marker after a successful accept; **only on a successful write** does the card disappear — a failed write keeps the card and reports it honestly) |
| **A4** | The whole right sidebar collapses into the error banner `dsh-better-sidebar: row is not defined` — triggered when **the main session and a subagent have background tasks at the same time** (a common state), which feels like "it keeps crashing for no reason" | Machines that rely on **third-party patches** such as "collapse finished background tasks" | **This release modifies no official or third-party artifact**; that crash comes from a third-party patch script whose anchor rewrite missed two variable renames. **If you have installed such a patch on your machine, re-apply it with the newest version from its author, or do not apply it for now** | Do not apply unofficial patches; or, after patching, immediately run that patch's own verification steps. The fix (repairing both the generator and the artifact) is planned for V1.3 |
| **A5** | The third-party plugin **`ds-harness-remote` is enabled by default and is hard-wired to the plugin author's server** (device registration + a remote-access channel). For **a freshly installed user this default state is what you get** | **All users**; the single largest privacy/trust item on this list | This is **a third-party plugin's default**, not part of this release (this repository ships only the four packages sidebar / workspace / hud / quickstop). **On your machine we recommend disabling it right after installing**; if it was ever enabled, revoke the device/token authorisation on that service's side | For how to disable it and the full explanation see [OPTIONAL_PLUGINS.md](OPTIONAL_PLUGINS.md) (add `disabled: true` to the patch layer of your own profile — one line, and deleting it fully rolls the change back) |
| **A6** | **Image reading sends the image itself to an external vision-model service** (decided by the image-reading plugin, not by this release); if that service's key sits in your local configuration as **plaintext**, the risk is yours | Users of "image reading" capabilities | This is a **plugin and environment** issue, not a code issue in this release; this release **contains no keys of any kind** and **makes no requests to any external host by default** (the one exception is a single anonymous read-only GET when you yourself open the right-hand ChatGPT tab; see [PRIVACY.md](PRIVACY.md)) | Use image reading only if you trust that service; rotate the key and prefer the system credential store; if you do not need image reading, disable that plugin |

---

## 2. Edge cases and specific paths (15 items)

| # | Symptom | Scope of impact | Current status / plan |
|---|---|---|---|
| **B1** | Two different 404s are treated as meaning the same thing: **a plugin that did not take effect (no such route)** is silently recorded as "there was never any such record" (a normal outcome) ⇒ a real fault is misread as normal | Machines with an incomplete install / a half-loaded host | Not fixed in V1.2; planned for V1.3: classify by **response-body evidence** (real route rejection / not mounted at the host layer / indistinguishable = unknown), and **never default to "record does not exist"** |
| **B2** | Continuation can be **delivered more than once**: there is no "already continued" marker | Repeatedly clicking continue / continuing from several entry points | Not started (planned for V1.3) |
| **B3** | Interruption records for background tasks have **no cleanup entry point** ⇒ the unread count stays inflated long-term and the badge never returns to zero | Users who used Quick Stop to stop background tasks | Not started (low severity, planned for V1.3) |
| **B4** | A task stopped by Quick Stop has **no "interrupted" state** on the board; it can only land in the five official states (`running/stopping/completed/killed/failed`) | Users who check the board after using Quick Stop | In V1.2 this was **not done** (it is not "done but unverified"). Planned for V1.3 as a "personal projection" rather than a separate record |
| **B5** | "Opening task details clears the purple dot" is only mounted in **Personal mode** ⇒ in **official mode**, opening task details does not clear the dot | Users who switch to official mode | A design boundary, stated honestly in the report; to be decided in V1.3 |
| **B6** | Two gaps between the interruption orchestration and the literal requirement: ① the nine steps run **per source** (an earlier source can be stopped before a later one has written its state) ② the durability barrier **covers only the top-level session** — subagents and background work have no barrier | Users who use Quick Stop to stop subagents / background work | V1.2 states the deviation explicitly and does not change it; planned for V1.3 to be settled by a ruling |
| **B7** | Several pieces of **user-visible copy** and 4 conservative rules are an initial draft, **not finally approved** (if it cannot be decided, do nothing; record a 404 as `no-record`; reopening counts as a new run; a real failure is not retried automatically) | Only visible when you hit an edge case | Not finalised (planned for V1.3) |
| **B8** | PPT / Office Master: path B proves the mechanism with **fixture pages only** — **a real deck opened in real PowerPoint was never done**; pixel-level QA was skipped throughout; compatibility with older Office (no SVG→PNG rasteriser) is unverified; the model score is a warning only, and its threshold has never been correlation-checked against human review | Users of that capability | Not done in V1.2. **You must not claim "accepted / supports high-design refinement"**; an upgraded version is planned for V1.3, and **the real-machine visible surface is still unverified** |
| **B9** | In a skill's `SKILL.md`, `allowed-tools:` / `permissions:` read as "this skill may only use these tools", but **the host does not parse those keys ⇒ they have zero enforcement power** | Users who make security judgements based on a skill's declared tool restrictions | The declarations are not inside this repository (they belong to the plugin/user skill roots). This release **does not change those declarations**; it provides only a read-only audit capability (planned to ship in V1.3) |
| **B10** | A set of coupling points that are "naturally limited / broken by any upstream move": when the task board cannot be fetched, the answer is always "count unavailable" (**never shown as 0**); collapse-type patches must be re-applied on every upstream upgrade; drift in the bundled copies of capabilities **is the normal state**; some semantics depend on official internal enums | Each item appears on a different path | Partly fixed; the rest await a ruling or are mechanically unsolvable (planned to be closed out in V1.3) |
| **B11** | **You cannot tell from the version number / self-check whether you are on the latest build**: the same component version number may correspond to different builds (the source differs only in an embedded string); the `.tgz` container hash differs every time, and `client.js` embeds the build commit ⇒ **a byte-for-byte self-check can report "inconsistent" even for the same source** | Users who want to check "which build do I have installed" | A release-engineering problem, not fixed in V1.2; planned to be unified in V1.3 |
| **B12** | When several build sources exist under the same product number, **installing from an old directory or an old cache can install an unintended build** | Users who install by directory name or from an old cache | Use only this release's artifacts (`packages/*.tgz` + `manifest.json` verification); do not reuse historical caches; closed out in V1.3 |
| **B13** | **There is no one-click install**: installation requires running a script; and historical install scripts had the trap of "copying the packages into the profile path but **never registering the load manifest**" ⇒ "installed but never loaded" | New machines / users installing it themselves | V1.2's one-click entry point is **still in flight and not green**; please follow the steps and restart requirements in [INSTALL_MACOS.md](INSTALL_MACOS.md) exactly |
| **B14** | **A fresh clone does not necessarily self-check all-green**: you must first build the four artifacts and restore the local dependency baseline to get all-green; without the historical baseline it shows 1 unverified item | Contributors who clone it and run the checks themselves | An environment issue, not a code regression. Follow the build order in the repository README; V1.3 plans to provide a read-only "recover the baseline" tool |
| **B15** | Running install / artifact checks inside the window where **artifacts are being rebuilt** produces a **misleading red** | Contributors who run checks after editing the code themselves | Operating discipline: do not run the install / artifact suites in parallel with rebuilding artifacts |

---

## 3. Look and feel (9 items)

| # | Symptom | Scope of impact | Current status / plan |
|---|---|---|---|
| **C1** | Quick Stop's **pixels and feel have never been re-checked on a real machine**: the appearance of the continuation bar / the **[继续] (Continue)** button, how the purple dot looks, and whether the state survives a restart of the app | All users of Quick Stop | **Unverified on a real machine** (this is not "passing"). Anything pixel-related always needs **the user's own** confirmation; planned for V1.3, to be re-checked item by item against the install checklist |
| **C2** | Whether the sidebar "really shows only 4 rows" after collapsing, the **feel** of drag-to-reorder, and whether it is remembered across restarts — **none of these have had a real-machine acceptance** | Users of sidebar collapse / drag-to-reorder | **Unverified on a real machine** (an automated suite can prove rendering and logic; it **cannot prove feel**) |
| **C3** | The interruption purple dot uses **a colour value this release carries itself** (default `#a06bff`), because the official theme token table has **no purple semantic token** ⇒ if the official theme changes, it may look out of place | Users who see the purple dot | Known and logged; planned for V1.3 to keep handling it as "a variable carried by this package" |
| **C4** | The collapse strip copy does not match the example (it reads "25 completed" instead of "completed 25"); **the 17 languages other than Chinese/English** still show the upstream wording (no error, no crash) | Users on non-Chinese/English interfaces | Not supplemented; awaiting a ruling (planned for V1.3) |
| **C5** | Several look-and-feel rules are **undecided**: which of a purple dot and a green dot wins in the same frame, how two badges contesting the same position are ordered, and which token the purple should use | Interfaces with several badges / status lights at once | Awaiting a ruling (planned for V1.3) |
| **C6** | The right sidebar's ChatGPT **cannot be embedded**: the site returns 403 + `x-frame-options: SAMEORIGIN` + a Cloudflare challenge ⇒ all it can do is **show the status honestly**; it is not a usable embedded panel | Users who want to use ChatGPT directly in the right panel | V1.2 ships it as an "honest launcher" (**it does not fake an embed**). That can only change once upstream opens up; V1.3 has shipped the browser surface (**the real-machine visible surface is unverified**), but it **still does not promise that embedding will succeed** |
| **C7** | The memory-tree canvas **node cap and truncation are real behaviour** (with many nodes it truncates and discards the part over budget) | Users with a large amount of memory | Measured behaviour, not a defect; V1.3 improves the canvas experience (**real-machine feel unverified**) |
| **C8** | In project context, the **L2 summary can be empty** (when that projection has no project archive file) — easily misread as "the injection did not work" | Users who created a project but have no archive file | By design, and the panel **honestly annotates** the reason; this is not a pipeline failure |
| **C9** | Two display issues that are easy to misread: ① **product version ≠ component version** (the interface shows only the product version; component versions are in the diagnostics panel) ② the `repoHint` of an installation that came from an older setup once pointed at an **old path that no longer exists** ⇒ this can make project-context injection silently fail to match (**unverified on a real machine**) | Users installing V1.2; ② only for the projects that were pointed at | ① By design; ② this release **pre-sets no projects at all** (the seed is empty), so a freshly installed user does not inherit old paths; if you imported an old configuration by hand, check it yourself |

---

## 4. Capabilities explicitly **not** in V1.2 (so you do not think they exist)

| Capability | Its real state in V1.2 |
|---|---|
| **Web Intelligence Layer** (fetching + browser engine + unified web tool routing + research space) | **Zero code**. Only a read-only pre-check and a frozen design |
| **Skill Router** (skill registry / routing / handoff protocol) | **Only a read-only drift-audit tool**; **the Router itself is not done** |
| **Human control-plane write channel** | **Not started** |
| **Topics** | **Not started**, and the upstream data source has no such semantics (only "a set of tool names") |
| **Archive Center** | **Does not exist in V1.2** — neither a unified aggregate view nor restore/delete entry points (what exists is project archiving and official sidebar session archiving). **Session restore is not done**: there is no official write path, and the interface honestly labels it "Archived · restore not currently offered by the official app", and **offers no delete either** |
| **A self-hosted option for phone remote control** | **The only path in V1.2 is the third-party plugin in A5** (enabled by default, pointing at the author's server); the self-hosted / LAN option is **not wired up** |
| **Voice input** | **Zero implementation**. The third-party voice plugin **does not carry an engine itself**, and there is no usable speech-recognition engine on the machine either ⇒ **it does not work on V1.2** |
| **The state "stopped by Quick Stop ≠ Failed"** | **Not done** (see B4) |
| **The first-party embedded browser surface proposal** | The proposal is archived, **waiting on upstream** |

---

## 5. Unverified items (**never misreported as passing**)

| Item | Status | Reason |
|---|---|---|
| Opening this build in a real desktop session and **confirming the interface with your own eyes** (including Quick Stop's pixels and feel) | **Unverified** | It needs a real-machine host restart and confirmation by the user personally; the install chain itself was verified in an isolated environment |
| Running on a version of DSH Desktop **other than** 2.0.5 | **Unverified** | No other version was available; always judged UNTESTED |
| **Upgrading from the previous public release (V1.1 → V1.2)** | **Unverified** | This release has **no evidence** covering that path; if you need guaranteed stability, **uninstall first and then do a clean install** |
| **Reproducible builds** of this release's four packages (rebuild from the release commit → byte-for-byte identical) | **Unverified** | The equivalent V1.1 conclusion does not apply to the packages newly added in V1.2; not measured |
| Long-run memory / performance, cold-start time, and the settle timing of the stop operation | Not measured / Unverified | No stress testing was done; these are real-machine acceptance items |
| Pixel-level conclusions such as the interruption purple dot | **Needs the user to confirm personally** | An automated suite cannot prove pixels or feel |
| **The Windows build (install / interface / uninstall / rollback)** | **Not part of the V1.2 release scope** | V1.2 **ships a macOS build only**; the Windows material in the repository is the previous release's experimental material and **has never been verified with V1.2's packages** — do not use it to install V1.2. See [INSTALL_WINDOWS_EXPERIMENTAL.md](../INSTALL_WINDOWS_EXPERIMENTAL.md) (currently Chinese-only) |

> **An honest statement about "all-green regression"**: the internal full regression at V1.2 freeze was **73 passed / 0 failed / 0 unverified**, but that run was in **non-strict mode**, and **35 of those items carried no assertion count** (that is, under that convention "ran 0 assertions" and "all passed" look identical). This is not a product defect, but it does determine why we **dare not overstate** the word "all-green": it is **an internal self-check passing**, which is not the same as **systematic acceptance being complete**.

---

## 6. Design trade-offs (not defects, but you should know)

1. **Component versions and the product version are two separate numbering schemes**: components `0.1.x` evolve independently (this release: sidebar `0.1.28` / workspace `0.1.25` / hud `0.1.3` / quickstop `0.1.1`), while the product is released by stage (V1.2). Seeing `0.1.x` does not mean "a very early version".
2. **Task supplement fields live on your machine** (localStorage) and do not enter the official task ledger: the official create/update accepts an exact whitelist of keys, and one extra key makes the whole request return 400. The cost is that these fields do not follow official data and do not sync across devices.
3. **For fields with no real source, the HUD shows `—`**, and never a placeholder name (unknown ≠ 0).
4. **The public build ships no pre-set projects or agents**: the first install starts from a blank state and you create them yourself.
5. **There is no "temporarily turn it off" switch**: either you use it, or you uninstall / roll back.
6. **No official or third-party artifact is modified**: this release hooks in only through official extension points (compatibility mode) and does not patch official code.

## 7. Product-level limitations

| ID | Limitation | What you will notice | Workaround |
|---|---|---|---|
| **KL-1** | Several official overlays (task board details, agent approval, cost details) are drawn inside the official `#root` context, so outside CSS cannot raise their stacking order | While the HUD/Inspector is expanded, the hover/details of a few official overlays can be covered | Collapse the HUD/Inspector temporarily. The real fix belongs upstream (portalizing those overlays) — **we do not patch the official DOM** |
| **KL-2** | The session list is capped at **5 visible rows** by default | "One or two sessions are missing from the list" is not data loss | Click "Expand" to see all of them |
| **KL-3** | An empty session appears in the list only while it is the **current** session (this follows the official visibility rule) | "I created a session but it is not in the list" is normal | Open it first from the "Recent" panel |
| **KL-4** | When the effective window width is too small (DevTools docked, for example), the shell collapses the sidebar into a narrow rail, and **the narrow rail does not render the session list** | You cannot see the session list in a narrow window | Widen the window or collapse DevTools |
| **KL-5** | The official code goes silent on several failure paths; **we are deliberately louder** | You may see errors that the official app would not show | This is intentional: better noisy than silently failing. Matching the official behavior exactly means waiting for an upstream change |
| **KL-8** | With debug explicitly enabled, the diagnostics overlay uses a very high `z-index` (a troubleshooting exception) | Only appears when you turn debug on yourself | Turn debug off and it is gone |

## 8. Legacy entries tied to an environment (not applicable to a fresh install)

| ID | Original record | What it means for a public installation |
|---|---|---|
| **KL-6** | A test session directory was once left on the development machine and could not be deleted | This release **deletes no session directory at all**; if your `~/.dsh/sessions` contains directories you no longer need, delete them inside the app |
| **KL-7** | Two acceptance-test keys (`dsh.acc.v1` / `dsh.acc.cleanup.v1`) were once left behind in browser storage on the development machine | A fresh install does not create these keys. The only key prefixes this release writes are `dsh.personal.*` and `dsh.dps.*` |

---

**One last word:** if all you want is to use it stably, install **V1.1**. If you want the most complete feature set and accept the issues above (they are planned to be fixed in **V1.3**), then install **V1.2**.
