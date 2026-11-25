-- ============================================================================
-- 0009 — Self-service client orders and the unified onboarding pipeline
--
-- The developer shares one order link. A client chooses Torque ERP, ScanPlan or
-- TAW, enters their details and (for Torque ERP) the modules they want. The
-- order lands in the master portal as a pending installation. The portal then
-- tracks provisioning, deployment, initial credentials and handover before the
-- client installation starts its 30-day trial.
--
-- Security model:
--   * anon may only call submit_client_order(jsonb) — no table reads or writes
--   * the master portal admin (app_metadata.role = ravsoft_admin) reads and
--     updates orders through the normal authenticated RLS policies
--   * initial credentials are stored only on the admin-only order row and can
--     be cleared from the portal after handover
--
-- Additive and idempotent. Run after 0001-0008.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Client order table
-- ---------------------------------------------------------------------------
create table if not exists public.developer_client_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  product text not null
    check (product in ('Torque ERP','ScanPlan','TAW')),
  client_name text not null,
  contact_name text not null,
  phone text not null,
  email text,
  district text not null default '',
  address text,
  plan text not null default 'Growth'
    check (plan in ('Lite','Starter','Growth','Pro','Enterprise')),
  monthly_fee numeric(12,2)
    check (monthly_fee is null or monthly_fee >= 0),
  modules jsonb not null default '[]'::jsonb
    check (jsonb_typeof(modules) = 'array'),
  notes text,
  status text not null default 'Submitted'
    check (status in (
      'Submitted','Reviewing','Provisioning','Deployed',
      'Delivered','Trial','Active','Cancelled'
    )),
  provisioning jsonb not null default
    '{"supabase":false,"cloudflare":false,"waha":false,"other":false,"aiAccess":false,"deployed":false}'::jsonb,
  server_address text,
  supabase_url text,
  cloudflare_project text,
  app_url text,
  deploy_webhook_url text,
  initial_username text,
  initial_password text,
  owner_pin text,
  installation_id text,
  client_id text references public.developer_client_installations(id) on delete set null,
  trial_days integer not null default 30 check (trial_days between 1 and 90),
  trial_ends_at timestamptz,
  submitted_at timestamptz not null default now(),
  deployed_at timestamptz,
  delivered_at timestamptz,
  activated_at timestamptz,
  credentials_cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.developer_client_orders
  add column if not exists monthly_fee numeric(12,2)
    check (monthly_fee is null or monthly_fee >= 0),
  add column if not exists supabase_url text,
  add column if not exists cloudflare_project text,
  add column if not exists app_url text,
  add column if not exists deploy_webhook_url text,
  add column if not exists credentials_cleared_at timestamptz;

create index if not exists developer_client_orders_status_idx
  on public.developer_client_orders (status, submitted_at desc);

create index if not exists developer_client_orders_product_idx
  on public.developer_client_orders (product, submitted_at desc);

create index if not exists developer_client_orders_client_idx
  on public.developer_client_orders (client_id);

comment on table public.developer_client_orders is
  'Self-service client orders received from the public order link. Admin-only after submission.';
comment on column public.developer_client_orders.initial_password is
  'Temporary initial login password chosen by RAVBsoft. Clear after handover.';
comment on column public.developer_client_orders.modules is
  'Torque ERP feature-flag keys selected by the client. Empty for ScanPlan and TAW.';

-- Keep updated_at current on every admin edit.
drop trigger if exists developer_client_orders_touch on public.developer_client_orders;
create trigger developer_client_orders_touch
  before update on public.developer_client_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS: no anonymous table access, admin-only management
-- ---------------------------------------------------------------------------
alter table public.developer_client_orders enable row level security;

drop policy if exists developer_client_orders_admin_all
  on public.developer_client_orders;
create policy developer_client_orders_admin_all
  on public.developer_client_orders
  for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

revoke all on public.developer_client_orders from public, anon;
grant select, insert, update, delete on public.developer_client_orders to authenticated;
grant all on public.developer_client_orders to service_role;

-- ---------------------------------------------------------------------------
-- 3. Public submission RPC
--
-- The order link calls this with the anon key. It validates the payload,
-- filters unknown module keys, generates a human-readable reference and never
-- returns another client's data.
-- ---------------------------------------------------------------------------
create or replace function public.submit_client_order(p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product text := trim(coalesce(p_payload->>'product', ''));
  v_client_name text := trim(coalesce(p_payload->>'clientName', ''));
  v_contact_name text := trim(coalesce(p_payload->>'contactName', ''));
  v_phone text := trim(coalesce(p_payload->>'phone', ''));
  v_email text := nullif(trim(coalesce(p_payload->>'email', '')), '');
  v_district text := trim(coalesce(p_payload->>'district', ''));
  v_address text := nullif(trim(coalesce(p_payload->>'address', '')), '');
  v_plan text := coalesce(nullif(trim(p_payload->>'plan'), ''), 'Growth');
  v_modules jsonb := coalesce(p_payload->'modules', '[]'::jsonb);
  v_notes text := nullif(trim(coalesce(p_payload->>'notes', '')), '');
  v_reference text;
begin
  if v_product not in ('Torque ERP','ScanPlan','TAW') then
    raise exception 'Choose Torque ERP, ScanPlan or TAW.';
  end if;
  if length(v_client_name) < 2 then
    raise exception 'Client or business name is required.';
  end if;
  if length(v_contact_name) < 2 then
    raise exception 'Contact name is required.';
  end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then
    raise exception 'A valid phone number is required.';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The email address is not valid.';
  end if;
  if v_plan not in ('Lite','Starter','Growth','Pro','Enterprise') then
    raise exception 'Choose a valid licence plan.';
  end if;
  if jsonb_typeof(v_modules) <> 'array' then
    v_modules := '[]'::jsonb;
  end if;

  -- Only the Torque ERP module keys the portal understands are stored.
  select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    into v_modules
    from jsonb_array_elements_text(v_modules)
   where value in (
     'enable_multi_sections','enable_paint_module','enable_insurance_module',
     'enable_estimates_module','enable_vat_invoicing','enable_advanced_accounting',
     'enable_payroll_epf_etf','enable_daily_wages','enable_driver_commissions',
     'enable_petty_cash','enable_voice_notifications'
   );

  if v_product = 'Torque ERP' and jsonb_array_length(v_modules) = 0 then
    raise exception 'Select at least one Torque ERP module.';
  end if;

  -- Simple abuse guard: the same phone cannot submit the same product twice
  -- within five minutes. The portal still shows every legitimate order.
  if exists (
    select 1
      from public.developer_client_orders
     where product = v_product
       and phone = v_phone
       and submitted_at > now() - interval '5 minutes'
  ) then
    raise exception 'An order for this phone number was just submitted. Please wait a few minutes or contact RAVBsoft.';
  end if;

  loop
    v_reference := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.developer_client_orders where reference = v_reference
    );
  end loop;

  insert into public.developer_client_orders (
    reference, product, client_name, contact_name, phone, email, district,
    address, plan, modules, notes, status, trial_days
  ) values (
    v_reference, v_product, v_client_name, v_contact_name, v_phone, v_email,
    v_district, v_address, v_plan, v_modules, v_notes, 'Submitted', 30
  );

  return v_reference;
end;
$$;

revoke all on function public.submit_client_order(jsonb) from public;
grant execute on function public.submit_client_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Keep the golden manifest version current
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.golden_master_manifest') is not null then
    update public.golden_master_manifest
       set schema_version = '0001-0009'
     where id is not null;
  end if;
end;
$$;
