# Install on macOS (INSTALL_MACOS)

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
4. After cloning this repository, run the install script **for your platform** (macOS: `scripts/install.sh`; Windows: `scripts/windows/install.ps1`, but note that the **Windows material is not part of the V1.2 release** — see the note at the top of this page);
5. The script installs the four `.tgz` packages into **your DSH Desktop profile** (by default `~/.dsh/profiles/desktop`);
6. You must then **fully quit and restart DSH Desktop** (⌘Q, a real quit — not minimising). Plugins are only loaded when the host starts;
7. **Running the Harness Web UI in a browser on its own is not a verified install path** for this release; this release verifies the "DSH Desktop loads local plugins" path.

Not sure where to start after installing? Read the [Feature Guide](FEATURE_GUIDE.md) (what each entry point is for, when to use it, what it does not do).

```text
Verified: macOS + DSH Desktop 2.0.5
```

> **This is the macOS release**: Personal Harness **V1.2** (release tag `public-v1.2`); only the macOS build is shipped this time. The Windows scripts and documents kept in this repository are **not part of this release** and must not be used to install this version's packages (see the note at the top of [INSTALL_WINDOWS_EXPERIMENTAL.md](../../INSTALL_WINDOWS_EXPERIMENTAL.md), currently Chinese-only).

## Requirements

| Requirement | Needed | If it is missing |
|---|---|---|
| Operating system | macOS (only macOS has been verified) | The script only reports "result unknown"; it does not block |
| DSH Desktop | **2.0.5**, installed and started at least once | The verdict is UNTESTED / INCOMPATIBLE and it **will not install silently** (see the Compatibility guide) |
| Node.js | ≥ 20 | `install.sh` exits immediately (exit code 1) and tells you Node is missing |
| pnpm | any recent version (DSH Desktop uses it to manage profile plugins) | `install.sh` exits immediately and tells you to install pnpm first |
| Disk space | about 6 MB (four packages plus cache) | — |

Not required: administrator rights (**the script never uses sudo**), no changes to the official DSH installation directory, and no network access (the install stage works entirely from local files).

## One-command install

### Recommended: let an AI install it for you (it reads the docs, you approve)

> Send your AI **one you trust, which can reach your computer's terminal**, the link to this repository, and let it read this document, then help you download, check prerequisites, create a backup and install.
> Installing manually works too, but you have to run every command yourself and it is easy to miss a step.

You can send it the text below together with the repository address:

```text
This is an open-source repository I'm giving you: <repository address>
Please read README_EN.md and docs/en/INSTALL_MACOS.md in full first, then:
1) Check my machine against the "Requirements" table item by item: macOS, whether DSH Desktop 2.0.5 is installed and starts, Node.js >= 20, and whether pnpm is available;
2) Tell me clearly which profile directory this will modify (default ~/.dsh/profiles/desktop) and where the backup (rollback point) will go;
3) Run bash scripts/install.sh --dry-run first and show me what it plans to do;
4) After I confirm, run the real install;
5) When it is done, remind me to fully quit (Cmd+Q) and reopen DSH Desktop;
6) Show me the full output of every step; if something fails, stop and explain why instead of working around the compatibility gate.
```

Why this is recommended: there are not many commands, but **missing one step makes people conclude "the plugin doesn't work"** — the most common cause is not restarting the host.

Boundaries (please align on all of them):

- The AI **must have access to your local terminal** to download and install for you; if it cannot, it can only hand you a command list to run yourself;
- The AI should check DSH Desktop, Node.js and pnpm **before** installing, state **which profile will be modified** and **where the backup goes**, and then **wait for your confirmation**;
- After installing it should remind you to **fully quit and restart DSH Desktop**;
- Backups, installation and any system permission prompts are still **yours to confirm**;
- **Running the Harness Web UI in a browser on its own is not a verified install path** (this release verifies "DSH Desktop loads local plugins").

### Manual install

```bash
git clone <the address of this repository> dsh-personal-harness
cd dsh-personal-harness
bash scripts/install.sh --dry-run   # see what it plans to do first (a real dry run: no directories, no copies, no installs)
bash scripts/install.sh
```

The script does seven things in order; any failed step reports a clear error:

1. **Platform check** — macOS / node / pnpm present
2. **Locate the profile** — default `$HOME/.dsh/profiles/desktop`, overridable with `DSH_PROFILE=/path/to/profile`; it must contain `package.json`
3. **Compatibility gate** — reads the DSH Desktop version and prints a SUPPORTED / UNTESTED / INCOMPATIBLE verdict. UNTESTED requires an explicit `--allow-untested`, INCOMPATIBLE requires `--force`
4. **Artifact integrity** — checks the sha256 of the four `.tgz` files against `manifest.json` + `checksums.sha256` (catches a corrupted or substituted download)
5. **Create a rollback point** — backs up the profile's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `cordis*.yml`, and records which `dsh-personal-*` packages were installed before into `installed-before.json`
6. **Install** — copies `packages/*.tgz` into `$HOME/.dsh/cache/`, then runs `pnpm add file:$HOME/.dsh/cache/<package>-public-v1.2.tgz` inside the profile
   (the script **discovers `packages/*.tgz` automatically**; all four packages are installed and no package names or version arguments are needed)
7. **Byte-for-byte check** — compares `node_modules/<package>/client.js` in the profile against the sha256 recorded in `manifest.json`; a mismatch is an error and it tells you to roll back

On success the output prints the **absolute path of the rollback point** — keep a copy of it.

One last step is manual and unavoidable: **fully quit DSH Desktop (⌘Q) and open it again.** Plugins load only when the host starts, so a hot reload will not show them.

What you should see afterwards:

- **On the left**, a new group of Personal Harness navigation entries: **New Task (＋) / Home / Projects / Workspaces / Recent / Conversations** (plus a "back to the official conversation browser" button that returns you to the official interface at any time);
- **In the centre**, pages for Home, New Task, the **Task Board**, Projects, project details, Workspaces and so on (the Task Board is a centre-area page, reached for example from a task row on Home);
- **At the bottom**, a HUD status bar (with a collapsible diagnostics panel).

If you already have a common third-party task-board plugin installed, this layer shows a **real "needs attention" count badge** on its existing "Task Board" entry row — it does **not** rename, remove or take over that entry.

What each entry point is actually for, and when to use it: [Feature Guide](FEATURE_GUIDE.md).

## Options

```bash
bash scripts/install.sh --allow-untested   # continue when the host version is not 2.0.5 (but is still 2.x)
bash scripts/install.sh --force            # ignore the compatibility verdict (including 1.x: strongly discouraged)
bash scripts/install.sh --dry-run          # only print what would happen; write nothing to the profile
bash scripts/install.sh --no-backup        # skip the rollback point (not recommended: no automatic rollback on failure)
DSH_PROFILE=/path/to/profile bash scripts/install.sh
```

Exit codes: `0` success | `1` environment or compatibility refusal | `2` install failed (the script already attempted an automatic rollback)

## If the install fails

| Symptom | What to do |
|---|---|
| `Compatibility: UNTESTED` and it exits | This is deliberate (no silent installs). Once you have confirmed the host is 2.x, add `--allow-untested` |
| `Release package verification failed` | Clone again, or run `npm run verify` to see which package hash does not match |
| A step fails and the output says "rolled back" | The profile has been restored to its pre-install state; send the full output to the author |
| Install succeeded but the interface did not change | 99% of the time the host was not restarted: fully quit with ⌘Q and open it again. If it still does not change, run `bash scripts/rollback.sh` and report back |
| You want to look before you leap | Use `--dry-run` to see the complete list of actions |

## Building from source (optional)

The pre-packaged `.tgz` files were fully verified for this release, so you can normally just use them. If you want to build yourself:

```bash
npm install            # build-time dependencies only (esbuild / jsdom); not part of the released artifacts
npm run build          # esbuild bundles for each of the four plugins (includes build:quickstop)
npm run package        # regenerate packages/*.tgz, manifest.json, checksums.sha256 and VERSION
npm run verify         # self-check: hashes / install consistency / no private data
npm run test           # artifact contract tests (71 checks, four packages)
```

Two extra notes:

- To only **verify** the packages shipped in the repository after cloning, you do not need to build first: when `src/workstation/*/build/` is missing, `npm run verify` / `npm test` restore the bundles from `packages/*.tgz` and check them byte for byte against the sha256 values in `manifest.json`.
- Rebuilding embeds **the short hash of the current HEAD** into the artifacts. The claim that "rebuilding on the release commit produces a `client.js` **byte-identical** to the released one" was **measured on the V1.1 public artifacts**; **it was not re-measured for the four V1.2 packages (unverified)** — `npm run verify` only tells you whether the artifacts are self-consistent, which is not the same as a local rebuild comparison. If you add your own commits on top of the release commit, the embedded short hash changes and `client.js` will differ from the release in exactly that one place.

Installing a custom build:

```bash
bash scripts/install.sh    # verifies your freshly generated manifest/checksums first, then installs
```

## Manual install (without the script)

```bash
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$HOME/.dsh/cache"
cp packages/*.tgz "$HOME/.dsh/cache/"
cd "$PROFILE"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-sidebar-0.1.28-public-v1.2.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-workspace-0.1.25-public-v1.2.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-hud-0.1.3-public-v1.2.tgz"
pnpm add file:"$HOME/.dsh/cache/dsh-personal-quickstop-0.1.1-public-v1.2.tgz"
```

All four packages are required (missing any one means that part of the interface will not appear): `sidebar` 0.1.28 / `workspace` 0.1.25 / `hud` 0.1.3 / `quickstop` 0.1.1 (new in this version).

A manual install has no rollback point and no byte-for-byte check. If something goes wrong, make sure you have your own backup of the profile's `package.json` before trying `bash scripts/rollback.sh`.
