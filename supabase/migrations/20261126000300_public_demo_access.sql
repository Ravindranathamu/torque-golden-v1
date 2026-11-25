-- Public demo access: one global seven-day window from the first poll.
-- Clearing browser storage cannot restart the demo because the timestamp lives
-- in the master Supabase project.

create table if not exists public.demo_access_windows (
  demo_key text primary key,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.demo_access_windows enable row level security;

-- No direct table grants. The security-definer RPC is the only access path.
revoke all on public.demo_access_windows from anon, authenticated;

create or replace function public.poll_demo_access()
returns table (
  started_at timestamptz,
  expires_at timestamptz,
  server_time timestamptz,
  allowed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := 'ravsoft-portal-dashboard-demo';
  v_started_at timestamptz;
  v_server_time timestamptz := now();
begin
  insert into public.demo_access_windows (demo_key, started_at)
  values (v_key, v_server_time)
  on conflict (demo_key) do nothing;

  select w.started_at into v_started_at
  from public.demo_access_windows w
  where w.demo_key = v_key;

  return query
  select
    v_started_at,
    v_started_at + interval '7 days',
    v_server_time,
    v_server_time < v_started_at + interval '7 days';
end;
$$;

revoke all on function public.poll_demo_access() from public;
grant execute on function public.poll_demo_access() to anon, authenticated;
