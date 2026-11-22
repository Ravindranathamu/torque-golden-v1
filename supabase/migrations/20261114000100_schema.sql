-- ============================================================================
-- Torque ERP — production schema for Supabase (PostgreSQL 15+)
-- Multi-tenant workshop ERP: check-in → gate → job card → stores → billing →
-- credit → accounting → marketing.
--
-- Run in the Supabase SQL editor or with `supabase db push`.
-- After running: create the first auth user, then call public.create_workshop().
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Tenants
-- ---------------------------------------------------------------------------
create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  company_name text not null check (length(trim(company_name)) > 1),
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  logo_url text,
  brand_color text not null default '#0f766e'
    check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text not null default '#f59e0b'
    check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  google_review_url text not null default '',
  currency text not null default 'LKR',
  configured boolean not null default true,
  demo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Staff profiles (linked 1:1 to Supabase Auth users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 1),
  username text not null check (username ~ '^[a-zA-Z0-9._-]{3,40}$'),
  phone text not null default '',
  email text,
  is_owner boolean not null default false,
  departments text[] not null default '{}'
    check (departments <@ array['PRO','Supervisor','Cashier','Accounting','Stores']::text[]),
  base_salary numeric(12,2) not null default 0 check (base_salary >= 0),
  commission_rate numeric(5,2) not null default 0
    check (commission_rate >= 0 and commission_rate <= 100),
  gdrive_email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, username)
);

-- ---------------------------------------------------------------------------
-- 3. HR / workers
-- ---------------------------------------------------------------------------
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  full_name text not null,
  phone text not null default '',
  nic text not null default '',
  address text not null default '',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  base_salary numeric(12,2) not null default 0 check (base_salary >= 0),
  commission_rate numeric(5,2) not null default 0
    check (commission_rate >= 0 and commission_rate <= 100),
  joined date not null default current_date,
  status text not null default 'Active'
    check (status in ('Active','Suspended','Terminated')),
  bank_name text not null default '',
  account_number text not null default '',
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Suppliers and stock
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null,
  phone text not null default '',
  contact_person text not null default '',
  outstanding_credit numeric(12,2) not null default 0 check (outstanding_credit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  invoice_no text not null,
  amount numeric(12,2) not null check (amount >= 0),
  purchase_type text not null check (purchase_type in ('Cash','Credit')),
  credit_days integer not null default 0 check (credit_days >= 0),
  purchase_date date not null default current_date,
  due_date date,
  status text not null default 'Unpaid' check (status in ('Unpaid','Paid')),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  code text not null,
  name text not null,
  stock_type text not null default 'Spare Part'
    check (stock_type in ('Spare Part','Consumable')),
  make text,
  model text,
  stock numeric(12,2) not null default 0 check (stock >= 0),
  min_stock numeric(12,2) not null default 0 check (min_stock >= 0),
  unit text not null default 'pcs',
  last_selling_price numeric(12,2) check (last_selling_price >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, code)
);

-- ---------------------------------------------------------------------------
-- 5. Customer check-ins and job cards
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  created_at timestamptz not null default now(),
  vehicle_no text not null,
  make text not null,
  model text not null,
  customer_name text not null,
  phone text not null,
  mileage integer not null check (mileage >= 0),
  email text,
  address text,
  status text not null default 'Awaiting Approval'
    check (status in ('Awaiting Approval','Accepted','Rejected')),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.job_cards (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  numeric_id integer not null,
  check_in_id uuid references public.check_ins(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  paid_at timestamptz,
  dispatched_at timestamptz,
  vehicle_no text not null,
  make text not null,
  model text not null,
  customer_name text not null,
  phone text not null,
  mileage integer not null default 0 check (mileage >= 0),
  repair_type text not null,
  safety_notes text,
  photos jsonb not null default '[]'::jsonb,
  drive_folder_id text,
  status text not null default 'In Progress'
    check (status in ('In Progress','Repair Completed','Paid','Released on Credit','Dispatched')),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  discount_type text not null default 'Fixed' check (discount_type in ('Fixed','Percentage')),
  payment_method text check (payment_method in ('Cash','Card','Credit')),
  credit_grace_days integer check (credit_grace_days >= 0),
  dispatched_by text,
  updated_at timestamptz not null default now(),
  unique (workshop_id, numeric_id)
);

create table if not exists public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  name text not null,
  labor_cost numeric(12,2) not null default 0 check (labor_cost >= 0),
  worker_id uuid references public.workers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_parts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  item_name text not null,
  qty_requested numeric(12,2) not null check (qty_requested > 0),
  qty_issued numeric(12,2) not null default 0 check (qty_issued >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  margin_percent numeric(5,2) not null default 20
    check (margin_percent >= -100 and margin_percent <= 500),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  status text not null default 'Requested'
    check (status in ('Requested','Issued','Exchange Pending','Return Pending','Returned','Backordered')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (qty_issued <= qty_requested + 0.001)
);

-- ---------------------------------------------------------------------------
-- 6. Credit, expenses, ledger
-- ---------------------------------------------------------------------------
create table if not exists public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete restrict,
  customer_name text not null,
  vehicle_no text not null,
  phone text not null,
  total numeric(12,2) not null check (total >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0),
  credit_date date not null default current_date,
  due_date date not null,
  grace_days integer not null default 0 check (grace_days >= 0),
  status text not null default 'Unpaid'
    check (status in ('Unpaid','Partially Paid','Settled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_card_id),
  check (paid <= total)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null
    check (category in ('Rental','Electricity','Water','Operational Cost','Other Expenses')),
  amount numeric(12,2) not null check (amount >= 0),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid references public.job_cards(id) on delete set null,
  entry_date date not null default current_date,
  labor_revenue numeric(12,2) not null default 0 check (labor_revenue >= 0),
  parts_revenue numeric(12,2) not null default 0 check (parts_revenue >= 0),
  parts_cost numeric(12,2) not null default 0 check (parts_cost >= 0),
  commission numeric(12,2) not null default 0 check (commission >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  payment_method text not null
    check (payment_method in ('Cash','Card','Credit','Credit Settlement')),
  settlement_amount numeric(12,2) check (settlement_amount >= 0),
  worker_id uuid references public.workers(id) on delete set null,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. Marketing and notifications
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_reminders (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  vehicle_no text not null,
  customer_name text not null,
  phone text not null,
  trigger_type text not null check (trigger_type in ('Periodic Cycle','Mileage Milestone')),
  target_date date,
  target_mileage integer check (target_mileage >= 0),
  dispatch_date date,
  ready_at timestamptz,
  status text not null default 'Pending'
    check (status in ('Pending','Reminder Sent','Completed')),
  avg_cycle_days integer check (avg_cycle_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  departments text[] not null default '{}'
    check (departments <@ array['PRO','Supervisor','Cashier','Accounting','Stores','Owner']::text[]),
  title text not null,
  message text not null,
  priority text not null default 'normal'
    check (priority in ('normal','high','critical')),
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Per-workshop counters (job-card numbering, future document numbers).
create table if not exists public.workshop_counters (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (workshop_id, name)
);

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------
create index if not exists profiles_workshop_idx on public.profiles(workshop_id);
create index if not exists workers_workshop_idx on public.workers(workshop_id);
create index if not exists suppliers_workshop_idx on public.suppliers(workshop_id);
create index if not exists purchases_workshop_idx on public.supplier_purchases(workshop_id, due_date);
create index if not exists inventory_workshop_idx on public.inventory_items(workshop_id);
create index if not exists check_ins_workshop_idx on public.check_ins(workshop_id, status, created_at desc);
create index if not exists check_ins_vehicle_idx on public.check_ins using gin (vehicle_no gin_trgm_ops);
create index if not exists job_cards_workshop_idx on public.job_cards(workshop_id, status, created_at desc);
create index if not exists job_cards_vehicle_idx on public.job_cards using gin (vehicle_no gin_trgm_ops);
create index if not exists job_cards_vehicle_btree_idx on public.job_cards(workshop_id, vehicle_no);
create index if not exists job_tasks_job_idx on public.job_tasks(job_card_id);
create index if not exists job_parts_job_idx on public.job_parts(job_card_id);
create index if not exists customer_credits_due_idx on public.customer_credits(workshop_id, status, due_date);
create index if not exists expenses_workshop_idx on public.expenses(workshop_id, expense_date desc);
create index if not exists ledger_workshop_idx on public.ledger_entries(workshop_id, entry_date desc);
create index if not exists marketing_workshop_idx on public.marketing_reminders(workshop_id, status, ready_at);
create index if not exists notifications_workshop_idx on public.notifications(workshop_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Helper functions (security definer to avoid recursive RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_workshop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.workshop_id
  from public.profiles p
  where p.id = auth.uid() and p.active
  limit 1;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_owner
    from public.profiles p
    where p.id = auth.uid() and p.active
    limit 1
  ), false);
$$;

create or replace function public.has_any_department(deps text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_owner or p.departments && deps
    from public.profiles p
    where p.id = auth.uid() and p.active
    limit 1
  ), false);
$$;

revoke all on function public.current_workshop_id() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.has_any_department(text[]) from public;
grant execute on function public.current_workshop_id() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.has_any_department(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Onboarding: create a workshop + owner profile for the signed-in user
-- ---------------------------------------------------------------------------
create or replace function public.create_workshop(
  p_company_name text,
  p_slug text,
  p_owner_name text,
  p_phone text default '',
  p_email text default '',
  p_currency text default 'LKR'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workshop uuid;
  v_username text;
begin
  if v_user is null then
    raise exception 'You must be signed in to create a workshop.';
  end if;
  if exists (select 1 from public.profiles where id = v_user) then
    raise exception 'This account already belongs to a workshop.';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Slug may only contain lowercase letters, numbers and hyphens.';
  end if;

  v_username := lower(regexp_replace(
    split_part(coalesce(nullif(trim(p_email), ''), 'owner'), '@', 1),
    '[^a-zA-Z0-9._-]', '', 'g'
  ));
  if length(v_username) < 3 then
    v_username := coalesce(nullif(v_username, ''), 'owner') || '-owner';
  end if;
  v_username := left(v_username, 40);

  insert into public.workshops (slug, company_name, phone, email, currency)
  values (p_slug, trim(p_company_name), coalesce(p_phone, ''), coalesce(p_email, ''), coalesce(p_currency, 'LKR'))
  returning id into v_workshop;

  insert into public.profiles (
    id, workshop_id, full_name, username, phone, email, is_owner, departments
  ) values (
    v_user, v_workshop, trim(p_owner_name), v_username,
    coalesce(p_phone, ''), nullif(p_email, ''), true, '{}'
  );

  insert into public.notifications (workshop_id, departments, title, message, priority, link)
  values (
    v_workshop, array['Owner'], 'Workshop created',
    p_company_name || ' is ready. Invite your team from Settings → Team.',
    'normal', '/team'
  );

  return v_workshop;
end;
$$;

revoke all on function public.create_workshop(text, text, text, text, text, text) from public;
grant execute on function public.create_workshop(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Public QR check-in RPCs (anonymous, slug-scoped)
-- ---------------------------------------------------------------------------
create or replace function public.public_workshop(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', w.slug,
    'company_name', w.company_name,
    'logo_url', w.logo_url,
    'brand_color', w.brand_color,
    'accent_color', w.accent_color,
    'phone', w.phone,
    'currency', w.currency
  )
  from public.workshops w
  where w.slug = p_slug and w.configured
  limit 1;
$$;

create or replace function public.public_check_in(p_slug text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_check_in public.check_ins;
  v_vehicle text := upper(regexp_replace(trim(coalesce(p_payload->>'vehicle_no', '')), '\s+', ' ', 'g'));
begin
  if length(v_vehicle) < 2 then
    raise exception 'Vehicle number is required.';
  end if;
  if coalesce(trim(p_payload->>'customer_name'), '') = '' then
    raise exception 'Customer name is required.';
  end if;
  if coalesce(trim(p_payload->>'phone'), '') = '' then
    raise exception 'Phone number is required.';
  end if;
  if coalesce((p_payload->>'mileage')::numeric, 0) <= 0 then
    raise exception 'Mileage must be greater than zero.';
  end if;

  select id into v_workshop
  from public.workshops
  where slug = p_slug and configured;

  if v_workshop is null then
    raise exception 'Workshop not found.';
  end if;

  insert into public.check_ins (
    workshop_id, vehicle_no, make, model, customer_name, phone,
    mileage, email, address, status, created_by
  ) values (
    v_workshop,
    v_vehicle,
    trim(coalesce(p_payload->>'make', '')),
    trim(coalesce(p_payload->>'model', '')),
    trim(p_payload->>'customer_name'),
    trim(p_payload->>'phone'),
    (p_payload->>'mileage')::integer,
    nullif(trim(coalesce(p_payload->>'email', '')), ''),
    nullif(trim(coalesce(p_payload->>'address', '')), ''),
    'Awaiting Approval',
    auth.uid()
  )
  returning * into v_check_in;

  return jsonb_build_object(
    'id', v_check_in.id,
    'status', v_check_in.status,
    'vehicle_no', v_check_in.vehicle_no,
    'created_at', v_check_in.created_at
  );
end;
$$;

create or replace function public.lookup_vehicle_for_checkin(p_slug text, p_vehicle_no text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'make', j.make,
    'model', j.model,
    'customer_name', j.customer_name,
    'phone', j.phone,
    'mileage', j.mileage,
    'last_visit', j.created_at,
    'job_id', j.numeric_id
  )
  from public.job_cards j
  join public.workshops w on w.id = j.workshop_id
  where w.slug = p_slug
    and upper(regexp_replace(j.vehicle_no, '\s+', ' ', 'g')) = upper(regexp_replace(trim(p_vehicle_no), '\s+', ' ', 'g'))
  order by j.created_at desc
  limit 1;
$$;

revoke all on function public.public_workshop(text) from public;
revoke all on function public.public_check_in(text, jsonb) from public;
revoke all on function public.lookup_vehicle_for_checkin(text, text) from public;
grant execute on function public.public_workshop(text) to anon, authenticated;
grant execute on function public.public_check_in(text, jsonb) to anon, authenticated;
grant execute on function public.lookup_vehicle_for_checkin(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Stock issuing RPC (atomic, blocks overselling)
-- ---------------------------------------------------------------------------
create or replace function public.issue_job_part(p_part_id uuid, p_qty numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part public.job_parts;
  v_item public.inventory_items;
  v_workshop uuid := public.current_workshop_id();
  v_new_qty numeric;
  v_stock numeric;
begin
  if not (public.is_owner() or public.has_any_department(array['Supervisor','Stores'])) then
    raise exception 'Not authorised to issue parts.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select * into v_part
  from public.job_parts
  where id = p_part_id and workshop_id = v_workshop
  for update;

  if not found then
    raise exception 'Part request not found.';
  end if;
  if v_part.status in ('Returned','Return Pending','Exchange Pending') then
    raise exception 'This part is not available for issuing.';
  end if;

  v_new_qty := v_part.qty_issued + p_qty;
  if v_new_qty > v_part.qty_requested then
    raise exception 'Cannot issue more than the requested quantity.';
  end if;

  select * into v_item
  from public.inventory_items
  where id = v_part.item_id and workshop_id = v_workshop
  for update;

  if not found then
    raise exception 'Inventory item not found.';
  end if;
  if v_item.stock < p_qty then
    raise exception 'Insufficient stock: % available, % requested.', v_item.stock, p_qty;
  end if;

  update public.inventory_items
  set stock = stock - p_qty
  where id = v_item.id
  returning stock into v_stock;

  update public.job_parts
  set qty_issued = v_new_qty,
      status = case when v_new_qty >= qty_requested then 'Issued' else 'Requested' end
  where id = v_part.id
  returning * into v_part;

  return jsonb_build_object(
    'part_id', v_part.id,
    'qty_issued', v_part.qty_issued,
    'status', v_part.status,
    'remaining_stock', v_stock
  );
end;
$$;

revoke all on function public.issue_job_part(uuid, numeric) from public;
grant execute on function public.issue_job_part(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Customer credit settlement RPC
-- ---------------------------------------------------------------------------
create or replace function public.settle_customer_credit(
  p_credit_id uuid,
  p_amount numeric,
  p_method text default 'Cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.customer_credits;
  v_workshop uuid := public.current_workshop_id();
  v_balance numeric;
begin
  if not (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])) then
    raise exception 'Not authorised to settle credit.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be greater than zero.';
  end if;

  select * into v_credit
  from public.customer_credits
  where id = p_credit_id and workshop_id = v_workshop
  for update;

  if not found then
    raise exception 'Credit account not found.';
  end if;

  v_balance := v_credit.total - v_credit.paid;
  if v_balance <= 0 then
    raise exception 'This credit account is already settled.';
  end if;
  if p_amount > v_balance then
    raise exception 'Settlement exceeds the outstanding balance of %.', v_balance;
  end if;

  update public.customer_credits
  set paid = paid + p_amount
  where id = v_credit.id
  returning * into v_credit;

  if v_credit.status = 'Settled' then
    update public.job_cards
    set status = 'Paid'
    where id = v_credit.job_card_id and status = 'Released on Credit';
  end if;

  insert into public.ledger_entries (
    workshop_id, job_card_id, entry_date, labor_revenue, parts_revenue,
    parts_cost, commission, discount, payment_method, settlement_amount, description
  ) values (
    v_workshop, v_credit.job_card_id, current_date, 0, 0, 0, 0, 0,
    case when p_method in ('Cash','Card') then p_method else 'Credit Settlement' end,
    p_amount,
    'Credit settlement for ' || v_credit.vehicle_no
  );

  return jsonb_build_object(
    'credit_id', v_credit.id,
    'paid', v_credit.paid,
    'balance', v_credit.total - v_credit.paid,
    'status', v_credit.status
  );
end;
$$;

revoke all on function public.settle_customer_credit(uuid, numeric, text) from public;
grant execute on function public.settle_customer_credit(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Trigger functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_vehicle_no()
returns trigger
language plpgsql
as $$
begin
  new.vehicle_no := upper(regexp_replace(trim(new.vehicle_no), '\s+', ' ', 'g'));
  return new;
end;
$$;

create or replace function public.assign_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numeric_id is null then
    insert into public.workshop_counters (workshop_id, name, value)
    values (new.workshop_id, 'job_card', 1)
    on conflict (workshop_id, name)
    do update set value = public.workshop_counters.value + 1
    returning value into new.numeric_id;
  end if;
  return new;
end;
$$;

create or replace function public.set_purchase_due_date()
returns trigger
language plpgsql
as $$
begin
  if new.purchase_type = 'Credit' and new.due_date is null then
    new.due_date := new.purchase_date + coalesce(new.credit_days, 0);
  elsif new.purchase_type = 'Cash' then
    new.due_date := null;
  end if;
  return new;
end;
$$;

create or replace function public.sync_customer_credit_status()
returns trigger
language plpgsql
as $$
begin
  if new.paid <= 0 then
    new.status := 'Unpaid';
  elsif new.paid >= new.total then
    new.status := 'Settled';
  else
    new.status := 'Partially Paid';
  end if;
  return new;
end;
$$;

create or replace function public.sync_supplier_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.suppliers s
    set outstanding_credit = coalesce((
      select sum(p.amount) from public.supplier_purchases p
      where p.supplier_id = old.supplier_id and p.purchase_type = 'Credit' and p.status = 'Unpaid'
    ), 0)
    where s.id = old.supplier_id;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.supplier_id is distinct from old.supplier_id then
    update public.suppliers s
    set outstanding_credit = coalesce((
      select sum(p.amount) from public.supplier_purchases p
      where p.supplier_id = old.supplier_id and p.purchase_type = 'Credit' and p.status = 'Unpaid'
    ), 0)
    where s.id = old.supplier_id;
  end if;

  update public.suppliers s
  set outstanding_credit = coalesce((
    select sum(p.amount) from public.supplier_purchases p
    where p.supplier_id = new.supplier_id and p.purchase_type = 'Credit' and p.status = 'Unpaid'
  ), 0)
  where s.id = new.supplier_id;

  return new;
end;
$$;

create or replace function public.notify_new_check_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (workshop_id, departments, title, message, priority, link)
  values (
    new.workshop_id,
    array['PRO','Owner'],
    'New vehicle at the gate',
    new.vehicle_no || ' · ' || new.make || ' ' || new.model || ' · ' || new.customer_name,
    'high',
    '/gate'
  );
  return new;
end;
$$;

create or replace function public.notify_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'Repair Completed' then
      insert into public.notifications (workshop_id, departments, title, message, priority, link)
      values (new.workshop_id, array['Cashier','Owner'], 'Ready for billing',
        new.vehicle_no || ' · Job #' || new.numeric_id || ' completed by the workshop.', 'high', '/cashier');
    elsif new.status in ('Paid','Released on Credit') then
      insert into public.notifications (workshop_id, departments, title, message, priority, link)
      values (new.workshop_id, array['PRO','Owner'], 'Gate clearance requested',
        new.vehicle_no || ' · Job #' || new.numeric_id || ' is ' || lower(new.status) || '.', 'high', '/gate');
    elsif new.status = 'Dispatched' then
      insert into public.notifications (workshop_id, departments, title, message, priority, link)
      values (new.workshop_id, array['Accounting','Owner'], 'Vehicle dispatched',
        new.vehicle_no || ' · Job #' || new.numeric_id || ' handed over.', 'normal', '/history');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock <= new.min_stock then
    if tg_op = 'INSERT' or old.stock > old.min_stock then
      insert into public.notifications (workshop_id, departments, title, message, priority, link)
      values (new.workshop_id, array['Stores','Owner'], 'Low stock alert',
        new.name || ' (' || new.code || ') has ' || new.stock || ' ' || new.unit || ' left.',
        'high', '/stores');
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists workshops_updated_at on public.workshops;
create trigger workshops_updated_at before update on public.workshops
for each row execute function public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists workers_updated_at on public.workers;
create trigger workers_updated_at before update on public.workers
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists purchases_updated_at on public.supplier_purchases;
create trigger purchases_updated_at before update on public.supplier_purchases
for each row execute function public.set_updated_at();

drop trigger if exists inventory_updated_at on public.inventory_items;
create trigger inventory_updated_at before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists check_ins_updated_at on public.check_ins;
create trigger check_ins_updated_at before update on public.check_ins
for each row execute function public.set_updated_at();

drop trigger if exists job_cards_updated_at on public.job_cards;
create trigger job_cards_updated_at before update on public.job_cards
for each row execute function public.set_updated_at();

drop trigger if exists job_parts_updated_at on public.job_parts;
create trigger job_parts_updated_at before update on public.job_parts
for each row execute function public.set_updated_at();

drop trigger if exists customer_credits_updated_at on public.customer_credits;
create trigger customer_credits_updated_at before update on public.customer_credits
for each row execute function public.set_updated_at();

drop trigger if exists expenses_updated_at on public.expenses;
create trigger expenses_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists marketing_updated_at on public.marketing_reminders;
create trigger marketing_updated_at before update on public.marketing_reminders
for each row execute function public.set_updated_at();

drop trigger if exists check_ins_normalize_vehicle on public.check_ins;
create trigger check_ins_normalize_vehicle before insert or update on public.check_ins
for each row execute function public.normalize_vehicle_no();

drop trigger if exists job_cards_normalize_vehicle on public.job_cards;
create trigger job_cards_normalize_vehicle before insert or update on public.job_cards
for each row execute function public.normalize_vehicle_no();

drop trigger if exists customer_credits_normalize_vehicle on public.customer_credits;
create trigger customer_credits_normalize_vehicle before insert or update on public.customer_credits
for each row execute function public.normalize_vehicle_no();

drop trigger if exists marketing_normalize_vehicle on public.marketing_reminders;
create trigger marketing_normalize_vehicle before insert or update on public.marketing_reminders
for each row execute function public.normalize_vehicle_no();

drop trigger if exists job_cards_assign_number on public.job_cards;
create trigger job_cards_assign_number before insert on public.job_cards
for each row execute function public.assign_job_number();

drop trigger if exists purchases_due_date on public.supplier_purchases;
create trigger purchases_due_date before insert or update on public.supplier_purchases
for each row execute function public.set_purchase_due_date();

drop trigger if exists customer_credits_status on public.customer_credits;
create trigger customer_credits_status before insert or update on public.customer_credits
for each row execute function public.sync_customer_credit_status();

drop trigger if exists purchases_sync_supplier on public.supplier_purchases;
create trigger purchases_sync_supplier after insert or update or delete on public.supplier_purchases
for each row execute function public.sync_supplier_credit();

drop trigger if exists check_ins_notify on public.check_ins;
create trigger check_ins_notify after insert on public.check_ins
for each row execute function public.notify_new_check_in();

drop trigger if exists job_cards_notify on public.job_cards;
create trigger job_cards_notify after update of status on public.job_cards
for each row execute function public.notify_job_status();

drop trigger if exists inventory_low_stock on public.inventory_items;
create trigger inventory_low_stock after insert or update of stock on public.inventory_items
for each row execute function public.notify_low_stock();

-- ---------------------------------------------------------------------------
-- 16. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.workshops enable row level security;
alter table public.profiles enable row level security;
alter table public.workers enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_purchases enable row level security;
alter table public.inventory_items enable row level security;
alter table public.check_ins enable row level security;
alter table public.job_cards enable row level security;
alter table public.job_tasks enable row level security;
alter table public.job_parts enable row level security;
alter table public.customer_credits enable row level security;
alter table public.expenses enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.marketing_reminders enable row level security;
alter table public.notifications enable row level security;
alter table public.workshop_counters enable row level security;

-- Workshops -----------------------------------------------------------------
drop policy if exists workshops_read on public.workshops;
create policy workshops_read on public.workshops
for select to authenticated
using (id = public.current_workshop_id());

drop policy if exists workshops_update on public.workshops;
create policy workshops_update on public.workshops
for update to authenticated
using (id = public.current_workshop_id() and public.is_owner())
with check (id = public.current_workshop_id() and public.is_owner());

-- Profiles ------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
for select to authenticated
using (workshop_id = public.current_workshop_id());

drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write on public.profiles
for all to authenticated
using (workshop_id = public.current_workshop_id() and public.is_owner())
with check (workshop_id = public.current_workshop_id() and public.is_owner());
-- Intentionally no self-update policy: owners manage roles, departments,
-- commission rates and salaries. This prevents privilege escalation by staff.

-- Workers (owner + accounting read; owner writes) ---------------------------
drop policy if exists workers_read on public.workers;
create policy workers_read on public.workers
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists workers_owner_write on public.workers;
create policy workers_owner_write on public.workers
for all to authenticated
using (workshop_id = public.current_workshop_id() and public.is_owner())
with check (workshop_id = public.current_workshop_id() and public.is_owner());

-- Generic tenant read policies ---------------------------------------------
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists purchases_read on public.supplier_purchases;
create policy purchases_read on public.supplier_purchases
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists inventory_read on public.inventory_items;
create policy inventory_read on public.inventory_items
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists check_ins_read on public.check_ins;
create policy check_ins_read on public.check_ins
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists job_cards_read on public.job_cards;
create policy job_cards_read on public.job_cards
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists job_tasks_read on public.job_tasks;
create policy job_tasks_read on public.job_tasks
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists job_parts_read on public.job_parts;
create policy job_parts_read on public.job_parts
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists customer_credits_read on public.customer_credits;
create policy customer_credits_read on public.customer_credits
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])));

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists ledger_read on public.ledger_entries;
create policy ledger_read on public.ledger_entries
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])));

drop policy if exists marketing_read on public.marketing_reminders;
create policy marketing_read on public.marketing_reminders
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO'])));

-- Scoped writers ------------------------------------------------------------
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores'])));

drop policy if exists purchases_write on public.supplier_purchases;
create policy purchases_write on public.supplier_purchases
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores','Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores','Accounting'])));

drop policy if exists inventory_write on public.inventory_items;
create policy inventory_write on public.inventory_items
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores'])));

drop policy if exists check_ins_write on public.check_ins;
create policy check_ins_write on public.check_ins
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO'])));

drop policy if exists job_cards_write on public.job_cards;
create policy job_cards_write on public.job_cards
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO','Supervisor','Cashier'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO','Supervisor','Cashier'])));

drop policy if exists job_tasks_write on public.job_tasks;
create policy job_tasks_write on public.job_tasks
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor'])));

drop policy if exists job_parts_write on public.job_parts;
create policy job_parts_write on public.job_parts
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor','Stores'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor','Stores'])));

drop policy if exists customer_credits_write on public.customer_credits;
create policy customer_credits_write on public.customer_credits
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])));

drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists ledger_write on public.ledger_entries;
create policy ledger_write on public.ledger_entries
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])));

drop policy if exists marketing_write on public.marketing_reminders;
create policy marketing_write on public.marketing_reminders
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO'])));

-- Notifications -------------------------------------------------------------
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or departments && (
    select p.departments from public.profiles p where p.id = auth.uid()
  )));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
for update to authenticated
using (workshop_id = public.current_workshop_id())
with check (workshop_id = public.current_workshop_id());

-- Counters: members may read; writes happen through security-definer triggers.
drop policy if exists counters_read on public.workshop_counters;
create policy counters_read on public.workshop_counters
for select to authenticated using (workshop_id = public.current_workshop_id());

-- ---------------------------------------------------------------------------
-- 17. Reporting views (security invoker keeps tenant RLS intact)
-- ---------------------------------------------------------------------------
create or replace view public.v_job_financials
with (security_invoker = true)
as
select
  j.id,
  j.workshop_id,
  j.numeric_id,
  j.vehicle_no,
  j.make,
  j.model,
  j.customer_name,
  j.phone,
  j.status,
  j.created_at,
  j.completed_at,
  j.paid_at,
  j.dispatched_at,
  coalesce(t.labour_total, 0)::numeric(12,2) as labour_total,
  coalesce(p.parts_total, 0)::numeric(12,2) as parts_total,
  coalesce(p.parts_cost, 0)::numeric(12,2) as parts_cost,
  j.discount,
  j.discount_type,
  case
    when j.discount_type = 'Percentage'
      then round((coalesce(t.labour_total, 0) + coalesce(p.parts_total, 0)) * j.discount / 100, 2)
    else least(j.discount, coalesce(t.labour_total, 0) + coalesce(p.parts_total, 0))
  end as discount_amount,
  (coalesce(t.labour_total, 0) + coalesce(p.parts_total, 0)
    - case
        when j.discount_type = 'Percentage'
          then round((coalesce(t.labour_total, 0) + coalesce(p.parts_total, 0)) * j.discount / 100, 2)
        else least(j.discount, coalesce(t.labour_total, 0) + coalesce(p.parts_total, 0))
      end
  )::numeric(12,2) as invoice_total
from public.job_cards j
left join (
  select job_card_id, sum(labor_cost) as labour_total
  from public.job_tasks group by job_card_id
) t on t.job_card_id = j.id
left join (
  select job_card_id,
         sum(qty_issued * selling_price) as parts_total,
         sum(qty_issued * cost_price) as parts_cost
  from public.job_parts group by job_card_id
) p on p.job_card_id = j.id;

create or replace view public.v_low_stock
with (security_invoker = true)
as
select i.*, (i.min_stock - i.stock) as shortfall
from public.inventory_items i
where i.stock <= i.min_stock
order by i.stock asc, i.name asc;

create or replace view public.v_customer_receivables
with (security_invoker = true)
as
select
  c.*,
  (c.total - c.paid) as balance,
  (c.due_date + c.grace_days) as grace_due_date,
  greatest((current_date - (c.due_date + c.grace_days)), 0) as days_overdue
from public.customer_credits c
where c.status <> 'Settled';

create or replace view public.v_supplier_payables
with (security_invoker = true)
as
select
  p.*,
  s.name as supplier_name,
  s.phone as supplier_phone,
  (current_date - coalesce(p.due_date, p.purchase_date)) as days_since_due
from public.supplier_purchases p
join public.suppliers s on s.id = p.supplier_id
where p.purchase_type = 'Credit' and p.status = 'Unpaid'
order by p.due_date asc nulls last;

create or replace view public.v_cashier_queue
with (security_invoker = true)
as
select f.*, j.repair_type, j.payment_method
from public.v_job_financials f
join public.job_cards j on j.id = f.id
where j.status = 'Repair Completed'
order by j.completed_at asc;

create or replace view public.v_gate_queue
with (security_invoker = true)
as
select j.*, c.created_at as check_in_created_at
from public.job_cards j
left join public.check_ins c on c.id = j.check_in_id
where j.status in ('Paid','Released on Credit')
order by j.paid_at asc;

create or replace view public.v_vehicle_service_history
with (security_invoker = true)
as
select
  f.workshop_id,
  f.vehicle_no,
  count(*) as visits,
  min(f.created_at) as first_visit,
  max(f.created_at) as last_visit,
  sum(f.invoice_total) as lifetime_spend
from public.v_job_financials f
group by f.workshop_id, f.vehicle_no;

create or replace view public.v_monthly_pnl
with (security_invoker = true)
as
with revenue as (
  select
    workshop_id,
    date_trunc('month', entry_date)::date as month,
    sum(labor_revenue + parts_revenue - discount) as revenue,
    sum(parts_cost) as parts_cost,
    sum(commission) as commission,
    sum(case when payment_method = 'Cash' then labor_revenue + parts_revenue - discount else 0 end) as cash_sales,
    sum(case when payment_method = 'Card' then labor_revenue + parts_revenue - discount else 0 end) as card_sales,
    sum(case when payment_method = 'Credit' then labor_revenue + parts_revenue - discount else 0 end) as credit_sales,
    sum(case when payment_method = 'Credit Settlement' then coalesce(settlement_amount, 0) else 0 end) as credit_collected
  from public.ledger_entries
  group by workshop_id, date_trunc('month', entry_date)::date
),
costs as (
  select workshop_id, date_trunc('month', expense_date)::date as month, sum(amount) as expenses
  from public.expenses
  group by workshop_id, date_trunc('month', expense_date)::date
)
select
  coalesce(r.workshop_id, c.workshop_id) as workshop_id,
  coalesce(r.month, c.month) as month,
  coalesce(r.revenue, 0)::numeric(12,2) as revenue,
  coalesce(r.cash_sales, 0)::numeric(12,2) as cash_sales,
  coalesce(r.card_sales, 0)::numeric(12,2) as card_sales,
  coalesce(r.credit_sales, 0)::numeric(12,2) as credit_sales,
  coalesce(r.credit_collected, 0)::numeric(12,2) as credit_collected,
  coalesce(r.parts_cost, 0)::numeric(12,2) as parts_cost,
  coalesce(r.commission, 0)::numeric(12,2) as commission,
  coalesce(c.expenses, 0)::numeric(12,2) as expenses,
  (coalesce(r.revenue, 0) - coalesce(r.parts_cost, 0) - coalesce(r.commission, 0) - coalesce(c.expenses, 0))::numeric(12,2) as net_profit
from revenue r
full outer join costs c on c.workshop_id = r.workshop_id and c.month = r.month;

create or replace view public.v_marketing_queue
with (security_invoker = true)
as
select *
from public.marketing_reminders
where status = 'Pending'
  and (
    target_date is not null and target_date <= current_date
    or target_mileage is not null
  )
order by ready_at asc nulls last, target_date asc nulls last;

-- ---------------------------------------------------------------------------
-- 18. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table
    public.notifications,
    public.check_ins,
    public.job_cards,
    public.job_parts,
    public.inventory_items;
exception
  when undefined_object then null;
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Storage buckets and policies
--   job-photos/<workshop_id>/<job_number>/<file>   (private)
--   branding/<workshop_id>/<file>                  (public read)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists job_photos_read on storage.objects;
create policy job_photos_read on storage.objects
for select to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
);

drop policy if exists job_photos_write on storage.objects;
create policy job_photos_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and (public.is_owner() or public.has_any_department(array['PRO']))
);

drop policy if exists job_photos_update on storage.objects;
create policy job_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and (public.is_owner() or public.has_any_department(array['PRO']))
);

drop policy if exists job_photos_delete on storage.objects;
create policy job_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.is_owner()
);

drop policy if exists branding_read on storage.objects;
create policy branding_read on storage.objects
for select to public
using (bucket_id = 'branding');

drop policy if exists branding_write on storage.objects;
create policy branding_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.is_owner()
);

drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects
for update to authenticated
using (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.is_owner()
);

drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.is_owner()
);

-- ---------------------------------------------------------------------------
-- 20. Grants (RLS still applies; no anon access except the public RPCs)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_job_financials, public.v_low_stock, public.v_customer_receivables,
  public.v_supplier_payables, public.v_cashier_queue, public.v_gate_queue,
  public.v_vehicle_service_history, public.v_monthly_pnl, public.v_marketing_queue
  to authenticated;

-- ============================================================================
-- 21. Extended workflows (workshop update pack)
--     Advances, estimates, insurance, labour catalogue, payroll, attendance,
--     staff loans, daily wages, warranty claims and service records.
--     Written as additive DDL so this file can be re-run on an existing schema.
-- ============================================================================

-- Workshop payroll / licence settings ---------------------------------------
alter table public.workshops
  add column if not exists working_days smallint[] not null default '{1,2,3,4,5,6}',
  add column if not exists epf_employee_rate numeric(5,2) not null default 8
    check (epf_employee_rate >= 0 and epf_employee_rate <= 100),
  add column if not exists epf_employer_rate numeric(5,2) not null default 12
    check (epf_employer_rate >= 0 and epf_employer_rate <= 100),
  add column if not exists etf_rate numeric(5,2) not null default 3
    check (etf_rate >= 0 and etf_rate <= 100),
  add column if not exists trial_started_at timestamptz not null default now(),
  add column if not exists license_key text,
  add column if not exists license_activated_at timestamptz,
  add column if not exists license_expires_at timestamptz,
  add column if not exists license_holder text;

-- Worker pay basis and statutory toggles ------------------------------------
alter table public.workers
  add column if not exists pay_type text not null default 'Monthly'
    check (pay_type in ('Monthly','Daily')),
  add column if not exists daily_rate numeric(12,2) not null default 0
    check (daily_rate >= 0),
  add column if not exists epf_enabled boolean not null default true,
  add column if not exists etf_enabled boolean not null default true,
  add column if not exists commission_enabled boolean not null default true,
  add column if not exists allowed_off_days_per_month integer not null default 2
    check (allowed_off_days_per_month >= 0);

-- Labour price catalogue -----------------------------------------------------
create table if not exists public.labour_catalogue (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null check (length(trim(name)) > 1),
  category text not null default 'General',
  standard_price numeric(12,2) not null default 0 check (standard_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insurance company directory ------------------------------------------------
create table if not exists public.insurance_companies (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null check (length(trim(name)) > 1),
  address text not null default '',
  email text not null default '',
  hotline text not null default '',
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Estimates and approvals ----------------------------------------------------
create table if not exists public.job_estimates (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  kind text not null default 'Initial' check (kind in ('Initial','Supplementary')),
  status text not null default 'Draft'
    check (status in ('Draft','Awaiting Approval','Approved','Rejected')),
  lines jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Advance payments / deposits -------------------------------------------------
create table if not exists public.advance_payments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  customer_name text not null,
  vehicle_no text not null,
  phone text not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'Cash'
    check (method in ('Cash','Card','Bank Transfer')),
  receipt_no text not null,
  note text,
  recorded_by text,
  created_at timestamptz not null default now(),
  unique (workshop_id, receipt_no)
);

-- Insurance claims ------------------------------------------------------------
create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  insurer_id uuid not null references public.insurance_companies(id) on delete restrict,
  claim_no text not null,
  policy_no text not null,
  assessor_name text,
  assessor_phone text,
  estimate_status text not null default 'Pending'
    check (estimate_status in ('Pending','Submitted','Approved')),
  estimate_approved_at timestamptz,
  parts_status text not null default 'Pending'
    check (parts_status in ('Pending','Submitted','Approved')),
  parts_approved_at timestamptz,
  insurance_bill_no text,
  insurance_bill_amount numeric(12,2) check (insurance_bill_amount >= 0),
  insurance_bill_at timestamptz,
  customer_bill_no text,
  customer_bill_amount numeric(12,2) check (customer_bill_amount >= 0),
  release_order_no text,
  release_order_received_at timestamptz,
  salvage_status text not null default 'Pending'
    check (salvage_status in ('Pending','Submitted','Not Required')),
  salvage_submitted_at timestamptz,
  salvage_reference text,
  cheque_no text,
  cheque_amount numeric(12,2) check (cheque_amount >= 0),
  cheque_received_at timestamptz,
  cheque_cleared_at timestamptz,
  status text not null default 'Open'
    check (status in ('Open','Estimate Approved','Parts Approved','Awaiting Payment','Settled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_card_id),
  unique (workshop_id, claim_no)
);

-- Attendance register ---------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('Present','Absent','Off Day')),
  marked_by text,
  marked_at timestamptz not null default now(),
  unique (worker_id, attendance_date)
);

-- Staff loans / salary advances ----------------------------------------------
create table if not exists public.staff_loans (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  loan_date date not null default current_date,
  principal numeric(12,2) not null check (principal > 0),
  balance numeric(12,2) not null check (balance >= 0),
  monthly_deduction numeric(12,2) not null check (monthly_deduction > 0),
  reason text not null default '',
  status text not null default 'Active' check (status in ('Active','Settled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (balance <= principal)
);

-- Payslips --------------------------------------------------------------------
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  worked_days numeric(6,2) not null default 0 check (worked_days >= 0),
  working_days numeric(6,2) not null default 0 check (working_days >= 0),
  basic numeric(12,2) not null default 0 check (basic >= 0),
  commission numeric(12,2) not null default 0 check (commission >= 0),
  loan_deduction numeric(12,2) not null default 0 check (loan_deduction >= 0),
  epf_employee numeric(12,2) not null default 0 check (epf_employee >= 0),
  epf_employer numeric(12,2) not null default 0 check (epf_employer >= 0),
  etf_employer numeric(12,2) not null default 0 check (etf_employer >= 0),
  other_deductions numeric(12,2) not null default 0 check (other_deductions >= 0),
  gross numeric(12,2) not null default 0 check (gross >= 0),
  net numeric(12,2) not null default 0 check (net >= 0),
  paid_at timestamptz not null default now(),
  paid_by text,
  note text,
  created_at timestamptz not null default now()
);

-- Daily wage payouts ----------------------------------------------------------
create table if not exists public.wage_payouts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  payout_date date not null default current_date,
  days numeric(6,2) not null default 0 check (days >= 0),
  base_amount numeric(12,2) not null default 0 check (base_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  commission_included boolean not null default true,
  amount numeric(12,2) not null check (amount >= 0),
  receipt_no text not null,
  paid_at timestamptz not null default now(),
  paid_by text,
  created_at timestamptz not null default now(),
  unique (workshop_id, receipt_no)
);

-- Supplier credit notes / warranty returns ------------------------------------
create table if not exists public.supplier_credit_notes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  part_id uuid references public.job_parts(id) on delete set null,
  job_card_id uuid references public.job_cards(id) on delete set null,
  supplier_invoice_no text not null,
  credit_note_no text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  note_date date not null default current_date,
  reason text not null default '',
  status text not null default 'Recorded'
    check (status in ('Recorded','Applied')),
  created_at timestamptz not null default now()
);

-- Vehicle service history snapshots ------------------------------------------
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  vehicle_no text not null,
  make text not null default '',
  model text not null default '',
  customer_name text not null default '',
  service_date timestamptz not null default now(),
  mileage integer not null default 0 check (mileage >= 0),
  repair_type text not null default '',
  tasks jsonb not null default '[]'::jsonb,
  parts jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  unique (job_card_id)
);

-- Job card extensions ---------------------------------------------------------
alter table public.job_cards
  add column if not exists customer_address text,
  add column if not exists intake_type text not null default 'Repair'
    check (intake_type in ('Repair','Estimate')),
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists driver_commission_type text
    check (driver_commission_type in ('Fixed','Percentage')),
  add column if not exists driver_commission_value numeric(12,2)
    check (driver_commission_value >= 0),
  add column if not exists driver_commission_basis text
    check (driver_commission_basis in ('Labour','Total')),
  add column if not exists insurance_claim_id uuid;

alter table public.job_cards drop constraint if exists job_cards_payment_method_check;
alter table public.job_cards add constraint job_cards_payment_method_check
  check (payment_method is null or payment_method in ('Cash','Card','Credit','Insurance'));

do $$
begin
  alter table public.job_cards
    add constraint job_cards_insurance_claim_fk
    foreign key (insurance_claim_id) references public.insurance_claims(id) on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then null;
end;
$$;

-- Task and part extensions ----------------------------------------------------
alter table public.job_tasks
  add column if not exists labour_catalogue_id uuid
    references public.labour_catalogue(id) on delete set null;

alter table public.job_parts
  add column if not exists supplier_invoice_no text,
  add column if not exists warranty_replacement_invoice_no text,
  add column if not exists warranty_status text not null default 'None'
    check (warranty_status in ('None','Claimed','Replaced','Credited')),
  add column if not exists warranty_note text,
  add column if not exists warranty_claimed_at timestamptz,
  add column if not exists credit_note_no text,
  add column if not exists credit_note_amount numeric(12,2)
    check (credit_note_amount >= 0),
  add column if not exists salvage_status text
    check (salvage_status in ('Pending','Submitted','Not Required')),
  add column if not exists salvage_reference text,
  add column if not exists salvage_note text;

-- Ledger extends to insurance and driver commissions -------------------------
alter table public.ledger_entries
  add column if not exists driver_commission numeric(12,2) not null default 0
    check (driver_commission >= 0);

alter table public.ledger_entries drop constraint if exists ledger_entries_payment_method_check;
alter table public.ledger_entries add constraint ledger_entries_payment_method_check
  check (payment_method in ('Cash','Card','Credit','Credit Settlement','Insurance','Insurance Settlement'));

-- Indexes ---------------------------------------------------------------------
create index if not exists labour_catalogue_workshop_idx on public.labour_catalogue(workshop_id);
create index if not exists insurance_companies_workshop_idx on public.insurance_companies(workshop_id);
create index if not exists insurance_claims_workshop_idx on public.insurance_claims(workshop_id, status);
create index if not exists estimates_job_idx on public.job_estimates(job_card_id);
create index if not exists advances_job_idx on public.advance_payments(job_card_id);
create index if not exists advances_workshop_idx on public.advance_payments(workshop_id, created_at desc);
create index if not exists attendance_workshop_date_idx on public.attendance_records(workshop_id, attendance_date desc);
create index if not exists staff_loans_worker_idx on public.staff_loans(worker_id, status);
create index if not exists payslips_worker_idx on public.payslips(worker_id, period_end desc);
create index if not exists wage_payouts_worker_idx on public.wage_payouts(worker_id, paid_at desc);
create index if not exists credit_notes_workshop_idx on public.supplier_credit_notes(workshop_id, status);
create index if not exists service_records_vehicle_idx on public.service_records(workshop_id, vehicle_no);
create index if not exists job_parts_supplier_invoice_idx on public.job_parts(supplier_invoice_no);

-- Triggers --------------------------------------------------------------------
drop trigger if exists labour_catalogue_updated_at on public.labour_catalogue;
create trigger labour_catalogue_updated_at before update on public.labour_catalogue
for each row execute function public.set_updated_at();

drop trigger if exists insurance_companies_updated_at on public.insurance_companies;
create trigger insurance_companies_updated_at before update on public.insurance_companies
for each row execute function public.set_updated_at();

drop trigger if exists insurance_claims_updated_at on public.insurance_claims;
create trigger insurance_claims_updated_at before update on public.insurance_claims
for each row execute function public.set_updated_at();

drop trigger if exists job_estimates_updated_at on public.job_estimates;
create trigger job_estimates_updated_at before update on public.job_estimates
for each row execute function public.set_updated_at();

drop trigger if exists staff_loans_updated_at on public.staff_loans;
create trigger staff_loans_updated_at before update on public.staff_loans
for each row execute function public.set_updated_at();

-- Row Level Security ----------------------------------------------------------
alter table public.labour_catalogue enable row level security;
alter table public.insurance_companies enable row level security;
alter table public.insurance_claims enable row level security;
alter table public.job_estimates enable row level security;
alter table public.advance_payments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.staff_loans enable row level security;
alter table public.payslips enable row level security;
alter table public.wage_payouts enable row level security;
alter table public.supplier_credit_notes enable row level security;
alter table public.service_records enable row level security;

-- Catalogue & directory: everyone reads, owner writes.
drop policy if exists labour_catalogue_read on public.labour_catalogue;
create policy labour_catalogue_read on public.labour_catalogue
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists labour_catalogue_write on public.labour_catalogue;
create policy labour_catalogue_write on public.labour_catalogue
for all to authenticated
using (workshop_id = public.current_workshop_id() and public.is_owner())
with check (workshop_id = public.current_workshop_id() and public.is_owner());

drop policy if exists insurance_companies_read on public.insurance_companies;
create policy insurance_companies_read on public.insurance_companies
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists insurance_companies_write on public.insurance_companies;
create policy insurance_companies_write on public.insurance_companies
for all to authenticated
using (workshop_id = public.current_workshop_id() and public.is_owner())
with check (workshop_id = public.current_workshop_id() and public.is_owner());

-- Insurance claims: all staff read; supervisor and cashier manage.
drop policy if exists insurance_claims_read on public.insurance_claims;
create policy insurance_claims_read on public.insurance_claims
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists insurance_claims_write on public.insurance_claims;
create policy insurance_claims_write on public.insurance_claims
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor','Cashier'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor','Cashier'])));

-- Estimates: supervisor prepares; everyone reads for billing context.
drop policy if exists job_estimates_read on public.job_estimates;
create policy job_estimates_read on public.job_estimates
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists job_estimates_write on public.job_estimates;
create policy job_estimates_write on public.job_estimates
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor'])));

-- Advances: cashier and accounting.
drop policy if exists advance_payments_read on public.advance_payments;
create policy advance_payments_read on public.advance_payments
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])));

drop policy if exists advance_payments_write on public.advance_payments;
create policy advance_payments_write on public.advance_payments
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Cashier','Accounting'])));

-- Attendance: supervisor marks, accounting reads for payroll.
drop policy if exists attendance_read on public.attendance_records;
create policy attendance_read on public.attendance_records
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor','Accounting'])));

drop policy if exists attendance_write on public.attendance_records;
create policy attendance_write on public.attendance_records
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Supervisor'])));

-- Staff loans and payslips: owner-controlled payroll, accounting operates.
drop policy if exists staff_loans_read on public.staff_loans;
create policy staff_loans_read on public.staff_loans
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists staff_loans_write on public.staff_loans;
create policy staff_loans_write on public.staff_loans
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists payslips_read on public.payslips;
create policy payslips_read on public.payslips
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists payslips_write on public.payslips;
create policy payslips_write on public.payslips
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists wage_payouts_read on public.wage_payouts;
create policy wage_payouts_read on public.wage_payouts
for select to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

drop policy if exists wage_payouts_write on public.wage_payouts;
create policy wage_payouts_write on public.wage_payouts
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Accounting'])));

-- Supplier credit notes / warranty returns.
drop policy if exists supplier_credit_notes_read on public.supplier_credit_notes;
create policy supplier_credit_notes_read on public.supplier_credit_notes
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists supplier_credit_notes_write on public.supplier_credit_notes;
create policy supplier_credit_notes_write on public.supplier_credit_notes
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores','Accounting'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['Stores','Accounting'])));

-- Service records are written when the vehicle is dispatched.
drop policy if exists service_records_read on public.service_records;
create policy service_records_read on public.service_records
for select to authenticated using (workshop_id = public.current_workshop_id());

drop policy if exists service_records_write on public.service_records;
create policy service_records_write on public.service_records
for all to authenticated
using (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO','Supervisor'])))
with check (workshop_id = public.current_workshop_id()
  and (public.is_owner() or public.has_any_department(array['PRO','Supervisor'])));

-- Reporting views -------------------------------------------------------------
drop view if exists public.v_monthly_pnl;
create view public.v_monthly_pnl
with (security_invoker = true)
as
with revenue as (
  select
    workshop_id,
    date_trunc('month', entry_date)::date as month,
    sum(labor_revenue + parts_revenue - discount) as revenue,
    sum(parts_cost) as parts_cost,
    sum(commission) as commission,
    sum(driver_commission) as driver_commission,
    sum(case when payment_method = 'Cash' then labor_revenue + parts_revenue - discount else 0 end) as cash_sales,
    sum(case when payment_method = 'Card' then labor_revenue + parts_revenue - discount else 0 end) as card_sales,
    sum(case when payment_method = 'Credit' then labor_revenue + parts_revenue - discount else 0 end) as credit_sales,
    sum(case when payment_method = 'Credit Settlement' then coalesce(settlement_amount, 0) else 0 end) as credit_collected,
    sum(case when payment_method = 'Insurance' then labor_revenue + parts_revenue - discount else 0 end) as insurance_sales,
    sum(case when payment_method = 'Insurance Settlement' then coalesce(settlement_amount, 0) else 0 end) as insurance_collected
  from public.ledger_entries
  group by workshop_id, date_trunc('month', entry_date)::date
),
costs as (
  select workshop_id, month, sum(expenses) as expenses, sum(payroll) as payroll, sum(daily_wages) as daily_wages
  from (
    select workshop_id, date_trunc('month', expense_date)::date as month,
           amount as expenses, 0::numeric as payroll, 0::numeric as daily_wages
    from public.expenses
    union all
    select workshop_id, date_trunc('month', paid_at)::date as month,
           0::numeric, gross, 0::numeric
    from public.payslips
    union all
    select workshop_id, date_trunc('month', paid_at)::date as month,
           0::numeric, 0::numeric, amount
    from public.wage_payouts
  ) combined
  group by workshop_id, month
)
select
  coalesce(r.workshop_id, c.workshop_id) as workshop_id,
  coalesce(r.month, c.month) as month,
  coalesce(r.revenue, 0) as revenue,
  coalesce(r.cash_sales, 0) as cash_sales,
  coalesce(r.card_sales, 0) as card_sales,
  coalesce(r.credit_sales, 0) as credit_sales,
  coalesce(r.credit_collected, 0) as credit_collected,
  coalesce(r.parts_cost, 0) as parts_cost,
  coalesce(r.commission, 0) as commission,
  coalesce(c.expenses, 0) as expenses,
  (coalesce(r.revenue, 0) - coalesce(r.parts_cost, 0) - coalesce(r.commission, 0)
    - coalesce(r.driver_commission, 0) - coalesce(c.expenses, 0)
    - coalesce(c.payroll, 0) - coalesce(c.daily_wages, 0)) as net_profit,
  coalesce(r.driver_commission, 0)::numeric(12,2) as driver_commission,
  coalesce(r.insurance_sales, 0)::numeric(12,2) as insurance_sales,
  coalesce(r.insurance_collected, 0)::numeric(12,2) as insurance_collected,
  coalesce(c.payroll, 0)::numeric(12,2) as payroll,
  coalesce(c.daily_wages, 0)::numeric(12,2) as daily_wages
from revenue r
full outer join costs c on c.workshop_id = r.workshop_id and c.month = r.month;

drop view if exists public.v_insurance_receivables;
create view public.v_insurance_receivables
with (security_invoker = true)
as
select
  i.*,
  j.vehicle_no,
  j.customer_name,
  c.name as insurer_name,
  c.hotline as insurer_hotline,
  c.email as insurer_email,
  greatest(coalesce(i.insurance_bill_amount, 0) - coalesce(i.cheque_amount, 0), 0) as balance
from public.insurance_claims i
join public.job_cards j on j.id = i.job_card_id
join public.insurance_companies c on c.id = i.insurer_id
where i.status <> 'Settled';

-- Realtime --------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table
    public.insurance_claims,
    public.job_estimates,
    public.advance_payments,
    public.attendance_records,
    public.staff_loans,
    public.payslips,
    public.wage_payouts,
    public.service_records;
exception
  when undefined_object then null;
  when duplicate_object then null;
end;
$$;

-- Grants for the new tables and views -----------------------------------------
grant select, insert, update, delete on
  public.labour_catalogue,
  public.insurance_companies,
  public.insurance_claims,
  public.job_estimates,
  public.advance_payments,
  public.attendance_records,
  public.staff_loans,
  public.payslips,
  public.wage_payouts,
  public.supplier_credit_notes,
  public.service_records
to authenticated;

grant select on public.v_insurance_receivables, public.v_monthly_pnl to authenticated;

-- Done.

-- ============================================================================
-- Second wave: inventory controls, petty cash, banking, cheques, estimates,
-- insurance documents, driver commission, notification preferences.
-- Additive and idempotent. Apply after the original schema above.
-- ============================================================================

-- Inventory: opening stock, bulk purchase lines and supplier returns ---------
alter table public.inventory_items
  add column if not exists is_opening_stock boolean not null default false;

alter table public.supplier_purchases
  add column if not exists goods_confirmed_by text,
  add column if not exists goods_confirmed_at timestamptz,
  add column if not exists paid_by text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text
    check (payment_method in ('Cash','Bank Transfer','Cheque')),
  add column if not exists bank_account_id uuid,
  add column if not exists cheque_id uuid;

create table if not exists public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  purchase_id uuid not null references public.supplier_purchases(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  qty numeric(12,2) not null check (qty > 0),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  selling_price numeric(12,2) check (selling_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid references public.supplier_purchases(id) on delete set null,
  invoice_no text not null default '',
  reason text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Recorded' check (status in ('Recorded','Credited')),
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  return_id uuid not null references public.supplier_returns(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  qty numeric(12,2) not null check (qty > 0),
  cost_price numeric(12,2) not null check (cost_price >= 0)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  kind text not null check (kind in ('Opening_Stock','Purchase','Job_Issue','Supplier_Return')),
  qty numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  reference text not null default '',
  note text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

-- Banking --------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null,
  bank_name text not null default '',
  branch text not null default '',
  account_number text not null default '',
  account_type text not null default 'Bank' check (account_type in ('Bank','Cash')),
  opening_balance numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.supplier_purchases
  drop constraint if exists supplier_purchases_bank_account_id_fkey;
alter table public.supplier_purchases
  add constraint supplier_purchases_bank_account_id_fkey
  foreign key (bank_account_id) references public.bank_accounts(id) on delete set null;

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  account_id uuid not null references public.bank_accounts(id) on delete cascade,
  txn_date timestamptz not null default now(),
  direction text not null check (direction in ('Credit_In','Debit_Out')),
  amount numeric(12,2) not null check (amount > 0),
  category text not null default '',
  description text not null default '',
  reference text,
  linked_type text,
  linked_id uuid,
  transfer_group uuid,
  created_by text,
  created_at timestamptz not null default now()
);

-- Petty cash -----------------------------------------------------------------
create table if not exists public.petty_cash_entries (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  voucher_no text,
  entry_date timestamptz not null default now(),
  entry_type text not null check (entry_type in ('Float_Topup','Expense')),
  category text not null default 'Other',
  amount numeric(12,2) not null check (amount > 0),
  description text not null default '',
  paid_to text,
  photo_url text,
  receipt_no text not null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  recorded_by text,
  created_at timestamptz not null default now()
);

create index if not exists petty_cash_entry_date_idx
  on public.petty_cash_entries(workshop_id, entry_date desc);

-- Incoming cheques and credit payments ---------------------------------------
create table if not exists public.customer_cheques (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  source text not null check (source in ('Checkout','Advance','Credit','Insurance')),
  job_card_id uuid references public.job_cards(id) on delete set null,
  credit_id uuid references public.customer_credits(id) on delete set null,
  advance_id uuid references public.advance_payments(id) on delete set null,
  insurance_claim_id uuid references public.insurance_claims(id) on delete set null,
  customer_name text not null,
  vehicle_no text not null default '',
  phone text not null default '',
  cheque_no text not null,
  bank text not null,
  branch text not null,
  cheque_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'In_Safe'
    check (status in ('In_Safe','Deposited','Cleared','Bounced')),
  bounce_reason text,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  received_at timestamptz not null default now(),
  received_by text,
  cleared_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  credit_id uuid not null references public.customer_credits(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('Cash','Card','Bank Transfer','Cheque')),
  paid_on timestamptz not null default now(),
  cheque_id uuid references public.customer_cheques(id) on delete set null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  recorded_by text,
  created_at timestamptz not null default now()
);

-- Supplier post-dated cheques and workshop loans -----------------------------
create table if not exists public.supplier_cheques (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid references public.supplier_purchases(id) on delete set null,
  cheque_no text not null,
  bank text not null,
  branch text not null,
  cheque_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'Issued_PDC'
    check (status in ('Issued_PDC','Cleared','Taken_Back')),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  issued_by text,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workshop_loans (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  lender text not null,
  purpose text not null default '',
  principal numeric(12,2) not null check (principal > 0),
  balance numeric(12,2) not null check (balance >= 0),
  monthly_installment numeric(12,2) not null check (monthly_installment > 0),
  start_date date not null default current_date,
  next_due_date date,
  status text not null default 'Active' check (status in ('Active','Settled')),
  created_at timestamptz not null default now()
);

create table if not exists public.workshop_loan_payments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  loan_id uuid not null references public.workshop_loans(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('Cash','Bank Transfer','Cheque')),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  paid_on timestamptz not null default now(),
  receipt_no text not null,
  recorded_by text,
  created_at timestamptz not null default now()
);

-- Estimates: revision, numbering and approval lock --------------------------
alter table public.job_estimates
  add column if not exists number text not null default 'Initial',
  add column if not exists revision integer not null default 1 check (revision >= 1),
  add column if not exists approved_by text;

create unique index if not exists job_estimates_one_initial_idx
  on public.job_estimates(job_card_id)
  where kind = 'Initial';

create unique index if not exists job_estimates_supp_number_idx
  on public.job_estimates(job_card_id, number)
  where kind = 'Supplementary';

-- Driver commission basis accepts the UI value ('Total Bill') ----------------
alter table public.job_cards
  drop constraint if exists job_cards_driver_commission_basis_check;
alter table public.job_cards
  add constraint job_cards_driver_commission_basis_check
  check (driver_commission_basis in ('Labour','Total Bill'));

-- Insurance claim document and cheque fields --------------------------------
alter table public.insurance_claims
  add column if not exists customer_bill_no text,
  add column if not exists customer_bill_amount numeric(12,2),
  add column if not exists cheque_bank text,
  add column if not exists cheque_branch text,
  add column if not exists cheque_date date,
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete set null;

-- Notification preferences ---------------------------------------------------
alter table public.profiles
  add column if not exists notification_preferences jsonb not null default
    '{"voiceEnabled":false,"jobUpdates":true,"inventoryAlerts":true,"paymentAlerts":true,"chequeAlerts":true}'::jsonb;

-- Indexes --------------------------------------------------------------------
create index if not exists bank_transactions_account_idx
  on public.bank_transactions(account_id, txn_date desc);
create index if not exists customer_cheques_status_idx
  on public.customer_cheques(workshop_id, status, cheque_date);
create index if not exists supplier_cheques_status_idx
  on public.supplier_cheques(workshop_id, status, cheque_date);
create index if not exists credit_payments_credit_idx
  on public.credit_payments(credit_id, paid_on desc);
create index if not exists stock_movements_item_idx
  on public.stock_movements(item_id, created_at desc);

-- RLS ------------------------------------------------------------------------
alter table public.purchase_lines enable row level security;
alter table public.supplier_returns enable row level security;
alter table public.supplier_return_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.petty_cash_entries enable row level security;
alter table public.customer_cheques enable row level security;
alter table public.credit_payments enable row level security;
alter table public.supplier_cheques enable row level security;
alter table public.workshop_loans enable row level security;
alter table public.workshop_loan_payments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'purchase_lines','supplier_returns','supplier_return_lines','stock_movements',
    'bank_accounts','bank_transactions','petty_cash_entries','customer_cheques',
    'credit_payments','supplier_cheques','workshop_loans','workshop_loan_payments'
  ]
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using (workshop_id = public.current_workshop_id())',
      t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (workshop_id = public.current_workshop_id() and (public.is_owner() or public.has_any_department(array[''Accounting'',''Cashier'',''Stores'',''Supervisor''])) ) with check (workshop_id = public.current_workshop_id() and (public.is_owner() or public.has_any_department(array[''Accounting'',''Cashier'',''Stores'',''Supervisor''])))',
      t, t
    );
  end loop;
end;
$$;

-- Grants ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.purchase_lines,
  public.supplier_returns,
  public.supplier_return_lines,
  public.stock_movements,
  public.bank_accounts,
  public.bank_transactions,
  public.petty_cash_entries,
  public.customer_cheques,
  public.credit_payments,
  public.supplier_cheques,
  public.workshop_loans,
  public.workshop_loan_payments
to authenticated;-- Keep P&L petty cash aware --------------------------------------------------
drop view if exists public.v_monthly_pnl;
create view public.v_monthly_pnl
with (security_invoker = true)
as
with revenue as (
  select
    workshop_id,
    date_trunc('month', entry_date)::date as month,
    sum(labor_revenue + parts_revenue - discount) as revenue,
    sum(parts_cost) as parts_cost,
    sum(commission) as commission,
    sum(driver_commission) as driver_commission,
    sum(case when payment_method = 'Cash' then labor_revenue + parts_revenue - discount else 0 end) as cash_sales,
    sum(case when payment_method = 'Card' then labor_revenue + parts_revenue - discount else 0 end) as card_sales,
    sum(case when payment_method = 'Credit' then labor_revenue + parts_revenue - discount else 0 end) as credit_sales,
    sum(case when payment_method = 'Credit Settlement' then coalesce(settlement_amount, 0) else 0 end) as credit_collected,
    sum(case when payment_method = 'Insurance' then labor_revenue + parts_revenue - discount else 0 end) as insurance_sales,
    sum(case when payment_method = 'Insurance Settlement' then coalesce(settlement_amount, 0) else 0 end) as insurance_collected
  from public.ledger_entries
  group by workshop_id, date_trunc('month', entry_date)::date
),
costs as (
  select workshop_id, month, sum(expenses) as expenses, sum(payroll) as payroll, sum(daily_wages) as daily_wages
  from (
    select workshop_id, date_trunc('month', expense_date)::date as month,
           amount as expenses, 0::numeric as payroll, 0::numeric as daily_wages
    from public.expenses
    union all
    select workshop_id, date_trunc('month', entry_date)::date as month,
           amount as expenses, 0::numeric, 0::numeric
    from public.petty_cash_entries
    where entry_type = 'Expense'
    union all
    select workshop_id, date_trunc('month', paid_at)::date as month,
           0::numeric, gross, 0::numeric
    from public.payslips
    union all
    select workshop_id, date_trunc('month', paid_at)::date as month,
           0::numeric, 0::numeric, amount
    from public.wage_payouts
  ) combined
  group by workshop_id, month
)
select
  coalesce(r.workshop_id, c.workshop_id) as workshop_id,
  coalesce(r.month, c.month) as month,
  coalesce(r.revenue, 0) as revenue,
  coalesce(r.cash_sales, 0) as cash_sales,
  coalesce(r.card_sales, 0) as card_sales,
  coalesce(r.credit_sales, 0) as credit_sales,
  coalesce(r.credit_collected, 0) as credit_collected,
  coalesce(r.parts_cost, 0) as parts_cost,
  coalesce(r.commission, 0) as commission,
  coalesce(c.expenses, 0) as expenses,
  (coalesce(r.revenue, 0) - coalesce(r.parts_cost, 0) - coalesce(r.commission, 0)
    - coalesce(r.driver_commission, 0) - coalesce(c.expenses, 0)
    - coalesce(c.payroll, 0) - coalesce(c.daily_wages, 0)) as net_profit,
  coalesce(r.driver_commission, 0)::numeric(12,2) as driver_commission,
  coalesce(r.insurance_sales, 0)::numeric(12,2) as insurance_sales,
  coalesce(r.insurance_collected, 0)::numeric(12,2) as insurance_collected,
  coalesce(c.payroll, 0)::numeric(12,2) as payroll,
  coalesce(c.daily_wages, 0)::numeric(12,2) as daily_wages
from revenue r
full outer join costs c on c.workshop_id = r.workshop_id and c.month = r.month;

grant select on public.v_monthly_pnl to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Tax registration, IRD invoice template and printer routing
-- ---------------------------------------------------------------------------
alter table public.workshops
  add column if not exists tin_number text not null default '',
  add column if not exists vat_reg_number text not null default '',
  add column if not exists default_vat_rate numeric(5,2) not null default 18
    check (default_vat_rate >= 0 and default_vat_rate <= 100),
  add column if not exists place_of_supply text not null default '',
  add column if not exists footer_inquiry_line text not null default
    'Any inquiry, please call our workshop hotline.',
  add column if not exists footer_complaint_line text not null default
    'Any suggestion or complaint regarding your vehicle or job, please contact management.',
  add column if not exists printer_mode text not null default 'Both'
    check (printer_mode in ('Standard_PC','Thermal_Only','Both')),
  add column if not exists thermal_paper_width text not null default '80mm'
    check (thermal_paper_width in ('58mm','80mm')),
  add column if not exists standard_paper_size text not null default 'A4'
    check (standard_paper_size in ('A4','A5'));

-- Insurance directory: IRD TIN and soft active/inactive status -----------------
alter table public.insurance_companies
  add column if not exists tin_number text not null default '',
  add column if not exists active boolean not null default true;

-- Invoice tax and purchaser TIN -----------------------------------------------
alter table public.job_cards
  add column if not exists customer_tin_number text,
  add column if not exists is_vat_invoice boolean not null default false,
  add column if not exists vat_rate_applied numeric(5,2) not null default 0
    check (vat_rate_applied >= 0 and vat_rate_applied <= 100),
  add column if not exists vat_amount numeric(12,2) not null default 0
    check (vat_amount >= 0);

alter table public.insurance_claims
  add column if not exists branch_address_override text,
  add column if not exists is_vat_invoice boolean not null default false,
  add column if not exists vat_rate_applied numeric(5,2) not null default 0
    check (vat_rate_applied >= 0 and vat_rate_applied <= 100),
  add column if not exists vat_amount numeric(12,2) not null default 0
    check (vat_amount >= 0);

-- Dated cheque payments are a first-class payment method ----------------------
alter table public.job_cards drop constraint if exists job_cards_payment_method_check;
alter table public.job_cards add constraint job_cards_payment_method_check
  check (payment_method is null or payment_method in ('Cash','Card','Credit','Insurance','Cheque'));

alter table public.ledger_entries drop constraint if exists ledger_entries_payment_method_check;
alter table public.ledger_entries add constraint ledger_entries_payment_method_check
  check (payment_method in ('Cash','Card','Credit','Credit Settlement','Insurance','Insurance Settlement','Cheque'));

-- ---------------------------------------------------------------------------
-- 14. RAVBsoft developer portal: client installations, LKR payments and the
--     outbound-only licence poll used by each isolated client server
-- ---------------------------------------------------------------------------
create table if not exists public.developer_client_installations (
  id text primary key,
  workshop_name text not null,
  software_name text not null default 'Torque ERP',
  server_address text,
  owner_name text not null default '',
  phone text not null default '',
  email text,
  district text not null default '',
  address text,
  plan text not null default 'Growth'
    check (plan in ('Lite','Starter','Growth','Pro','Enterprise')),
  monthly_fee numeric(12,2)
    check (monthly_fee is null or monthly_fee >= 0),
  status text not null default 'Active'
    check (status in ('Trial','Active','Expired','Suspended')),
  expires_at timestamptz,
  feature_flags jsonb not null default '{}'::jsonb,
  notes text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.developer_client_installations
  add column if not exists software_name text not null default 'Torque ERP',
  add column if not exists server_address text,
  add column if not exists app_version text not null default '1.0.0',
  add column if not exists latest_version text not null default '1.0.0',
  add column if not exists git_branch text,
  add column if not exists custom_build boolean not null default false,
  add column if not exists customisation_summary text,
  add column if not exists deploy_webhook_url text,
  add column if not exists last_deployed_at timestamptz,
  add column if not exists last_deployed_by text;

create table if not exists public.developer_license_payments (
  id text primary key,
  client_id text not null references public.developer_client_installations(id) on delete cascade,
  workshop_name text not null default '',
  paid_at timestamptz not null default now(),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'LKR' check (currency = 'LKR'),
  method text not null default 'Bank Transfer'
    check (method in ('Bank Transfer','Cash','Card','Online')),
  reference text,
  months integer not null default 12 check (months > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists developer_license_payments_client_idx
  on public.developer_license_payments (client_id, paid_at desc);

alter table public.developer_client_installations enable row level security;
alter table public.developer_license_payments enable row level security;

-- The portal publishes with the anon key in the demo deployment. In production
-- replace these policies with an authenticated developer role or a service key
-- kept on a trusted server only.
drop policy if exists developer_installations_portal_all on public.developer_client_installations;
create policy developer_installations_portal_all on public.developer_client_installations
  for all using (true) with check (true);

drop policy if exists developer_payments_portal_all on public.developer_license_payments;
create policy developer_payments_portal_all on public.developer_license_payments
  for all using (true) with check (true);

-- Workshops call this function outbound. It never exposes other clients and
-- updates last_seen_at so the portal can show fleet activity.
create or replace function public.poll_workshop_license(p_installation_id text)
returns table (
  status text,
  plan text,
  expires_at timestamptz,
  feature_flags jsonb,
  holder text,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.developer_client_installations i
     set last_seen_at = v_now,
         status = case
           when i.status = 'Active' and i.expires_at is not null and i.expires_at < v_now
             then 'Expired'
           else i.status
         end,
         updated_at = v_now
   where i.id = upper(trim(p_installation_id));

  return query
    select i.status,
           i.plan,
           i.expires_at,
           i.feature_flags,
           i.workshop_name as holder,
           v_now as server_time
      from public.developer_client_installations i
     where i.id = upper(trim(p_installation_id));
end;
$$;

revoke all on function public.poll_workshop_license(text) from public;
grant execute on function public.poll_workshop_license(text) to anon, authenticated;
grant select, insert, update, delete on public.developer_client_installations to anon, authenticated;
grant select, insert, update, delete on public.developer_license_payments to anon, authenticated;

-- Workshop-side licence cache columns. The client writes these locally first,
-- then mirrors the state of the last successful poll for support diagnostics.
alter table public.workshops
  add column if not exists installation_id text not null default '',
  add column if not exists license_status text not null default 'Trial'
    check (license_status in ('Trial','Active','Expired','Suspended')),
  add column if not exists license_plan text not null default 'Starter',
  add column if not exists license_expires_at timestamptz,
  add column if not exists last_licence_sync_at timestamptz,
  add column if not exists feature_flags jsonb not null default '{}'::jsonb,
  add column if not exists stores_topology text not null default 'Central'
    check (stores_topology in ('Central','PerSection'));
