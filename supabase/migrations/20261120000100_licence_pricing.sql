-- ---------------------------------------------------------------------------
-- RAVBsoft licence pricing, per-client fees and the small-garage plan
--
-- Plans: Lite / Starter / Growth / Pro / Enterprise.
-- Legacy "Professional" rows become "Growth" so existing clients keep working.
-- Each installation can carry a typed monthly fee; the portal falls back to the
-- published rate card when it is null.
-- ---------------------------------------------------------------------------

-- 1. Plan values ------------------------------------------------------------
alter table public.developer_client_installations
  drop constraint if exists developer_client_installations_plan_check;

alter table public.developer_client_installations
  alter column plan set default 'Growth';

update public.developer_client_installations
   set plan = 'Growth'
 where plan = 'Professional';

alter table public.developer_client_installations
  add constraint developer_client_installations_plan_check
  check (plan in ('Lite','Starter','Growth','Pro','Enterprise'));

-- 2. Typed monthly fee ------------------------------------------------------
alter table public.developer_client_installations
  add column if not exists monthly_fee numeric(12,2)
    check (monthly_fee is null or monthly_fee >= 0);

comment on column public.developer_client_installations.monthly_fee is
  'Agreed monthly licence fee in LKR typed by the portal admin. Null uses the plan rate card.';

-- 3. Keep the fee when an installation ID changes ---------------------------
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

  if v_new !~ '^WS-LK-[A-Z0-9]{6,16}$' then
    raise exception 'Installation ID must look like WS-LK-XXXXXXXX.';
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
    district, address, plan, monthly_fee, status, expires_at, feature_flags,
    notes, last_seen_at, created_at, updated_at, app_version, latest_version,
    git_branch, custom_build, customisation_summary, deploy_webhook_url,
    last_deployed_at, last_deployed_by
  ) values (
    v_new, v_row.workshop_name, v_row.software_name, v_row.server_address,
    v_row.owner_name, v_row.phone, v_row.email, v_row.district, v_row.address,
    v_row.plan, v_row.monthly_fee, v_row.status, v_row.expires_at,
    v_row.feature_flags, v_row.notes, v_row.last_seen_at, v_row.created_at,
    now(), v_row.app_version, v_row.latest_version, v_row.git_branch,
    v_row.custom_build, v_row.customisation_summary, v_row.deploy_webhook_url,
    v_row.last_deployed_at, v_row.last_deployed_by
  );

  update public.developer_license_payments
     set client_id = v_new
   where client_id = v_old;

  update public.developer_update_runs
     set client_id = v_new
   where client_id = v_old;

  delete from public.developer_client_installations
   where id = v_old;

  return v_new;
end;
$$;

revoke all on function public.portal_change_installation_id(text, text)
  from public, anon;
grant execute on function public.portal_change_installation_id(text, text)
  to authenticated, service_role;

-- 4. Golden-master reference row -------------------------------------------
do $$
begin
  if to_regclass('public.system_reference_data') is not null then
    update public.system_reference_data
       set value = '["Lite","Starter","Growth","Pro","Enterprise"]'::jsonb,
           description = 'RAVBsoft licence plans: Lite, Starter, Growth, Pro, Enterprise.'
     where key = 'licence_plans';
  end if;
  if to_regclass('public.golden_master_manifest') is not null then
    update public.golden_master_manifest
       set schema_version = '0001-0007';
  end if;
end;
$$;
