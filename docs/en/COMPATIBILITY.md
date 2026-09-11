# Compatibility

## How the verdict is decided

The install script and `npm run compat` share one decision logic (the same constant, `TESTED = 2.0.5`):

| Your local DSH Desktop version | Verdict | Behavior |
|---|---|---|
| **2.0.5** | **SUPPORTED** — macOS + DSH Desktop 2.0.5 only; this is the only scope this release was actually verified on and it is not a claim about any other platform or version | Install directly |
| Other 2.x versions | **UNTESTED** | **Silent install is refused**; `install.sh` exits with code 1 and points you to `--allow-untested` |
| 1.x or earlier | **INCOMPATIBLE** | Refused unless you pass `--force` explicitly |
| App bundle not detectable (but a profile exists) | **UNTESTED** | Same as above: you need `--allow-untested` or `--force` |

```bash
node scripts/compat-check.mjs          # human-readable
node scripts/compat-check.mjs --json   # machine-readable
```

Exit codes: `0` SUPPORTED | `3` UNTESTED | `4` INCOMPATIBLE | `1` environment error. These are the verdict labels `scripts/compat-check.mjs` uses; a label never turns an unverified target into a passing one.

## Why other 2.x versions also count as UNTESTED

The plugins depend on official extension points (slot injection, the official client/ui/api services, `cordis.patch.yml` declarations). Minor releases inside 2.x can change those contracts, and **we have not run real-device verification on those versions**. This project's rule is **unknown ≠ pass**. So the verdict is UNTESTED and you have to confirm explicitly, instead of us assuming "it probably works fine".

Want to try an unverified version? Run `--dry-run` first to see the actions, then `--allow-untested`. If the UI misbehaves afterwards, a rollback is one command (see [ROLLBACK.md](ROLLBACK.md)).

## Windows: Experimental / untested

| Platform | Status | Notes |
|---|---|---|
| **Windows 10 / 11** | **Experimental / untested** | `scripts/windows/*.ps1` are provided; **this release has never been verified in a real Windows environment**. The Windows host version cannot be read reliably → the verdict is always UNTESTED, and you must pass `-AllowUntested` explicitly to continue |

**Windows is not a SUPPORTED platform**, and no document may describe it as supported. All three PowerShell scripts print the full warning block on every run; the verification boundary and the risk list are in docs/WINDOWS_EXPERIMENTAL_STATUS.md (currently Chinese-only).

## Measured environment (this release)

| Item | Value |
|---|---|
| Host | DSH Desktop **2.0.5** @ `/Applications/DSH Desktop.app` |
| Host integration | compatibility mode — **zero patches to official code** (all three plugins hook in through official extension points) |
| OS | macOS |
| Node.js | ≥ 20 (24.16.0 used for this build/test run) |
| pnpm | used for profile dependency management (11.8.0 in this run) |
| Components | sidebar 0.1.24 / workspace 0.1.20 / hud 0.1.3 |

## How far the coverage goes (honest accounting)

| Verified | Evidence |
|---|---|
| Full install → reinstall (idempotent) → compatibility gate → uninstall → rollback in an **isolated synthetic profile**; 22 assertions, all passed | docs/PUBLIC_INSTALL_TEST_REPORT.md (currently Chinese-only) |
| 57 artifact contract tests (57 under each of the two `NODE_ENV` settings) | `npm run test` |
| After install, `client.js` inside the profile is **byte-for-byte identical** to the distribution package | `install.sh` step 7 / `npm run verify` |
| Distribution package sha256 matches `manifest.json` | `npm run verify` |

| **Not verified** (never reported as passing) | Notes |
|---|---|
| Opening the public build in a **real desktop session** and confirming the UI by eye | Requires restarting the host on real hardware; not performed for this release (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)) |
| Running on any host version other than 2.0.5 | No device and no such version available; the verdict is always UNTESTED |
| **Every part of Windows** (install / UI / uninstall / rollback) | No Windows environment here; only PowerShell syntax parsing plus a logic drill run on a non-Windows machine — that does not prove how it behaves on Windows (see docs/WINDOWS_EXPERIMENTAL_STATUS.md, currently Chinese-only) |
| Upgrading from "the previous public release" | This is the **first** public release, so there is no previous public release to upgrade from → this test item is N/A (not PASS) |
| Memory / performance under long-running use | Not measured |
