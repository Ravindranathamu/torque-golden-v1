# Golden master

The **golden master** is the clean installation template that every RAVBsoft
client server is cloned from. It contains the production schema and the global
reference lists the UI needs, and **no client data of any kind**.

> Never onboard a real workshop into the golden-master project. Clone a fresh
> Supabase project from it first, then run onboarding there.

## Live template

| Item | Value |
| --- | --- |
| Project | `ravsoft-golden-v1` |
| Ref | `nydlpgucdwaifgvgrlib` |
| Region | `ap-south-1` |
| Verified | 2026-11-18 |
| App version | `1.4.0` |
| Schema version | `0001-0007` |
| Tenant rows / auth users / storage objects | `0` / `0` / `0` |
| Sign-ups | disabled |

Verification results and the snapshot hash are recorded in
[`docs/DEPLOYMENT_PLAN.md` §3.7](DEPLOYMENT_PLAN.md#37-live-golden-master-record).

---

## What is included

| Layer | Included in the golden master |
| --- | --- |
| Schema | All tables, views, functions, triggers, RLS policies and storage buckets from migrations `0001`–`0007`. |
| Reference data | Expense and petty-cash categories, payment methods, service types, suggested vehicle makes, the Sri Lankan insurance directory, licence plans and release channels (`system_reference_data`). |
| Release registry | `developer_releases` with the current stable release and `developer_update_runs` for the portal. |
| Manifest | One `golden_master_manifest` row (`RAVSOFT-GM-V1`) recording schema, reference and app versions. |
| Verification | `golden_master_status()` and `assert_golden_master_clean()`. |

## What is excluded

The template must never contain:

- `workshops` rows (no company profile, branding, TIN, licence key or WhatsApp
  secrets)
- `profiles`, auth users, workers, attendance, staff loans or payslips
- customers, vehicles, check-ins, job cards, tasks, parts, estimates, insurance
  claims or bills
- inventory, suppliers, purchases, ledger entries, expenses, petty cash, cheques
  or notifications
- exported JSON backups or uploaded PDFs/photos

The demo workshop in `src/data/seed.ts` is a browser-only sample. It is not part
of the golden master and is never inserted into the database.

---

## Building the template

1. Create a new, empty Supabase project for the template.
2. Apply the migrations in order, either with the SQL editor or the CLI:

   ```bash
   supabase link --project-ref <template-project-ref>
   supabase db push
   ```

   The files are:

   | File | Purpose |
   | --- | --- |
   | `20261114000100_schema.sql` | Core ERP schema, RLS, views, public RPCs, storage. |
   | `20261114000200_golden_master.sql` | Global reference seeds, manifest, clean-state verification. |
   | `20261114000300_security_hardening.sql` | Audit log, private PDF buckets, owner-only WhatsApp secrets, database licence enforcement. |
   | `20261114000400_portal_releases.sql` | Latest-release registry, update-run ledger and portal RPCs. |
   | `20261114000500_app_records.sql` | Cloud app-records bridge for multi-device workshop data. |
   | `20261114000600_portal_security.sql` | Portal admin role helpers and admin-only RLS. |
   | `20261120000100_licence_pricing.sql` | Lite/Starter/Growth/Pro/Enterprise plans, per-client monthly fees and the RAVBsoft pricing reference. |

3. Run the verification script as the service role:

   ```bash
   psql "$SUPABASE_DB_URL" -f supabase/golden-master/verify.sql
   ```

4. Confirm `has_client_data` is `false` and the row counts are all `0`.
5. Take a database backup and store it as the golden-master snapshot.
6. If the template also hosts the RAVBsoft portal, keep the portal tables in a
   separate project. The client template does not need portal write access.

All migrations are additive and idempotent. Re-running them never overwrites
operator-customised reference values because the seeds use
`ON CONFLICT DO NOTHING`.

---

## Onboarding a client

1. **Clone** the golden-master database into a new Supabase project — one
   project per client, never a shared schema. The canonical clone is a replay
   of the verified migrations `0001`–`0007`; the `pg_dump` snapshot is for
   audit and disaster recovery. If you use a physical restore, re-run `0003`,
   `0004` and `0006` so the private PDF buckets, policies and release registry
   exist.
2. Set the client-specific environment variables:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, WhatsApp/WAHA values and the
   master licence URL.
3. Apply any migrations released after the snapshot, in order, before creating
   client data.
4. Create the owner auth user and call `public.create_workshop(...)` with that
   user's JWT. This is the first and only `workshops` row in that project.
5. Configure branding, printer routing, WAHA pairing, licence and modules in
   **Settings**.
6. Register the installation in the RAVBsoft portal with its installation ID,
   server address, software name, plan and Git branch.
7. Record the clone date and the app/reference versions in the portal notes.

Do **not** copy a client database into the template to "start from their data".
If a client needs a demo, use the browser demo (`npm run dev`) or a throwaway
project that is destroyed afterwards.

---

## Verification

`supabase/golden-master/verify.sql` checks:

- the manifest row exists and has `client_data_allowed = false`
- every reference category is present
- the tenant tables are empty
- `assert_golden_master_clean()` does not raise

Run it after every migration and before every snapshot. A template that fails
verification must not be published or cloned.

Useful manual queries:

```sql
select * from public.golden_master_status();
select key, category, jsonb_typeof(value) as value_type
  from public.system_reference_data
 order by category, key;
select * from public.v_latest_release;
```

`golden_master_status()` and `assert_golden_master_clean()` are executable only
by the service role. They are not exposed to `anon` or `authenticated`.

---

## Updating the template

1. Merge the release into `main` and run `npx tsc -b`, `npm run lint` and
   `npm run build`.
2. Add the new migration files to `supabase/migrations/` using the next number.
3. Apply them to the template database.
4. Bump `golden_master_manifest` values and update the reference version if the
   seed content changed:

   ```sql
   update public.golden_master_manifest
      set schema_version = '0001-0005',
          reference_version = 'gm-ref-YYYY-MM-DD',
          app_version = '1.5.0',
          notes = 'Golden master for release 1.5.0.'
    where id = 'RAVSOFT-GM-V1';

   insert into public.developer_releases (
     version, released_at, title, changes, migration_files, channel, is_latest, notes
   ) values (
     '1.5.0', current_date, 'Release title', 'What changed.',
     array['20261201000100_new_migration.sql'], 'Stable', true, 'Golden master updated.'
   );

   update public.developer_releases set is_latest = false where version <> '1.5.0';
   ```

5. Re-run `verify.sql`, take a fresh snapshot and deploy it to the portal's
   release registry.
6. Follow [`docs/UPDATE_WORKFLOW.md`](UPDATE_WORKFLOW.md) to roll the release
   out to existing clients.

---

## Checklist

- [ ] `golden_master_status()` reports zero client rows.
- [ ] `has_client_data` is `false`.
- [ ] `assert_golden_master_clean()` returns without error.
- [ ] All reference categories exist (`expense_categories`,
      `petty_cash_categories`, `payment_methods`, `service_types`,
      `vehicle_makes`, `insurance_companies_lk`, `licence_plans`,
      `release_channels`).
- [ ] One `developer_releases` row has `is_latest = true`.
- [ ] No auth users, storage objects or client PDFs exist.
- [ ] A fresh snapshot has been taken after the last migration.
- [ ] The manifest app version matches `LATEST_APP_VERSION` in the portal.