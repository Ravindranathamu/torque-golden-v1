# Golden master SQL

This folder holds the clean-template verification for the RAVsoft golden master.

| File | Purpose |
| --- | --- |
| `verify.sql` | Fails if the template contains client rows, is missing reference seeds, has no manifest or has more than one latest release. |

Run it with the service role after applying migrations `0001`–`0004` and before
taking a snapshot:

```bash
psql "$SUPABASE_DB_URL" -f supabase/golden-master/verify.sql
```

The script raises an exception on the first failed check, so `psql` exits
non-zero and a CI job can stop the release. Re-running it is safe.

The manifest row is `golden_master_manifest.id = 'RAVSOFT-GM-V1'`. Keep
`client_data_allowed = false` and update the schema, reference and app versions
whenever the template changes.

See [`docs/GOLDEN_MASTER.md`](../../docs/GOLDEN_MASTER.md) for the full template,
onboarding and update procedure.