-- ============================================================================
-- 0010 — TAW licence poll for the new order pipeline
--
-- The self-service order flow registers a TAW installation with status Trial,
-- then activates it from the portal. TAW-Carrier must therefore poll by the
-- portal-assigned TAW-LK installation ID and receive Trial/Active directly.
-- Older developer_license_keys remain supported as an activation fallback.
--
-- Additive and idempotent. Run after 0001-0009.
-- ============================================================================

create or replace function public.poll_taw_license(p_license_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input text := upper(trim(coalesce(p_license_key, '')));
  v_server_time timestamptz := now();
  v_installation public.developer_client_installations%rowtype;
  v_key public.developer_license_keys%rowtype;
  v_status text;
  v_plan text;
  v_expires timestamptz;
  v_holder text;
  v_installation_id text;
  v_valid boolean;
  v_message text;
begin
  -- New mechanism: the identifier is the installation ID from the order
  -- pipeline. Trial is a valid, fully unlocked state until payment.
  select * into v_installation
    from public.developer_client_installations
   where upper(trim(id)) = v_input
     and upper(trim(software_name)) = 'TAW'
   limit 1;

  if found then
    v_status := v_installation.status;
    v_plan := v_installation.plan;
    v_expires := v_installation.expires_at;
    v_holder := v_installation.workshop_name;
    v_installation_id := v_installation.id;

    if v_status = 'Active' and v_expires is not null and v_expires < v_server_time then
      v_status := 'Expired';
    end if;

    update public.developer_client_installations i
       set status = v_status,
           last_seen_at = v_server_time,
           updated_at = v_server_time
     where i.id = v_installation.id;

    v_valid := v_status in ('Trial', 'Active');
    v_message := case
      when v_status = 'Trial' then 'TAW trial is active. Every feature is unlocked.'
      when v_status = 'Active' then 'TAW licence is active.'
      when v_status = 'Expired' then 'This TAW trial or licence has expired.'
      else 'This TAW installation is suspended.'
    end;

    return jsonb_build_object(
      'valid', v_valid,
      'product', 'TAW',
      'plan', v_plan,
      'status', v_status,
      'expires_at', case
        when v_expires is null then ''
        else to_char(v_expires at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      end,
      'seats', 0,
      'installation_id', v_installation_id,
      'holder', v_holder,
      'server_time', to_char(v_server_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'message', v_message
    );
  end if;

  -- Compatibility: manually issued TAW keys from the earlier portal flow.
  select * into v_key
    from public.developer_license_keys
   where upper(trim(license_key)) = v_input
     and product = 'TAW'
   limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false, 'product', 'TAW', 'plan', '', 'status', 'NOT_FOUND',
      'expires_at', '', 'seats', 0,
      'installation_id', '', 'holder', '',
      'server_time', to_char(v_server_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'message', 'TAW installation ID or licence key was not found in the RAVBsoft portal.'
    );
  end if;

  v_status := case
    when v_key.status = 'Revoked' then 'Suspended'
    else v_key.status
  end;
  v_expires := v_key.expires_at;
  v_installation_id := coalesce(v_key.client_id, '');

  select workshop_name into v_holder
    from public.developer_client_installations
   where id = v_key.client_id;

  if v_status = 'Active' and v_expires is not null and v_expires < v_server_time then
    v_status := 'Expired';
  end if;

  v_valid := v_key.active and v_status = 'Active';
  v_message := case
    when v_valid then 'TAW licence is active.'
    when v_status = 'Expired' then 'This TAW licence has expired.'
    when v_status = 'Suspended' then 'This TAW licence is suspended.'
    else 'This TAW licence is not active.'
  end;

  return jsonb_build_object(
    'valid', v_valid,
    'product', 'TAW',
    'plan', v_key.plan,
    'status', v_status,
    'expires_at', case
      when v_expires is null then ''
      else to_char(v_expires at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    end,
    'seats', v_key.seats,
    'installation_id', v_installation_id,
    'holder', coalesce(v_holder, v_key.holder, ''),
    'server_time', to_char(v_server_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'message', v_message
  );
end;
$$;

revoke all on function public.poll_taw_license(text) from public;
grant execute on function public.poll_taw_license(text) to anon, authenticated, service_role;

-- Keep the golden manifest version current.
do $$
begin
  if to_regclass('public.golden_master_manifest') is not null then
    update public.golden_master_manifest
       set schema_version = '0001-0010'
     where id is not null;
  end if;
end;
$$;
