# Privacy

In one sentence: **this release has no server, no account and no telemetry, sends no data, and does not read files unrelated to the workbench.**

## What it reads and writes

| Location | Read | Write | Notes |
|---|---|---|---|
| `$HOME/.dsh/profiles/desktop/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | ✓ | ✓ (during install/uninstall/rollback) | Declares the `file:` dependencies of the three plugins; backed up automatically before writing |
| `$HOME/.dsh/profiles/desktop/node_modules/` | ✓ | ✓ | pnpm installs/removes the plugin packages |
| `$HOME/.dsh/cache/` | ✓ | ✓ | Install places the release `.tgz` files here |
| `$HOME/.dsh/guard-backups/personal-harness/` | ✓ | ✓ | Rollback points (`--purge-user-data` deletes this whole directory) |
| Official DSH storage (sessions / tasks / workspaces) | ✓ read-only | ✗ | Read and displayed through official services injected by the host; **we never use official write APIs to change your data** |
| Browser localStorage (key prefixes `dsh.personal.*` / `dsh.dps.*`) | ✓ | ✓ | Project-level and task supplement fields (due date / deliverables / constraints / notes) stay on your machine |

**Not read**: `~/.ssh`, the keychain, browser cookies / history, personal files outside `~/.dsh`, or credentials in any environment variable.

## What it does not do

- **Makes no network requests**: the plugin code contains no fetch/XHR to any self-hosted endpoint; all data access goes through official services injected by the host.
- **No telemetry / no analytics / no crash reporting**.
- **No account and no API key required**: this release contains no model-calling logic; the AI capability comes from the DSH Desktop host.
- **Uploads nothing**: this project has no backend.

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

## Feedback

If you find any privacy problem (for example, something that still contains information identifying an individual), please open an issue; **do not** keep distributing that version until it is fixed.
