-- ============================================================================
-- 0005 — Workshop application-state bridge
--
-- The browser engine keeps a single AppState document per workshop. Its IDs are
-- prefixed text values (job_…, chk_…, usr_…) and several records contain nested
-- objects, while the normalised tables use UUID primary keys. This table gives
-- every workshop a real-time, RLS-protected copy of the engine state without an
-- ID-mapping layer across every screen.
--
-- Rows are workshop-scoped. `deleted` is a tombstone so an offline device
-- cannot resurrect a record that another device deleted.
--
-- Additive and idempotent. Run after 0001-0004.
-- ============================================================================

create table if not exists public.app_records (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  collection text not null check (collection ~ '^[a-zA-Z][a-zA-Z0-9]*$'),
  record_id text not null check (length(record_id) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  deleted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workshop_id, collection, record_id)
);

create index if not exists app_records_workshop_updated_idx
  on public.app_records (workshop_id, updated_at desc);

create index if not exists app_records_workshop_collection_idx
  on public.app_records (workshop_id, collection, sort_order);

alter table public.app_records enable row level security;

drop policy if exists app_records_workshop_all on public.app_records;
create policy app_records_workshop_all on public.app_records
  for all
  to authenticated
  using (workshop_id = public.current_workshop_id())
  with check (workshop_id = public.current_workshop_id());

revoke all on public.app_records from anon;
grant select, insert, update, delete on public.app_records to authenticated;

-- Stamp server time and attribute the writer. A client cannot spoof updated_by.
create or replace function public.touch_app_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.touch_app_record() from public, anon;
grant execute on function public.touch_app_record() to authenticated;

drop trigger if exists app_records_touch on public.app_records;
create trigger app_records_touch
  before insert or update on public.app_records
  for each row execute function public.touch_app_record();

-- Realtime is optional; the app still polls after reconnect. Add the table to
-- the default publication once.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
         from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'app_records'
     ) then
    alter publication supabase_realtime add table public.app_records;
  end if;
end;
$$;

-- Keep the golden-master clean check honest: this table must start empty.
comment on table public.app_records is
  'Workshop-scoped application state bridge. Empty in the golden master.';