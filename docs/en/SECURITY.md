# Security

## Trust model

Personal Harness runs **on your own machine, inside your own DSH Desktop profile**, with your user identity. It has no privilege-escalation design:

- **Never sudo**: the install/uninstall/rollback scripts write only to `$HOME` from start to finish. The scripts contain no `sudo`, no `chmod +s`, and do not modify the official application bundle.
- **No changes to official code**: all three plugins attach through official extension points (slots, the official client/ui/api services, `cordis.patch.yml` declarations), with zero patches to the host code. Uninstalling or rolling back therefore leaves no "broken official files" behind.
- **No changes to official data**: we never call official write APIs to modify your sessions or tasks; we only read and render them.
- **Local file-based installation**: `pnpm add file:...tgz`, no npm registry, no network, no token.
- **Verification before install**: `install.sh` first checks the sha256 of the three packages against `manifest.json` + `checksums.sha256`, then installs; after installation it compares `client.js` inside the profile byte for byte.

## Data flow

```
this repo's packages/*.tgz  ──pnpm add file:──▶  $HOME/.dsh/profiles/desktop/node_modules/
                                                       │  loaded when the host starts
                                                       ▼
                                     official extension points (slots / official services) ◀── three plugins (local JS)
                                                       │
                                                       ▼
                                     official storage (sessions / tasks / workspaces) — read-only
```

No edge in this diagram points to an external network. There is no server built by this project.

## Permissions and attack surface

| Item | Notes |
|---|---|
| Network | The plugins make no self-hosted network requests at runtime |
| File system | Reads and writes only the paths in the table above; does not walk `$HOME` |
| Credentials | Does not read, store or forward any API key / cookie / token. The repository contains no `.env`, and `.gitignore` already ignores the usual credential filenames |
| Code execution | The plugins run inside the host renderer process with ordinary JS privileges — this is an inherent premise of the DSH plugin model: **installing any third-party plugin means trusting its author**. So install only `.tgz` files whose source you trust |
| Supply chain | The sha256 of the pre-packaged `.tgz` files is recorded in `manifest.json` and `checksums.sha256`; if you want full control, build from source with `npm run build && npm run package` |

## Known non-security deviations (intentional, on the record)

**The official code stays silent on some failure paths; we are louder in a few places (extra logs / extra thrown errors).** This is a deliberate visibility improvement (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), KL-5): when something goes wrong we would rather you knew than that it failed silently. It introduces no new external access — it only affects how many logs and notices you see.

## Reporting a vulnerability

Please report through the repository's issues, and include: the version (`npm run compat` output), your DSH Desktop version, reproduction steps, and the expected versus actual result.

**Please do not** paste your private data into a public issue (session content, tokens, absolute paths). If you need to share logs, remove the personal content from them first.

If you find an issue of the kind "this release may read or send out your data," **stop using it immediately** and roll back with [ROLLBACK.md](ROLLBACK.md). This boundary is non-negotiable.
