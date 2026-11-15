-- ============================================================================
-- 0003 — Security hardening
--
--   * database-level licence enforcement on operational writes
--   * private PDF buckets (invoice and payroll documents)
--   * owner-only WhatsApp / WAHA secrets
--   * audit log with redaction of licence keys and API keys
--   * RLS on every new table
--
-- Additive and idempotent. Safe to re-run on an existing installation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigserial primary key,
  workshop_id uuid,
  actor_id uuid,
  actor_name text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name text not null,
  record_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_workshop_idx
  on public.audit_log (workshop_id, created_at desc);
create index if not exists audit_log_table_idx
  on public.audit_log (table_name, record_id, created_at desc);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_owner_read on public.audit_log;
create policy audit_log_owner_read on public.audit_log
for select to authenticated
using (workshop_id = public.current_workshop_id() and public.is_owner());

-- No insert/update/delete policies. The security-definer trigger writes the
-- log; clients can never edit or erase audit history.
grant select on public.audit_log to authenticated;
revoke all on public.audit_log from anon;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_record_id text;
  v_before jsonb;
  v_after jsonb;
  v_actor uuid := auth.uid();
  v_actor_name text;
begin
  if tg_op in ('UPDATE','DELETE') then
    v_before := to_jsonb(old);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_after := to_jsonb(new);
  end if;

  if tg_table_name = 'workshops' then
    v_workshop := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
  else
    v_workshop := coalesce(
      (v_after->>'workshop_id')::uuid,
      (v_before->>'workshop_id')::uuid
    );
  end if;

  v_record_id := coalesce(
    v_after->>'id',
    v_before->>'id',
    v_after->>'workshop_id',
    v_before->>'workshop_id'
  );

  -- Never copy secrets into the audit trail.
  if tg_table_name = 'workshops' then
    v_before := v_before - 'license_key';
    v_after := v_after - 'license_key';
  elsif tg_table_name = 'workshop_whatsapp_secrets' then
    v_before := v_before - 'waha_api_key';
    v_after := v_after - 'waha_api_key';
  end if;

  if v_actor is not null then
    select p.full_name into v_actor_name
      from public.profiles p
     where p.id = v_actor
     limit 1;
  end if;

  insert into public.audit_log (
    workshop_id, actor_id, actor_name, action, table_name, record_id,
    before_data, after_data
  ) values (
    v_workshop, v_actor, v_actor_name, tg_op, tg_table_name, v_record_id,
    v_before, v_after
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Owner-only WhatsApp / WAHA secrets
-- ---------------------------------------------------------------------------
create table if not exists public.workshop_whatsapp_secrets (
  workshop_id uuid primary key references public.workshops(id) on delete cascade,
  provider text not null default 'WAHA' check (provider in ('WAHA','Meta')),
  waha_base_url text not null default '',
  waha_session text not null default 'default',
  waha_api_key text,
  whatsapp_number text not null default '',
  meta_phone_number_id text,
  meta_access_token text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.workshop_whatsapp_secrets enable row level security;

drop policy if exists workshop_whatsapp_owner_all on public.workshop_whatsapp_secrets;
create policy workshop_whatsapp_owner_all on public.workshop_whatsapp_secrets
for all to authenticated
using (workshop_id = public.current_workshop_id() and public.is_owner())
with check (workshop_id = public.current_workshop_id() and public.is_owner());

revoke all on public.workshop_whatsapp_secrets from anon;
grant select, insert, update, delete on public.workshop_whatsapp_secrets to authenticated;

-- Production tip: store the API key/token in Supabase Vault and keep only the
-- secret UUID in this table. The demo keeps the owner-only row for clarity.

-- ---------------------------------------------------------------------------
-- 3. Audit triggers on sensitive tables
-- ---------------------------------------------------------------------------
drop trigger if exists audit_workshops on public.workshops;
create trigger audit_workshops
after insert or update or delete on public.workshops
for each row execute function public.audit_row_change();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
after insert or update or delete on public.profiles
for each row execute function public.audit_row_change();

drop trigger if exists audit_job_cards on public.job_cards;
create trigger audit_job_cards
after insert or update or delete on public.job_cards
for each row execute function public.audit_row_change();

drop trigger if exists audit_job_parts on public.job_parts;
create trigger audit_job_parts
after insert or update or delete on public.job_parts
for each row execute function public.audit_row_change();

drop trigger if exists audit_ledger_entries on public.ledger_entries;
create trigger audit_ledger_entries
after insert or update or delete on public.ledger_entries
for each row execute function public.audit_row_change();

drop trigger if exists audit_advance_payments on public.advance_payments;
create trigger audit_advance_payments
after insert or update or delete on public.advance_payments
for each row execute function public.audit_row_change();

drop trigger if exists audit_payslips on public.payslips;
create trigger audit_payslips
after insert or update or delete on public.payslips
for each row execute function public.audit_row_change();

drop trigger if exists audit_wage_payouts on public.wage_payouts;
create trigger audit_wage_payouts
after insert or update or delete on public.wage_payouts
for each row execute function public.audit_row_change();

drop trigger if exists audit_petty_cash on public.petty_cash_entries;
create trigger audit_petty_cash
after insert or update or delete on public.petty_cash_entries
for each row execute function public.audit_row_change();

drop trigger if exists audit_customer_credits on public.customer_credits;
create trigger audit_customer_credits
after insert or update or delete on public.customer_credits
for each row execute function public.audit_row_change();

drop trigger if exists audit_supplier_purchases on public.supplier_purchases;
create trigger audit_supplier_purchases
after insert or update or delete on public.supplier_purchases
for each row execute function public.audit_row_change();

drop trigger if exists audit_whatsapp_secrets on public.workshop_whatsapp_secrets;
create trigger audit_whatsapp_secrets
after insert or update or delete on public.workshop_whatsapp_secrets
for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. Private PDF storage
--   invoice-pdfs/<workshop_id>/<job_number>/<file>.pdf
--   payroll-pdfs/<workshop_id>/<period>/<file>.pdf
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('payroll-pdfs', 'payroll-pdfs', false)
on conflict (id) do nothing;

drop policy if exists invoice_pdfs_read on storage.objects;
create policy invoice_pdfs_read on storage.objects
for select to authenticated
using (
  bucket_id = 'invoice-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and (
    public.is_owner()
    or public.has_any_department(array['Cashier','Accounting','Supervisor','PRO'])
  )
);

drop policy if exists invoice_pdfs_write on storage.objects;
create policy invoice_pdfs_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'invoice-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.has_any_department(array['Cashier','Accounting'])
);

drop policy if exists invoice_pdfs_update on storage.objects;
create policy invoice_pdfs_update on storage.objects
for update to authenticated
using (
  bucket_id = 'invoice-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.has_any_department(array['Cashier','Accounting'])
);

drop policy if exists invoice_pdfs_delete on storage.objects;
create policy invoice_pdfs_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'invoice-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.is_owner()
);

drop policy if exists payroll_pdfs_read on storage.objects;
create policy payroll_pdfs_read on storage.objects
for select to authenticated
using (
  bucket_id = 'payroll-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.has_any_department(array['Accounting'])
);

drop policy if exists payroll_pdfs_write on storage.objects;
create policy payroll_pdfs_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'payroll-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.has_any_department(array['Accounting'])
);

drop policy if exists payroll_pdfs_update on storage.objects;
create policy payroll_pdfs_update on storage.objects
for update to authenticated
using (
  bucket_id = 'payroll-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.has_any_department(array['Accounting'])
);

drop policy if exists payroll_pdfs_delete on storage.objects;
create policy payroll_pdfs_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'payroll-pdfs'
  and (storage.foldername(name))[1] = public.current_workshop_id()::text
  and public.is_owner()
);

-- ---------------------------------------------------------------------------
-- 5. Database-level licence enforcement
--
-- Trial = 30 days from trial_started_at. Active = a paid expiry in the future.
-- Demo workshops and trusted service-role work (auth.uid() is null) bypass the
-- write guard so support can still repair or export an expired installation.
-- ---------------------------------------------------------------------------
create or replace function public.licence_state(p_workshop_id uuid)
returns table (
  state text,
  expires_at timestamptz,
  days_remaining integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workshops%rowtype;
  v_expiry timestamptz;
  v_days integer;
begin
  select * into w from public.workshops where id = p_workshop_id;
  if not found then
    return query select 'Missing'::text, null::timestamptz, 0;
    return;
  end if;
  if w.demo_mode then
    return query select 'Demo'::text, null::timestamptz, null::integer;
    return;
  end if;
  if w.license_status = 'Suspended' then
    return query select 'Suspended'::text, w.license_expires_at, 0;
    return;
  end if;
  if w.license_status = 'Expired' then
    return query select 'Expired'::text, w.license_expires_at, 0;
    return;
  end if;

  v_expiry := coalesce(
    w.license_expires_at,
    w.trial_started_at + interval '30 days'
  );

  if v_expiry is not null then
    v_days := greatest(0, ceil(extract(epoch from (v_expiry - now())) / 86400.0))::integer;
    if v_expiry < now() then
      return query select 'Expired'::text, v_expiry, 0;
      return;
    end if;
  else
    v_days := null;
  end if;

  if w.license_status = 'Active' then
    return query select 'Active'::text, w.license_expires_at, v_days;
  else
    return query select 'Trial'::text, v_expiry, v_days;
  end if;
end;
$$;

revoke all on function public.licence_state(uuid) from public;
grant execute on function public.licence_state(uuid) to authenticated;

create or replace function public.enforce_workshop_licence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop uuid;
  v_state text;
begin
  -- Trusted backend jobs, migrations and service-role support bypass the guard.
  if auth.uid() is null then
    return new;
  end if;

  v_workshop := nullif(to_jsonb(new)->>'workshop_id', '')::uuid;
  if v_workshop is null then
    return new;
  end if;

  select state into v_state from public.licence_state(v_workshop);
  if v_state in ('Expired', 'Suspended', 'Missing') then
    raise exception
      'Licence % for workshop %. Renew the licence in Settings → Licence before changing operational data.',
      v_state, v_workshop
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_workshop_licence() from public, anon, authenticated;

drop trigger if exists enforce_licence_check_ins on public.check_ins;
create trigger enforce_licence_check_ins
before insert or update on public.check_ins
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_job_cards on public.job_cards;
create trigger enforce_licence_job_cards
before insert or update on public.job_cards
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_job_parts on public.job_parts;
create trigger enforce_licence_job_parts
before insert or update on public.job_parts
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_ledger on public.ledger_entries;
create trigger enforce_licence_ledger
before insert or update on public.ledger_entries
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_advances on public.advance_payments;
create trigger enforce_licence_advances
before insert or update on public.advance_payments
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_payslips on public.payslips;
create trigger enforce_licence_payslips
before insert or update on public.payslips
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_wages on public.wage_payouts;
create trigger enforce_licence_wages
before insert or update on public.wage_payouts
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_purchases on public.supplier_purchases;
create trigger enforce_licence_purchases
before insert or update on public.supplier_purchases
for each row execute function public.enforce_workshop_licence();

drop trigger if exists enforce_licence_petty_cash on public.petty_cash_entries;
create trigger enforce_licence_petty_cash
before insert or update on public.petty_cash_entries
for each row execute function public.enforce_workshop_licence();

-- ---------------------------------------------------------------------------
-- 6. Audit retention helper (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.trim_audit_log(p_days integer default 365)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if p_days < 30 then
    raise exception 'Audit retention must be at least 30 days.';
  end if;
  delete from public.audit_log
   where created_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.trim_audit_log(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.trim_audit_log(integer) to service_role;
  end if;
end;
$$;