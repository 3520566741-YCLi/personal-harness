# Known Limitations

**Read this page first.** Every item below is a **logged fact**, not a "probably fine." This release installs, uninstalls and rolls back, but the limitations below are unfixed: some are imposed by upstream, some we keep on purpose.

## Product-level limitations

| ID | Limitation | What you will notice | Workaround |
|---|---|---|---|
| **KL-1** | Several official overlays (task board details, agent approval, cost details) are drawn inside the official `#root` context, so outside CSS cannot raise their stacking order; official Tooltips are not portaled either | While the bottom HUD/Inspector is expanded, the hover/details of a few official overlays can be covered | Collapse the HUD/Inspector temporarily. The real fix belongs upstream (portalizing those overlays) — **we do not patch the official DOM** |
| **KL-2** | The session list is capped at **5 visible rows** by default | "One or two sessions are missing from the list" is not data loss | Click "Expand" to see all of them |
| **KL-3** | An empty session (one you have not spoken in yet) appears in the list only while it is the **current** session (this follows the official visibility rule verbatim) | "I created a session but it is not in the list" is normal | Open it first from the "Recent" panel |
| **KL-4** | When the effective window width is too small (DevTools docked, for example), the shell collapses the sidebar into a narrow rail, and **the narrow rail does not render the session list** | You cannot see the session list in a narrow window | Widen the window or collapse DevTools |
| **KL-5** | The official code goes silent on several failure paths (a failed fork is a bare `.catch(()=>{})`, a failed archive only does `console.warn`); **we are deliberately louder** | You may see errors that the official app would not show | This is intentional: better noisy than silently failing. Matching the official behavior exactly means waiting for an upstream change |
| **KL-8** | With debug explicitly enabled (`dps.debug=1`), the diagnostics overlay uses a very high `z-index` (a troubleshooting exception) | Only appears when you turn debug on yourself | Turn debug off and it is gone |

## Legacy entries tied to an environment (not applicable to a fresh install)

The two entries below come from an internal development machine. They are **on the record, but they are not the behavior of this release**, and we list them as they are:

| ID | Original record | What it means for a public installation |
|---|---|---|
| **KL-6** | One leftover test session directory (about 23 KB) on an internal development machine could not be deleted inside the sandbox | This release **deletes no session directory at all**; if your `~/.dsh/sessions` contains directories you no longer need, delete them inside the app |
| **KL-7** | Two acceptance-test keys (`dsh.acc.v1` / `dsh.acc.cleanup.v1`) were left behind in browser storage on an internal development machine | A fresh install does not create these keys. The only key prefixes this release writes are `dsh.personal.*` and `dsh.dps.*` |

## Unverified items (**not to be reported as passing**)

| Item | Status | Reason |
|---|---|---|
| Open the public build in a real desktop session and confirm the interface visually | **Not verified** | Would require restarting the host on a real machine; not performed for this release. The install path itself was fully verified in an isolated environment |
| Running on any version other than DSH Desktop 2.0.5 | **Not verified** | No other version was available; always judged UNTESTED and requires explicit confirmation |
| Upgrading from a previous public release | **N/A** | This is the first public release, so no previous public release exists (this is not a PASS, it is not applicable) |
| Long-run memory / performance behavior | Not measured | No stress testing was done |
| Cold-start time, and the settle timing of the stop operation | Not verified | These are internal real-machine acceptance items and were not covered by this release |
| **Windows build (install / interface / uninstall / rollback)** | **Not verified** | This release had no real Windows environment. The Windows scripts only passed "PowerShell 7 syntax parsing plus a logic dry run in a non-Windows environment (PASS 27 / FAIL 0)", which **does not prove that Windows works**; the risk list is in docs/WINDOWS_EXPERIMENTAL_STATUS.md (currently Chinese-only) |

## Design trade-offs (not defects, but you should know)

1. **Component versions and the product version are two separate numbering schemes**: components live at `0.1.x` (sidebar 0.1.24 / workspace 0.1.20 / hud 0.1.3) and evolve independently, while the product is released by stage (V1.1). Seeing `0.1.24` does not mean "a very early version."
2. **Task supplement fields live on your machine** (localStorage) and do not enter the official task ledger: the official create/update accepts an exact whitelist of keys, and one extra key makes the whole request return 400. The cost is that these fields do not follow official data and do not sync across devices.
3. **For fields with no real source, the HUD shows `—`** and never a placeholder name (unknown ≠ 0).
4. **The public build ships no pre-set projects or agents**: the first install starts from a blank state and you create them yourself.
5. **There is no "temporarily turn it off" switch**: either you use it, or you uninstall/roll back.
6. **The narrow rail does not render the session list** (same as KL-4): that is the trade-off for coexisting with the official layout.
