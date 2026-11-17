# RAVsoft deployment plan

**Scope:** deploy the RAVsoft developer portal first, then the clean golden-master
template, then the first isolated client installation — each on its own server
and Supabase project — and wire them together.

**Rule:** one Supabase project per client. The portal, the golden master and
every client live in separate projects. Never share a schema, auth users,
storage buckets or WhatsApp session between installations.

---

## Read this first — production gates

The code-level fixes for G1–G7 are implemented in this build. A gate is only
**closed for a deployment** after its live check passes against the real
Supabase project; this workspace has no project credentials, so the checks
below are the remaining cutover work.

| Gate | Code status | What changed | Live check before cutover |
| --- | --- | --- | --- |
| **G1 — Supabase app data adapter** | Closed in code | `app_records` bridge (`20261114000500_app_records.sql`), `src/lib/cloudStore.ts`, `src/state/useCloudSync.ts`, cloud sign-in on `/login`, provisioning guard on `/setup`. Demo mode still uses `localStorage` when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are blank. | Sign in on two devices; create a job on one and confirm it appears on the other. Go offline, edit, reconnect, confirm the queue flushes. |
| **G2 — Portal admin security** | Closed in code | `20261114000600_portal_security.sql` removes anon access, adds `is_portal_admin()` policies and admin wrappers. The portal signs in with Supabase Auth and writes with the session JWT. | With the anon key, `select * from developer_client_installations` must fail or return nothing. A non-admin Auth user must be rejected. An admin must read and write. |
| **G3 — Installation ID match** | Closed in code | The registration form accepts the app's ID; `portal_change_installation_id` repoints payments and update runs. | Copy the ID from the client **Settings → Licence**, register it, then confirm `poll_workshop_license` returns the plan and expiry. |
| **G4 — Update audit wiring** | Closed in code | **Deploy latest** calls `portal_request_client_update` first, fires the webhook with the run ID, then calls `portal_record_client_update_result`; only `Deployed` promotes `app_version`. | Deploy a test client and confirm one `developer_update_runs` row, then confirm `app_version` changes only after `Deployed`. |
| **G5 — CLI migration names** | Closed | All six migrations use `<14-digit timestamp>_name.sql`; `supabase db push` is now a first-class option (§2.2). | `supabase_migrations.schema_migrations` shows six rows ending in `20261114000600`. |
| **G6 — Git remote** | Closed locally | The workspace is a Git repository with an initial commit. | Add the private remote and push `main`: `git remote add origin <url>` then `git push -u origin main`. |
| **G7 — PWA shortcut** | Closed | `public/manifest.webmanifest` opens `/check-in`, which resolves the signed-in or configured workshop slug. | Install the PWA and confirm the shortcut lands on the client's check-in form. |

> **Pilot rule:** until every live check above passes, a deployment is a
> **private pilot**. Keep demo mode on and do not enter real customer data.

**Execution order at a glance:**

1. **Portal:** new Supabase project → migrations → portal build → release `1.4.0`.
2. **Golden master:** new Supabase project → migrations → `verify.sql` → snapshot → tag.
3. **First client:** new Supabase project → migrations → owner + workshop →
   client build → branch → WAHA → portal registration → licence poll →
   recorded deploy → verification.

---

## 0. Target topology

### 0.1 Server map

| Component | RAVsoft server | Golden-master server | First client server |
| --- | --- | --- | --- |
| Frontend | `https://portal.ravsoft.lk` | none | `https://erp.<client-domain>` |
| Supabase project | `ravsoft-portal-prod` | `ravsoft-golden-v1` | `ravsoft-client-<shortcode>` |
| Database / Auth / Storage | Portal only | Clean template only | Client only |
| WhatsApp | none | none | `https://waha.<client-domain>` |
| Deploy receiver | `https://deploy.ravsoft.lk` | none | none |
| DNS | Cloudflare | none | Cloudflare |

Three separate Supabase projects are required. Check your Supabase plan's
active-project limit before starting; a free organisation may not allow portal +
golden + client at the same time.

### 0.2 What lives where

| Data | Lives in | Backed up by |
| --- | --- | --- |
| Workshops, jobs, invoices, stock, payroll, audit rows | Client Supabase | Client database backup |
| Job photos and PDFs | Client storage buckets | Client storage backup |
| Licence status, plan, expiry, flags, server address, branch, webhook | Portal Supabase | Portal database backup |
| Global reference lists | Golden master **and** each client (seeded by migration) | Golden snapshot |
| Code | Git `main` + `client/<installation-id>` branches | Private Git remote |
| WAHA session and API key | Client WAHA volume + owner-only secrets table | WAHA volume backup + secret manager |
| Portal/CI/deploy secrets | Password manager + hosting environment | Password manager |

The portal stores **licence and client-contact metadata only**. It never stores
job cards, workshop transaction data or PDFs.

### 0.3 Network flows

```text
Client browser
  ├─ HTTPS → client frontend (static host)
  ├─ HTTPS → client Supabase (auth, data, storage)
  ├─ HTTPS → portal Supabase  POST /rest/v1/rpc/poll_workshop_license
  └─ HTTPS → client WAHA      /api/sendText, /api/sendFile

RAVsoft browser
  └─ HTTPS → portal Supabase (licence registry, payments, releases)

Trusted deploy receiver
  ├─ HTTPS → portal Supabase  (read queued run, record result)
  ├─ Postgres → client Supabase (backup, additive migrations)
  ├─ HTTPS → Git host         (fetch client branch)
  └─ HTTPS → client host      (deploy build, smoke test)
```

No client opens an inbound licence port. No client talks directly to another
client. The golden master is never a runtime server.

### 0.4 Naming

| Value | Example | Notes |
| --- | --- | --- |
| Installation ID | `WS-LK-C9A412B7` | Uppercase, 8 hex characters after `WS-LK-`. |
| Client slug | `vezel-masters-kandy` | Lowercase letters, numbers and hyphens only. |
| Client branch | `client/WS-LK-C9A412B7` | Must match the portal `git_branch`. |
| Client project | `ravsoft-client-vezel` | One per workshop. |
| Server address | `https://erp.vezelmasters.lk` | The frontend URL, not the Supabase URL. |

---

## 1. Before you begin

### 1.1 Accounts and tools

- [ ] Node.js 20+ and npm
- [ ] Git
- [ ] Docker Desktop or Docker Engine (WAHA)
- [ ] A Supabase account with three available projects
- [ ] A static host account (Vercel, Netlify or Cloudflare Pages)
- [ ] A domain with DNS control (Cloudflare recommended)
- [ ] A small VPS for WAHA and the deploy receiver (or a container host)
- [ ] `psql` (PostgreSQL client) **or** use the Supabase SQL editor

Install the PostgreSQL client on Windows if needed:

```powershell
winget install PostgreSQL.PostgreSQL.17
```

After installation, open a new terminal and confirm:

```powershell
psql --version
```

### 1.2 Secret inventory

Create these in a password manager before starting. Never commit them.

| Secret | Used by | Notes |
| --- | --- | --- |
| Portal DB password | Portal Supabase / CI | Generated at project creation. |
| Portal anon key | Portal browser, every client | Public by design; protected by RLS. |
| Portal service-role key | Deploy receiver / admin scripts only | Never in a browser or `VITE_*`. |
| Client DB password | Client CI / deploy receiver | One per client. |
| Client anon key | Client browser | Public by design. |
| Client service-role key | Client admin scripts only | Never in a browser. |
| `VITE_LICENSE_SIGNING_KEY` | Portal + every client | Same value everywhere; generate 48 random bytes. |
| `WHATSAPP_API_KEY` | WAHA + client Settings | WAHA's API key env name. |
| WAHA dashboard password | WAHA dashboard | Different from the API key. |
| Deploy webhook secret | Portal worker + receiver | Not a `VITE_*` value. |
| GitHub token | Deploy receiver | Read-only to the client repo is enough. |
| Hosting API token | Deploy receiver | Scoped to the client project. |

Generate the signing key:

```powershell
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes)
```

### 1.3 Repository baseline

The workspace is not a Git repository yet. Initialise it **before** creating
client branches:

```powershell
git init
git add .
git commit -m "chore: RAVsoft 1.4.0 baseline"
git branch -M main
git remote add origin <PRIVATE_REPO_URL>
git push -u origin main
```

Verify that secrets are ignored:

```powershell
git check-ignore -v .env
```

`.gitignore` now ignores `.env` and `.env.*` except `.env.example`.

### 1.4 Placeholders used in this plan

Replace these consistently:

| Placeholder | Meaning |
| --- | --- |
| `<PORTAL_REF>` | Portal Supabase project reference. |
| `<PORTAL_URL>` | `https://<PORTAL_REF>.supabase.co` |
| `<PORTAL_ANON>` | Portal anon public key. |
| `<PORTAL_SERVICE_ROLE>` | Portal service-role key. |
| `<GOLDEN_REF>` | Golden-master Supabase project reference. |
| `<CLIENT_REF>` | Client Supabase project reference. |
| `<CLIENT_URL>` | `https://<CLIENT_REF>.supabase.co` |
| `<CLIENT_ID>` | `WS-LK-XXXXXXXX` |
| `<CLIENT_SLUG>` | Lowercase public QR slug. |
| `<CLIENT_DOMAIN>` | `erp.<client-domain>` |
| `<WAHA_DOMAIN>` | `waha.<client-domain>` |
| `<DEPLOY_DOMAIN>` | `deploy.ravsoft.lk` |

---

## 2. Phase 1 — RAVsoft developer portal

**Goal:** a RAVsoft-branded, multi-app portal on its own Supabase project, with
release `1.4.0` published and the licence RPC reachable by clients.

### 2.1 Create the portal Supabase project

1. Open <https://supabase.com/dashboard> → **New project**.
2. Name: `ravsoft-portal-prod`.
3. Region: `ap-south-1` (Mumbai) or the closest region to Sri Lanka.
4. Generate a strong database password and save it.
5. Wait for provisioning.
6. Open **Project Settings → API** and copy:
   - Project URL → `<PORTAL_URL>`
   - `anon` public key → `<PORTAL_ANON>`
   - `service_role` secret → `<PORTAL_SERVICE_ROLE>` (keep private)
7. Open **Project Settings → Database → Connect** and copy the **direct** or
   **session pooler** connection string. Do not use the transaction pooler
   (port `6543`) for schema migrations.

### 2.2 Apply the migrations

Apply all six files **in order**. They are additive and idempotent.

| Order | File |
| --- | --- |
| 1 | `supabase/migrations/20261114000100_schema.sql` |
| 2 | `supabase/migrations/20261114000200_golden_master.sql` |
| 3 | `supabase/migrations/20261114000300_security_hardening.sql` |
| 4 | `supabase/migrations/20261114000400_portal_releases.sql` |
| 5 | `supabase/migrations/20261114000500_app_records.sql` |
| 6 | `supabase/migrations/20261114000600_portal_security.sql` |

**Option A — SQL editor:**

1. Open **SQL Editor**.
2. Paste `20261114000100_schema.sql`, click **Run**, wait for success.
3. Repeat for `20261114000200` through `20261114000600`.
4. If any file fails, stop and fix the error before continuing.

**Option B — `psql`:**

```powershell
$env:PGPASSWORD = "<PORTAL_DB_PASSWORD>"
$PORTAL_DB = "postgresql://postgres.<PORTAL_REF>:<PORTAL_DB_PASSWORD>@<DIRECT_OR_SESSION_POOLER_HOST>:5432/postgres"

psql $PORTAL_DB -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261114000100_schema.sql
psql $PORTAL_DB -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261114000200_golden_master.sql
psql $PORTAL_DB -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261114000300_security_hardening.sql
psql $PORTAL_DB -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261114000400_portal_releases.sql
psql $PORTAL_DB -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261114000500_app_records.sql
psql $PORTAL_DB -v ON_ERROR_STOP=1 -f .\supabase\migrations\20261114000600_portal_security.sql
```

If the password contains `@`, `:`, `/` or `#`, URL-encode it before putting it
in the connection string.

**Option C — Supabase CLI:**

The migrations now use the CLI's `<14-digit timestamp>_name.sql` convention,
so `db push` applies and records them in order:

```powershell
npx supabase link --project-ref <PORTAL_REF>
npx supabase db push
```

Then confirm the bookkeeping:

```sql
select version, name
  from supabase_migrations.schema_migrations
 order by version;
```

Expect six rows ending in `20261114000600`. Never rename a migration that has
already been applied: the CLI matches history by filename. If a database was
built from the old `0001_…` names, treat it as already migrated and stamp the
timestamped versions before using `db push` again, or keep using Option A/B for
that database.

### 2.3 Verify the portal schema

Run in the SQL editor:

```sql
-- Exactly one latest release, expected 1.4.0
select version, released_at, is_latest
  from public.developer_releases
 order by released_at desc;

select *
  from public.v_latest_release;

-- The portal starts with no client rows
select count(*) as installations
  from public.developer_client_installations;

select count(*) as payments
  from public.developer_license_payments;

select count(*) as update_runs
  from public.developer_update_runs;
```

Expected:

- `1.4.0` exists and `is_latest = true`.
- `v_latest_release` returns exactly one row.
- `installations = 0`, `payments = 0`, `update_runs = 0`.

### 2.4 Configure Auth

1. **Authentication → Providers**: enable **Email**.
2. **Authentication → URL Configuration**:
   - Site URL: `https://portal.ravsoft.lk`
   - Redirect URLs:
     - `https://portal.ravsoft.lk/**`
     - `http://localhost:5173/**` (local testing only)
3. **Authentication → Users → Add user**: create the RAVsoft developer account
   (for example `portal@ravsoft.lk`), auto-confirm it and set a strong password.
4. **Authentication → Providers → Email**: disable public sign-ups after the
   developer account exists.
5. Enable MFA for the developer account.
6. Brand the confirmation and recovery emails if they are used.

> The portal now has an email/password sign-in screen (`/developer`) and requires
> `app_metadata.role = "ravsoft_admin"` on the Auth user. Gate **G2** is closed in
> code: anon access to the portal tables is revoked, so an unauthenticated visitor
> sees the sign-in form and no data. Keep the portal URL private until the live
> verification (§6) and security checklist (§9) pass.

### 2.5 Build and deploy the portal frontend

The portal is a route (`/developer`) in the same Vite app, but it must be a
**separate build** from every client build.

Create `.env.portal` locally (never commit it):

```dotenv
# Portal database
VITE_MASTER_LICENSE_URL=https://<PORTAL_REF>.supabase.co
VITE_MASTER_LICENSE_ANON_KEY=<PORTAL_ANON>

# Shared offline-token signing key. Must match every client build.
VITE_LICENSE_SIGNING_KEY=<SHARED_SIGNING_KEY>
VITE_LICENSE_PUBLIC_KEY=

# Deliberately blank: the portal must not touch a client database.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Deliberately blank: WAHA is configured per client in Settings, not here.
VITE_WHATSAPP_GATEWAY_URL=
VITE_WHATSAPP_GATEWAY_KEY=
```

Build and check:

```powershell
npm ci
npx tsc -b
npm run lint
npm run build -- --mode portal
```

Deploy `dist/` to Vercel:

```powershell
npx vercel login
npx vercel --prod
```

Or connect the Git repository to a Vercel project with:

- Framework preset: **Vite**
- Build command: `npm run build -- --mode portal`
- Output directory: `dist`
- Environment variables: the `.env.portal` values above

Add `vercel.json` at the repository root for SPA routing:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

For Netlify, use:

```toml
[build]
  command = "npm run build -- --mode portal"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

For Cloudflare Pages, use build command `npm run build -- --mode portal`,
output directory `dist`, and a catch-all rewrite to `/index.html`.

If the portal and client sites share this repository, set the build command in
each host's site settings instead of committing a root `netlify.toml` that
hardcodes `--mode portal`. A shared root config would make every client build
use the portal environment.

Then:

1. Add the custom domain `portal.ravsoft.lk`.
2. Wait for the TLS certificate.
3. Open `https://portal.ravsoft.lk/developer`.
4. Confirm the header says **RAVsoft** and the badge says
   **Master DB configured**.

### 2.6 Publish release 1.4.0

`20261114000400_portal_releases.sql` already seeds release `1.4.0` as the latest release.
Confirm it:

```sql
select *
  from public.v_latest_release;
```

If it is missing, apply `20261114000400_portal_releases.sql` again. To promote `1.4.0`
manually without creating a duplicate:

```sql
begin;
update public.developer_releases
   set is_latest = false
 where is_latest
   and version <> '1.4.0';

update public.developer_releases
   set is_latest = true
 where version = '1.4.0';
commit;
```

The portal's hardcoded `LATEST_APP_VERSION` and `RELEASES` list in
`src/pages/DeveloperPortal.tsx` already match `1.4.0`. If you publish a new
version, update both the database and that file, then rebuild the portal.

### 2.7 Clear the demo registry before real clients

The portal seeds four demo clients in the browser when its local registry is
empty. They are **not** in Supabase, but they will be pushed if you click
**Publish registry**.

In the production portal browser, open DevTools → Console and run:

```js
localStorage.setItem(
  "ravsoft_master_portal_v1",
  JSON.stringify({ clients: [], payments: [] }),
);
location.reload();
```

The portal should now show an empty fleet. Do not click **Publish registry**
until you have verified that Supabase contains only real rows.

### 2.8 Portal smoke test

- [ ] `https://portal.ravsoft.lk/developer` loads over HTTPS.
- [ ] The RAVsoft mark and **Developer portal** title are visible.
- [ ] The badge reads **Master DB configured**.
- [ ] The **Releases** tab shows `1.4.0` as latest.
- [ ] The fleet is empty after the localStorage reset.
- [ ] Browser console has no errors.
- [ ] `select count(*) from public.developer_client_installations;` returns `0`.

### 2.9 Portal production hardening (required before public exposure)

Do **not** run this until the portal has a login/proxy; it will break the
current anon-key UI.

Target design:

1. The developer signs in with Supabase Auth.
2. The developer's `app_metadata.role` is `ravsoft_admin`.
3. The portal sends the **user access token**, not the anon key, on writes.
4. Anonymous clients can still call only `poll_workshop_license`.

Set the role with the Admin API (service role, trusted machine only):

```powershell
$adminHeaders = @{
  apikey = "<PORTAL_SERVICE_ROLE>"
  Authorization = "Bearer <PORTAL_SERVICE_ROLE>"
  "Content-Type" = "application/json"
}
$body = @{ app_metadata = @{ role = "ravsoft_admin" } } | ConvertTo-Json -Depth 3

Invoke-RestMethod `
  -Method Put `
  -Uri "https://<PORTAL_REF>.supabase.co/auth/v1/admin/users/<DEVELOPER_USER_ID>" `
  -Headers $adminHeaders `
  -Body $body
```

Reference SQL:

```sql
-- Helper used by RLS and the update RPCs.
create or replace function public.is_portal_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'ravsoft_admin',
    false
  );
$$;

revoke all on function public.is_portal_admin() from public, anon;
grant execute on function public.is_portal_admin() to authenticated;

-- Replace the open demo policies.
drop policy if exists developer_installations_portal_all
  on public.developer_client_installations;
create policy developer_installations_admin_all
  on public.developer_client_installations
  for all to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

drop policy if exists developer_payments_portal_all
  on public.developer_license_payments;
create policy developer_payments_admin_all
  on public.developer_license_payments
  for all to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

revoke all on public.developer_client_installations from anon;
revoke all on public.developer_license_payments from anon;
revoke select on public.developer_update_runs from anon;
revoke select on public.v_client_update_status from anon;

grant select, insert, update, delete
  on public.developer_client_installations to authenticated;
grant select, insert, update, delete
  on public.developer_license_payments to authenticated;
grant select on public.developer_update_runs to authenticated;
grant select on public.v_client_update_status to authenticated;
```

The two update RPCs are `security definer` and are currently executable by
`anon`. Revoke that and add an admin guard inside each function. Keep the
service-role path working for the deploy receiver:

```sql
revoke execute on function public.request_client_update(text, text) from anon;
revoke execute on function public.record_client_update_result(uuid, text, text) from anon;

-- Add this at the top of both function bodies:
-- if auth.role() <> 'service_role' and not public.is_portal_admin() then
--   raise exception 'Not authorized.';
-- end if;
```

For strict isolation, also replace the `developer_update_runs_read` policy with
`using (public.is_portal_admin())`, and expose `v_client_update_status` only to
the service role or recreate it with `security_invoker = true`.

`poll_workshop_license(text)` must remain executable by `anon`; it is the only
RPC a client calls.

### 2.10 Back up the portal

1. Click **Download** in the portal to save the local JSON registry.
2. Take a Supabase on-demand backup or run `pg_dump` (see §8).
3. Store the portal anon key, service-role key and database password in the
   password manager.
4. Record the project reference and region in the deployment log.

### Phase 1 checklist

- [ ] Portal Supabase project created.
- [ ] `0001`–`0004` applied in order.
- [ ] `1.4.0` is the only `is_latest` release.
- [ ] Developer auth user created; public sign-ups disabled.
- [ ] Portal built with `--mode portal` and deployed to HTTPS.
- [ ] Demo registry cleared; fleet empty.
- [ ] Portal database has zero client rows.
- [ ] Portal backup and secrets stored.

---

## 3. Phase 2 — Golden master (clean empty system)

**Goal:** a separate Supabase project containing the production schema and
global reference data only. Zero workshops, auth users, client rows, PDFs or
storage objects.

### 3.1 Create the template project

1. Supabase Dashboard → **New project**.
2. Name: `ravsoft-golden-v1`.
3. Region: same region you will use for clients (`ap-south-1` for Sri Lanka).
4. Strong database password.
5. Do **not** create a frontend, auth users or storage objects.
6. Save the project reference and database connection string.

> Never onboard a real workshop into this project. Clone/provision a fresh
> client project first.

### 3.2 Apply the migrations

Apply all six files in order, using §2.2 Option A, B or C, against
`<GOLDEN_REF>`.

### 3.3 Run the clean-template verification

**Option A — `psql`:**

```powershell
$env:PGPASSWORD = "<GOLDEN_DB_PASSWORD>"
$GOLDEN_DB = "postgresql://postgres.<GOLDEN_REF>:<GOLDEN_DB_PASSWORD>@<DIRECT_OR_SESSION_POOLER_HOST>:5432/postgres"

psql $GOLDEN_DB -v ON_ERROR_STOP=1 -f .\supabase\golden-master\verify.sql
```

**Option B — SQL editor:**

Paste the entire contents of `supabase/golden-master/verify.sql` and run it.
It raises an exception on the first failure.

Expected result:

- `golden_master_clean = t`
- `has_client_data = false`
- Every tenant count is `0`.
- All eight reference categories exist.
- Exactly one `developer_releases` row has `is_latest = true` (`1.4.0`).

### 3.4 Manual assertions

```sql
select *
  from public.golden_master_status();

select *
  from public.golden_master_manifest;

select version, released_at, is_latest
  from public.developer_releases
 order by released_at desc;

select key, category
  from public.system_reference_data
 order by category, key;

select count(*) as auth_users
  from auth.users;

select count(*) as storage_objects
  from storage.objects;

select count(*) as portal_clients
  from public.developer_client_installations;

select count(*) as portal_payments
  from public.developer_license_payments;

select count(*) as portal_update_runs
  from public.developer_update_runs;

select id, name, public
  from storage.buckets
 order by id;
```

Expected:

| Check | Expected |
| --- | --- |
| `has_client_data` | `false` |
| `workshops`, `profiles`, `workers`, `job_cards`, `check_ins`, `ledger_entries` | `0` |
| `auth.users` | `0` |
| `storage.objects` | `0` |
| `developer_client_installations` | `0` |
| `developer_license_payments` | `0` |
| `developer_update_runs` | `0` |
| Buckets | `job-photos`, `branding`, `invoice-pdfs`, `payroll-pdfs` |
| `developer_releases` latest | Exactly one, `1.4.0` |
| Manifest | `RAVSOFT-GM-V1`, `client_data_allowed = false`, `app_version = 1.4.0` |

Reference categories:

- `expense_categories`
- `petty_cash_categories`
- `payment_methods`
- `service_types`
- `vehicle_makes`
- `insurance_companies_lk`
- `licence_plans`
- `release_channels`

### 3.5 Snapshot the template

A snapshot is for audit and disaster recovery. Client provisioning should
replay the verified migrations, not depend on a physical restore.

```powershell
$env:PGPASSWORD = "<GOLDEN_DB_PASSWORD>"
$GOLDEN_DB = "postgresql://postgres.<GOLDEN_REF>:<GOLDEN_DB_PASSWORD>@<DIRECT_OR_SESSION_POOLER_HOST>:5432/postgres"

New-Item -ItemType Directory -Force .\backups

# Full public-schema dump (schema + reference data)
pg_dump $GOLDEN_DB `
  --schema=public `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file=".\backups\ravsoft-golden-v1-1.4.0-public.dump"

# Small reviewable reference-data dump
pg_dump $GOLDEN_DB `
  --schema=public `
  --data-only `
  --table=public.system_reference_data `
  --table=public.golden_master_manifest `
  --table=public.developer_releases `
  --format=plain `
  --file=".\backups\ravsoft-golden-v1-1.4.0-reference.sql"
```

Hash the dump and store it with the release record:

```powershell
Get-FileHash .\backups\ravsoft-golden-v1-1.4.0-public.dump -Algorithm SHA256 |
  Format-List
```

Tag the verified code baseline:

```powershell
git tag -a golden-gm-v1.4.0 -m "Verified golden master 1.4.0"
git push origin golden-gm-v1.4.0
```

Store the dump encrypted (password manager attachment, encrypted S3 bucket or
an offline drive). Do not commit dumps to Git.

### 3.6 Lock the template

- [ ] No frontend is deployed from this project.
- [ ] No auth users exist.
- [ ] No storage objects exist.
- [ ] No WhatsApp or WAHA configuration.
- [ ] Public sign-ups are disabled.
- [ ] The anon key is not embedded in any deployed app.
- [ ] `client_data_allowed = false`.
- [ ] The last `verify.sql` run passed after the last migration.

### Phase 2 checklist

- [ ] Golden project created separately from the portal.
- [ ] `0001`–`0004` applied in order.
- [ ] `verify.sql` passes.
- [ ] Zero tenant rows and zero auth users.
- [ ] Exactly one latest release (`1.4.0`).
- [ ] Snapshot and SHA-256 recorded.
- [ ] `golden-gm-v1.4.0` tag pushed.
- [ ] Template locked; no client data allowed.

---

## 4. Phase 3 — First client copy

**Goal:** one isolated Supabase project, one frontend build, one WAHA instance and
one portal registration for the first real workshop.

> Complete gates **G1–G4** before entering real customer data. The steps below
> assume the Supabase adapter and portal auth are in place.

### 4.1 Decide the client identity

| Value | Example |
| --- | --- |
| Client name | `Vezel Masters Kandy` |
| Installation ID | `WS-LK-C9A412B7` |
| Client slug | `vezel-masters-kandy` |
| Frontend URL | `https://erp.vezelmasters.lk` |
| Supabase project | `ravsoft-client-vezel` |
| Git branch | `client/WS-LK-C9A412B7` |
| WAHA URL | `https://waha.vezelmasters.lk` |
| Plan | `Professional` |
| Trial / expiry | 30-day trial or paid expiry date |

The installation ID must be **identical** in three places:

1. The app's **Settings → Licence** screen.
2. `public.workshops.installation_id` in the client database.
3. The portal's `developer_client_installations.id`.

If the portal cannot accept an existing ID yet (gate G3), register the client
first and use the portal-generated ID as the canonical one; then set the client
database and app to that value before the first licence poll.

### 4.2 Create the client Supabase project

1. Supabase Dashboard → **New project**.
2. Name: `ravsoft-client-<shortcode>`.
3. Region: closest to the workshop (`ap-south-1` for Sri Lanka).
4. Strong database password.
5. Save:
   - `<CLIENT_URL>`
   - `<CLIENT_ANON>`
   - `<CLIENT_SERVICE_ROLE>` (private)
   - Direct/session pooler connection string.

### 4.3 Provision the schema

**Recommended — replay the verified migrations:**

Apply `0001`–`0004` in order to `<CLIENT_REF>` using §2.2 Option A or B.

Run the golden verification before creating any client data:

```powershell
$env:PGPASSWORD = "<CLIENT_DB_PASSWORD>"
$CLIENT_DB = "postgresql://postgres.<CLIENT_REF>:<CLIENT_DB_PASSWORD>@<DIRECT_OR_SESSION_POOLER_HOST>:5432/postgres"

psql $CLIENT_DB -v ON_ERROR_STOP=1 -f .\supabase\golden-master\verify.sql
```

**Why not restore the dump for onboarding?**

The golden dump is an audit and disaster-recovery artifact, not the provisioning
mechanism. Restoring `public` into a fresh project can fail before `pgcrypto`
and `pg_trgm` exist, and restoring it after the migrations can duplicate the
reference seeds. Replaying `0001`–`0004` produces exactly the same schema,
reference data and storage buckets, deterministically.

If your Supabase plan offers a project restore/clone feature, use that for a
physical clone, then re-run `0003`–`0004` to guarantee the private PDF buckets,
policies and release registry. Never restore `auth`, `storage`, `realtime` or
platform schemas from the golden master; they belong to the new project.

Apply any migrations released after the golden snapshot, in order, before
creating client data.

### 4.4 Configure Auth and create the owner

1. **Authentication → Providers**: enable **Email**.
2. **Authentication → URL Configuration**:
   - Site URL: `https://<CLIENT_DOMAIN>`
   - Redirect URLs: `https://<CLIENT_DOMAIN>/**`
3. **Authentication → Users → Add user**:
   - Owner email
   - Strong password
   - Auto-confirm
4. Disable public sign-ups after the owner exists.
5. Enable MFA for the owner.

Copy the owner's auth user UUID from the Users table.

### 4.5 Create the workshop

`create_workshop` requires the owner's JWT. Do not call it with the service
role; it will raise `You must be signed in to create a workshop.`

**PowerShell (recommended):**

```powershell
$CLIENT_URL = "https://<CLIENT_REF>.supabase.co"
$CLIENT_ANON = "<CLIENT_ANON>"
$OWNER_EMAIL = "owner@vezelmasters.lk"
$OWNER_PASSWORD = "<OWNER_PASSWORD>"

$loginBody = @{
  email = $OWNER_EMAIL
  password = $OWNER_PASSWORD
} | ConvertTo-Json

$session = Invoke-RestMethod `
  -Method Post `
  -Uri "$CLIENT_URL/auth/v1/token?grant_type=password" `
  -Headers @{
    apikey = $CLIENT_ANON
    "Content-Type" = "application/json"
  } `
  -Body $loginBody

$headers = @{
  apikey = $CLIENT_ANON
  Authorization = "Bearer $($session.access_token)"
  "Content-Type" = "application/json"
}

$workshopBody = @{
  p_company_name = "Vezel Masters Kandy"
  p_slug = "vezel-masters-kandy"
  p_owner_name = "Nimal Perera"
  p_phone = "+94 81 234 5678"
  p_email = $OWNER_EMAIL
  p_currency = "LKR"
} | ConvertTo-Json

$workshopId = Invoke-RestMethod `
  -Method Post `
  -Uri "$CLIENT_URL/rest/v1/rpc/create_workshop" `
  -Headers $headers `
  -Body $workshopBody

$workshopId
```

**SQL-editor fallback:**

```sql
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<OWNER_AUTH_UUID>',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;
select public.create_workshop(
  'Vezel Masters Kandy',
  'vezel-masters-kandy',
  'Nimal Perera',
  '+94 81 234 5678',
  'owner@vezelmasters.lk',
  'LKR'
);
commit;
```

Verify:

```sql
select id, company_name, slug, installation_id, trial_started_at
  from public.workshops;

select id, workshop_id, full_name, username, is_owner, departments
  from public.profiles;
```

### 4.6 Set the installation ID

Use the canonical ID from §4.1:

```sql
update public.workshops
   set installation_id = 'WS-LK-C9A412B7'
 where slug = 'vezel-masters-kandy';
```

The app reads `workshop_settings.installationId` when the Supabase adapter is in
place. Until then, a pilot browser can be pre-seeded before the first app load:

```js
localStorage.setItem("torque_erp_installation_id", "WS-LK-C9A412B7");
```

Then reload the app and confirm **Settings → Licence** shows the same ID. This
is a pilot workaround only; a multi-device installation must read the ID from
`public.workshops.installation_id`.

### 4.7 Verify storage buckets

The migrations create four buckets:

| Bucket | Visibility | Use |
| --- | --- | --- |
| `job-photos` | Private | Job card photos |
| `branding` | Public read | Workshop logo |
| `invoice-pdfs` | Private | Invoice/estimate PDFs |
| `payroll-pdfs` | Private | Payslips and payroll PDFs |

```sql
select id, name, public, file_size_limit, allowed_mime_types
  from storage.buckets
 order by id;
```

In **Storage → Buckets**, set sensible limits:

- `job-photos`: 10 MB; `image/jpeg`, `image/png`, `image/webp`
- `branding`: 2 MB; `image/jpeg`, `image/png`, `image/webp`
- `invoice-pdfs`: 10 MB; `application/pdf`
- `payroll-pdfs`: 10 MB; `application/pdf`

Do not make the PDF or job-photo buckets public. The app uses signed URLs.

Test one upload and one signed URL from the app after deployment.

### 4.8 Build and deploy the client frontend

Each client needs its own build because Vite bakes `VITE_*` values at build
time. Never reuse a portal build or another client's build.

Create `.env.client` locally (never commit it):

```dotenv
# This client's own Supabase project
VITE_SUPABASE_URL=https://<CLIENT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<CLIENT_ANON>
VITE_SUPABASE_JOB_PHOTOS_BUCKET=job-photos
VITE_SUPABASE_BRANDING_BUCKET=branding

# WAHA is configured in Settings → Integrations, not here.
# Leave these blank for a WAHA-only deployment.
VITE_WHATSAPP_GATEWAY_URL=
VITE_WHATSAPP_GATEWAY_KEY=

# Google Drive / Picker (optional)
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_PICKER_API_KEY=

# Portal licence server — NOT this client's Supabase URL
VITE_MASTER_LICENSE_URL=https://<PORTAL_REF>.supabase.co
VITE_MASTER_LICENSE_ANON_KEY=<PORTAL_ANON>

# Must match the portal build
VITE_LICENSE_SIGNING_KEY=<SHARED_SIGNING_KEY>
VITE_LICENSE_PUBLIC_KEY=
```

Build and test:

```powershell
npm ci
npx tsc -b
npm run lint
npm run build -- --mode client
```

Deploy `dist/` to a **separate** Vercel project, Netlify site or Cloudflare
Pages project:

- Build command: `npm run build -- --mode client`
- Output directory: `dist`
- Environment variables: the `.env.client` values
- SPA rewrite: `/*` → `/index.html`
- Domain: `https://<CLIENT_DOMAIN>`
- HTTPS: required for the PWA and QR check-in

After deployment:

- [ ] `/manifest.webmanifest` returns 200.
- [ ] `/sw.js` returns 200.
- [ ] `/icons/*` load.
- [ ] The app installs as a PWA.
- [ ] `/check-in/<CLIENT_SLUG>` loads without login.
- [ ] `/book?token=BOOK-<CLIENT_ID>` loads without login.
- [ ] The browser console has no errors.

Fix the PWA manifest shortcut before handover. `public/manifest.webmanifest`
currently hardcodes `/check-in/vezel-masters-kandy`; generate it from the
client slug or record the client-branch change.

#### 4.8.1 If the client frontend runs on its own VPS

A separate VPS per client is fine; the isolation rule is one build and one
Supabase project per client. Build locally or in CI, then copy `dist/`:

```powershell
npm run build -- --mode client
scp -r .\dist\* deploy@<CLIENT_SERVER_IP>:/var/www/ravsoft-client/
```

Caddy on the client VPS:

```caddyfile
erp.vezelmasters.lk {
  root * /var/www/ravsoft-client
  try_files {path} /index.html
  file_server
  encode gzip

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

Nginx equivalent:

```nginx
server {
  listen 443 ssl http2;
  server_name erp.vezelmasters.lk;
  root /var/www/ravsoft-client;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location = /index.html {
    add_header Cache-Control "no-store";
  }
}
```

Point the DNS `A` record at the VPS, issue TLS with Caddy or Certbot, and add
the deploy receiver's SSH key to a restricted deploy user. Never give the
receiver root access to the workshop's internal network.

If you self-host Supabase instead of using Supabase Cloud, use one complete
Supabase stack and database per client. Do not share a database, auth service or
storage bucket between clients. The migrations and environment wiring are the
same; only the URLs change.

### 4.9 Create the client Git branch

From the verified `main` baseline:

```powershell
git checkout main
git pull --ff-only
git checkout -b client/WS-LK-C9A412B7
```

Edit `src/custom/index.ts`:

```ts
export const CLIENT_BUILD = {
  branch: "client/WS-LK-C9A412B7",
  summary: "Vezel Masters Kandy — branded invoice footer and login message.",
};

export const CLIENT_CUSTOMISATION = {
  invoiceNote: "Thank you for choosing Vezel Masters Kandy.",
  estimateNote: "Estimate valid for 14 days. Parts prices may change without notice.",
  loginMessage: "Welcome to Vezel Masters Kandy. Call our hotline for urgent breakdowns.",
};
```

Rules:

- Keep client changes inside `src/custom` wherever possible.
- If a core file must change, record why in the portal's customisation summary.
- Never commit `.env`, service-role keys or WAHA keys.
- `HAS_CLIENT_CUSTOMISATION` is true when `CLIENT_BUILD.branch` is not `main`,
  when the summary is non-empty, or when any custom note is set. Keep the
  portal's **Custom build** tick aligned with that badge.

Build and commit:

```powershell
npm ci
npx tsc -b
npm run lint
npm run build
git add .
git commit -m "feat(client): Vezel Masters Kandy customisation"
git push -u origin client/WS-LK-C9A412B7
```

Deploy the client branch to the client's hosting project. Confirm
**Settings → Licence** shows the custom-build badge and the summary.

### 4.10 Deploy WAHA for this client

Use one WAHA container and one `default` session per client. Do not share a
session between workshops.

On the client VPS:

```powershell
New-Item -ItemType Directory -Force C:\waha\vezel
Set-Location C:\waha\vezel
```

`docker-compose.yml`:

```yaml
services:
  waha:
    image: devlikeapro/waha:latest
    container_name: waha-vezel
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env
    volumes:
      - ./sessions:/app/.sessions
```

`.env`:

```dotenv
WHATSAPP_API_KEY=<LONG_RANDOM_KEY>
WHATSAPP_DEFAULT_ENGINE=WEBJS
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<STRONG_DASHBOARD_PASSWORD>
```

Start:

```powershell
docker compose up -d
docker compose logs -f waha
```

Put TLS in front of it. Caddy example:

```caddyfile
waha.vezelmasters.lk {
  reverse_proxy 127.0.0.1:3000
}
```

Restrict the dashboard to the RAVsoft VPN or an IP allow-list. The API must be
HTTPS and protected by `WHATSAPP_API_KEY`.

Pair the company phone:

1. Open `https://waha.vezelmasters.lk/dashboard`.
2. Log in with the dashboard credentials.
3. Start the `default` session.
4. Scan the QR from the company phone:
   **WhatsApp → Linked devices → Link a device**.
5. Wait for the session to report `WORKING`.

The app's **Open pairing QR** tab cannot send `X-Api-Key`, so pair from the WAHA
dashboard and then click **Mark connected** in the app.

Configure the app:

**Settings → Integrations → WhatsApp**

- Mode: **WAHA**
- Gateway URL: `https://waha.vezelmasters.lk`
- Session: `default`
- API key: the same `WHATSAPP_API_KEY`
- Company WhatsApp number: the workshop's real number
- Automatic sending: on

The API key is stored in the owner-only `workshop_whatsapp_secrets` table from
`20261114000300_security_hardening.sql`. It is not a `VITE_*` value and must never be
committed to the client branch.

Test from PowerShell:

```powershell
$body = @{
  session = "default"
  chatId = "94755756803@c.us"
  text = "RAVsoft WAHA test from Vezel Masters Kandy"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://waha.vezelmasters.lk/api/sendText" `
  -Headers @{ "X-Api-Key" = "<WHATSAPP_API_KEY>" } `
  -ContentType "application/json" `
  -Body $body
```

Keep **demo mode** on until the client signs off. Every outbound message and PDF
will route to `+94 75 575 56803`. For live sending, turn demo mode off and test
with a consented number.

### 4.11 Register the client in the portal

1. Open the production portal in a clean browser profile.
2. Confirm the fleet is empty (§2.7).
3. Click **Register client**.
4. Enter:

| Field | Value |
| --- | --- |
| Client / workshop | `Vezel Masters Kandy` |
| Software | `Torque ERP` (free text; add other RAVsoft apps as needed) |
| Server address | `https://erp.vezelmasters.lk` |
| Owner | `Nimal Perera` |
| Phone | `+94 81 234 5678` |
| Email | `owner@vezelmasters.lk` |
| District | `Kandy` |
| Address | `No. 12, Peradeniya Road, Kandy` |
| Plan | `Professional` |
| Months | `1` for trial, or the paid term |
| Module preset | Match the sold plan |
| Git branch | `client/WS-LK-C9A412B7` |
| Custom build | Tick when `CLIENT_BUILD.branch`, summary or notes differ from core |
| Customisation summary | Short support note |
| Deploy webhook | `https://deploy.ravsoft.lk/hooks/client-update` (or blank for manual) |
| Notes | `First production client. Cloned from golden-gm-v1.4.0.` |

5. Save.
6. Copy the generated installation ID.
7. If it differs from the app's ID, update the client database and app to the
   portal ID before the first licence poll (gate G3).
8. A new registration starts as **Trial**. After payment or activation, use
   **Manage → Active** or **Renew** to set the paid expiry.

Verify in the portal database:

```sql
select id,
       workshop_name,
       software_name,
       server_address,
       app_version,
       latest_version,
       git_branch,
       custom_build,
       customisation_summary,
       deploy_webhook_url,
       plan,
       status,
       expires_at,
       last_seen_at
  from public.developer_client_installations
 order by created_at desc;

select id, client_id, paid_at, amount, method, reference, months
  from public.developer_license_payments
 order by paid_at desc;
```

Expected: exactly one real client row with the correct branch and server
address. If the client paid, exactly one matching payment row. Do **not** click
**Publish registry**; that would push any remaining demo rows from the browser.

### 4.12 Wire and verify licence sync

On the client build, confirm:

```dotenv
VITE_MASTER_LICENSE_URL=https://<PORTAL_REF>.supabase.co
VITE_MASTER_LICENSE_ANON_KEY=<PORTAL_ANON>
```

This is the **portal** project, not the client's own Supabase project.

In the app:

1. Sign in as the owner.
2. Open **Settings → Licence**.
3. Confirm the installation ID matches the portal.
4. Click **Sync licence now**.
5. Confirm the status, plan and expiry appear.
6. Confirm the portal row's `last_seen_at` updates:

```sql
select id, status, plan, expires_at, last_seen_at, feature_flags
  from public.developer_client_installations
 where id = 'WS-LK-C9A412B7';
```

Test the RPC directly:

```powershell
$body = @{ p_installation_id = "WS-LK-C9A412B7" } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://<PORTAL_REF>.supabase.co/rest/v1/rpc/poll_workshop_license" `
  -Headers @{
    apikey = "<PORTAL_ANON>"
    Authorization = "Bearer <PORTAL_ANON>"
    "Content-Type" = "application/json"
  } `
  -Body $body
```

Expected fields: `status`, `plan`, `expires_at`, `feature_flags`, `holder`,
`server_time`.

The client keeps a monotonic high-water mark. A backwards system clock forces a
fresh online check; a successful poll repairs the marker using `server_time`.
Verify this on a test device by moving the clock back one day, confirming the
lock/recheck message, then syncing again.

If the client must work offline, generate a `TRQ2.` token in the portal, send it
to the owner and activate it in **Settings → Licence**. The portal online poll is
the primary entitlement; the offline token is a fallback. The current TRQ2
implementation uses a shared-secret hash in the browser — do not treat it as
tamper-proof for high-value licensing.

### 4.13 Wire the deploy webhook

The portal's **Deploy latest** button currently posts directly from the browser.
That is acceptable for a private pilot but not for production, because the
browser cannot hold a webhook secret and the receiver would be unauthenticated.

**Production flow:**

1. Queue the run:

```sql
select public.request_client_update('WS-LK-C9A412B7', '1.4.0') as run_id;
```

2. Save the returned `run_id`.
3. A trusted server-side worker (not the browser) picks up the queued run:

```text
Queued → Deploying → Deployed | Failed | Rolled Back
```

4. The worker performs:

   - Authenticate the job (service token/HMAC; never trust the browser).
   - Look up the client's server, branch and Supabase project in a server-side
     inventory — do not trust the payload alone.
   - Put the installation into maintenance/read-only mode.
   - Back up the client database and storage buckets.
   - Check out `client/WS-LK-C9A412B7`, merge/rebase from `main` if needed.
   - Apply the listed additive migrations as the service role.
   - Build the frontend with the client's environment variables.
   - Deploy to the client host.
   - Smoke-test login, licence state, one job card and one print template.
   - Record the result.

5. Record success or failure:

```sql
select public.record_client_update_result(
  '<RUN_UUID>',
  'Deployed',
  'First client deployed from golden-gm-v1.4.0; data preserved.'
);
```

On failure:

```sql
select public.record_client_update_result(
  '<RUN_UUID>',
  'Failed',
  'Reason and failing step.'
);
```

6. Verify:

```sql
select *
  from public.v_client_update_status
 where id = 'WS-LK-C9A412B7';
```

The portal button currently updates its local `appVersion` before the webhook
result arrives. Treat `developer_update_runs` and the `app_version` promoted by
`record_client_update_result` as the authoritative deployment state, not the
button label.

If you use the browser webhook for the pilot, the receiver must:

- Accept `POST` from `https://portal.ravsoft.lk` with CORS headers.
- Reject any request without the shared service token.
- Return non-2xx on failure.
- Never expose a database service key to the browser.

### Phase 3 checklist

- [ ] Client Supabase project created; separate from portal and golden master.
- [ ] Migrations applied; clean verification passed before onboarding.
- [ ] Owner auth user created; public sign-ups disabled.
- [ ] `create_workshop` called with the owner's JWT.
- [ ] `workshops.installation_id` matches the portal ID.
- [ ] Storage buckets and limits verified.
- [ ] Client frontend built with `--mode client` and deployed to HTTPS.
- [ ] Client branch `client/<CLIENT_ID>` created and pushed.
- [ ] WAHA container running; session `WORKING`; app settings saved.
- [ ] Portal registration complete; exactly one real client row.
- [ ] Licence poll returns the correct plan/expiry and updates `last_seen_at`.
- [ ] Deploy run queued and recorded.
- [ ] Insurance and multi-section modules match the client contract in
      Settings → Modules; disabled modules are absent from navigation.
- [ ] Insurance smoke test: estimate approval loads unassigned tasks, supervisor
      assigns workers, part source is chosen, the **Insurance** tab shows approvals
      only, the **Invoice** tab saves draft bills, Cashier sets No VAT/Add VAT and
      sends the insurance bill (*Waiting for releasing order*), a short release
      order creates the Additional bill, and the Additional bill can be collected
      in Cashier. The claim stays unsettled after release.
- [ ] Cashier queue smoke test: one billing queue with vehicle search, collapsed
      vehicle rows showing the open amount, expanded bills, multi-select print/send
      as one PDF, and settlement moving the vehicle to Paid & released only when
      every bill is settled.
- [ ] Partial-settlement smoke test: cash/card checkout with less than the balance
      shows the collected/credit split and leaves the job in **Awaiting Release
      Approval**; the same works for the first payment on a separate customer bill.
      Owner/Accounting approve the release from the customer credit ledger and the
      job moves to **Released on Credit**, waiting for the cashier's exit approval.
      Confirm the PRO gate does not show or hand over that vehicle until the cashier
      approves the exit from **Paid & released**; the job then becomes **Dispatched**.
      Repeat and settle the credit before approval; the job clears to **Paid** and
      appears in gate clearance without approval. Confirm an insurance bill or dated
      cheque cannot be part-paid.
- [ ] Stores zero-stock smoke test: request an out-of-stock part, issue it either
      by purchase with supplier invoice or by replacing the line with a suitable
      in-stock part; confirm stock, no purchase on substitution, and the updated job
      line. Then return a customer-brought part and use **Add again…** for both the
      customer and store paths.
- [ ] Estimate part smoke test: type a part description, pick a stock suggestion,
      confirm the selling price fills and stock does not move until Stores issues.
- [ ] Multi-section smoke test: two section bills settle independently, the final
      bill is blocked until both settle, then totals both section bills.
- [ ] Multi-technician smoke test: assign two or three present workers to one
      task, confirm the preview splits labour equally at each worker's rate, then
      settle a bill and verify each worker's share in payroll and analytics and
      that the invoice lists every technician.
- [ ] Insurance desk smoke test: released vehicle shows salvage and cheque
      queues; supervisor/storekeeper and cashier/accounting see only their queues;
      a recorded cheque moves In Safe → deposited → realized, and only realization
      marks the claim settled.
- [ ] Demo mode still on until client sign-off.

---

## 5. Wiring matrix

### 5.1 Environment variables by server

| Variable | Portal build | Golden master | Client build |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | **blank** | not deployed | `https://<CLIENT_REF>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **blank** | not deployed | `<CLIENT_ANON>` |
| `VITE_SUPABASE_JOB_PHOTOS_BUCKET` | blank | not deployed | `job-photos` |
| `VITE_SUPABASE_BRANDING_BUCKET` | blank | not deployed | `branding` |
| `VITE_MASTER_LICENSE_URL` | `https://<PORTAL_REF>.supabase.co` | not deployed | `https://<PORTAL_REF>.supabase.co` |
| `VITE_MASTER_LICENSE_ANON_KEY` | `<PORTAL_ANON>` | not deployed | `<PORTAL_ANON>` |
| `VITE_LICENSE_SIGNING_KEY` | `<SHARED_SIGNING_KEY>` | not deployed | `<SHARED_SIGNING_KEY>` |
| `VITE_LICENSE_PUBLIC_KEY` | blank (reserved) | not deployed | blank (reserved) |
| `VITE_WHATSAPP_GATEWAY_URL` | blank | not deployed | **blank for WAHA** |
| `VITE_WHATSAPP_GATEWAY_KEY` | blank | not deployed | **blank for WAHA** |
| `VITE_GOOGLE_CLIENT_ID` | optional | not deployed | optional |
| `VITE_GOOGLE_PICKER_API_KEY` | optional | not deployed | optional |
| `SUPABASE_DB_URL` | CI only | CI only | CI only |
| `SUPABASE_SERVICE_ROLE_KEY` | CI only | CI only | CI only |
| `WHATSAPP_API_KEY` | never | never | WAHA `.env` + app Settings |
| Deploy webhook secret | receiver | never | never |

Key points:

- `VITE_MASTER_LICENSE_URL` is the **portal** URL on both the portal and every
  client. It is never the client's own Supabase URL.
- `VITE_SUPABASE_URL` is the **client's own** URL on a client build. Leave it
  blank on the portal build.
- `VITE_WHATSAPP_GATEWAY_*` is for the optional Meta Cloud API gateway only.
  WAHA uses Settings → Integrations and the owner-only secrets table.
- `VITE_LICENSE_SIGNING_KEY` must match the portal and every client. Rotating it
  invalidates existing `TRQ2.` offline tokens and requires rebuilding clients.
- The portal anon key is embedded in every client build. Rotating it requires
  rebuilding and redeploying every client.
- Only `VITE_*` values reach the browser. Service-role keys and WAHA secrets
  must never use a `VITE_` prefix.
- Vite bakes values at build time. After changing any environment variable,
  rebuild and redeploy; restarting the host is not enough.
- Do not keep a shared root `.env` with client values on a build machine. Use
  `.env.portal` and `.env.client` only; a stale `.env` can leak into the wrong
  build.

### 5.2 What talks to what

| From | To | Protocol | Authentication |
| --- | --- | --- | --- |
| Client browser | Client frontend | HTTPS | Static files |
| Client browser | Client Supabase | HTTPS | Supabase Auth JWT |
| Client browser | Portal Supabase | HTTPS | Anon key + installation ID |
| Client browser | Client WAHA | HTTPS | `X-Api-Key` from Settings |
| RAVsoft browser | Portal frontend | HTTPS | Host access / portal login |
| RAVsoft browser | Portal Supabase | HTTPS | Admin Supabase Auth JWT (RLS `ravsoft_admin`) |
| Deploy receiver | Client Supabase | Postgres | Service role |
| Deploy receiver | Portal Supabase | HTTPS/Postgres | Service role |
| Deploy receiver | Git host | HTTPS | Read-only token |
| Deploy receiver | Client host | HTTPS API | Scoped deploy token |
| WAHA | WhatsApp Web | Outbound WebSocket | Paired session |

No client-to-client traffic. No inbound port on the client Supabase database.
No inbound port on the client network for licensing.

### 5.3 Common wiring mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `VITE_MASTER_LICENSE_URL` points at the client's own project | Poll returns no installation row | Point it at the portal project. |
| `VITE_SUPABASE_ANON_KEY` uses the portal key | Client queries fail / wrong data | Use the client project's anon key. |
| Service-role key in a `VITE_*` variable | Full database compromise | Remove it, rotate the key, rebuild. |
| Env changed but no rebuild | App still uses old project | Rebuild and redeploy. |
| One build reused for two clients | Both clients share one database | One build per client. |
| Demo installation ID kept | Licence poll returns nothing | Set the real `WS-LK-…` ID everywhere. |
| Demo mode left on | All messages go to `+94 75 575 56803` | Turn it off only after sign-off. |
| WAHA key placed in `VITE_WHATSAPP_GATEWAY_KEY` | WAHA calls return 401 or are ignored | Put it in Settings → Integrations. |
| `job-photos` bucket made public | Customer photos exposed | Keep it private; use signed URLs. |
| Portal demo rows published | Fake clients in production | Clear localStorage registry first. |
| Shared Supabase schema across clients | Data leakage | One project per client. |

---

## 6. End-to-end verification

Run this after Phase 3 and before handover.

### 6.1 Portal

- [ ] `https://portal.ravsoft.lk/developer` loads over HTTPS.
- [ ] RAVsoft branding, multi-app software field and release registry visible.
- [ ] Release `1.4.0` is latest; only one row has `is_latest = true`.
- [ ] Exactly one real client row exists.
- [ ] Server address displays shortened, copy button copies the full URL.
- [ ] Branch, custom-build badge and summary are correct.
- [ ] Licence poll updates `last_seen_at`.
- [ ] Portal backup downloaded.

### 6.2 Golden master

- [ ] `verify.sql` passes.
- [ ] `has_client_data = false`.
- [ ] Zero tenant rows.
- [ ] Zero auth users.
- [ ] Zero storage objects.
- [ ] Four buckets exist.
- [ ] Exactly one latest release.
- [ ] Snapshot hash recorded.

### 6.3 Client

- [ ] Owner can sign in.
- [ ] One staff account is assigned **Supervisor + Stores**; both workspaces open from one login and the profile menu lists both.
- [ ] Change that person's departments in **Team & HR → Staff access**, reload, and confirm the change persisted in `profiles`.
- [ ] A Stores-only user cannot open `/workshop`; a Supervisor-only user cannot open `/stores`.
- [ ] Trial/active licence shows the correct plan and expiry.
- [ ] **Settings → Licence** shows the correct installation and machine IDs.
- [ ] One job card created end-to-end.
- [ ] One invoice printed A4 and thermal.
- [ ] One estimate printed/PDF and sent to the test number.
- [ ] One payment receipt printed.
- [ ] One job photo uploaded and viewed via signed URL.
- [ ] One branding logo uploaded.
- [ ] Audit log contains the job/invoice actions.
- [ ] Public `/check-in/<slug>` works from a phone on mobile data.
- [ ] `/book?token=BOOK-<CLIENT_ID>` works.
- [ ] PWA installs and reloads offline.
- [ ] No console errors.

### 6.4 WhatsApp / WAHA

- [ ] Session status is `WORKING`.
- [ ] Test text arrives at `+94 75 575 56803` while demo mode is on.
- [ ] Test PDF arrives as a native attachment.
- [ ] Invoice, estimate, payslip and voucher PDFs send.
- [ ] Gateway down does not block billing; fallback works.
- [ ] Demo mode is turned off only after client sign-off.
- [ ] A live test to a consented number succeeds after demo mode is off.

### 6.5 Security

- [ ] RLS enabled on all tenant tables.
- [ ] Anon cannot read `profiles`, `job_cards`, `ledger_entries` or payroll.
- [ ] Anon can call only the public check-in RPCs and licence poll.
- [ ] Service-role key is not in any browser bundle.
- [ ] `.env` is ignored by Git.
- [ ] Public sign-ups disabled on all projects.
- [ ] Owner MFA enabled.
- [ ] PDF and job-photo buckets private.
- [ ] WAHA dashboard restricted and API key strong.
- [ ] Audit log retention scheduled.
- [ ] Portal anon-write gap (G2) closed before public exposure.

### 6.6 Backup and rollback

- [ ] Client database snapshot taken.
- [ ] All four storage buckets copied.
- [ ] Previous frontend build/tag retained.
- [ ] Rollback procedure tested on a throwaway project.
- [ ] Portal run recorded as `Deployed`.
- [ ] Client confirms normal operation.

---

## 7. Release and update workflow

### 7.1 Publish a new core release

1. Merge the release into `main`.
2. Run:

```powershell
npx tsc -b
npm run lint
npm run build
```

3. Add the next additive migration, for example
   `supabase/migrations/20261114000700_next_change.sql`.
4. Apply it to the golden master.
5. Run `verify.sql`.
6. Update the manifest:

```sql
update public.golden_master_manifest
   set schema_version = '20261114000100-20261114000700',
       reference_version = 'gm-ref-<YYYY-MM-DD>',
       app_version = '1.5.0',
       notes = 'Golden master for release 1.5.0.'
 where id = 'RAVSOFT-GM-V1';
```

7. Publish the release in the portal database:

```sql
begin;
update public.developer_releases
   set is_latest = false
 where is_latest;

insert into public.developer_releases (
  version, released_at, title, changes, migration_files, channel, is_latest, notes
) values (
  '1.5.0', current_date, 'Release title', 'What changed.',
  array['20261201000100_next_change.sql'], 'Stable', true, 'Golden master updated.'
)
on conflict (version) do update
  set released_at = excluded.released_at,
      title = excluded.title,
      changes = excluded.changes,
      migration_files = excluded.migration_files,
      channel = excluded.channel,
      is_latest = true,
      notes = excluded.notes;
commit;
```

8. Update `LATEST_APP_VERSION` and `RELEASES` in
   `src/pages/DeveloperPortal.tsx`.
9. Rebuild and redeploy the portal.
10. Take a fresh golden snapshot and tag it.

### 7.2 Update a client

1. **Verify the golden master** — `verify.sql` passes.
2. **Back up** — client database and all storage buckets.
3. **Review the diff** — every new migration is additive.
4. **Queue the run** — `request_client_update(client_id, to_version)`.
5. **Merge** — `main` into `client/<installation-id>`; resolve only in
   `src/custom` where possible.
6. **Build** — `npx tsc -b`, `npm run lint`, `npm run build`.
7. **Apply migrations** — service role only, in order.
8. **Deploy the frontend** — from the client branch.
9. **Smoke test** — login, licence, one invoice, one estimate, one thermal
   receipt, custom-build badge, insurance release-order shortfall, multi-section
   final bill and the insurance desk queues.
10. **Record the result** — `record_client_update_result(run_id, 'Deployed', …)`.
11. **Keep the backup** until the client confirms normal operation.

### 7.3 Rollback

1. Record the rollback:

```sql
select public.record_client_update_result(
  '<RUN_UUID>',
  'Rolled Back',
  'Reason for rollback.'
);
```

2. Restore the previous frontend build/tag.
3. Restore the database snapshot only if a migration changed data.
4. Leave additive columns and tables in place; the older frontend ignores them.
5. Fix forward on `main`, merge into the client branch and queue a new run.

Never run a destructive down-migration on a live client.

---

## 8. Backups and disaster recovery

### 8.1 Database

- Enable daily backups in Supabase.
- Enable point-in-time recovery on paid plans.
- Take an on-demand backup before every client update.
- Keep at least 30 days of client backups.
- Test a restore into a throwaway project every quarter.

`pg_dump` example:

```powershell
$env:PGPASSWORD = "<CLIENT_DB_PASSWORD>"
$CLIENT_DB = "postgresql://postgres.<CLIENT_REF>:<CLIENT_DB_PASSWORD>@<DIRECT_OR_SESSION_POOLER_HOST>:5432/postgres"

pg_dump $CLIENT_DB `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file=".\backups\ravsoft-client-<client>-<date>.dump"
```

### 8.2 Storage

Copy all four buckets before an update:

- `job-photos`
- `branding`
- `invoice-pdfs`
- `payroll-pdfs`

Use the Supabase CLI storage commands, the dashboard download for small
volumes, or `rclone` against the project's S3-compatible endpoint. Verify the
object count after copying:

```sql
select bucket_id, count(*)
  from storage.objects
 group by bucket_id
 order by bucket_id;
```

### 8.3 Secrets and configuration

- Store every `.env.*` value in a password manager.
- Keep a deployment record: project refs, regions, domains, installation ID,
  branch, plan, expiry, WAHA URL/session, webhook URL, Google Drive backup
  webhook URL, folder ID and secret rotation date.
- Do not store secrets in Git, docs, screenshots or chat.

### 8.4 Daily Google Drive JSON snapshot

The workshop can upload a complete JSON snapshot to Drive every day through a
secured Apps Script or Supabase Edge Function webhook. Configure it in
**Settings → Data & backup**, run **Backup now**, and confirm the status line.

- Receiver setup and hardening: `docs/GOOGLE_DRIVE_BACKUP.md`.
- Keep the Drive folder private and the shared secret in a password manager.
- The browser catches up at the next launch if it was closed at the configured
  hour. For unattended guarantees, add a server-side scheduled function that
  exports `app_records` and uploads it.
- Test restoring one snapshot into a spare workshop before go-live.

### 8.5 Restore drill

1. Create a throwaway Supabase project.
2. Restore the latest client dump.
3. Run `verify.sql` only if it is a clean template; otherwise check row counts
   and a few known records.
4. Sign in as a test user and open one job card.
5. Confirm storage objects are present.
6. Destroy the throwaway project.

---

## 9. Security checklist

- [ ] One Supabase project per client; no shared schema.
- [ ] Portal, golden master and clients in separate projects.
- [ ] RLS enabled on every tenant table.
- [ ] Portal anon writes removed before public exposure (G2).
- [ ] `request_client_update` and `record_client_update_result` not callable by
      `anon`.
- [ ] Service-role keys only on trusted servers/CI.
- [ ] No service-role key in any `VITE_*` variable.
- [ ] `.env` and `.env.*` ignored by Git.
- [ ] Public sign-ups disabled on all projects.
- [ ] Owner MFA enabled.
- [ ] Job-photo and PDF buckets private; branding public-read only.
- [ ] WAHA dashboard protected; API key strong; CORS restricted.
- [ ] Deploy webhook authenticated; no unauthenticated browser webhook in
      production.
- [ ] Public check-in rate-limited/CAPTCHA-protected at the edge.
- [ ] Audit log retained and trimmed only by the service role.
- [ ] Backups and restore drills current.
- [ ] Staff offboarding revokes Auth sessions and deactivates profiles.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `create_workshop` says “You must be signed in” | Called with service role or anon key | Sign in as the owner and use the user JWT. |
| `create_workshop` says account already belongs to a workshop | Owner already has a profile | Use a fresh auth user or inspect `profiles`. |
| Slug rejected | Uppercase, spaces or symbols | Use lowercase letters, numbers and hyphens. |
| Licence poll returns `[]` | Installation ID mismatch or missing portal row | Match `workshops.installation_id`, app Settings and portal ID. |
| Client shows demo/local data after deploy | Supabase adapter missing or env not built in | Close G1; rebuild with `--mode client`. |
| Portal writes fail 401/403 | Wrong anon key or RLS | Check `VITE_MASTER_LICENSE_*`; verify policy. |
| Portal shows fake clients | Browser demo seed | Reset `ravsoft_master_portal_v1` to empty. |
| Portal **Publish registry** pushed demo rows | Seed not cleared | Delete the fake rows in Supabase and fix the portal seed. |
| `supabase db push` skips migrations | Filenames are not 14-digit timestamps | Use SQL editor/`psql`, or timestamped copies. |
| `pg_restore` fails on roles/extensions | Platform schemas included | Restore only `public`; let the new project own `auth`/`storage`. |
| `pg_restore` duplicate key on seeds | Data restored after migrations | Provision by replaying migrations instead. |
| WAHA send returns 401 | API key mismatch | Match `WHATSAPP_API_KEY` and the app's API key. |
| WAHA QR tab cannot fetch | Missing `X-Api-Key` header | Pair from the WAHA dashboard; click **Mark connected**. |
| WhatsApp sends to `+94 75 575 56803` | Demo mode is on | Expected. Turn it off only for live sending. |
| Storage upload 403 | RLS/path convention | Use `<workshop_id>/<job_number>/<file>` and the correct bucket. |
| PWA shows an old build | Service worker cache | Close all tabs, hard refresh; bump the SW version on release. |
| PWA install prompt missing | Not HTTPS or manifest unreachable | Check TLS, `/manifest.webmanifest` and `/sw.js`. |
| Portal custom domain 404 on refresh | SPA rewrite missing | Add `/* → /index.html`. |
| Client build points at the wrong database | Reused another build | Rebuild with this client's `.env.client`. |

---

## 11. Go-live sign-off

Record this in the portal notes and the internal deployment log:

| Item | Value |
| --- | --- |
| Client | |
| Installation ID | |
| Client slug | |
| Client Supabase project ref | |
| Client frontend URL | |
| Client branch | |
| Portal release | `1.4.0` |
| Golden tag | `golden-gm-v1.4.0` |
| WAHA URL / session | |
| Plan / expiry | |
| Database backup file + SHA-256 | |
| Storage backup location | |
| Portal run ID | |
| Deployed by / date | |
| Client sign-off name / date | |

**Do not hand over while any of these are true:**

- The client build has blank `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and
  therefore falls back to browser `localStorage`.
- The portal project still exposes anon read/write policies.
- The installation ID differs between the app and portal.
- The update run is not recorded.
- Demo mode routes real customer messages to the test number.
- No database and storage backup exists.

---

## Appendix A — Production gates: where the fixes live

| Gate | File | What to inspect |
| --- | --- | --- |
| G1 | `supabase/migrations/20261114000500_app_records.sql` | Workshop-scoped `app_records`, RLS, trigger and realtime publication. |
| G1 | `src/lib/cloudStore.ts`, `src/state/useCloudSync.ts` | State↔row diff, bootstrap, offline queue, realtime apply, auth lifecycle. |
| G1 | `src/lib/supabase.ts` | Client and master clients; blank env keeps demo mode. |
| G2 | `supabase/migrations/20261114000600_portal_security.sql` | Anon revokes, `is_portal_admin()`, admin policies, authenticated wrappers. |
| G2 | `src/pages/DeveloperPortal.tsx` | Portal sign-in, session-backed reads/writes, admin-role gate. |
| G3 | `src/pages/DeveloperPortal.tsx` | Installation ID field on registration and **Repoint ID** action. |
| G3 | `20261114000600_portal_security.sql` | `portal_change_installation_id` moves payments and update runs. |
| G4 | `src/pages/DeveloperPortal.tsx` | `deployClient()` queues the run, posts the webhook, records the result. |
| G4 | `20261114000400_portal_releases.sql` | `request_client_update` and `record_client_update_result`. |
| G5 | `supabase/migrations/` | Six timestamped files, `20261114000100`–`20261114000600`. |
| G6 | repository root | `.gitignore` excludes `.env`; initial commit on `main`. |
| G7 | `public/manifest.webmanifest` | Shortcut opens `/check-in`, not a demo slug. |

The live checks in the top table are the difference between a private pilot and
a production workshop. Phases 1 and 2, the golden-master verification, the
branch model and the WAHA wiring are otherwise ready to execute.