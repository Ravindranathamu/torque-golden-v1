-- ============================================================================
-- 0002 — Golden master: reference seeds only, zero client data
--
-- A golden master is a clean installation template:
--   * the full schema from 0001 plus this migration
--   * global reference lists used by the UI
--   * no workshops, profiles, workers, jobs, invoices or client secrets
--
-- Run order:
--   20261114000100_schema.sql
--   20261114000200_golden_master.sql
--   20261114000300_security_hardening.sql
--   20261114000400_portal_releases.sql
--
-- The script is additive and idempotent. Re-running it never overwrites an
-- operator-customised reference value because seeds use ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Global reference data
-- ---------------------------------------------------------------------------
create table if not exists public.system_reference_data (
  key text primary key,
  category text not null default 'General',
  value jsonb not null,
  description text not null default '',
  is_seed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_reference_data enable row level security;

drop policy if exists system_reference_read on public.system_reference_data;
create policy system_reference_read on public.system_reference_data
for select to authenticated
using (true);

-- No insert/update/delete policy: only the service role or a trusted migration
-- may change global reference data.

insert into public.system_reference_data (key, category, value, description)
values
  (
    'expense_categories',
    'Finance',
    '["Rental","Salaries","Utilities","Marketing","Transport","Office Supplies","Repairs","Bank Charges","Insurance","Other"]'::jsonb,
    'Operating expense categories used by Accounting.'
  ),
  (
    'petty_cash_categories',
    'Finance',
    '["Fuel","Transport","Office Supplies","Refreshments","Repairs","Other"]'::jsonb,
    'Petty cash voucher categories.'
  ),
  (
    'payment_methods',
    'Finance',
    '["Cash","Card","Bank Transfer","Cheque","Credit"]'::jsonb,
    'Payment methods accepted by the workshop.'
  ),
  (
    'service_types',
    'Workshop',
    '["Mechanical","Electrical","Body & Paint","Service Bay","Insurance"]'::jsonb,
    'Default workshop sections and repair types.'
  ),
  (
    'vehicle_makes',
    'Workshop',
    '["Honda","Toyota","Suzuki","Nissan","Mitsubishi","Mazda","Hyundai","Kia","BMW","Mercedes-Benz","Audi","Volkswagen","Ford","Isuzu","Tata","Mahindra","MG","BYD"]'::jsonb,
    'Suggested vehicle makes for intake forms. Free text remains allowed.'
  ),
  (
    'insurance_companies_lk',
    'Insurance',
    '[
      {"name":"Ceylinco General Insurance","hotline":"+94 11 230 0000"},
      {"name":"Sri Lanka Insurance","hotline":"+94 11 235 5555"},
      {"name":"Allianz Lanka","hotline":"+94 11 230 3030"},
      {"name":"AIA Sri Lanka","hotline":"+94 11 230 8888"},
      {"name":"Sanasa General Insurance","hotline":"+94 11 230 4444"},
      {"name":"LOLC General Insurance","hotline":"+94 11 230 5555"},
      {"name":"Continental Insurance Lanka","hotline":"+94 11 230 6666"},
      {"name":"HNB General Insurance","hotline":"+94 11 230 7777"},
      {"name":"People''s Insurance","hotline":"+94 11 230 9999"},
      {"name":"Union Assurance General","hotline":"+94 11 230 1111"}
    ]'::jsonb,
    'Reference insurance directory. Verify hotlines before production use; each workshop can add its own entries.'
  ),
  (
    'licence_plans',
    'Licensing',
    '["Lite","Starter","Growth","Pro","Enterprise"]'::jsonb,
    'RAVBsoft licence plans.'
  ),
  (
    'release_channels',
    'Licensing',
    '["Stable","Beta","Custom"]'::jsonb,
    'Release channels used by the developer portal.'
  )
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Golden-master manifest and clean-state verification
-- ---------------------------------------------------------------------------
create table if not exists public.golden_master_manifest (
  id text primary key,
  schema_version text not null default '0001-0007',
  reference_version text not null default 'gm-ref-2026-11-14',
  app_version text not null default '1.4.0',
  client_data_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  notes text not null default ''
);

insert into public.golden_master_manifest (
  id, schema_version, reference_version, app_version, client_data_allowed, notes
) values (
  'RAVSOFT-GM-V1',
  '0001-0007',
  'gm-ref-2026-11-14',
  '1.4.0',
  false,
  'Golden master. Reference seeds only. Never store client data in this database.'
)
on conflict (id) do nothing;

alter table public.golden_master_manifest enable row level security;

drop policy if exists golden_master_manifest_read on public.golden_master_manifest;
create policy golden_master_manifest_read on public.golden_master_manifest
for select to authenticated
using (true);

grant select on public.golden_master_manifest to authenticated;

create or replace function public.golden_master_status()
returns table (
  workshops bigint,
  profiles bigint,
  workers bigint,
  job_cards bigint,
  check_ins bigint,
  ledger_entries bigint,
  has_client_data boolean,
  app_version text,
  reference_version text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workshops bigint;
  v_profiles bigint;
  v_workers bigint;
  v_job_cards bigint;
  v_check_ins bigint;
  v_ledger bigint;
  v_app text;
  v_ref text;
begin
  select count(*) into v_workshops from public.workshops;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_workers from public.workers;
  select count(*) into v_job_cards from public.job_cards;
  select count(*) into v_check_ins from public.check_ins;
  select count(*) into v_ledger from public.ledger_entries;

  select m.app_version, m.reference_version
    into v_app, v_ref
    from public.golden_master_manifest m
   where m.id = 'RAVSOFT-GM-V1';

  return query select
    v_workshops,
    v_profiles,
    v_workers,
    v_job_cards,
    v_check_ins,
    v_ledger,
    (v_workshops + v_profiles + v_workers + v_job_cards + v_check_ins + v_ledger) > 0,
    coalesce(v_app, '1.4.0'),
    coalesce(v_ref, 'gm-ref-2026-11-14');
end;
$$;

create or replace function public.assert_golden_master_clean()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_client_data boolean;
begin
  select has_client_data into v_has_client_data from public.golden_master_status();
  if coalesce(v_has_client_data, false) then
    raise exception 'Golden master is not clean: client rows exist. Use a fresh database for the template.';
  end if;
end;
$$;

revoke all on function public.golden_master_status() from public, anon, authenticated;
revoke all on function public.assert_golden_master_clean() from public, anon, authenticated;
-- The service role bypasses these revokes and can run both functions from CI.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.golden_master_status() to service_role;
    grant execute on function public.assert_golden_master_clean() to service_role;
  end if;
end;
$$;

grant select on public.system_reference_data to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reference-data touch trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_reference_data()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists system_reference_data_touch on public.system_reference_data;
create trigger system_reference_data_touch
before update on public.system_reference_data
for each row execute function public.touch_reference_data();