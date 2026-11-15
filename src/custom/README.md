# `src/custom` — client override area

RAVsoft keeps one shared core on `main`. A client that needs a bespoke layout,
wording, approval step or integration gets its own branch:

```
main                        RAVsoft core
client/WS-LK-XXXXXXXX       one branch per installed client
```

## Rules

1. **Only edit this folder on a client branch.** Core files stay identical to
   `main`, so the next core release merges cleanly.
2. **One branch per installation.** The branch name uses the installation ID
   shown in Settings → Licence, for example `client/WS-LK-DEMO0001`.
3. **Keep the portal in sync.** Record the branch, tick *Custom build* and add a
   short customisation summary in the RAVsoft developer portal.
4. **Never put secrets here.** Use server-side environment variables for WAHA
   API keys, service-role keys and signing secrets.
5. **Prefer configuration over code.** If a change can be a setting, feature
   flag or `workshop_settings` field, do that instead of forking the UI.
6. **Core fixes go upstream.** If the change would help every client, open it
   against `main` first, then merge `main` into the client branch.

## Files

| File | Purpose |
| --- | --- |
| `index.ts` | `CLIENT_CUSTOMISATION` text/config values and `CLIENT_BUILD` metadata. |
| `README.md` | This branch and update guide. |

## Merge workflow

```bash
git checkout main
git pull --ff-only
git checkout client/WS-LK-XXXXXXXX
git merge main          # resolve only inside src/custom if possible
npm run build
```

After merging, update the portal release run and deploy through the client's
webhook. Database changes must be additive migrations; see
[`docs/UPDATE_WORKFLOW.md`](../../docs/UPDATE_WORKFLOW.md).