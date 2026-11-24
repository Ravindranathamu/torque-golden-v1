# ScanPlan ↔ Torque ERP integration

ScanPlan is RAVBsoft's separate attendance app. The developer portal licenses it,
but the workshop data stays in that workshop's existing Supabase project. Torque
ERP remains the source of truth for workers and staff accounts; ScanPlan reads
those records and writes attendance back into the same workshop.

## 1. Licensing

- Portal product name: **ScanPlan**
- Installation IDs: `SP-LK-XXXXXXXX` (6–16 letters/digits)
- Torque ERP keeps `WS-LK-XXXXXXXX`
- ScanPlan has **no fixed rate card yet**: the RAVBsoft admin types the agreed
  monthly fee on each client record.
- Annual renewal = `10 × monthly fee` for 12 months.
- Lifetime = `60 × monthly fee`, paid once, with the same 100-year expiry used by
  Torque ERP. Lifetime is an outright purchase, not a subscription.
- The ScanPlan app calls `public.poll_workshop_license(SP-LK-…)` on the client
  Supabase project, exactly like Torque ERP calls it with `WS-LK-…`.

## 2. Supabase connection

ScanPlan must be configured with the **same client Supabase URL and anon key**
as the workshop's Torque ERP installation. Sign in with a real workshop auth
account (owner or active staff). Row Level Security uses
`public.current_workshop_id()` from the `profiles` table, so no workshop ID needs
to be hard-coded in ScanPlan.

## 3. Data owner and collections

Torque ERP stores its whole app state as rows in `public.app_records`:

```text
workshop_id | collection | record_id | payload (jsonb)
------------------------------------------------------
<uuid>      | workers    | wrk_...   | WorkerProfile JSON
<uuid>      | users      | usr_...   | WorkshopUser JSON
<uuid>      | attendance | att_...   | AttendanceRecord JSON
```

ScanPlan should:

1. Read active workers from `collection = 'workers'` where
   `payload.status = 'Active'`.
2. Read staff accounts from `collection = 'users'` where
   `payload.active = true`.
3. Write attendance rows to `collection = 'attendance'`.

Do **not** create a second worker master in ScanPlan, and do not write attendance
only to the normalised `public.attendance` table — Torque payroll and the labour
assignment guard read `app_records`.

If a staff account has `payload.workerId`, that person is linked to a worker
profile. Record their attendance under `workerId` for payroll; use `userId` only
for staff who do not have a worker profile.

## 4. Attendance payload

```ts
interface AttendanceRecord {
  id: string;                 // unique, e.g. att_scan_<date>_<personId>
  date: string;               // YYYY-MM-DD
  workerId?: string;          // worker profile id, for payroll
  userId?: string;            // staff account id, when no worker profile
  sectionId?: string;
  status: "Present" | "Absent" | "Off Day";
  markedAt: string;           // ISO timestamp
  markedBy?: string;          // person or device that recorded it
  source?: "ERP" | "ScanPlan";// ScanPlan must set "ScanPlan"
}
```

Exactly one of `workerId` or `userId` must be present. Torque ERP ignores
malformed attendance rows so a bad external write cannot break payroll.

### Upsert example

```ts
const workshopId = /* from public.current_workshop_id() */;
const record: AttendanceRecord = {
  id: `att_scan_2026-11-24_wrk_123`,
  date: "2026-11-24",
  workerId: "wrk_123",
  status: "Present",
  markedAt: new Date().toISOString(),
  markedBy: "Gate terminal 1",
  source: "ScanPlan",
};

const { error } = await supabase.from("app_records").upsert(
  {
    workshop_id: workshopId,
    collection: "attendance",
    record_id: record.id,
    payload: record,
    sort_order: Date.now(),
    deleted: false,
  },
  { onConflict: "workshop_id,collection,record_id" },
);
```

Use the same `id` for a re-mark on the same day so the row is updated instead of
duplicated. Torque ERP's cloud subscription applies the change within about a
second.

## 5. What Torque ERP shows

- Worker attendance appears on **Workshop floor → Morning attendance** and feeds
  labour assignment and payroll. Rows recorded by ScanPlan are labelled
  `ScanPlan`.
- Staff attendance appears on **Workshop floor → Staff attendance today**.
- The portal registry shows ScanPlan clients separately in the product filter,
  with their own fee, payments and licence status.
