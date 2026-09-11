# Rollback

A rollback restores the DSH profile's **manifest files** to the state captured at a rollback point, and then has pnpm recompute the dependency tree from that manifest. It does not touch user data.

## Where rollback points come from

`scripts/install.sh` creates a rollback point automatically before every install:

```
$HOME/.dsh/guard-backups/personal-harness/<YYYYMMDD-HHMMSS>/
├── package.json            plugin manifest as it was before install
├── pnpm-lock.yaml          lockfile as it was before install (if one existed)
├── pnpm-workspace.yaml     workspace config as it was before install (if it existed)
├── cordis.yml / cordis.patch.yml   host config as it was before install (if it existed)
└── installed-before.json   dsh-personal-* packages already installed, with versions (including the "none" case)
```

If any step of the install fails, `install.sh` restores that rollback point **automatically** and exits with code 2.

## Usage

```bash
bash scripts/rollback.sh              # use the most recent rollback point
bash scripts/rollback.sh --list       # list every rollback point (newest first)
bash scripts/rollback.sh <backup-dir>    # pick a rollback point (absolute path)
DSH_PROFILE=/path/to/profile bash scripts/rollback.sh
```

Exit codes: `0` success | `1` environment error (rollback point / profile / pnpm not found) | `2` manifest restored but `pnpm install` failed

## What it does / does not do

| Does | Notes |
|---|---|
| Restores `package.json` | Declares the state as of the rollback point (may include older plugin versions, or no Personal Harness at all) |
| Restores `pnpm-lock.yaml` / `pnpm-workspace.yaml` | Only if those two files are in the rollback point; if not, they are left as they are and the script says so explicitly |
| Runs `pnpm install` | Recomputes `node_modules` from the restored manifest |
| **Saves your current state first** | The rollback itself first stores your "current" state in `<timestamp>-before-rollback/`, so a rollback you did not want can be rolled back again |

| Does not | Notes |
|---|---|
| Touch user data | Sessions / tasks / projects / workspaces are never touched |
| Delete your projects | Browser-side `dsh.personal.*` state is not rolled back (it is not part of the profile manifest) |
| Need sudo | Everything is written inside your `$HOME` only |

## Windows (Experimental / Untested)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1 -List
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback.ps1
```

Rollback points live in `%USERPROFILE%\.dsh\guard-backups\personal-harness\<timestamp>\`, and before rolling back the script likewise saves the "current" state as `<timestamp>-before-rollback`. **Windows is not verified** — see the INSTALL_WINDOWS_EXPERIMENTAL.md document in the repository root (currently Chinese-only).

## After a rollback

**Quit DSH Desktop completely (⌘Q) and reopen it**, then confirm the UI matches the state of that rollback point.

If the result is not what you expected, roll back once more using the `...-before-rollback` directory the script printed at the end.

## Common scenarios

| Scenario | What to do |
|---|---|
| You installed it and the UI looks wrong | `bash scripts/rollback.sh` (back to the pre-install state), then report it |
| You want to go back to an earlier point | `bash scripts/rollback.sh --list`, pick a directory and pass it as the argument |
| There is **no** rollback point (you installed with `--no-backup`) | Manual only: `pnpm remove dsh-personal-sidebar dsh-personal-workspace dsh-personal-hud` (equivalent to uninstalling) |
| You only want to switch it off temporarily instead of uninstalling | There is no on/off switch today; use uninstall or rollback (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)) |
