# Uninstall

```bash
cd dsh-personal-harness
bash scripts/uninstall.sh
```

Once you have uninstalled and restarted the host, the official UI should look the way it did before: the Personal Harness navigation and HUD are gone.

## Default behavior: plugins only, **not one line of your data**

The script runs `pnpm remove` for each of the three packages (inside the profile), then checks whether `node_modules/<package>` is really gone. Exit code `0` = everything removed, no leftovers; `2` = a plugin directory is still detectable after uninstall.

**No user data is deleted by default**: your sessions, tasks, workspaces and project data all live in official DSH storage. This distribution is only a reader — it owns none of it and does not clean it up on your behalf.

## `--purge-user-data`: deletes only the on-disk state this distribution wrote itself

```bash
bash scripts/uninstall.sh --purge-user-data
```

Before deleting anything it prints the **exact** list of what will go, and asks you to type uppercase `PURGE` to continue (anything else cancels it; the plugin uninstall still completes).

| Deleted | Notes |
|---|---|
| `$HOME/.dsh/guard-backups/personal-harness/` | Rollback points created by the install script |
| `$HOME/.dsh/cache/dsh-personal-*-public-v*.tgz` | Distribution packages put into the cache during install |
| `$HOME/.dsh/.personal/` | Deleted only if it exists; this distribution never writes this directory |

| **NOT** deleted | Notes |
|---|---|
| `$HOME/.dsh/profiles/desktop/node_modules/**` | Official plugins and other third-party plugins |
| `$HOME/.dsh/profiles/desktop/storages/**` | Session / task / workspace data |
| `$HOME/.dsh/sessions/**` | Session persistence directory |

`--purge-user-data` **does not** — and cannot — clear browser-side storage (that is the running app's localStorage). Project and task extra fields shown in the UI are yours to clean up inside the app: open the Personal Harness Inspector → "Reset local state", or delete entries one by one in the project/task views. The browser storage keys this distribution writes use the prefixes `dsh.personal.*` and `dsh.dps.*`.

## Windows (Experimental / Untested)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall.ps1 -PurgeUserData
```

The semantics match the macOS version (all user data kept by default; `-PurgeUserData` requires you to type `PURGE`, and its scope is only the rollback-point directory, this distribution's own package cache, and `%USERPROFILE%\.dsh\.personal`). **Windows is not verified** — see the INSTALL_WINDOWS_EXPERIMENTAL.md document in the repository root (currently Chinese-only).

## Coming back after uninstalling

Just run `bash scripts/install.sh` again. Uninstalling does not damage any official state, and reinstalling is idempotent (reinstalling never resets your data — see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) and the measured evidence in docs/PUBLIC_INSTALL_TEST_REPORT.md, which is currently Chinese-only).

## When uninstall fails

| Symptom | What to do |
|---|---|
| Exit code 2: the script still reports `.../node_modules/<package>` as present | Inside the profile, run `pnpm remove dsh-personal-sidebar dsh-personal-workspace dsh-personal-hud` by hand, then `pnpm install` |
| `pnpm` missing | Install pnpm first |
| DSH profile not found | Use `DSH_PROFILE=/path/to/profile bash scripts/uninstall.sh` |
| The UI looks unchanged after uninstall | Quit DSH Desktop completely with ⌘Q and reopen it (plugins are loaded at startup) |
