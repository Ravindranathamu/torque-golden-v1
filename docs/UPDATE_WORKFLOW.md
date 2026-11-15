# Client update workflow

RAVsoft ships one shared core on `main` and keeps each client isolated on its
own server and Git branch. Updates merge the core into the client branch, apply
additive database migrations and preserve every client row.

---

## Branch model

```
main                     RAVsoft core, shared by every installation
client/WS-LK-XXXXXXXX    one branch per installed client
```

| Branch | Contains |
| --- | --- |
| `main` | Core features, docs, migrations and `src/custom` with empty defaults. |
| `client/<installation-id>` | The same core plus client-specific changes inside `src/custom` and, only when unavoidable, a small, documented change elsewhere. |

Rules:

1. Branch names use the installation ID from **Settings → Licence**, for example
   `client/WS-LK-DEMO0001`.
2. Client changes live in [`src/custom`](../src/custom/README.md). Prefer a
   setting, feature flag or `workshop_settings` value over forking a core file.
3. Core fixes are merged into `main` first, then `main` is merged into each
   client branch.
4. Resolve conflicts inside `src/custom` whenever possible. If a core file must
   diverge, record why in the portal's customisation summary.
5. Never commit `.env`, licence signing keys, WAHA API keys or service-role keys
   to any branch.
6. The portal records the branch, a **Custom build** tick and a short
   customisation summary for support and update planning.

Typical merge:

```bash
git checkout main
git pull --ff-only
git checkout client/WS-LK-DEMO0001
git merge main
npm ci
npx tsc -b
npm run lint
npm run build
```

---

## Release registry

`supabase/migrations/20261114000400_portal_releases.sql` adds the shared registry:

| Object | Purpose |
| --- | --- |
| `developer_releases` | One row per version: date, title, changes, migration files, channel and `is_latest`. |
| `developer_update_runs` | One row per requested deployment: client, from/to version, status, webhook status, requester, data-preserved flag and timestamps. |
| `v_latest_release` | The single `is_latest` release. |
| `v_client_update_status` | Fleet view joining each installation to its latest update run. |
| `request_client_update(client_id, to_version)` | Queues a deployment and stamps `latest_version` on the client. |
| `record_client_update_result(run_id, status, detail)` | Records the webhook/deploy result and promotes `app_version` on success. |

Latest stable release in this repository: **1.4.0**. The hardcoded `RELEASES`
list in `src/pages/DeveloperPortal.tsx` mirrors the registry so the portal still
works offline.

Publishing a release:

1. Merge and test on `main`.
2. Add the next numbered migration under `supabase/migrations/`.
3. Insert the version into `developer_releases` with its migration files and set
   `is_latest = true`; clear `is_latest` on the previous version.
4. Update `LATEST_APP_VERSION` and `RELEASES` in the portal.
5. Update `golden_master_manifest` and take a fresh snapshot
   ([`docs/GOLDEN_MASTER.md`](GOLDEN_MASTER.md)).

Migration rules:

- Use `create table if not exists` and `add column if not exists`.
- Never drop or rename a column that may hold client data in the same release;
  add the new column, backfill, and remove the old one in a later release.
- Never truncate reference or tenant tables.
- Seeds use `on conflict do nothing`.
- Keep functions `create or replace`, and re-create policies with
  `drop policy if exists` first.
- Test the migration against a clone of a real client database, not only against
  a fresh golden master.

---

## Deploy webhook

Each portal client can store a `deploy_webhook_url`. **Deploy latest** sends:

```json
{
  "clientId": "WS-LK-DEMO0001",
  "software": "Torque ERP",
  "branch": "client/WS-LK-DEMO0001",
  "fromVersion": "1.3.1",
  "toVersion": "1.4.0",
  "strategy": "additive-migrations",
  "preserveClientData": true,
  "requestedAt": "2026-11-14T09:30:00.000Z"
}
```

The receiver should:

1. Authenticate the request (shared secret header or signed payload). The demo
   portal sends the JSON body only; add a signature at the edge for production.
2. Check `software` and `branch`, then fetch that branch.
3. Put the installation into maintenance/read-only mode.
4. Take a database backup or snapshot.
5. Apply the listed migrations in order with the service role.
6. Build and deploy the frontend.
7. Run smoke checks: login, licence state, one job card, one print template.
8. Exit maintenance mode and call
   `record_client_update_result(run_id, 'Deployed', detail)`.

Return a non-2xx status on any failure so the portal can mark the run `Failed`.
A receiver that cannot authenticate the request must reject it; the webhook is
an administrative endpoint, not a public one.

---

## Zero-data-loss update steps

Do these in order for every client:

1. **Verify the golden master** — `supabase/golden-master/verify.sql` must pass
   before the release is published.
2. **Back up** — snapshot the client database and copy storage buckets
   (`job-photos`, `branding`, `invoice-pdfs`, `payroll-pdfs`).
3. **Review the diff** — list new migrations and confirm each one is additive.
4. **Queue the run** — use **Deploy latest** in the portal, which records
   `fromVersion`, `toVersion`, branch and `data_preserved`.
5. **Apply migrations** — service role only; never run as `anon` or a staff JWT.
   The licence triggers bypass when `auth.uid() is null`, so support work is not
   blocked by an expired licence.
6. **Deploy the frontend** — build from the client branch, which already
   contains `main`.
7. **Smoke test** — check the custom build badge, one invoice, one estimate, one
   thermal receipt and the licence screen.
8. **Record the result** — `record_client_update_result(..., 'Deployed', ...)`
   updates `app_version` and `last_deployed_at`.
9. **Keep the backup** until the client confirms normal operation.

`preserveClientData` is always `true` for a normal release. An update must never
delete workshops, users, jobs, bills, stock, ledgers, PDFs or audit rows.

---

## Rollback

If a release fails:

1. Call `record_client_update_result(run_id, 'Rolled Back', reason)`.
2. Restore the frontend from the previous tag/build.
3. Restore the database snapshot only if a migration changed data. Because
   migrations are additive, a code rollback usually needs no database rollback.
4. Leave additive columns and tables in place; the older frontend ignores them.
5. Fix forward on `main`, merge into the client branch and queue a new run.

Never attempt a destructive down-migration on a live client. Additive changes
are safe to keep, and removing them later is a separate, reviewed release.

---

## Audit and support

`20261114000300_security_hardening.sql` adds `audit_log` with owner-only reads. Every
insert, update and delete on workshops, profiles, job cards, parts, ledger,
advances, payslips, wages, petty cash, credits, purchases and WhatsApp secrets is
recorded. `license_key` and `waha_api_key` are redacted before writing.

Useful checks:

```sql
select * from public.v_latest_release;
select * from public.v_client_update_status order by workshop_name;
select * from public.developer_update_runs order by requested_at desc limit 20;
select * from public.audit_log where workshop_id = '<uuid>' order by created_at desc limit 50;
```

Audit retention is trimmed only by the service role:

```sql
select public.trim_audit_log(365);
```

---

## Checklist

- [ ] `main` builds: `npx tsc -b`, `npm run lint`, `npm run build`.
- [ ] Migration numbers are sequential and additive.
- [ ] `developer_releases` has one `is_latest = true` row.
- [ ] `LATEST_APP_VERSION` and `RELEASES` match the registry.
- [ ] Client branch merged from `main`, conflicts limited to `src/custom`.
- [ ] Portal shows the correct branch, custom-build badge and summary.
- [ ] Backup and storage copy completed.
- [ ] Update run recorded as `Deployed`.
- [ ] Client confirmed login, billing, printing and WhatsApp after the update.