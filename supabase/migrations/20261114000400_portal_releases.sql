-- ============================================================================
-- 0004 — RAVsoft master portal: release registry and one-click update runs
--
-- The portal already tracks each client installation. This migration adds the
-- shared latest-release registry and an auditable update-run ledger so a deploy
-- can be requested and confirmed without touching client data.
--
-- Additive and idempotent. Run after 0001-0003.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Latest-release registry
-- ---------------------------------------------------------------------------
create table if not exists public.developer_releases (
  version text primary key,
  released_at date not null default current_date,
  title text not null,
  changes text not null default '',
  migration_files text[] not null default '{}',
  channel text not null default 'Stable'
    check (channel in ('Stable','Beta','Custom')),
  is_latest boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists developer_releases_one_latest
  on public.developer_releases ((is_latest))
  where is_latest;

insert into public.developer_releases (
  version, released_at, title, changes, migration_files, channel, is_latest, notes
) values
  (
    '1.4.0',
    '2026-11-10',
    'Reservations, demo routing and thermal vouchers',
    'Booking links, supervisor review, WAHA settings, demo-mode override, thermal payslip/supplier/petty-cash vouchers.',
    array['20261114000100_schema.sql','20261114000200_golden_master.sql','20261114000300_security_hardening.sql','20261114000400_portal_releases.sql','20261114000500_app_records.sql','20261114000600_portal_security.sql'],
    'Stable',
    true,
    'Core release. Additive migrations only.'
  ),
  (
    '1.3.1',
    '2026-10-22',
    'Estimate editing and gate override',
    'Editable estimate lines, PRO override with reason, multiple bills per vehicle.',
    array[]::text[],
    'Stable',
    false,
    'Superseded by 1.4.0.'
  ),
  (
    '1.2.3',
    '2026-09-18',
    'Payroll and attendance',
    'Staff payroll, employer EPF/ETF in P&L, attendance locking.',
    array[]::text[],
    'Stable',
    false,
    'Superseded by 1.4.0.'
  )
on conflict (version) do nothing;

alter table public.developer_releases enable row level security;

drop policy if exists developer_releases_read on public.developer_releases;
create policy developer_releases_read on public.developer_releases
for select to anon, authenticated
using (true);

-- The registry is read-only to the portal. Only a trusted service-role release
-- job may insert or promote a new version.
grant select on public.developer_releases to anon, authenticated;

create or replace view public.v_latest_release as
select version, released_at, title, changes, migration_files, channel, notes
  from public.developer_releases
 where is_latest
 limit 1;

grant select on public.v_latest_release to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Update-run ledger
-- ---------------------------------------------------------------------------
create table if not exists public.developer_update_runs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null
    references public.developer_client_installations(id) on delete cascade,
  from_version text,
  to_version text not null,
  status text not null default 'Queued'
    check (status in ('Queued','Deploying','Deployed','Failed','Rolled Back')),
  webhook_status text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  requested_by text,
  data_preserved boolean not null default true,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists developer_update_runs_client_idx
  on public.developer_update_runs (client_id, requested_at desc);
create index if not exists developer_update_runs_status_idx
  on public.developer_update_runs (status, requested_at desc);

alter table public.developer_update_runs enable row level security;

drop policy if exists developer_update_runs_read on public.developer_update_runs;
create policy developer_update_runs_read on public.developer_update_runs
for select to anon, authenticated
using (true);

grant select on public.developer_update_runs to anon, authenticated;
-- Writes go through the security-definer RPCs below so every deployment is
-- validated and attributed.

-- ---------------------------------------------------------------------------
-- 3. Request a one-click update
-- ---------------------------------------------------------------------------
create or replace function public.request_client_update(
  p_client_id text,
  p_to_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.developer_client_installations%rowtype;
  v_version text;
  v_run uuid;
begin
  select * into v_client
    from public.developer_client_installations
   where id = upper(trim(p_client_id));
  if not found then
    raise exception 'Client installation % was not found.', p_client_id;
  end if;

  v_version := coalesce(
    nullif(trim(p_to_version), ''),
    (select version from public.developer_releases where is_latest limit 1)
  );
  if v_version is null then
    raise exception 'No latest release is published in the registry.';
  end if;

  insert into public.developer_update_runs (
    client_id, from_version, to_version, status, requested_by, webhook_status
  ) values (
    v_client.id,
    v_client.app_version,
    v_version,
    'Queued',
    'RAVsoft portal',
    case when v_client.deploy_webhook_url is null then 'Not configured' else 'Pending' end
  )
  returning id into v_run;

  update public.developer_client_installations
     set latest_version = v_version,
         updated_at = now()
   where id = v_client.id;

  return v_run;
end;
$$;

revoke all on function public.request_client_update(text, text) from public;
grant execute on function public.request_client_update(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Record the webhook / deploy result
-- ---------------------------------------------------------------------------
create or replace function public.record_client_update_result(
  p_run_id uuid,
  p_status text,
  p_detail text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.developer_update_runs%rowtype;
  v_ok boolean := false;
begin
  if p_status not in ('Deploying','Deployed','Failed','Rolled Back') then
    raise exception 'Invalid update status %.', p_status;
  end if;

  select * into v_run
    from public.developer_update_runs
   where id = p_run_id;
  if not found then
    raise exception 'Update run % was not found.', p_run_id;
  end if;

  update public.developer_update_runs
     set status = p_status,
         started_at = case
           when p_status = 'Deploying' and started_at is null then now()
           else started_at
         end,
         completed_at = case
           when p_status in ('Deployed','Failed','Rolled Back') then now()
           else completed_at
         end,
         webhook_status = p_status,
         detail = nullif(trim(p_detail), ''),
         data_preserved = p_status <> 'Rolled Back'
   where id = p_run_id;

  if p_status = 'Deployed' then
    update public.developer_client_installations
       set app_version = v_run.to_version,
           latest_version = v_run.to_version,
           last_deployed_at = now(),
           last_deployed_by = 'RAVsoft portal',
           updated_at = now()
     where id = v_run.client_id;
    v_ok := true;
  elsif p_status in ('Failed','Rolled Back') then
    update public.developer_client_installations
       set updated_at = now()
     where id = v_run.client_id;
  end if;

  return v_ok;
end;
$$;

revoke all on function public.record_client_update_result(uuid, text, text) from public;
grant execute on function public.record_client_update_result(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Convenience view for the portal fleet screen
-- ---------------------------------------------------------------------------
create or replace view public.v_client_update_status as
select
  i.id,
  i.workshop_name,
  i.software_name,
  i.server_address,
  i.app_version,
  i.latest_version,
  i.git_branch,
  i.custom_build,
  i.customisation_summary,
  i.deploy_webhook_url,
  i.last_deployed_at,
  i.last_deployed_by,
  r.status as latest_run_status,
  r.to_version as latest_run_version,
  r.requested_at as latest_run_requested_at,
  r.completed_at as latest_run_completed_at
from public.developer_client_installations i
left join lateral (
  select status, to_version, requested_at, completed_at
    from public.developer_update_runs
   where client_id = i.id
   order by requested_at desc
   limit 1
) r on true;

grant select on public.v_client_update_status to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.request_client_update(text, text) to service_role;
    grant execute on function public.record_client_update_result(uuid, text, text) to service_role;
    grant select on public.developer_releases to service_role;
    grant select on public.developer_update_runs to service_role;
    grant select on public.v_latest_release to service_role;
    grant select on public.v_client_update_status to service_role;
  end if;
end;
$$;