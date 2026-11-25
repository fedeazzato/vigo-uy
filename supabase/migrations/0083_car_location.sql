-- Car location, "Dónde está tu auto" (specs/car-location.md): opt-in, OFF by default, chosen on the car (Mi Vigo › Ajustes).
-- Mode 'last' keeps only the latest position; mode 'spots' also keeps the parking spots of the last 7 days. Off = no row at all.
-- Readable only by the vehicle's creator and members with the 'control' role (0070 can_control_car), through get_car_location():
-- neither table is granted to any client role.
--
-- Trust model: unchanged from 0045. The car signs the call, the Edge Function `car-device` verifies the signature (action
-- "location"), then calls car_submit_location (service role only), which runs the common guard car_device_accept first.
--
-- Retention without pg_cron (not used in this project): spots older than 7 days are deleted on every car write (all vehicles) and
-- on every read (the caller's vehicle), and the read filters them out anyway. At most 300 spots per vehicle.
--
-- Anon surface added: none. NOT APPLIED (owner OK required). Apply with `npx supabase db push`, deploy the Edge Function, then
-- `npm run gen:types`.

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.car_location (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  mode text not null check (mode in ('last', 'spots')),
  kind text check (kind in ('driving', 'parked')),
  lat numeric(6, 4) check (lat between -90 and 90),
  lon numeric(7, 4) check (lon between -180 and 180),
  acc_m smallint check (acc_m between 0 and 10000),
  observed_at timestamptz,
  received_at timestamptz,
  updated_at timestamptz not null default now(),
  -- the point is all there (acc_m optional) or not there at all (mode chosen, no point yet)
  check ((kind is null and lat is null and lon is null and acc_m is null and observed_at is null and received_at is null)
      or (kind is not null and lat is not null and lon is not null and observed_at is not null and received_at is not null))
);

comment on table public.car_location is
  'Latest car position, opt-in (specs/car-location.md). Written only by car_submit_location; read only through get_car_location.';

create table if not exists public.car_parking_spots (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  lat numeric(6, 4) not null check (lat between -90 and 90),
  lon numeric(7, 4) not null check (lon between -180 and 180),
  acc_m smallint check (acc_m between 0 and 10000),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (vehicle_id, observed_at)
);

create index if not exists car_parking_spots_observed_at_idx on public.car_parking_spots (observed_at);

comment on table public.car_parking_spots is
  'Parking spots of the last 7 days, only in mode spots (specs/car-location.md). Purged on every write and read.';

alter table public.car_location enable row level security;
alter table public.car_parking_spots enable row level security;
revoke all on public.car_location from public, anon, authenticated;
revoke all on public.car_parking_spots from public, anon, authenticated;
-- No policies and no grants: clients read through get_car_location(), the car writes through car_submit_location().

-- 2. The signed call ------------------------------------------------------------------------------------------------------------

-- p_mode = 'off' | 'last' | 'spots'; p_point = null or {"kind","observed_at"(Unix ms),"lat","lon","acc_m"?}.
-- Validated again here (the database is the boundary). Returns {"ok":true,"stored":bool}, {"error":<guard reason>} or
-- {"error":"bad_request"}.
create or replace function public.car_submit_location(p_device_id uuid, p_ts bigint, p_mode text, p_point jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_vehicle uuid;
  v_has_point boolean := p_point is not null and jsonb_typeof(p_point) <> 'null';
  v_kind text;
  v_observed timestamptz;
  v_lat numeric;
  v_lon numeric;
  v_acc integer;
  v_rows integer;
  v_stored boolean := false;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  v_vehicle := g.accepted_vehicle;

  if p_mode is null or p_mode not in ('off', 'last', 'spots') or (p_mode = 'off' and v_has_point) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  if v_has_point then
    if jsonb_typeof(p_point) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_point) k
                  where k not in ('kind', 'observed_at', 'lat', 'lon', 'acc_m'))
       or jsonb_typeof(p_point -> 'observed_at') is distinct from 'number'
       or jsonb_typeof(p_point -> 'lat') is distinct from 'number'
       or jsonb_typeof(p_point -> 'lon') is distinct from 'number'
       or coalesce(jsonb_typeof(p_point -> 'acc_m'), 'null') not in ('null', 'number') then
      return jsonb_build_object('error', 'bad_request');
    end if;
    begin
      v_kind := p_point ->> 'kind';
      v_observed := to_timestamp((p_point ->> 'observed_at')::bigint / 1000.0);
      v_lat := round((p_point ->> 'lat')::numeric, 4);
      v_lon := round((p_point ->> 'lon')::numeric, 4);
      v_acc := case when jsonb_typeof(p_point -> 'acc_m') = 'number' then (p_point ->> 'acc_m')::integer end;
      if jsonb_typeof(p_point -> 'acc_m') = 'number' and (p_point ->> 'acc_m') !~ '^[0-9]{1,5}$' then
        return jsonb_build_object('error', 'bad_request');     -- fractional or negative accuracy
      end if;
    exception when others then
      return jsonb_build_object('error', 'bad_request');
    end;
    if v_kind is null or v_kind not in ('driving', 'parked')
       or v_observed is null
       or v_observed > now() + interval '5 minutes'
       or v_observed < now() - interval '7 days'
       or v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180
       or (v_lat = 0 and v_lon = 0)
       or (v_acc is not null and (v_acc < 0 or v_acc > 10000)) then
      return jsonb_build_object('error', 'bad_request');
    end if;
  end if;

  -- Retention (no pg_cron): every write purges every vehicle's expired spots (indexed).
  delete from public.car_parking_spots where observed_at < now() - interval '7 days';

  if p_mode = 'off' then
    delete from public.car_parking_spots where vehicle_id = v_vehicle;
    delete from public.car_location where vehicle_id = v_vehicle;
    return jsonb_build_object('ok', true, 'stored', false);
  end if;

  if p_mode = 'last' then
    delete from public.car_parking_spots where vehicle_id = v_vehicle;
  end if;

  insert into public.car_location as l (vehicle_id, device_id, mode, updated_at)
  values (v_vehicle, p_device_id, p_mode, now())
  on conflict (vehicle_id) do update
    set mode = excluded.mode, device_id = excluded.device_id, updated_at = excluded.updated_at;

  if v_has_point then
    update public.car_location l
       set kind = v_kind, lat = v_lat, lon = v_lon, acc_m = v_acc, observed_at = v_observed, received_at = now()
     where l.vehicle_id = v_vehicle and (l.observed_at is null or l.observed_at < v_observed);
    get diagnostics v_rows = row_count;
    v_stored := v_rows > 0;

    if p_mode = 'spots' and v_kind = 'parked' then
      insert into public.car_parking_spots (vehicle_id, lat, lon, acc_m, observed_at)
      values (v_vehicle, v_lat, v_lon, v_acc, v_observed)
      on conflict (vehicle_id, observed_at) do nothing;
      get diagnostics v_rows = row_count;
      v_stored := v_stored or v_rows > 0;
      delete from public.car_parking_spots s
       where s.vehicle_id = v_vehicle
         and s.id not in (select s2.id from public.car_parking_spots s2 where s2.vehicle_id = v_vehicle
                          order by s2.observed_at desc limit 300);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'stored', v_stored);
end;
$$;

revoke execute on function public.car_submit_location(uuid, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.car_submit_location(uuid, bigint, text, jsonb) to service_role;

-- 3. The web read ---------------------------------------------------------------------------------------------------------------

-- Creator / control members of the caller's vehicle only. Everybody else gets {"allowed":false} and learns nothing (not even
-- whether a row exists). Purges the vehicle's expired spots and never returns one older than 7 days.
create or replace function public.get_car_location()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  r public.car_location;
  v_last jsonb := null;
  v_spots jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or v_vehicle is null or not public.can_control_car(v_vehicle) then
    return jsonb_build_object('allowed', false);
  end if;

  delete from public.car_parking_spots
   where vehicle_id = v_vehicle and observed_at < now() - interval '7 days';

  select * into r from public.car_location l where l.vehicle_id = v_vehicle;
  if r.vehicle_id is null then
    return jsonb_build_object('allowed', true, 'mode', null, 'last', null, 'spots', '[]'::jsonb);
  end if;

  if r.observed_at is not null then
    v_last := jsonb_build_object('kind', r.kind, 'lat', r.lat, 'lon', r.lon, 'acc_m', r.acc_m,
                                 'observed_at', r.observed_at, 'received_at', r.received_at);
  end if;

  if r.mode = 'spots' then
    select coalesce(jsonb_agg(jsonb_build_object('lat', s.lat, 'lon', s.lon, 'acc_m', s.acc_m, 'observed_at', s.observed_at)
                              order by s.observed_at desc), '[]'::jsonb)
      into v_spots
      from (select * from public.car_parking_spots s0
             where s0.vehicle_id = v_vehicle and s0.observed_at >= now() - interval '7 days'
             order by s0.observed_at desc limit 300) s;
  end if;

  return jsonb_build_object('allowed', true, 'mode', r.mode, 'last', v_last, 'spots', v_spots);
end;
$$;

revoke execute on function public.get_car_location() from public, anon;
grant execute on function public.get_car_location() to authenticated;

-- 4. Unlinked = forgotten ------------------------------------------------------------------------------------------------------

-- Nobody can turn the mode down from a screen that is no longer linked: when the vehicle has no active device left, its location
-- and spots go.
create or replace function public.car_location_forget_unlinked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := coalesce(new.vehicle_id, old.vehicle_id);
begin
  if v_vehicle is not null and not exists (
       select 1 from public.car_devices d where d.vehicle_id = v_vehicle and d.revoked_at is null) then
    delete from public.car_parking_spots where vehicle_id = v_vehicle;
    delete from public.car_location where vehicle_id = v_vehicle;
  end if;
  return null;
end;
$$;

revoke all on function public.car_location_forget_unlinked() from public, anon, authenticated;

drop trigger if exists car_location_forget_unlinked on public.car_devices;
create trigger car_location_forget_unlinked
  after update of revoked_at or delete on public.car_devices
  for each row execute function public.car_location_forget_unlinked();
