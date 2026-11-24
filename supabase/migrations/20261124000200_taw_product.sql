-- ============================================================================
-- 0008 — RAVBsoft master portal: TAW product line
--
-- Adds TAW as a first-class portal product:
--   * product-scoped release registry and update runs
--   * product-scoped licence keys (TAW keys cannot unlock Torque ERP)
--   * poll_taw_license RPC used by the TAW-Carrier Settings page
--   * TAW-LK installation IDs accepted by the portal
--
-- Additive and idempotent. Run after 0001-0007.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Product-scoped release registry
-- ---------------------------------------------------------------------------
alter table public.developer_releases
  add column if not exists product text not null default 'Torque ERP';

update public.developer_releases
   set product = 'Torque ERP'
 where product is null or trim(product) = '';

alter table public.developer_releases drop constraint if exists developer_releases_pkey;
alter table public.developer_releases add primary key (product, version);

drop index if exists public.developer_releases_one_latest;
create unique index if not exists developer_releases_one_latest_per_product
  on public.developer_releases (product)
 where is_latest;

insert into public.developer_releases (
  product, version, released_at, title, changes, migration_files, channel, is_latest, notes
) values
  (
    'Torque ERP',
    '1.4.0',
    '2026-11-10',
    'Reservations, demo routing and thermal vouchers',
    'Booking links, supervisor review, WAHA settings, demo-mode override, thermal vouchers.',
    array[]::text[],
    'Stable',
    true,
    'Core Torque ERP release. Additive migrations only.'
  ),
  (
    'ScanPlan',
    '1.0.0',
    '2026-11-18',
    'Attendance golden master',
    'QR check-in, GPS geofence, department shifts, approvals and Excel reports.',
    array[]::text[],
    'Stable',
    true,
    'ScanPlan release train.'
  ),
  (
    'TAW',
    '0.1.0',
    '2026-11-24',
    'TAW vehicle carrier golden master',
    'Login-based owner/driver roles, map pinning, WAHA, automatic GPS, partner fallback and IRD billing.',
    array[]::text[],
    'Stable',
    true,
    'TAW release train. Golden copy contains zero client data.'
  )
on conflict (product, version) do update set
  released_at = excluded.released_at,
  title = excluded.title,
  changes = excluded.changes,
  channel = excluded.channel,
  is_latest = excluded.is_latest,
  notes = excluded.notes;

-- The old view began with `version`; the product-scoped view has a different
-- column layout, so CREATE OR REPLACE alone would be rejected by PostgreSQL.
drop view if exists public.v_latest_release;
create view public.v_latest_release as
select product, version, released_at, title, changes, migration_files, channel, notes
  from public.developer_releases
 where is_latest;

grant select on public.v_latest_release to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Product-scoped update runs and product-aware default release
-- ---------------------------------------------------------------------------
alter table public.developer_update_runs
  add column if not exists product text not null default 'Torque ERP';

update public.developer_update_runs run
   set product = installation.software_name
  from public.developer_client_installations installation
 where run.client_id = installation.id
   and (run.product is null or trim(run.product) = '');

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
    (
      select version
        from public.developer_releases
       where product = v_client.software_name
         and is_latest
       limit 1
    )
  );
  if v_version is null then
    raise exception 'No latest release is published for %.', v_client.software_name;
  end if;

  insert into public.developer_update_runs (
    client_id, product, from_version, to_version, status, requested_by, webhook_status
  ) values (
    v_client.id,
    v_client.software_name,
    v_client.app_version,
    v_version,
    'Queued',
    'RAVBsoft portal',
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
grant execute on function public.request_client_update(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Product-scoped licence keys
-- ---------------------------------------------------------------------------
create table if not exists public.developer_license_keys (
  license_key text primary key,
  product text not null default 'Torque ERP'
    check (product in ('Torque ERP','ScanPlan','TAW','RAVBsoft')),
  holder text not null default '',
  client_id text references public.developer_client_installations(id) on delete set null,
  plan text not null default 'Growth'
    check (plan in ('Lite','Starter','Growth','Pro','Enterprise')),
  status text not null default 'Active'
    check (status in ('Active','Suspended','Revoked','Expired')),
  expires_at timestamptz,
  seats integer not null default 0 check (seats >= 0),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists developer_license_keys_product_idx
  on public.developer_license_keys (product, status);
create index if not exists developer_license_keys_client_idx
  on public.developer_license_keys (client_id);

alter table public.developer_license_keys enable row level security;

drop policy if exists developer_license_keys_read on public.developer_license_keys;
create policy developer_license_keys_read on public.developer_license_keys
for select to authenticated
using (public.is_portal_admin());

drop policy if exists developer_license_keys_admin_all on public.developer_license_keys;
create policy developer_license_keys_admin_all on public.developer_license_keys
for all to authenticated
using (public.is_portal_admin()) with check (public.is_portal_admin());

revoke all on public.developer_license_keys from public, anon;
grant select, insert, update, delete on public.developer_license_keys to authenticated;
grant all on public.developer_license_keys to service_role;

-- Issue a product-scoped licence key from the portal UI.
create or replace function public.portal_issue_license_key(
  p_product text,
  p_holder text,
  p_plan text,
  p_months integer,
  p_client_id text default null,
  p_seats integer default 0,
  p_note text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product text := upper(trim(coalesce(p_product, '')));
  v_holder text := trim(coalesce(p_holder, ''));
  v_plan text := trim(coalesce(p_plan, 'Growth'));
  v_months integer := greatest(1, coalesce(p_months, 12));
  v_prefix text;
  v_key text;
begin
  if not public.is_portal_admin() then
    raise exception 'Not authorized.';
  end if;
  if v_holder = '' then
    raise exception 'Licence holder is required.';
  end if;

  v_prefix := case v_product
    when 'TAW' then 'TAW'
    when 'SCANPLAN' then 'SP'
    when 'TORQUE ERP' then 'TRQ'
    when 'RAVBSOFT' then 'RAV'
    else ''
  end;
  if v_prefix = '' then
    raise exception 'Unsupported product %.', p_product;
  end if;
  if v_plan not in ('Lite','Starter','Growth','Pro','Enterprise') then
    raise exception 'Unsupported plan %.', p_plan;
  end if;

  v_key := v_prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' ||
           upper(replace(gen_random_uuid()::text, '-', ''));

  insert into public.developer_license_keys (
    license_key, product, holder, client_id, plan, status, expires_at, seats, active, note
  ) values (
    v_key,
    case v_product
      when 'SCANPLAN' then 'ScanPlan'
      when 'TORQUE ERP' then 'Torque ERP'
      when 'RAVBSOFT' then 'RAVBsoft'
      else v_product
    end,
    v_holder,
    nullif(trim(coalesce(p_client_id, '')), ''),
    v_plan,
    'Active',
    now() + make_interval(months => v_months),
    greatest(0, coalesce(p_seats, 0)),
    true,
    nullif(trim(coalesce(p_note, '')), '')
  );

  return v_key;
end;
$$;

revoke all on function public.portal_issue_license_key(text, text, text, integer, text, integer, text)
  from public, anon;
grant execute on function public.portal_issue_license_key(text, text, text, integer, text, integer, text)
  to authenticated, service_role;

-- TAW-Carrier Settings calls this RPC with p_license_key.
create or replace function public.poll_taw_license(p_license_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.developer_license_keys%rowtype;
  v_expires text;
begin
  select * into r
    from public.developer_license_keys
   where upper(trim(license_key)) = upper(trim(coalesce(p_license_key, '')))
     and product = 'TAW'
   limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false, 'product', 'TAW', 'plan', '', 'status', 'NOT_FOUND',
      'expires_at', '', 'seats', 0,
      'message', 'TAW licence key was not found in the RAVBsoft portal.'
    );
  end if;

  v_expires := case
    when r.expires_at is null then ''
    else to_char(r.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  end;

  if not r.active or r.status <> 'Active' then
    return jsonb_build_object(
      'valid', false, 'product', 'TAW', 'plan', r.plan, 'status', r.status,
      'expires_at', v_expires, 'seats', r.seats,
      'message', 'This TAW licence is not active.'
    );
  end if;

  if r.expires_at is not null and r.expires_at < now() then
    return jsonb_build_object(
      'valid', false, 'product', 'TAW', 'plan', r.plan, 'status', 'EXPIRED',
      'expires_at', v_expires, 'seats', r.seats,
      'message', 'This TAW licence has expired.'
    );
  end if;

  return jsonb_build_object(
    'valid', true, 'product', 'TAW', 'plan', r.plan, 'status', r.status,
    'expires_at', v_expires, 'seats', r.seats,
    'message', 'TAW licence is active.'
  );
end;
$$;

revoke all on function public.poll_taw_license(text) from public;
grant execute on function public.poll_taw_license(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Installation IDs: allow WS-LK, SP-LK and TAW-LK
-- ---------------------------------------------------------------------------
create or replace function public.portal_change_installation_id(
  p_old_id text,
  p_new_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := upper(trim(p_old_id));
  v_new text := upper(trim(p_new_id));
  v_row public.developer_client_installations%rowtype;
begin
  if not public.is_portal_admin() then
    raise exception 'Not authorized.';
  end if;

  if v_new !~ '^(WS|SP|TAW)-LK-[A-Z0-9]{6,16}$' then
    raise exception 'Installation ID must look like WS-LK-XXXXXXXX, SP-LK-XXXXXXXX or TAW-LK-XXXXXXXX.';
  end if;
  if v_old = v_new then
    return v_new;
  end if;

  select * into v_row
    from public.developer_client_installations
   where id = v_old;
  if not found then
    raise exception 'Client installation % was not found.', v_old;
  end if;

  if exists (
    select 1 from public.developer_client_installations where id = v_new
  ) then
    raise exception 'Installation ID % already exists.', v_new;
  end if;

  insert into public.developer_client_installations (
    id, workshop_name, software_name, server_address, owner_name, phone, email,
    district, address, plan, monthly_fee, status, expires_at, feature_flags, notes,
    last_seen_at, created_at, updated_at, app_version, latest_version,
    git_branch, custom_build, customisation_summary, deploy_webhook_url,
    last_deployed_at, last_deployed_by
  ) values (
    v_new, v_row.workshop_name, v_row.software_name, v_row.server_address,
    v_row.owner_name, v_row.phone, v_row.email, v_row.district, v_row.address,
    v_row.plan, v_row.monthly_fee, v_row.status, v_row.expires_at,
    v_row.feature_flags, v_row.notes, v_row.last_seen_at, v_row.created_at, now(),
    v_row.app_version, v_row.latest_version, v_row.git_branch, v_row.custom_build,
    v_row.customisation_summary, v_row.deploy_webhook_url,
    v_row.last_deployed_at, v_row.last_deployed_by
  );

  update public.developer_license_payments
     set client_id = v_new
   where client_id = v_old;

  update public.developer_update_runs
     set client_id = v_new
   where client_id = v_old;

  update public.developer_license_keys
     set client_id = v_new
   where client_id = v_old;

  delete from public.developer_client_installations
   where id = v_old;

  return v_new;
end;
$$;

revoke all on function public.portal_change_installation_id(text, text) from public, anon;
grant execute on function public.portal_change_installation_id(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Golden manifest bookkeeping
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.golden_master_manifest') is not null then
    update public.golden_master_manifest
       set schema_version = '0001-0008'
     where id is not null;
  end if;
end;
$$;
