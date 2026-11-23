-- Car status, wave 2: three optional keys in the car's status snapshot (the "status" object of a status call and the "live"
-- object of an orders poll), each for one feature:
--   remote_on   boolean   Copiloto's "Comandos remotos" switch as Mi Vigo last heard it  (specs/car-navigate-b2.md R2)
--   fw_version  text      head-unit software version, ro.build.version.software          (specs/car-firmware-a8.md R1)
--   odometer_km integer   odometer, IC_TOTAL_ODMETER 0x21402229, 0..999999                (specs/car-service-reminders-a4.md R1)
-- All optional: cars that do not send them keep working; null = unknown. No location, nothing personal (no VIN, no serials).
--
-- Trust model unchanged (0045/0048/0052): the Edge Function `car-device` verifies the signature and the shape, then
-- car_submit_status / car_poll_orders run the guard and car_store_status, which validates again (the database is the boundary).
-- Members read their own vehicle's row (0048 policy); the anon surface of A8 is added in 0056, not here.
--
-- NOT APPLIED (owner OK required). Apply with `npx supabase db push`, deploy `car-device`, then `npm run gen:types`.
-- ORDER MATTERS on the car side: install the Mi Vigo / Carga builds that send these keys only after this migration and the Edge
-- Function are live, or every status call and poll is refused as bad_request.

alter table public.car_status
  add column if not exists remote_on boolean,
  add column if not exists fw_version text check (fw_version is null or fw_version ~ '^[A-Za-z0-9_.-]{1,64}$'),
  add column if not exists odometer_km integer check (odometer_km between 0 and 999999);

comment on column public.car_status.remote_on is
  'Copiloto "Comandos remotos" switch as Mi Vigo last heard it; null = unknown (specs/car-navigate-b2.md).';
comment on column public.car_status.fw_version is
  'Head-unit software version (ro.build.version.software); null = unknown (specs/car-firmware-a8.md).';
comment on column public.car_status.odometer_km is
  'Odometer in km (IC_TOTAL_ODMETER); null = unknown (specs/car-service-reminders-a4.md).';

-- Replaces car_store_status as defined in 0052 (section 3). Same signature, contract and checks, plus the three keys.
create or replace function public.car_store_status(p_vehicle_id uuid, p_device_id uuid, p_status jsonb, p_live boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event text;
  v_observed timestamptz;
  v_soc integer;
  v_range integer;
  v_charging boolean;
  v_plugged boolean;
  v_reason text;
  v_remain integer;
  v_limit integer;
  v_remote boolean;
  v_fw text;
  v_odo integer;
  v_rows integer;
begin
  if p_status is null or jsonb_typeof(p_status) <> 'object' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- Unknown keys: nothing extra (e.g. a location) can be stored.
  if exists (select 1 from jsonb_object_keys(p_status) k
             where k not in ('event', 'observed_at', 'soc', 'range_km', 'charging', 'plugged', 'charge_end_reason',
                             'remain_charge_min', 'limit_pct', 'remote_on', 'fw_version', 'odometer_km')) then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- fw_version must be a JSON string (or null / absent): a number would otherwise be cast to text silently.
  if p_status ? 'fw_version' and jsonb_typeof(p_status -> 'fw_version') not in ('string', 'null') then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- odometer_km must be an integral JSON number (12.5 would round in the cast).
  if p_status ? 'odometer_km' and jsonb_typeof(p_status -> 'odometer_km') <> 'null'
     and (jsonb_typeof(p_status -> 'odometer_km') <> 'number' or (p_status ->> 'odometer_km') !~ '^[0-9]{1,6}$') then
    return jsonb_build_object('error', 'bad_request');
  end if;

  begin
    v_event := p_status ->> 'event';
    v_observed := to_timestamp((p_status ->> 'observed_at')::bigint / 1000.0);
    v_soc := (p_status ->> 'soc')::integer;
    v_range := (p_status ->> 'range_km')::integer;
    v_charging := (p_status ->> 'charging')::boolean;
    v_plugged := (p_status ->> 'plugged')::boolean;
    v_reason := p_status ->> 'charge_end_reason';
    v_remain := (p_status ->> 'remain_charge_min')::integer;
    v_limit := (p_status ->> 'limit_pct')::integer;
    v_remote := (p_status ->> 'remote_on')::boolean;
    v_fw := p_status ->> 'fw_version';
    v_odo := (p_status ->> 'odometer_km')::integer;
  exception when others then
    return jsonb_build_object('error', 'bad_request');
  end;

  if v_event is null
     or (p_live and v_event <> 'live')
     or (not p_live and v_event not in ('trip_end', 'charge_end'))
     or v_observed is null
     or v_observed > now() + interval '5 minutes'
     or v_observed < now() - interval '7 days'
     or (v_soc is not null and (v_soc < 0 or v_soc > 100))
     or (v_range is not null and (v_range < 0 or v_range > 1500))
     or (v_remain is not null and (v_remain < 0 or v_remain > 1440))
     or (v_limit is not null and (v_limit < 60 or v_limit > 100))
     or (v_fw is not null and v_fw !~ '^[A-Za-z0-9_.-]{1,64}$')
     or (v_odo is not null and (v_odo < 0 or v_odo > 999999))
     or (v_reason is not null and (v_event <> 'charge_end'
         or v_reason not in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos'))) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  insert into public.car_status as s
    (vehicle_id, device_id, event, soc, range_km, charging, plugged, charge_end_reason, remain_charge_min, limit_pct,
     remote_on, fw_version, odometer_km, observed_at, received_at)
  values
    (p_vehicle_id, p_device_id, v_event, v_soc, v_range, v_charging, v_plugged, v_reason, v_remain, v_limit,
     v_remote, v_fw, v_odo, v_observed, now())
  on conflict (vehicle_id) do update
    set device_id = excluded.device_id,
        event = excluded.event,
        soc = excluded.soc,
        range_km = excluded.range_km,
        charging = excluded.charging,
        plugged = excluded.plugged,
        charge_end_reason = excluded.charge_end_reason,
        remain_charge_min = excluded.remain_charge_min,
        limit_pct = excluded.limit_pct,
        -- The wave-2 keys change rarely, and a snapshot without them (an older app, a value it could not read) must not wipe a
        -- known value: keep the stored one when the new snapshot says nothing.
        remote_on = coalesce(excluded.remote_on, s.remote_on),
        fw_version = coalesce(excluded.fw_version, s.fw_version),
        odometer_km = coalesce(excluded.odometer_km, s.odometer_km),
        observed_at = excluded.observed_at,
        received_at = excluded.received_at
    where s.observed_at < excluded.observed_at;   -- the newest snapshot wins; a late older one is ignored
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'stored', v_rows > 0);
end;
$$;

-- create or replace keeps 0052's privileges; restated so this file is self-contained: internal, nobody may call it directly.
revoke execute on function public.car_store_status(uuid, uuid, jsonb, boolean) from public, anon, authenticated, service_role;
