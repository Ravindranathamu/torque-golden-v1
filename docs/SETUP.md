# Production setup guide

This guide takes the demo from `localStorage` to a multi-tenant production
deployment with Supabase, Google Drive, WhatsApp Cloud API and a static-hosted
PWA. It also covers the extended workshop pack: advances, estimates, insurance
claims, inventory and supplier returns, banking, petty cash, cheques, attendance,
payroll, staff loans, daily wages, warranty returns, service history, Sri Lankan
IRD tax invoices, thermal/A4 printer routing and offline licence activation.

> The demo is fully functional without any of this. Use this guide when you are
> ready to onboard a real workshop.

For deployment support or customisation, contact **RAVsoft** at
[ravindranath@hotmail.co.uk](mailto:ravindranath@hotmail.co.uk) or
[+94 75 575 6803](tel:+94755756803).

> For the complete portal → golden master → first client rollout, including
> separate Supabase projects, hosting, WAHA and environment wiring, follow
> [`docs/DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md).

---

## 0. Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) account (free tier is enough to start)
- A Google Cloud account (Drive photo storage)
- A Meta developer account with a WhatsApp Business app (if using WhatsApp)
- A static host (Vercel, Netlify, Cloudflare Pages, S3/CloudFront, etc.)
- A domain name and HTTPS for PWA installation and QR links

---

## 1. Run the demo locally

```bash
npm install
npm run dev
```

Open the printed URL, select **Explore the demo workshop**, and sign in with
`owner` / `1234`. The owner master password is `owner123`.

Build and preview the production bundle:

```bash
npm run build
npm run preview
```

Service-worker registration is skipped in development; use `preview` to test
offline behaviour and installation.

---

## 2. Supabase backend

### 2.1 Create the project

1. Create a Supabase project and wait for provisioning.
2. Save the **Project URL** and **anon public key** from
   *Project Settings → API*.
3. Keep the **service-role key** private. It must never appear in the browser or
   the WhatsApp gateway client.

### 2.2 Apply the schema

Apply all six migrations **in order**. They are additive and idempotent, so
they can be re-run safely on an existing installation.

| Order | File | Purpose |
| --- | --- | --- |
| 1 | [`20261114000100_schema.sql`](../supabase/migrations/20261114000100_schema.sql) | Core ERP schema, RLS, views, public RPCs and storage. |
| 2 | [`20261114000200_golden_master.sql`](../supabase/migrations/20261114000200_golden_master.sql) | Global reference seeds, golden-master manifest and clean-state verification. |
| 3 | [`20261114000300_security_hardening.sql`](../supabase/migrations/20261114000300_security_hardening.sql) | Audit log, private PDF buckets, owner-only WhatsApp secrets and database-level licence enforcement. |
| 4 | [`20261114000400_portal_releases.sql`](../supabase/migrations/20261114000400_portal_releases.sql) | Latest-release registry, update-run ledger and portal update RPCs. |
| 5 | [`20261114000500_app_records.sql`](../supabase/migrations/20261114000500_app_records.sql) | Workshop-scoped application-state bridge, RLS, trigger and realtime publication. |
| 6 | [`20261114000600_portal_security.sql`](../supabase/migrations/20261114000600_portal_security.sql) | Admin-only portal policies, authenticated update wrappers and installation-ID repointing. |

Option A — SQL editor:

1. Open *SQL Editor* in the Supabase dashboard.
2. Paste and run each file above, starting with `20261114000100_schema.sql`.
3. Run [`supabase/golden-master/verify.sql`](../supabase/golden-master/verify.sql)
   as the service role before creating client data. It fails if the template
   contains any workshop rows.

Option B — Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The filenames already use the CLI's `<14-digit timestamp>_name.sql` convention,
so `db push` applies them in order and records them in
`supabase_migrations.schema_migrations`. Do not rename an applied migration.
See [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md#22-apply-the-migrations).

For a clean installation template, see
[`docs/GOLDEN_MASTER.md`](GOLDEN_MASTER.md). For rolling a release out to an
existing client, see [`docs/UPDATE_WORKFLOW.md`](UPDATE_WORKFLOW.md).

The core migration creates:

- Tenant tables: workshops, profiles, workers, suppliers, purchases, inventory,
  check-ins, job cards, tasks, parts, customer credits, expenses, ledger,
  marketing reminders, notifications and counters.
- Workshop update pack: insurance companies and claims, job estimates, advance
  payments, attendance records, staff loans, payslips, daily wage payouts,
  supplier credit notes and service records.
- Finance pack: purchase lines, supplier returns, stock movements, bank accounts
  and transactions, petty cash vouchers, customer cheques, credit payments,
  supplier cheques, workshop loans and loan instalments, plus per-user
  notification preferences.
- RLS helpers: `current_workshop_id()`, `is_owner()`,
  `has_any_department(text[])`.
- Public RPCs: `public_workshop(slug)`, `public_check_in(slug, payload)` and
  `lookup_vehicle_for_checkin(slug, vehicle_no)`.
- Atomic RPCs: `issue_job_part(part_id, qty)` and
  `settle_customer_credit(credit_id, amount, method)`.
- Report views: job financials, low stock, receivables, payables, cashier/gate
  queues, vehicle service history, monthly P&L, insurance receivables and
  marketing queue.
- Storage buckets `job-photos` (private), `branding` (public read) and, from
  `0003`, private `invoice-pdfs` and `payroll-pdfs` buckets.
- Per-workshop job-number generation, stock guards, credit status sync,
  supplier outstanding sync, low-stock notifications and status notifications.
- Realtime publication for notifications, check-ins, job cards, parts,
  inventory, insurance claims, estimates, advances, attendance, loans, payslips,
  wage payouts and service records.
- Workshop payroll settings (`working_days`, EPF/ETF rates) and licence fields
  (`trial_started_at`, `license_key`, `license_activated_at`,
  `license_expires_at`, `license_holder`).
- Job-card intake type, driver commission fields, insurance claim link and VAT
  invoice fields (customer TIN, VAT rate and amount); worker pay type, daily
  rate, EPF/ETF/commission toggles and allowed off days; part supplier invoice,
  warranty and salvage fields.
- IRD tax identity and printer routing on `workshops` (`tin_number`,
  `vat_reg_number`, `default_vat_rate`, `place_of_supply`, footer lines,
  `printer_mode`, `thermal_paper_width`, `standard_paper_size`) plus insurer
  `tin_number` and `active` status.

The scripts are written as additive DDL (`alter table … add column if not
exists`, `create table if not exists`, `drop policy if exists`) so they can be
re-run on an existing installation. Review each one before applying it to a
database that already contains production data.

### 2.2.1 Global reference data and clean template

`20261114000200_golden_master.sql` seeds the shared reference lists used by the UI —
expense and petty-cash categories, payment methods, service types, suggested
vehicle makes, the Sri Lankan insurance directory, licence plans and release
channels. Seeds use `on conflict do nothing`, so operator changes are preserved.

The same migration adds the `golden_master_manifest` row `RAVSOFT-GM-V1` and two
service-role-only functions:

- `golden_master_status()` — row counts and a `has_client_data` flag.
- `assert_golden_master_clean()` — raises if any workshop or client row exists.

Never create real workshop data in the golden-master project. Clone a fresh
project first, then onboard the client there. The full procedure and checklist
are in [`docs/GOLDEN_MASTER.md`](GOLDEN_MASTER.md).

### 2.3 Configure Auth

1. *Authentication → Providers*: enable **Email** (password or magic link).
   Enable **Phone** if you want SMS OTP for staff or customers.
2. *Authentication → URL Configuration*: set the site URL to your production
   domain and add `http://localhost:5173` plus preview domains to redirects.
3. *Authentication → Email Templates*: brand the confirmation and recovery
   emails.
4. Decide whether public sign-ups are allowed. For a private ERP, disable
   public sign-up after creating each owner, and invite staff through the
   Supabase Admin API or a small Edge Function.
5. Optionally enforce MFA for owners under *Authentication → Multi-Factor Auth*.

### 2.4 Create the first workshop owner

1. Create/sign up the owner in *Authentication → Users*.
2. In the SQL editor, call the onboarding RPC **as that user** (run it with the
   user's JWT, or temporarily use the service role in a trusted server
   function):

```sql
select public.create_workshop(
  'Vezel Masters Kandy',        -- company name
  'vezel-masters-kandy',        -- public QR slug
  'Nimal Perera',               -- owner full name
  '+94 81 234 5678',            -- workshop phone
  'owner@vezelmasters.lk',      -- owner email
  'LKR'
);
```

The function refuses to run if the account already belongs to a workshop, and
creates both the tenant row and the owner profile.

Example with the JavaScript client:

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const { data, error } = await supabase.rpc("create_workshop", {
  p_company_name: "Vezel Masters Kandy",
  p_slug: "vezel-masters-kandy",
  p_owner_name: "Nimal Perera",
  p_phone: "+94 81 234 5678",
  p_email: "owner@vezelmasters.lk",
  p_currency: "LKR",
});
```

### 2.5 Add staff

Each staff member needs a Supabase Auth user and a `profiles` row:

```sql
insert into public.profiles (
  id, workshop_id, full_name, username, phone, email,
  is_owner, departments, base_salary, commission_rate
) values (
  '<auth-user-uuid>',
  '<workshop-uuid>',
  'Kasun Silva',
  'kasun',
  '+94 77 123 4567',
  'kasun@example.com',
  false,
  array['PRO'],
  85000,
  2.5
);
```

`departments` accepts `PRO`, `Supervisor`, `Cashier`, `Accounting` and `Stores`,
and may contain several values. Only owners can write profiles; staff cannot
promote themselves.

A staff member who both supervises and handles stores uses one login:

```sql
update public.profiles
set departments = array['Supervisor','Stores']
where username = 'ruwan';
```

Permissions are additive, not exclusive: `has_any_department(text[])` and the
app's `hasAnyDepartment` helper grant a page when **any** assigned department
matches. A multi-role user therefore gets both the workshop and stores
workspaces from one login, with no role switch and no "already assigned"
conflict. The sidebar shows the union; notifications target every department
the user belongs to; the profile menu lists all roles.

In cloud mode, the owner can change a staff member's departments without SQL:
open **Team & HR → Staff access**, edit the person and tick every department
they cover. The app writes the change to `public.profiles` with the owner's
session, so it survives reload and applies at that person's next sign-in. The
same dialog also shows a coverage summary so no department is left unstaffed.

Creating or deleting the underlying Supabase **Auth** user is a server-side
action. Do it with the Admin API or the Supabase dashboard; the Team screen
deliberately blocks those two actions in cloud mode rather than pretending a
local-only account exists. In demo/local mode, PIN accounts are created and
removed directly in Team.

Worker payroll is held in `public.workers`, not `profiles`:

```sql
insert into public.workers (
  workshop_id, name, phone, role, base_salary, commission_rate,
  pay_type, daily_rate, epf_enabled, etf_enabled, commission_enabled,
  allowed_off_days_per_month, active
) values (
  '<workshop-uuid>', 'Sunil Bandara', '+94 71 234 5678', 'Technician',
  65000, 5, 'Monthly', 0, true, true, true, 2, true
);
```

Use `pay_type = 'Daily'` with a `daily_rate` for daily-wage workers. Their
commission can be excluded at payout time.

### 2.6 Verify tenant isolation

Use two test users in different workshops and confirm:

- Each sees only their own workshop data.
- Cross-workshop `select` returns zero rows.
- Anon can call only `public_workshop`, `public_check_in` and
  `lookup_vehicle_for_checkin`.
- `issue_job_part` rejects quantities above stock.
- `settle_customer_credit` rejects overpayment.

### 2.7 Storage

Buckets are created by the migration:

| Bucket | Visibility | Path convention | Writers |
| --- | --- | --- | --- |
| `job-photos` | Private | `job-photos/<workshop_id>/<job_number>/<file>` | Owner, PRO |
| `branding` | Public read | `branding/<workshop_id>/logo.png` | Owner |

Private job photos require signed URLs:

```ts
const { data } = await supabase.storage
  .from("job-photos")
  .createSignedUrl(`${workshopId}/${jobNumber}/${file}`, 60 * 60);
```

---

## 3. Frontend environment

Copy the template and fill in the values you use:

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_WHATSAPP_GATEWAY_URL=https://wa-gateway.example.com
VITE_WHATSAPP_GATEWAY_KEY=<same as GATEWAY_API_KEY>
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
VITE_GOOGLE_PICKER_API_KEY=xxxx
VITE_MASTER_LICENSE_URL=https://master-portal.supabase.co
VITE_MASTER_LICENSE_ANON_KEY=eyJ...
VITE_LICENSE_SIGNING_KEY=<shared offline-token signing key>
```

`VITE_LICENSE_PUBLIC_KEY` is reserved for a production asymmetric verifier; the
demo verifies `TRQ2.` tokens with the shared signing key. Leave all master
licence values blank to keep the workshop fully offline.

Only `VITE_*` variables are exposed to the browser. Never put service-role or
WhatsApp tokens there.

For the demo, leaving these blank keeps the localStorage backend.

### 3.1 Cloud mode and the `app_records` bridge

The app has two storage modes, selected at build time:

| Mode | Build values | Behaviour |
| --- | --- | --- |
| Demo / offline | `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` blank | Everything stays in browser `localStorage`. Setup, PIN login, demo data and the developer portal work without a server. |
| Cloud | Both client Supabase values set | Supabase Auth, workshop-scoped live data, realtime updates and an offline retry queue. |

When cloud mode is on, `/login` switches to email/password and `/setup` refuses
to create a second local workshop. The account must already have:

- a Supabase **Auth user**, and
- a `public.profiles` row whose `id` equals `auth.uid()` and whose
  `workshop_id` points at a row in `public.workshops`.

If either is missing, the app shows a provisioning message instead of creating
data. RLS derives the tenant from `public.current_workshop_id()`, which reads
that profile; never trust a workshop ID sent by the browser.

**How the bridge works**

- Migration `20261114000500_app_records.sql` creates
  `public.app_records(workshop_id, collection, record_id, payload, sort_order, deleted, ...)`.
- `src/lib/cloudStore.ts` serialises `AppState` to one row per record. Array
  collections use the record's `id` (`job_…`, `chk_…`, `usr_…`). Settings use
  `collection = 'settings'`, `record_id = 'workshop'`.
- `sort_order` preserves list order. Deleting a record writes a tombstone
  (`deleted = true`, empty payload) so an offline device cannot resurrect it.
  The trigger stamps `updated_at` and `updated_by` server-side.
- `src/state/useCloudSync.ts` loads the workshop on sign-in, debounces edits for
  1.2 s, pushes in batches of 400, retries from a local queue after reconnect,
  and applies realtime rows from other devices.
- RLS allows only members of the same workshop. A member can read and write
  their own workshop's rows; no client can see another workshop.
- The table is added to the `supabase_realtime` publication when that
  publication exists.

**Why a JSONB bridge instead of one SQL table per entity**

The engine uses prefixed text IDs and nested records, while the normalised
tables in `20261114000100_schema.sql` use UUID primary keys. A literal per-table
adapter would need an ID-mapping layer on every screen. The bridge gives shared,
RLS-protected live data now; the normalised tables remain the reporting and
future-migration contract. Moving a collection to a dedicated table later does
not change any page's action signatures.

**Rules**

- Use only the anon key in the browser. The service-role key must never be
  bundled; it bypasses RLS.
- Keep `app_records` enabled with RLS. Do not add a broad `using (true)` policy.
- The golden master must have zero `app_records` rows.
- If realtime does not fire, check
  `select * from pg_publication_tables where tablename = 'app_records';`.
- If sign-in says the account has no workshop profile, create the `profiles`
  row (or call `public.create_workshop()`) with the admin/service key from a
  trusted script; do not create it from the browser.

**Portal mode**

The developer portal uses a separate client (`VITE_MASTER_LICENSE_URL`) and a
Supabase Auth account with `app_metadata.role = "ravsoft_admin"`.
`20261114000600_portal_security.sql` removes anon access and installs the admin
policies. The only anonymous portal RPC is `poll_workshop_license(text)`.

### 3.2 Extended workflow data model

| Workflow | Tables | Key rules |
| --- | --- | --- |
| Advance payments | `advance_payments` | Amount > 0; unique receipt per workshop; balance = advances not yet applied at checkout. Cashier and Accounting only. |
| Estimates | `job_estimates`, `job_estimates.section_id` | Exactly one Initial estimate per repair section (one per job when sections are off); later estimates are `SUP-01`, `SUP-02`; Draft → Awaiting Approval → Approved/Rejected; editing an approved estimate is locked and creates a new revision (`Rev 2`). Approval loads labour as unassigned tasks; the supervisor assigns workers before completion. |
| Insurance claim | `insurance_claims`, `job_parts.salvage_*` | One claim per job; estimate and parts approval are separate; release order can arrive before cheque/salvage; insurer bill and customer bill are recorded separately; insurer TIN and branch override feed the IRD bill; salvage tracked per part. After release, salvage and cheque settlement stay open in **Insurance desk**: supervisors/storekeepers submit salvage, cashier/accounting record the cheque and settle the claim. |
| Separate vehicle bills | `vehicle_bills`, `job_tasks.assigned_bill_id`, `job_parts.assigned_bill_id` | Each vehicle can have an Insurance bill, a Customer bill and Additional shortfall bills, optionally tagged to a repair section. Ticked tasks/parts lock to one bill. Insurance bills start as `Awaiting Release Order` (shown as *Waiting for releasing order*); they settle on the insurer release order, while customer and additional bills are paid in full. A release order below the insurance bill creates an Additional customer bill for the difference after tax, reduced by customer-brought value already paid on the insurance bill; the credit prints as a deduction. Section bills settle independently; the consolidated **Final bill** prints only when every section bill is settled. Settled bills are immutable. Customer-brought parts are priced on the insurance bill only and never charged to the customer or sent to stores. |
| Daily Google Drive backup | `workshops.drive_backup_*`, `app_records` | A complete JSON snapshot uploads once a day to Drive through a secured Apps Script or Edge Function webhook. The browser catches up at the next launch if it was closed at the configured hour. Last success time, status and filename are stored in settings. See `docs/GOOGLE_DRIVE_BACKUP.md`. |
| Attendance | `attendance_records` | One row per worker per date; Present/Absent/Off Day; only Present workers can be assigned to tasks. |
| Monthly payroll | `staff_loans`, `payslips` | Basic pay prorated by payable days; commission added; loan deduction, EPF employee deduction and other deductions reduce net. EPF/ETF employer amounts are reported but not deducted. |
| Daily wages | `wage_payouts` | Pay for present days; commission optional; a receipt number is stored for every payout; unpaid amounts accumulate until paid. |
| Warranty returns | `supplier_credit_notes`, `job_parts.warranty_*` | Claim references the original supplier invoice; completion records the credit note; the part moves to Replaced/Credited. |
| Service history | `service_records` | One snapshot per job at dispatch, including tasks, parts, worker assignments, total and mileage. |
| Driver commission | `job_cards.driver_*`, `ledger_entries.driver_commission` | Fixed or percentage of labour/total; hidden from customer invoices; deducted from owner P&L; thermal voucher for cashier/driver signatures. |
| Opening stock & stock ledger | `inventory_items.opening_stock`, `stock_movements` | Stock only moves through opening stock, bulk purchase invoice, job part issue or supplier return. When a requested part is short, Stores can purchase the balance and issue it in one step: a direct cash purchase is recorded with the supplier invoice number, plus matching `Purchase` and `Job_Issue` movements. Normal stock issues do not require a supplier invoice. No manual +/- adjustments; every movement stores reason, reference and user. |
| Bulk purchases & returns | `supplier_purchases`, `purchase_lines`, `supplier_returns`, `supplier_return_lines` | Multi-row purchase invoices; returns reverse stock and supplier outstanding; only Accounting/Cashier may mark a supplier invoice paid. |
| Banking | `bank_accounts`, `bank_transactions` | Opening balances, inflows/outflows, internal transfers, per-account statements and dashboard liquidity. Cheque deposits and supplier payments post here. |
| Petty cash | `petty_cash_entries` | Float top-ups and expense vouchers with category/photo; printable voucher; low-balance alert under LKR 3,000; expenses included in P&L. |
| Customer cheques | `customer_cheques` | `In_Safe` → `Deposited` → `Cleared`/`Bounced`; bounce reason reopens the invoice or credit balance. |
| Credit payments | `credit_payments` | Part-payments by cash, card, bank transfer or dated cheque against an invoice; dated cheques remain pending until realised. |
| Supplier PDC & loans | `supplier_cheques`, `workshop_loans`, `workshop_loan_payments` | Post-dated cheques with “Take Back Cheque & Pay Cash”; monthly loan schedule and instalments; both post to bank/petty cash and P&L. |
| Tax invoices & printing | `workshops.*`, `job_cards.vat_*`, `insurance_companies.tin_number` | IRD A4 bordered grid with supplier/purchaser name, address, TIN, VAT rows, amount in words and AUTHORIZATION box. Normal invoices default to thermal (58/80 mm); insurance documents default to A4; cashier can override. |
| Voice alerts | `profiles.notification_preferences` (JSONB) | Per-user voice/notification toggles using the Web Speech API; alerts respect department targeting. |
| Licensing | `workshops.license_*`, `trial_started_at` | Trial starts at workshop creation; activation stores key, holder and expiry. |

Operational notes:

- Record attendance **before** assigning workers; the UI blocks absent or
  off-day workers. Corrections are an update to the same worker/date row.
- Run payroll for a closed period once. Payslips are immutable snapshots; a
  correction should be a new adjustment, not an edit to a paid slip.
- Apply staff-loan deductions inside the same transaction as the payslip and
  reduce `staff_loans.balance`; settle the loan when the balance reaches zero.
- Cashier checkout should create the ledger entry, apply advance payments, and
  record the insurance portion when the job is billed to an insurer. Never
  double-count an advance as both a receipt and a payment.
- Release the vehicle on the insurer's release note; do not block handover on
  cheque clearance. Salvage submission and cheque settlement then remain open in
  **Insurance desk** until the supervisor/storekeeper and cashier/accountant
  close them.
- Settle split bills in **Cashier → Separate bills**. An insurance bill is
  released against the insurer release order; the customer and additional bills
  are collected in full. If the release order is lower than the insurance bill,
  the shortfall is created automatically as an Additional bill payable by the
  customer. Never mutate the insurance bill to absorb the shortfall. The basis is
  the insurance bill grand total after tax, less any customer-brought value
  already included in that bill and paid by the customer.
- Cashier may add a discount before tax and may choose **With VAT** or **Without
  VAT** on each bill. The release/payment preview shows the resulting supply, VAT
  and net payable before the bill is settled.
- Repair sections estimate, work and bill independently. The consolidated final
  bill is available only when at least two section bills exist and every one is
  settled; it totals all section bills and applies the same insurance
  release-order/additional-bill rules to the combined total.
- Estimate approval never auto-assigns a technician. A job cannot be marked
  repair-completed while any labour task has no worker.
- Estimate parts load with no source. The supervisor must choose **Store
  supplied** or **Customer brought** before the request reaches stores. Store
  supply deducts stock normally; customer-brought marks the part issued without a
  stock movement and never appears in the stores issue/swap queues.
- Customer-brought parts are priced on the insurance bill at the agreed value and
  are excluded from customer invoices, workshop parts revenue and the ledger
  parts revenue. The store blocks them from Customer and Additional bills. A
  swap or return goes back to the customer with a WhatsApp message; it never goes
  into stores and never creates a store return/exchange request.
- Configure the daily Google Drive backup under **Settings → Data & backup** and
  run **Backup now** once. See `docs/GOOGLE_DRIVE_BACKUP.md` for the Apps Script
  or Edge Function receiver.
- Generate daily-wage receipt numbers per workshop and keep the commission
  inclusion flag on the payout for audit.
- Save a service record when the job is dispatched, not when it is created, so
  the final tasks, parts, workers and totals are captured.
- Never expose driver commission on an invoice, receipt, estimate or WhatsApp
  message. It is an internal voucher only and is deducted in the owner P&L.
- Stock must only change through opening stock, a bulk purchase invoice, a job
  part issue or a supplier return. Write a `stock_movements` row for every
  change and do not add a manual adjustment screen.
- Record bank and cash opening balances before taking payments. Customer cheque
  deposits, supplier payments, petty-cash top-ups and transfers all create
  `bank_transactions` rows so the statement reconciles.
- Keep dated cheques in `In_Safe` until the bank confirms deposit and clearance.
  A bounced customer cheque must reopen the invoice/credit balance and store the
  bounce reason; a supplier cheque taken back and paid in cash must reverse the
  original cheque row.
- Petty-cash vouchers need a category and optionally a photo. Alert the owner
  below LKR 3,000 and include expenses in the P&L.
- Insurance directory entries can be deactivated instead of deleted. New PRO
  intake lists only active insurers; historical claims and PDFs stay readable.
- Configure the company TIN, VAT registration number, default VAT rate (18%),
  place of supply and footer lines during setup or under **Settings → Printing &
  tax**. The cashier chooses With VAT or Without VAT per invoice.
- Keep the standard paper setting at A4 for IRD documents. Thermal widths are
  58 mm or 80 mm; test both from **Settings → Printing & tax → Test thermal
  print** before going live.
- Print the A4 QR check-in poster from **Settings → QR check-in** and mount it at
  the gate. The poster uses the current workshop slug and brand colour.

---

## 4. Google Drive photo storage

The demo stores photos as base64 data URLs so it works offline. Production
should store bytes in Google Drive or Supabase Storage.

### 4.1 Google Cloud setup

1. Create a Google Cloud project.
2. Enable **Google Drive API** and **Google Picker API**.
3. Configure the OAuth consent screen (external, testing or production).
4. Create an **OAuth 2.0 Client ID** of type *Web application*.
   - Authorised JavaScript origins: `http://localhost:5173` and your domain.
   - Authorised redirect URIs: your domain (GIS token flow usually needs none).
5. Create an API key restricted to the Picker API and your domain.
6. Use the least-privilege scope `https://www.googleapis.com/auth/drive.file` so
   the app can only manage files it creates.

### 4.2 Folder convention

```
Torque ERP/
└─ <workshop name>/
   └─ <job number>/          e.g. VM-1042
      ├─ receiving-note.pdf  (optional)
      └─ damage-*.jpg
```

When the PRO accepts a check-in:

1. Create or find the workshop root folder.
2. Create the job folder named with the job number.
3. Upload each photo with `files.create` (multipart) or a resumable upload.
4. Save the folder ID in `job_cards.drive_folder_id` and the file metadata in
   `job_cards.photos`.
5. Store the folder link on the job card and include it in the internal
   receiving note.

Access can be granted per folder to the workshop's Google account
(`gdrive_email` on the profile) instead of making folders public.

### 4.3 Supabase Storage fallback

If you prefer not to use Google Drive, upload to the private `job-photos`
bucket using the same `<workshop_id>/<job_number>/` convention. The schema and
RLS policies already support it. Signed URLs replace Drive share links.

---

## 5. WhatsApp (WAHA)

The app's automatic sender posts to a **self-hosted WAHA** gateway. WAHA keeps
the company's own WhatsApp number paired through WhatsApp Web, so customers see
the workshop's normal number and no Meta template approval is needed for routine
updates. The Meta Cloud API scaffold in `server/whatsapp-gateway` remains
available as an alternative.

### 5.1 WAHA setup

1. Deploy WAHA on a small VPS or container host and give it a persistent volume
   so the paired session survives restarts. Terminate TLS in front of it and
   keep it private except for the API.
2. Start a session named `default` (or your own name) and protect the API with
   `WHATSAPP_API_KEY`.
3. On the workshop installation, open **Settings → Integrations → WhatsApp**:
   - Mode: **WAHA**
   - Gateway URL: `https://waha.example.com`
   - Session: `default`
   - API key: the same `WHATSAPP_API_KEY`
   - Company WhatsApp number
   - **Automatic sending** on
4. Save, then open the pairing QR and scan it from the company phone under
   *WhatsApp → Linked devices*.
5. Confirm the session reports `WORKING`. The setup wizard asks for the same
   values, so a new installation can pair during onboarding.

Sending rules:

- Automatic dispatch runs only when mode is `WAHA`, the gateway URL is set and
  automatic sending is not switched off.
- **Demo mode** routes every outbound message and PDF to
  `+94755756803` and shows the amber demo banner. Trials and live installations
  send to the real customer.
- Text messages use `POST /api/sendText`. PDFs and images use
  `POST /api/sendFile` with base64 data, so invoices, estimates, advance
  receipts, payslips and insurance bills arrive as native attachments.
- A failed or unreachable gateway never blocks the workshop. The UI falls back
  to the device share sheet or a downloaded PDF and an opened `wa.me` chat.
- WhatsApp/WAHA secrets are stored in the owner-only
  `workshop_whatsapp_secrets` table from `20261114000300_security_hardening.sql`. Never
  put them in a client-side environment variable.

### 5.2 Meta Cloud API (optional)

1. Create a Meta app of type **Business** and add the **WhatsApp** product.
2. Link a WhatsApp Business Account and a phone number.
3. Copy the **Phone number ID** and create a **permanent token** through a
   system user with `whatsapp_business_messaging` permission.
4. Under *App settings → Basic*, copy the **App secret**.
5. Add the webhook:
   - Callback URL: `https://wa-gateway.example.com/webhook`
   - Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to `messages` (inbound messages and delivery statuses).

### 5.3 Run the Cloud API gateway

```bash
cd server/whatsapp-gateway
cp .env.example .env
# fill in WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN,
# WHATSAPP_APP_SECRET and GATEWAY_API_KEY
node index.mjs
```

Health check:

```bash
curl http://localhost:8787/health
```

Send a text message:

```bash
curl -X POST http://localhost:8787/api/send/text \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"94771234567","text":"Your vehicle is ready for collection."}'
```

Send a PDF invoice from base64:

```bash
curl -X POST http://localhost:8787/api/send/document \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "94771234567",
    "base64": "JVBERi0xLjQK...",
    "mimeType": "application/pdf",
    "filename": "VM-1042.pdf",
    "caption": "Invoice for your vehicle"
  }'
```

Send an approved template:

```bash
curl -X POST http://localhost:8787/api/send/template \
  -H "Authorization: Bearer $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "94771234567",
    "name": "service_reminder",
    "language": "en",
    "components": [{
      "type": "body",
      "parameters": [
        {"type":"text","text":"Nimal"},
        {"type":"text","text":"CAB-1234"}
      ]
    }]
  }'
```

Deploy the gateway to any Node 20 host (Render, Railway, Fly.io, a VPS or a
Supabase Edge Function rewrite). Terminate TLS at the platform and keep the
service private except for `/webhook`.

### 5.4 Recommended Meta templates

Submit these in *WhatsApp Manager → Message templates* for approval:

| Template | Use | Suggested variables |
| --- | --- | --- |
| `vehicle_received` | Receiving note after PRO acceptance | customer, vehicle, job no |
| `invoice_ready` | PDF invoice + amount due | customer, vehicle, amount, invoice |
| `vehicle_ready` | Handover invitation | customer, vehicle, job no |
| `service_reminder` | Periodic service due | customer, vehicle, target date |
| `mileage_reminder` | 5,000 km milestone | customer, vehicle, target km |
| `credit_reminder` | Outstanding balance | customer, vehicle, balance, due date |
| `review_request` | Google review link | customer, review URL |
| `supplier_payment` | Supplier payment confirmation | supplier, invoice, amount |
| `advance_receipt` | Advance payment receipt | customer, vehicle, job no, amount, receipt no |
| `payslip_ready` | Monthly payslip PDF | worker, month, net pay |
| `wage_receipt` | Daily-wage payout receipt | worker, date, amount, receipt no |
| `insurance_bill` | Insurer bill / claim update | insurer, claim, vehicle, amount |

The app also sends PDF documents directly (advance receipts, tax-style
invoices, payslips, insurance bills and release orders) through
`POST /api/send/document`, so a Meta template is only required when messaging
outside the 24-hour customer service window.

Rules to remember:

- Template messages can be sent outside the 24-hour window; free-form text
  cannot.
- Templates must be approved before sending.
- The gateway accepts document links or base64 uploads; WhatsApp's document
  limit is 100 MB, but the gateway caps base64 at 8 MB to stay within request
  and demo limits. Use a signed HTTPS link for larger files.
- Inbound webhook events are verified with `X-Hub-Signature-256` when
  `WHATSAPP_APP_SECRET` is set. The current scaffold logs events; forward them
  to your CRM, Supabase table or support inbox as needed.

### 5.5 Frontend wiring (Cloud API fallback)

The WAHA path is already wired in `src/lib/whatsapp.ts` and needs no frontend
environment variables beyond the Settings values. For the optional Meta gateway,
set `VITE_WHATSAPP_GATEWAY_URL` and `VITE_WHATSAPP_GATEWAY_KEY`. The legacy
gateway endpoints are:

- `POST /api/send/text`
- `POST /api/send/document`
- `POST /api/send/template`

Keep `wa.me` as the fallback so the app still works offline or when either
gateway is down.

---

## 6. Licensing and trials

Client installations start on a **30-day trial** created with the workshop. The
trial and activation screen is **Settings → Licence** (owner only).

### 6.1 Trial behaviour

- `workshops.trial_started_at` is set when the workshop is created.
- The app shows the days remaining and switches to a **licence lock screen** when
  the trial expires, except for the demo workshop. The screen shows the machine
  ID, the expiry date and an activation field, and the owner can activate a key
  there without signing out. Staff see a message to ask the owner.
- Trial data is not deleted on expiry; activating a licence restores access.

### 6.2 Issue a licence

1. On the client installation, open **Settings → Licence** and copy the
   **installation ID** (`WS-LK-XXXXXXXX`) and machine ID.
2. Open the RAVsoft developer portal at `/developer` and register the client,
   or send the IDs, client name, software name and licence period to RAVsoft
   ([ravindranath@hotmail.co.uk](mailto:ravindranath@hotmail.co.uk) /
   [+94 75 575 6803](tel:+94755756803)).
3. Issue a key in the format `TRQ-YYYYMMDD-XXXXXXXX`, where the date is the
   expiry date and the suffix is bound to the machine ID, or generate a signed
   `TRQ2.` offline activation token bound to the installation ID, plan, expiry
   and module flags.
4. Enter the key or token and licence holder in Settings → Licence and activate.

The demo helper `src/lib/licence.ts` exports `generateLicenceKey()` for
RAVsoft-issued keys and `generateOfflineToken()`/`verifyOfflineToken()` for
signed offline activation. A renewal is simply a new key or token with a later
expiry; activating it replaces the old expiry.

### 6.3 RAVsoft developer portal and isolated client servers

Each client runs its own isolated server and never opens an inbound licence
port. When `VITE_MASTER_LICENSE_URL` is configured:

- The client calls `POST /rest/v1/rpc/poll_workshop_license` with
  `{ p_installation_id }` on start-up and from **Sync licence now**.
- The response carries `status`, `plan`, `expires_at`, `feature_flags`,
  `holder` and `server_time`; the client caches it locally.
- The workshop keeps operating for up to **7 days** after the last successful
  poll. Clock rollback is detected through a monotonic high-water mark and
  forces a fresh online check.
- The portal can renew, suspend or switch modules remotely; the client applies
  the flags on the next poll without losing local data.

Portal tables and the RPC are included at the end of
`supabase/migrations/20261114000100_schema.sql`; `20261114000400_portal_releases.sql` adds the
release registry and update ledger:

| Table / function | Purpose |
| --- | --- |
| `developer_client_installations` | One row per isolated client server: client name, software name, server address, plan, status, expiry, feature flags, last seen, branch, custom-build flag and deploy webhook. |
| `developer_license_payments` | LKR renewal log with method, reference and months. |
| `poll_workshop_license(text)` | Outbound-only client poll; updates `last_seen_at`, expires overdue licences and returns the signed entitlement data. |
| `developer_releases` | Published versions with migration files, channel and a single `is_latest` row. |
| `developer_update_runs` | Auditable deployment runs with from/to version, status, webhook status and a data-preserved flag. |
| `request_client_update(client_id, to_version)` | Queues a one-click update and stamps `latest_version` on the client. |
| `record_client_update_result(run_id, status, detail)` | Records the deploy result and promotes `app_version` on success. |

See [`docs/UPDATE_WORKFLOW.md`](UPDATE_WORKFLOW.md) for the deploy webhook
payload, zero-data-loss update steps and rollback procedure.

The demo portal stores its registry in `ravsoft_master_portal_v1` and publishes
to Supabase when `VITE_MASTER_LICENSE_URL` and `VITE_MASTER_LICENSE_ANON_KEY`
are set. For production, replace the permissive demo RLS policies with an
authenticated developer role and keep write access off the public anon key.

### 6.4 Production hardening

The demo validates keys in the browser and stores activation in
`localStorage`/the workshop row. For commercial deployments:

- Validate the key and expiry on a trusted licensing endpoint or Edge Function,
  and return a short-lived signed entitlement.
- Bind the licence to a stable machine or installation identifier, and record
  activations server-side to detect sharing.
- Keep the signing secret out of the frontend; the client should only receive a
  signed token, never the secret used to create it.
- Gracefully degrade to read-only or a renewal screen; never destroy workshop
  data because a licence lapsed.

---

## 7. Deploy the PWA

### Vercel

```bash
npm run build
npx vercel --prod
```

- Framework preset: Vite
- Output: `dist`
- SPA rewrite: `/(.*)` → `/index.html`
- Environment variables: the `VITE_*` values above

### Netlify

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Add a catch-all rewrite to `/index.html`

### After deployment

1. Serve only over HTTPS.
2. Verify `/manifest.webmanifest`, `/sw.js` and `/icons/*` load.
3. Install from Chrome/Edge (install icon), Android Chrome (Add to Home screen)
   or iOS Safari (Share → Add to Home Screen).
4. Open Settings → QR and download/print the entrance QR. It points to
   `https://your-domain/check-in/<slug>`.
5. Test the public check-in in a private window; no login should be required.
6. Add the production domain to Supabase Auth redirect allow-lists.

---

## 8. Demo data, backup and migration

- The demo store is keyed in `localStorage` under `torque_workshop_erp_v1`.
- Demo data is versioned (`AppState.version = 4`). Loading an older snapshot
  migrates it in place and fills the new arrays/fields without discarding jobs.
- Settings → Data & backup exports a JSON snapshot and imports it back; older
  demo backups are accepted as long as their version is not newer than 4.
- Daily Google Drive backup uploads the same snapshot automatically through a
  secured webhook. Configure it in Settings → Data & backup and read
  `docs/GOOGLE_DRIVE_BACKUP.md`. The app catches up at the next launch if it was
  closed at the configured hour; use a server-side schedule for unattended
  guarantees.
- The demo seed includes an insurance job (`JC-1005`), an advance (`ADV-4001`),
  attendance, loans, payslips, a wage payout, a credit note and a driver
  commission so every workflow can be tried immediately.
- Reset demo data from Settings after experimenting to restore the seed.
- Export before clearing browser data or switching devices.
- To migrate demo data to Supabase, map the exported JSON to the SQL tables
  using the column mapping in section 3.1. There is no automatic migration.
- Back up Supabase daily (Dashboard → Database → Backups) and enable
  point-in-time recovery on paid plans.
- For job photos, back up the `job-photos` bucket or the Google Drive root.

---

## 9. Security checklist

- [ ] Supabase RLS enabled on every tenant table (migration does this), including
      advances, estimates, claims, attendance, loans, payslips, wages, credit
      notes and service records.
- [ ] Payroll and staff-loan tables readable only by Owner/Accounting.
- [ ] Cashier advance-payment data restricted to Owner/Cashier/Accounting.
- [ ] Insurance claim and estimate writes restricted to Owner/Supervisor/Cashier
      as defined by the policies.
- [ ] Release order, insurance/customer bill creation, cheque and claim
      settlement restricted to Owner/Cashier/Accounting; salvage submission
      restricted to Owner/Supervisor/Stores.
- [ ] Supervisors and storekeepers are scoped to their assigned sections, and
      worker profiles pick the sections they work in when multi-section mode is
      enabled.
- [ ] Licence keys validated on a trusted service; signing secret never shipped
      to the browser.
- [ ] Service-role key only in trusted server environments.
- [ ] Owner accounts use MFA; public sign-up disabled after onboarding.
- [ ] WhatsApp app secret set; webhook signature verification enabled.
- [ ] Gateway exposed over HTTPS with a strong `GATEWAY_API_KEY` and CORS list.
- [ ] Google OAuth uses `drive.file`, not full Drive access.
- [ ] Job photos stored privately; signed URLs expire quickly.
- [ ] Public check-in rate-limited/CAPTCHA-protected at the edge.
- [ ] Daily database backups and periodic restore tests.
- [ ] Staff offboarding: deactivate the profile, revoke auth sessions, rotate
      shared secrets if needed.
- [ ] Owner master password stored only as a hash in a trusted backend, never in
      browser storage (the demo's password is intentionally local-only).

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| App shows the setup screen every reload | Browser storage blocked/cleared | Allow site data; export a backup |
| PWA install prompt missing | Not HTTPS or manifest not reachable | Check `/manifest.webmanifest` and cert |
| New version not appearing | Old service worker shell | Hard refresh or close all app tabs |
| Supabase returns zero rows | No profile / inactive profile / wrong workshop | Check `profiles.workshop_id`, `active` |
| `create_workshop` fails | Slug invalid or account already linked | Use lowercase hyphen slug; use a fresh auth user |
| Check-in RPC forbidden | Wrong slug or workshop not configured | Confirm `workshops.slug` and `configured` |
| WhatsApp 401 | Expired token or wrong phone number ID | Regenerate a permanent token |
| Webhook verification fails | Verify token mismatch | Match Meta and gateway env exactly |
| WhatsApp template rejected | Missing variables or policy issue | Review Meta template guidelines |
| PDF too large | Base64 upload over 8 MB | Upload to storage and send a link |
| Google Drive 403 | Missing `drive.file` consent or API not enabled | Re-consent; enable Drive API |
| Thermal receipt misaligned | Printer paper width | Choose 80 mm in the print dialog |
| Trial expired / app locked | No licence activated | Settings → Licence, send machine ID, activate a valid key |
| Licence key rejected | Key issued for another machine ID or expired | Copy this installation's machine ID exactly; request a new key |
| Worker missing from task assignment | Not marked Present today | Mark attendance on Workshop, then assign |
| Payslip basic pay looks low | Absences exceed allowed off days | Check attendance and allowed off days in Team & HR |
| Daily wage not accumulating | Attendance not marked | Mark Present on each worked day before payout |
| Advance not reducing the bill | Advance recorded against another job | Check the job number on the advance receipt |
| Insurance job cannot be released | Release order not recorded | Record the insurer release note in the Insurance tab |
| Repair completion blocked | Estimate-approved task has no technician | Assign a worker to every labour task in Job → Labour & tasks |
| Stores does not see an estimate part | Supervisor has not chosen the part source | In Job → Parts & materials choose Store supplied or Customer brought |
| Final bill button is missing | Bills are not tagged to two or more sections | Tag each section bill with its repair section; settle every section bill first |
| Insurance desk shows nothing | Vehicle not released, or salvage/claim already closed | Release the vehicle, then check salvage per part and the claim cheque status |
| Customer-brought part cannot go to stores | Customer parts never enter stock | Hand it back with the swap/return button; WhatsApp the owner |

---

## 11. Support

For product questions, start with the demo and the in-app **Settings →
Integrations** notes. For schema changes, keep migrations additive and run them
through the Supabase CLI so every environment stays reproducible.
