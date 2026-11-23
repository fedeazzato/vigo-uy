-- B2 "Enviar al auto" (specs/car-navigate-b2.md): a member sends a destination from WikiVigo (a station, any place or address, a
-- stop of a trip plan) to the vehicle's linked car. It is one more kind of the E3 remote order (0052): kind 'navigate',
-- args exactly {"lat": <number -90..90>, "lon": <number -180..180>, "label": <text 1..80>}. The car (Mi Vigo poll -> Copiloto)
-- opens Waze navigation to lat/lon and shows "Destino de <sender>: <label>"; unlike the other kinds it does NOT require P and
-- speed 0 (it only sets a destination; spec R4). New car result code 'no_app' (Waze missing or refused the link).
--
-- Trust model unchanged: the web writes only through create_car_order (members, rate-limited), the car only through the signed,
-- guarded car_poll_orders / car_order_result. No anon surface.
--
-- NOT APPLIED (owner OK required). Needs 0052 (applied 2026-11-22). Apply with `npx supabase db push`, deploy `car-device`
-- (accepts the code no_app), then `npm run gen:types`.

-- 1. car_orders: the kind, its args and the new result code ----------------------------------------------------------------
-- The inline checks of 0052 got Postgres's default names; dropping them by name fails loudly if a name ever differs.

alter table public.car_orders drop constraint car_orders_kind_check;
-- The args check reads two columns (kind, args), so Postgres named it car_orders_check (checked on PGlite).
alter table public.car_orders drop constraint car_orders_check;
alter table public.car_orders drop constraint car_orders_result_code_check;

-- navigate args are written ONLY by create_car_order (below), which normalises them: lat/lon rounded to 6 decimals, the label
-- cleaned (control characters removed, trimmed, at most 80 characters). The check pins the shape so no other path can differ.
create or replace function public.car_navigate_args_ok(p_args jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_args) <> 'object' or (select count(*) from jsonb_object_keys(p_args)) <> 3
         or not (p_args ? 'lat' and p_args ? 'lon' and p_args ? 'label') then false
    when jsonb_typeof(p_args -> 'lat') <> 'number' or jsonb_typeof(p_args -> 'lon') <> 'number'
         or jsonb_typeof(p_args -> 'label') <> 'string' then false
    else (p_args ->> 'lat')::numeric between -90 and 90
         and (p_args ->> 'lon')::numeric between -180 and 180
         and char_length(p_args ->> 'label') between 1 and 80
  end;
$$;

alter table public.car_orders
  add constraint car_orders_kind_check
    check (kind in ('windows_open_all', 'windows_close_all', 'ventilate', 'charge_limit', 'charge_stop', 'navigate')),
  add constraint car_orders_args_check check (
    case
      when kind = 'charge_limit'
        then case when jsonb_typeof(args) = 'object' and args ? 'pct' and args - 'pct' = '{}'::jsonb
                       and jsonb_typeof(args -> 'pct') = 'number' and (args ->> 'pct') ~ '^[0-9]{1,3}$'
                  then (args ->> 'pct')::integer between 60 and 100
                  else false
             end
      when kind = 'navigate' then public.car_navigate_args_ok(args)
      else args = '{}'::jsonb
    end
  ),
  add constraint car_orders_result_code_check check (result_code in (
    'ok', 'remote_off', 'not_parked', 'not_calibrated', 'car_wash', 'not_charging', 'car_error', 'busy', 'no_executor',
    'expired_on_car', 'no_app', 'not_picked_up', 'superseded'));

-- 2. create_car_order: + navigate ------------------------------------------------------------------------------------------
-- Replaces 0052's definition: identical except the navigate branch.
create or replace function public.create_car_order(p_kind text, p_args jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  max_per_minute constant integer := 6;
  max_per_hour constant integer := 40;
  v_vehicle uuid := public.current_user_vehicle_id();
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_pct integer;
  v_lat numeric;
  v_lon numeric;
  v_label text;
  v_id uuid;
begin
  if auth.uid() is null or v_vehicle is null
     or not exists (select 1 from public.car_devices d where d.vehicle_id = v_vehicle and d.revoked_at is null) then
    return jsonb_build_object('error', 'no_car');
  end if;

  if p_kind is null
     or p_kind not in ('windows_open_all', 'windows_close_all', 'ventilate', 'charge_limit', 'charge_stop', 'navigate')
     or jsonb_typeof(v_args) <> 'object' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  if p_kind = 'charge_limit' then
    -- Exactly {"pct": <integer 60..100>}; unknown keys are refused.
    if not (v_args ? 'pct') or v_args - 'pct' <> '{}'::jsonb
       or jsonb_typeof(v_args -> 'pct') <> 'number' or (v_args ->> 'pct') !~ '^[0-9]{1,3}$' then
      return jsonb_build_object('error', 'bad_request');
    end if;
    v_pct := (v_args ->> 'pct')::integer;
    if v_pct < 60 or v_pct > 100 then
      return jsonb_build_object('error', 'bad_request');
    end if;
    v_args := jsonb_build_object('pct', v_pct);
  elsif p_kind = 'navigate' then
    -- Exactly {"lat","lon","label"}; unknown keys are refused. (0, 0) is refused: it is what a missing coordinate looks like.
    if v_args - 'lat' - 'lon' - 'label' <> '{}'::jsonb or not (v_args ? 'lat' and v_args ? 'lon' and v_args ? 'label')
       or jsonb_typeof(v_args -> 'lat') <> 'number' or jsonb_typeof(v_args -> 'lon') <> 'number'
       or jsonb_typeof(v_args -> 'label') <> 'string' then
      return jsonb_build_object('error', 'bad_request');
    end if;
    v_lat := round((v_args ->> 'lat')::numeric, 6);
    v_lon := round((v_args ->> 'lon')::numeric, 6);
    v_label := public.car_clean_text(v_args ->> 'label', 80);
    if v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180 or (v_lat = 0 and v_lon = 0)
       or v_label is null or v_label = '' then
      return jsonb_build_object('error', 'bad_request');
    end if;
    v_args := jsonb_build_object('lat', v_lat, 'lon', v_lon, 'label', v_label);
  elsif v_args <> '{}'::jsonb then
    return jsonb_build_object('error', 'bad_request');
  end if;

  -- Serialise the vehicle's order writers so the rate limit cannot be raced.
  perform pg_advisory_xact_lock(hashtext('public.car_orders:' || v_vehicle::text));

  if (select count(*) from public.car_orders o
       where o.vehicle_id = v_vehicle and o.created_at > now() - interval '1 minute') >= max_per_minute
     or (select count(*) from public.car_orders o
          where o.vehicle_id = v_vehicle and o.created_at > now() - interval '1 hour') >= max_per_hour then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  perform public.car_orders_expire(v_vehicle);
  -- The car only ever runs the latest intent: older queued orders are superseded (a new destination replaces an old one too).
  update public.car_orders o
     set state = 'expired', result_code = 'superseded', finished_at = now()
   where o.vehicle_id = v_vehicle and o.state = 'queued';

  insert into public.car_orders (vehicle_id, created_by, kind, args)
  values (v_vehicle, auth.uid(), p_kind, v_args)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 3. car_order_result: + no_app --------------------------------------------------------------------------------------------
-- Replaces 0052's definition: identical except the accepted code list.
create or replace function public.car_order_result(
  p_device_id uuid,
  p_ts bigint,
  p_id uuid,
  p_state text,
  p_code text,
  p_text text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  o public.car_orders;
  v_text text;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  if p_state is null or p_state not in ('done', 'failed')
     or p_code is null or p_code not in ('ok', 'remote_off', 'not_parked', 'not_calibrated', 'car_wash', 'not_charging',
                                         'car_error', 'busy', 'no_executor', 'expired_on_car', 'no_app')
     or (p_text is not null and char_length(p_text) > 200) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  select * into o from public.car_orders c where c.id = p_id for update;
  if o.id is null or o.vehicle_id <> g.accepted_vehicle or o.device_id is distinct from p_device_id then
    return jsonb_build_object('error', 'bad_request');
  end if;
  if o.state in ('done', 'failed') and o.state = p_state and o.result_code = p_code then
    return jsonb_build_object('ok', true);
  end if;
  if o.state <> 'taken' then
    return jsonb_build_object('error', 'bad_request');
  end if;

  v_text := nullif(public.car_clean_text(p_text, 200), '');
  update public.car_orders c
     set state = p_state, result_code = p_code, result_text = v_text, finished_at = now()
   where c.id = o.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 4. Privileges (create or replace keeps 0052's; restated) -----------------------------------------------------------------
-- car_navigate_args_ok is used by a table check, which runs with the writer's privileges: only the definer functions write.
revoke execute on function public.car_navigate_args_ok(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.create_car_order(text, jsonb) from public, anon;
grant execute on function public.create_car_order(text, jsonb) to authenticated;
revoke execute on function public.car_order_result(uuid, bigint, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.car_order_result(uuid, bigint, uuid, text, text, text) to service_role;
