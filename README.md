# Torque ERP — Automobile Workshop Management PWA

A complete, mobile-first workshop ERP for Sri Lankan automobile garages: customer
QR check-in, PRO gate approval, job cards, worker commissions, model-specific
stock, supplier credit, cashier billing with advance payments, customer credit,
insurance claims, attendance-based payroll, daily wages, accounting, service
reminders and an owner dashboard — installable on Android, iOS and PC from the
same link.

The repository ships with a **fully working demo** that runs without a backend,
plus a **production Supabase schema** and a **self-hosted WAHA WhatsApp
gateway** (with an optional Meta Cloud API scaffold) for going live. Client
installations start on a **30-day trial** and are activated with an offline
RAVsoft licence key.

Every worker can hold a fixed basic salary plus labour commission, with optional
EPF/ETF, salary advances and staff loans. Two or three technicians can share one
task, splitting its labour and commission equally at their own rates. Insurance
jobs support estimates, supplementary estimates, parts approval, insurer and
customer bills, release orders, per-part salvage and cheque tracking. A standard
Sri Lankan labour price catalogue, supplier invoice numbers, warranty returns,
morning attendance, daily wage payouts and optional driver commissions are built
in.

**Developed and maintained by RAVsoft.**  
Email: [ravindranath@hotmail.co.uk](mailto:ravindranath@hotmail.co.uk) · Phone:
[+94 75 575 6803](tel:+94755756803)

---

## Quick start (demo — no accounts, no backend)

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally <http://localhost:5173>), choose
**Explore the demo workshop**, and log in with any demo account.

### Demo logins

Every staff account uses PIN **`1234`**.

| Username | Name | Access |
| --- | --- | --- |
| `owner` | Nimal Perera | Owner — everything, dashboard, team & settings |
| `kasun` | Kasun Silva | PRO — gate, check-in approval, marketing |
| `ruwan` | Ruwan Fernando | Supervisor + Stores — job cards, parts, stock |
| `sampath` | Sampath Weerasinghe | Stores — inventory, suppliers, purchases |
| `ishara` | Ishara Jayasuriya | Cashier — billing, credit settlement, gate clearing |
| `malini` | Malini Abeywickrama | Accounting — P&L, expenses, payables, payroll |

The owner master password is **`owner123`**. It unlocks Team & HR salary editing
and owner-only security actions.

The **RAVsoft developer portal** is at <http://localhost:5173/developer> in
development and <https://ravsoft-portal.pages.dev/developer> in production. It
sits outside the staff shell and signs in through Supabase Auth against the
separate master database (`ravsoft-portal-prod`); use it to register client
installations for any RAVsoft app, renew or suspend licences, switch modules
remotely and generate signed offline tokens.

> Demo data lives in `localStorage`. Use **Settings → Data & backup** to export a
> JSON snapshot before clearing your browser, or reset the demo at any time.
> Because the demo has no shared server, the public QR check-in and the staff
> screens must be opened in tabs of the same browser/device. Connect Supabase
> (see [docs/SETUP.md](docs/SETUP.md)) to accept check-ins from customers' phones.

---

## The workflow

```
Customer scans QR ──► /check-in/:slug
        │  vehicle no, make, model, customer, +94 phone, mileage
        ▼
PRO gate ──► accepts repair or estimate intake, safety notes, damage photos
        │  optional driver + driver commission (hidden from customer bill)
        │  job number assigned, WhatsApp receiving note
        ▼
Supervisor ──► estimates, tasks + present workers (commission), parts requests
        │  free-text tasks with autosuggest from past jobs and last price
        │  insurance: estimate → parts approval → supplementary estimates
        ▼
Stores ──► suppliers, cash/credit purchases with invoice numbers, 20% margin
        │  warranty returns, supplier credit notes, salvage tracking
        ▼
Cashier ──► advance payments (receipt + WhatsApp), bill, discount
        │  cash/card/credit/insurance/dated cheque, thermal or A4 IRD tax invoice
        │  VAT on/off, customer TIN, PDF via WhatsApp, driver commission chit
        │  advances deducted from the customer balance
        ▼
PRO gate ──► release order / clearance notification, handover
        ▼
Accounting ──► expenses, payables, receivables, attendance payroll,
        │      EPF/ETF, staff loans, payslips, daily wages,
        │      insurance cheque tracking, driver commission P&L
        ▼
Owner ──► live P&L, receivables, commissions, low stock, marketing
```

Returning customers are recognised by vehicle number, and every job is grouped
under **History** for warranty claims (repairs, prices, supplier invoice
numbers, salvage, insurance status, workers/tasks and driver commission).

---

## What is included

### Operations
- Public QR check-in with compulsory vehicle number, make, model, customer,
  Sri Lankan mobile number and mileage; returning-vehicle autofill.
- PRO acceptance as **Repair** or **Estimate**, with safety/damage notes and
  multiple damage photos, organised by job number (Google Drive–ready).
- Job cards with labour tasks, multi-technician assignment and commission. A task
  can be shared by two or three workers; its labour and commission are split
  equally, and each worker earns their own commission rate on their share. Tasks
  are free text with autosuggest from past jobs and their last-used prices — no
  static labour catalogue to maintain.
- Multi-department staff (for example Supervisor + Stores) with one login.
- Model-specific parts matching, multi-quantity requests, strict stock
  enforcement, partial issuing, backorders, exchanges and returns.
- Stores: suppliers, multi-row cash/credit bulk purchases with credit periods,
  opening-stock setup, supplier returns, stock-card movement history, low-stock
  alerts, 20% default margin with override, and a **supplier purchase invoice
  number on parts bought through a recorded purchase**. Opening-stock items do
  not require one. Stock only moves through opening stock, a purchase invoice, a
  job issue or a supplier return. When a requested part is out of stock, Issue
  offers two paths: **purchase the balance** from a supplier (recording the
  supplier invoice) or **issue a suitable in-stock part**, which replaces the job
  line with the chosen stock item and deducts only the issued quantity.
- Cashier: one searchable billing queue with collapsed vehicle rows, fixed or
  percentage VAT-aware discounts, cash/card/credit/insurance/dated cheque,
  thermal 58/80 mm receipts, standard A4 IRD tax invoices, PDF WhatsApp
  delivery, review requests and PRO gate-clearance. A vehicle with separate
  bills expands to its bills, where several can be ticked and printed or sent as
  one set; once every bill is settled the vehicle leaves the queue and moves to
  **Paid & released**.
- **Advance payments** against a job number: printable thermal or A4 receipt,
  WhatsApp e-receipt, and automatic deduction from the final bill.
- Customer credit ledger with grace periods, part payments, payment method
  (including dated cheque), and reminders. A counter part payment moves the
  balance here and blocks gate release until Owner or Accounting approves it and
  the cashier confirms the vehicle exit.
- Accounting: rental, electricity, water, operational and other expenses;
  supplier payables with purchased-parts drawer; customer receivables; payroll
  and commission statements; bank accounts and internal transfers; petty-cash
  float and vouchers; incoming customer-cheque board; supplier post-dated
  cheques and workshop loans.
- **Accounting reports** for any period: stock (opening, in, out, closing,
  cost/retail value and low-stock status), a management trial balance, separate
  customer/supplier/insurance/cash-and-bank ledgers with running balances,
  debtor and insurance ageing, and the profit & loss statement. Owner's opening
  capital is captured during workshop setup and shown as equity in the trial
  balance. Presets cover today, this month, last month and this year, with exact
  From/To dates for any other range; every report prints and exports to CSV.
- **Reservations**: tokenised WhatsApp booking link, public `/book?token=...`
  form for name, phone, vehicle, repair type and preferred slot. Requests stay
  pending until a supervisor confirms; a previous-day 4:30 p.m. review popup and
  an appointment-day list drive confirm, reschedule, cancel, arrived and no-show
  actions, with WhatsApp notes to the customer.
- **Multiple bills per vehicle**: separate customer and insurance bills can be
  drafted against the same job with independent numbers, amounts and notes.
  Bills are saved as **Drafts** and appear in **Cashier's billing queue**, where
  the cashier chooses **No VAT** or **Add VAT** and marks the bill sent. Sent
  insurance bills become **Awaiting Release Order** (*Waiting for releasing
  order*). A release order below the insurance bill creates an **Additional**
  customer bill for the shortfall after tax; the shortfall is reduced by any
  customer-brought parts already valued on the insurance bill, and the additional
  bill prints that credit as a deduction. The queue has a dedicated vehicle-number
  search, shows one collapsed row per vehicle with its open amount, and expands
  to the bill table. When a vehicle has several bills, tick them and print or
  send the whole set in one PDF. When a vehicle has bills for more than one
  repair section, Cashier prints one consolidated **Final bill** only after every
  section bill is settled. Customer and additional bills can be collected in full
  or as a part payment; a part-paid bill moves its balance to the credit ledger
  and keeps the vehicle at the gate until Owner/Accounting approves the release
  and the cashier confirms the exit.
- **Partial settlement at checkout**: the cashier can collect part of a standard
  cash/card invoice or the first payment on a separate customer bill. The balance
  becomes a **Part Payment** customer-credit entry with its own grace period, and
  the job moves to **Awaiting Release Approval**. Only Owner or Accounting can
  approve the release; the approved job then waits in **Paid & released** for the
  **cashier** to approve the vehicle exit, so the PRO gate cannot hand it over.
  The credit stays in the ledger for reminders and later collection. The request
  and the Owner/Accounting decision both raise a **Credit approvals** voice alert
  that speaks the amount left on credit, so the cashier hears the release
  instruction without watching the screen. If the balance is settled before
  approval, the job clears to **Paid** automatically and appears in gate
  clearance without an approval. Insurance bills and dated cheques still require
  full settlement.
- **PRO billing-gate override**: the PRO can release an unpaid completed vehicle
  with a mandatory reason. The job becomes *Released on Credit*, a 7-day customer
  credit opens, and Owner/Cashier/Accounting are notified.

### Shared consumables & multi-section workshops
- **Open shop-floor containers (Mode B)**: consumables such as carb cleaner,
  cataloy, 2K paint and thinner are opened once and issued fractionally to jobs
  (`0.25 Can`, `250 ml`, `300 g`) from the stores floor. A container can be
  marked empty when the last usable quantity is gone.
- Fractional issues round cleanly on thermal receipts, A4 invoices, estimates
  and WhatsApp messages, and are exempt from insurance salvage because the
  container is not a customer part.
- **Included in labor** hides a consumable line from customer invoices, thermal
  receipts and WhatsApp while keeping its cost in the owner P&L and section
  profitability.
- Owner-defined **workshop sections** (Mechanical, Electrical, Body & Paint,
  Service Bay) with staff assigned to one or several sections. PRO intake can
  route a vehicle to multiple sections.
- Supervisors see only their sections' floor, attendance and tasks; storekeepers
  see section-scoped stock and requests. Central store remains the default, with
  optional per-section stores.
- Tasks, parts and ledger revenue are section-tagged, so Accounting reports
  revenue, parts cost, commission, gross profit and margin per section.
- Sections can hold their own estimate, tasks, parts and bill. One section can be
  completed and billed while another is still in progress. When every section
  bill is settled, Cashier prints a single final bill totalling the whole vehicle;
  insurance release-order and shortfall rules apply to that combined total.
- Several supervisors can serve the same section and work independently. Worker
  and staff profiles pick their sections, and supervisors/storekeepers only see
  the sections ticked on their profile.

### Modules & provisioning
- Owner-selectable modules saved as feature flags:
  `enable_multi_sections`, `enable_paint_module`, `enable_insurance_module`,
  `enable_estimates_module`, `enable_vat_invoicing`,
  `enable_advanced_accounting`, `enable_payroll_epf_etf`, `enable_daily_wages`,
  `enable_driver_commissions`, `enable_petty_cash` and
  `enable_voice_notifications`.
- Presets for a quick service bay, insurance workshop, multi-section full
  workshop and single-workflow mode. Disabled modules disappear from navigation,
  intake, the cashier, attendance and reports, and single-workflow mode hides
  every section selector.
- Modules can be changed later from Settings → Modules & sections or remotely
  through the developer portal licence sync.

### Estimates & insurance
- Estimates (one Initial estimate per repair section, then `SUP-01`, `SUP-02`
  supplements) prepared by the Supervisor, including for vehicles already
  checked in. Estimates are editable with revision tracking (`Rev 2`) and lock
  after approval. Each estimate can be tagged to a workshop section.
- Estimate-only jobs hide **Add task**, **Request parts** and **Complete repair**
  until approval; approval copies the estimate lines into tasks/parts and moves
  the job to **In Progress**. Approved tasks load **unassigned** — the supervisor
  must assign at least one technician to every task before the repair can be
  completed. Several technicians can share one task; its labour and commission
  are split equally between them.
- Estimate parts load without a source. The part description autocompletes from
  current stock; choosing a stock item fills its last selling price without
  deducting stock. Before stores sees a request, the supervisor marks each part **Store
  supplied** or **Customer brought**. Customer-brought parts are valued on the
  insurance bill, skip stock deduction, and never go to Stores; a swap or return
  is handed back to the customer with a WhatsApp message. A returned
  customer-brought line offers **Add again…** — re-add it as customer-brought
  immediately, or send a fresh store request so Stores prices it at issue.
- Insurance workflow: section estimates → estimate approval → parts approval →
  supplementary estimates → draft insurance and customer bills → cashier sets
  VAT and sends → release order → salvage submission → cheque receipt in the
  Insurance desk and claim settlement only when the cheque is realized.
- Insurance billing roles: the job **Invoice** tab drafts insurance/customer
  bills; **Cashier** sets VAT and sends them, then records the release order or
  customer payment. Cheque recording, deposit and realization are
  cashier/accounting work (owner can override); realizing the cheque is what
  marks the claim settled. Supervisors and storekeepers handle salvage
  submission. The **Insurance desk** collects post-release salvage and cheque
  work in one queue after the vehicle has left.
- Vehicles can be released on the insurer's **release note** without waiting for
  the cheque or salvage; salvage submission remains a workshop duty tracked per
  part (`Pending`, `Submitted`, `Not Required`).
- Editable directory of Sri Lankan insurance companies with address, email,
  hotline, TIN and active/inactive status. PRO intake lists only active insurers;
  historical claims stay readable.
- Insurance estimates and bills download/email as branded A4 PDFs with insurer
  name, address, hotline, claims email, TIN, policy/claim/vehicle/owner details
  and separate parts/labour tables.
- Insurance receivable and cheque tracking in Accounting, with insurer details
  on claim PDFs and release orders.

### Tax invoices & printing
- Sri Lankan IRD-style A4 tax invoice: bordered grid, title box, date and invoice
  number, supplier/purchaser name, address and TIN blocks, date/place of supply,
  vehicle/job strip, grouped Done Jobs and Added Items tables,
  subtotal/discount/VAT rows, amount in words, mode of payment,
  inquiry/complaint footer and AUTHORIZATION box.
- Colourful branded A4 invoice and estimate templates use the uploaded logo and
  brand colour. Estimates omit the Date of Supply and Place of Supply rows and
  support PDF, print and WhatsApp for both normal and insurance jobs.
- Owner setup stores company TIN, VAT registration number, default VAT rate
  (18%) and place of supply. **VAT is chosen in Cashier before a bill is sent**
  to the insurer or corporate customer; once sent, the VAT is fixed and the
  cashier can still apply a discount at collection. VAT rate and amount are
  saved on the bill, job and insurance claim.
- Insurance, customer and additional bills all print as **INVOICE** or **TAX
  INVOICE** — never "Insurance Invoice" or "Additional Invoice". Customer-brought
  parts print at their agreed value on the insurance bill, with no
  "(customer supplied)" tag and a note that the insurer is billed for them.
- Printer routing chosen at setup: Standard PC, Thermal only, or Both, with
  58 mm/80 mm thermal width. Normal invoices and advance receipts default to
  thermal; insurance documents default to A4; the cashier can override a
  customer document between thermal and A4.
- Thermal driver-commission voucher with voucher/job/vehicle details and
  driver/cashier signature lines. It remains internal and never appears on
  customer documents.

### Payroll & HR
- Fixed basic salary plus labour commission per worker; monthly or daily pay
  basis. When several technicians share a task, its commission is divided
  equally and each technician earns their own rate on their share.
- Optional EPF and ETF contribution toggles per worker, with configurable
  employee/employer percentages and company working days.
- Salary advances and staff loans that automatically deduct from net salary.
- Morning attendance register: mark Present / Absent / Off Day, visible to the
  whole workshop; only present workers can be assigned to tasks.
- Attendance-based basic salary with owner-assigned allowed off days; company
  working days drive the daily rate. After the morning register is submitted it
  stays hidden until the next calendar morning, with an edit link for corrections.
- PDF payslips with WhatsApp sharing, thermal payslip printing, plus EPF/ETF
  totals for the month. Employer EPF and ETF are included in the owner P&L.
- Daily-wage workers paid at end of day, with unpaid wage accumulation, thermal
  receipts and an optional commission exclusion.

### Owner controls & licensing
- Optional **driver commission** at vehicle intake: driver name and phone, fixed
  or percentage of labour or total bill. It can be edited later by a Supervisor
  or Cashier, prints on an internal thermal chit, never appears on the customer
  invoice, and is deducted in the owner P&L.
- Worker/task assignments are saved into vehicle service history snapshots.
- Owner dashboard: live P&L, cash vs credit sales, bank/cash liquidity, petty
  cash, receivables, salaries, commissions, driver commissions, expenses, low
  stock, insurance receivables and supplier payables.
- Marketing: periodic service reminders based on a rolling average cycle and
  5,000 km milestones, with a 2-day post-handover buffer.
- Vehicle-number history search across all job cards. Visit cards stay collapsed
  (plate, owner, visit date, mileage, total) until opened.
- A4 QR check-in poster, printable from Settings, plus logo upload with automatic
  brand-colour extraction, self-service PIN/password change and per-user voice
  alert preferences.
- **Voice alerts** announce vehicle numbers only (never job numbers) for
  selectable job, inventory, payment, credit approval, cheque and appointment
  events, with voice choice, rate, pre-alert chime, watchdog and a tap-to-unlock
  gesture for Android/iOS browsers. Credit requests and approvals speak a fuller
  sentence with the balance left on credit instead of the generic title.
- **Demo mode** is separate from the 30-day trial. Only demo mode redirects every
  WhatsApp message and PDF to `+94755756803` and shows an amber warning banner.
- **WAHA WhatsApp**: settings and the setup wizard capture the gateway URL,
  session and API key, open the QR pairing page and mark the company account
  connected. Intake, handover, reminders and appointment notes send
  automatically; invoices, estimates, receipts and payslips attach as PDFs.
- **30-day trial** and remote licence activation bound to a machine ID
  (`TRQ-YYYYMMDD-XXXXXXXX`), managed from Settings → Licence. When a trial or
  licence expires, staff see a licence lock screen with the machine ID and an
  activation field; workshop data is never deleted.
- **Isolated client server** with outbound-only polling to
  `VITE_MASTER_LICENSE_URL`, a signed `TRQ2.` offline activation token bound to
  the installation ID, plan, expiry and module flags, and a 7-day offline grace
  period from the last successful check. Clock rollback is detected and forces a
  fresh online check before operations resume.
- **RAVsoft developer portal** at `/developer`: fleet KPIs, searchable client
  registry, client registration with software name and server address, activate/
  renew/suspend licensing, LKR payment log, remote module switches, offline token
  generator and WhatsApp renewal reminders. The demo registry is local
  (`ravsoft_master_portal_v1`) and can publish to Supabase when the master URL and
  anon key are configured.

### Platform
- Responsive React + TypeScript PWA, installable on Android/iOS/PC.
- Custom teal/amber design system, Lucide icons, no CSS framework.
- Demo persistence via `localStorage` with JSON backup/import/reset.
- Production Supabase schema: multi-tenant tables, RLS, triggers, reporting
  views, storage buckets and public check-in RPCs, including attendance,
  payroll, insurance, warranty, banking, petty cash, cheque and stock-movement
  tables.
- Dependency-free WhatsApp gateway for text, template and PDF document sends,
  with webhook signature verification.
- Offline licence activation (`src/lib/licence.ts`) with a configurable trial,
  machine ID and key validation.
- PWA manifest, offline app shell service worker, branded icons.

---

## Roles and access

Routes are guarded by owner/department membership. A user can hold multiple
departments (for example Supervisor + Stores).

| Area | Access |
| --- | --- |
| Dashboard, Team, Settings | Owner only |
| Gate, Marketing | PRO (Owner always allowed) |
| Workshop | Supervisor |
| Stores | Stores |
| Cashier | Cashier |
| Accounting | Accounting |
| Job detail, History | Any signed-in staff member |
| Public check-in | Anonymous, via QR slug |

Sensitive actions — payroll terms, commission rates, licence activation and
owner security — also require the owner master password. Supervisors mark
morning attendance; Accounting runs payroll and daily-wage payouts from the
recorded attendance.

---

## Tech stack

- React 19, TypeScript, Vite 8
- React Router 7
- Custom CSS design system (no Tailwind)
- Lucide icons
- jsPDF for A4 IRD tax invoices, insurance estimates/bills and payslips; HTML
  print sheets for 58 mm/80 mm thermal receipts and A4 documents
- qrcode for entrance QR generation
- localStorage demo store (seed data included)
- Supabase/PostgreSQL schema for production
- Node 20 WhatsApp Cloud API gateway (zero dependencies)
- Service worker + web app manifest for PWA install/offline shell

---

## Project structure

```
.
├─ index.html                     App metadata, icons, manifest
├─ public/
│  ├─ manifest.webmanifest        PWA manifest
│  ├─ sw.js                       Offline shell + asset cache
│  ├─ favicon.svg
│  └─ icons/                      PWA / iOS icons
├─ src/
│  ├─ App.tsx                     Guarded route tree
│  ├─ main.tsx                    Providers + service-worker registration
│  ├─ styles.css                  Design system and responsive layouts
│  ├─ types.ts                    Domain model
│  ├─ state/AppStore.tsx          Auth, business actions, persistence
│  ├─ data/seed.ts                Demo workshop and sample data
│  ├─ custom/                     Per-client branch overrides (`src/custom`)
│  ├─ components/                 Layout, UI primitives, credit ledger, toast,
│  │                              developer credit
│  ├─ pages/                      Setup, Login, PublicCheckIn, Dashboard, Gate,
│  │                              Workshop, JobDetail, Stores, Cashier,
│  │                              Accounting, Marketing, History, Team, Settings,
│  │                              Appointments, DeveloperPortal
│  └─ lib/                        Analytics, payroll, licensing, invoice/print/
│                                 WhatsApp, branding, message templates,
│                                 developer details
├─ supabase/migrations/
│  ├─ 20261114000100_schema.sql             Production schema, RLS, views, storage
│  ├─ 20261114000200_golden_master.sql      Reference seeds and clean-template checks
│  ├─ 20261114000300_security_hardening.sql Audit, private PDFs, licence enforcement
│  └─ 20261114000400_portal_releases.sql    Release registry and update runs
├─ supabase/golden-master/
│  └─ verify.sql                  Fails if the template contains client rows
├─ server/whatsapp-gateway/       WhatsApp Cloud API service
├─ docs/SETUP.md                  Production deployment guide
├─ docs/DEPLOYMENT_PLAN.md        Portal → golden master → first client runbook
├─ docs/GOLDEN_MASTER.md          Clean template and onboarding guide
├─ docs/UPDATE_WORKFLOW.md        Branch, release and rollback workflow
└─ .env.example                   Frontend environment template
```

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |
| `cd server/whatsapp-gateway && npm start` | Run the WhatsApp gateway |

---

## Going to production

The full walkthrough is in **[docs/SETUP.md](docs/SETUP.md)**. For the complete
portal → golden master → first client rollout, including separate servers and
environment wiring, follow **[docs/DEPLOYMENT_PLAN.md](docs/DEPLOYMENT_PLAN.md)**.

> The current build is demo-first: the workshop store still persists to browser
> `localStorage`. Complete the Supabase data/auth adapter in
> [docs/SETUP.md §3.1](docs/SETUP.md#31-connecting-the-app-to-supabase) before a
> live client cutover. The deployment plan marks this and the portal-admin RLS
> work as production gates.

In short:

1. **Supabase** — create a project and run all six migrations in order:
   `20261114000100_schema.sql`, `20261114000200_golden_master.sql`,
   `20261114000300_security_hardening.sql`, `20261114000400_portal_releases.sql`,
   `20261114000500_app_records.sql`, `20261114000600_portal_security.sql`. Verify
   the clean template with `supabase/golden-master/verify.sql`, enable email/phone
   auth, then create the first owner by calling `public.create_workshop(...)`.
2. **Frontend** — copy `.env.example` to `.env`, add the Supabase URL and anon
   key, build and deploy `dist/` to Vercel, Netlify, Cloudflare Pages or any
   static host with SPA fallback.
3. **Google Drive** — create a Google Cloud OAuth client with the `drive.file`
   scope and store each job's photos in
   `job-photos/<workshop_id>/<job_number>/`. The demo keeps photo bytes locally.
4. **WhatsApp** — self-hosted **WAHA** is the active gateway. Configure the
   company number in **Settings → Integrations**: gateway URL, session name and
   optional `X-Api-Key`, then pair the account by QR. Automatic intake, handover,
   appointment and reminder messages queue only when WAHA mode is on. Demo mode
   routes every outbound message to `+94755756803`. The Meta Cloud API scaffold
   in `server/whatsapp-gateway` remains available for approved-template setups.
5. **PWA** — serve over HTTPS and install from the browser menu. QR links use
   `/check-in/<slug>`.
6. **Licensing** — each client installation starts a 30-day trial. Copy the
   installation ID (`WS-LK-XXXXXXXX`) from Settings → Licence into the developer
   portal, issue a `TRQ-YYYYMMDD-XXXXXXXX` key or a signed `TRQ2.` offline token,
   then activate it on the workshop. A new key with a later expiry renews the
   licence; the demo workshop stays available for evaluation.
7. **Master portal** — create a separate Supabase project for the developer
   portal and run all six migrations. They include
   `developer_client_installations`, `developer_license_payments`,
   `poll_workshop_license`, the release registry, the update-run RPCs and the
   admin-only RLS from `20261114000600_portal_security.sql`. Create the admin Auth
   user with `app_metadata.role = "ravsoft_admin"`, set
   `VITE_MASTER_LICENSE_URL` and `VITE_MASTER_LICENSE_ANON_KEY` in `.env.portal`,
   then run `npm run deploy:portal`. Each client polls outbound only and keeps
   working for 7 days offline after the last successful check. The live portal is
   <https://ravsoft-portal.pages.dev/developer>; see
   [docs/DEPLOYMENT_PLAN.md §2.5.1](docs/DEPLOYMENT_PLAN.md#251-live-portal-record).
8. **Offline tokens** — set the same `VITE_LICENSE_SIGNING_KEY` on the portal
   and client builds so signed `TRQ2.` activation tokens verify. Leave blank for
   the built-in demo secret. `VITE_LICENSE_PUBLIC_KEY` is reserved for a
   production asymmetric verifier.

### Golden master and client updates

- The **golden master** is the clean template: full schema, global reference
  seeds and no client rows. Verify it with
  `supabase/golden-master/verify.sql` before every snapshot. See
  [docs/GOLDEN_MASTER.md](docs/GOLDEN_MASTER.md).
- Each client keeps its own server and branch,
  `client/<installation-id>`. Client-specific code lives in `src/custom` so core
  releases merge cleanly from `main`.
- The portal records the branch, a **Custom build** badge and a customisation
  summary, publishes the latest release and requests one-click updates through
  `request_client_update(...)`. Every deploy uses additive migrations and keeps
  client data. See [docs/UPDATE_WORKFLOW.md](docs/UPDATE_WORKFLOW.md).
- The deploy webhook payload is
  `{ clientId, software, branch, fromVersion, toVersion, strategy: "additive-migrations", preserveClientData: true, requestedAt }`.

### Production security notes

- The demo's PIN login, plaintext owner password and localStorage data are for
  evaluation only. Production uses Supabase Auth, hashed credentials, JWT
  sessions, RLS and server-side authorization.
- Never put a Supabase **service-role** key in the frontend or gateway client.
  The gateway's `GATEWAY_API_KEY` is a separate shared secret.
- Public vehicle lookup is intentionally limited to the fields needed for
  check-in autofill. Add rate limiting/CAPTCHA at your edge if vehicle-number
  enumeration is a concern.
- WhatsApp template messages must be approved by Meta when using the Cloud API
  gateway. WAHA sends through the paired WhatsApp Web session, so keep the
  company number active and respect WhatsApp's anti-spam rules. Demo mode routes
  all outbound messages to the RAVsoft test number.
- Back up `localStorage` data before switching to Supabase; there is no automatic
  migration from the demo store.
- The demo licence check runs in the browser so it can be evaluated offline.
  For a commercial client installation, validate licence keys on a trusted
  licensing service or signed server response rather than trusting client time
  or storage alone.

---

## Deployment

Any static host works. For Vercel or Netlify:

- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrite: all paths → `/index.html`
- Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional
  WhatsApp/Google variables, and for licensing
  `VITE_MASTER_LICENSE_URL`, `VITE_MASTER_LICENSE_ANON_KEY`,
  `VITE_LICENSE_SIGNING_KEY`.

The service worker is registered only in production builds. After deploying a
new version, users receive the updated shell on their next navigation.

---

## Developer & support

Torque ERP is developed and maintained by **RAVsoft**.

- **Email:** [ravindranath@hotmail.co.uk](mailto:ravindranath@hotmail.co.uk)
- **Phone:** [+94 75 575 6803](tel:+94755756803)

Contact RAVsoft for production setup, Supabase integration, Google Drive photo
storage, WhatsApp messaging, workshop-specific customisations or licensing.

## Copyright

Copyright © 2026 RAVsoft. All rights reserved.

Torque ERP and its source code may not be copied, redistributed or resold
without written permission from RAVsoft.
