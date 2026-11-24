-- ============================================================================
-- Golden-master verification
--
-- Run against the clean template database with the service role:
--   psql "$SUPABASE_DB_URL" -f supabase/golden-master/verify.sql
--
-- Every check raises an exception on failure, so a non-zero psql exit code
-- means the template must not be published or cloned.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Manifest exists and forbids client data
-- ---------------------------------------------------------------------------
do $$
declare
  v_allowed boolean;
  v_app text;
begin
  select client_data_allowed, app_version
    into v_allowed, v_app
    from public.golden_master_manifest
   where id = 'RAVSOFT-GM-V1';

  if v_allowed is null then
    raise exception 'Golden-master manifest row RAVSOFT-GM-V1 is missing.';
  end if;
  if v_allowed then
    raise exception 'Manifest allows client data. Set client_data_allowed = false before snapshotting.';
  end if;
  if coalesce(v_app, '') = '' then
    raise exception 'Manifest app_version is empty.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Required reference keys are present
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(expected.key, ', ' order by expected.key)
    into v_missing
    from (values
      ('expense_categories'),
      ('petty_cash_categories'),
      ('payment_methods'),
      ('service_types'),
      ('vehicle_makes'),
      ('insurance_companies_lk'),
      ('licence_plans'),
      ('release_channels')
    ) as expected(key)
   where not exists (
     select 1
       from public.system_reference_data data
      where data.key = expected.key
   );

  if v_missing is not null then
    raise exception 'Missing golden-master reference data: %', v_missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Every tenant table is empty
--    Global reference data lives in system_reference_data and is allowed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_count bigint;
  v_dirty text := '';
  v_tables text[] := array[
    'workshops',
    'profiles',
    'workers',
    'suppliers',
    'supplier_purchases',
    'inventory_items',
    'check_ins',
    'job_cards',
    'job_tasks',
    'job_parts',
    'customer_credits',
    'expenses',
    'ledger_entries',
    'marketing_reminders',
    'notifications',
    'workshop_counters',
    'labour_catalogue',
    'insurance_companies',
    'job_estimates',
    'advance_payments',
    'insurance_claims',
    'attendance_records',
    'staff_loans',
    'payslips',
    'wage_payouts',
    'supplier_credit_notes',
    'service_records',
    'purchase_lines',
    'supplier_returns',
    'supplier_return_lines',
    'stock_movements',
    'bank_accounts',
    'bank_transactions',
    'petty_cash_entries',
    'customer_cheques',
    'credit_payments',
    'supplier_cheques',
    'workshop_loans',
    'workshop_loan_payments'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    if v_count > 0 then
      v_dirty := v_dirty || format('%s=%s ', v_table, v_count);
    end if;
  end loop;

  if v_dirty <> '' then
    raise exception 'Golden master contains client rows: %', v_dirty;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Built-in assertion and status report
-- ---------------------------------------------------------------------------
select public.assert_golden_master_clean() as golden_master_clean;

select *
  from public.golden_master_status();

select key,
       category,
       jsonb_typeof(value) as value_type,
       is_seed
  from public.system_reference_data
 order by category, key;

-- ---------------------------------------------------------------------------
-- 5. Exactly one latest release is published per product
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad record;
begin
  for v_bad in
    select product, count(*) as latest_count
      from public.developer_releases
     where is_latest
     group by product
    having count(*) <> 1
  loop
    raise exception 'Expected exactly one latest release for %, found %.',
      v_bad.product, v_bad.latest_count;
  end loop;

  if not exists (select 1 from public.developer_releases where product = 'TAW' and is_latest) then
    raise exception 'TAW release train has no latest release.';
  end if;
end;
$$;

select product, version, released_at, title, migration_files
  from public.v_latest_release
 order by product;

-- ---------------------------------------------------------------------------
-- 6. Portal tables are advisory: a dedicated portal project should also be
--    empty, but these rows are not workshop client data.
-- ---------------------------------------------------------------------------
select 'developer_client_installations' as object_name, count(*) as row_count
  from public.developer_client_installations
union all
select 'developer_license_payments', count(*)
  from public.developer_license_payments
union all
select 'developer_update_runs', count(*)
  from public.developer_update_runs;