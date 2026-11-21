-- Car trip drafts, PLAN A1 (specs/car-trip-drafts.md): the driver shares a trip (or a road trip of several
-- trips with the charging sessions between them) from the car; it lands here as a DRAFT that only the
-- vehicle's members see. Nothing is published: the owner reviews it in "Borradores del auto" and, if wanted,
-- uses it to fill the normal trip-log form.
--
-- Trust model: unchanged from 0045/0048. The car signs the call, the Edge Function `car-device` verifies the
-- signature (action "trip_draft"), then calls car_submit_trip_draft (service role only), which runs the common
-- guard car_device_accept first (replay, freshness, rate limit, revocation, bound vehicle). The route and the
-- charge locations are stored because the driver chose to share that trip (confirmation dialog on the car).
--
-- Anon surface added: none. Apply with `npx supabase db push`, deploy the Edge Function, then `npm run gen:types`.

-- 1. Table ----------------------------------------------------------------------------

create table if not exists public.car_trip_drafts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  client_id uuid not null,                                   -- chosen by the car: an idempotent retry stores nothing new
  started_at timestamptz not null,
  ended_at timestamptz not null,
  trip_count smallint not null check (trip_count between 1 and 20),
  distance_km numeric(7, 1) not null check (distance_km >= 0 and distance_km <= 5000),
  energy_kwh numeric(6, 2) check (energy_kwh >= 0 and energy_kwh <= 1000),
  start_soc smallint check (start_soc between 0 and 100),
  end_soc smallint check (end_soc between 0 and 100),
  avg_speed_kmh numeric(5, 1) check (avg_speed_kmh >= 0 and avg_speed_kmh <= 250),
  route jsonb not null default '[]'::jsonb check (jsonb_typeof(route) = 'array' and jsonb_array_length(route) <= 2000),
  charges jsonb not null default '[]'::jsonb check (jsonb_typeof(charges) = 'array' and jsonb_array_length(charges) <= 30),
  status text not null default 'pending' check (status in ('pending', 'used', 'discarded')),
  used_at timestamptz,
  received_at timestamptz not null default now(),
  unique (vehicle_id, client_id),
  check (ended_at >= started_at)
);

create index if not exists car_trip_drafts_vehicle_status_idx on public.car_trip_drafts (vehicle_id, status, received_at desc);

comment on table public.car_trip_drafts is
  'Trips shared from the linked car as drafts (specs/car-trip-drafts.md). Written only by car_submit_trip_draft; members review them.';

alter table public.car_trip_drafts enable row level security;
revoke all on public.car_trip_drafts from anon, authenticated;
grant select, delete on public.car_trip_drafts to authenticated;
grant update (status, used_at) on public.car_trip_drafts to authenticated;

create policy "members can select their vehicle's trip drafts"
  on public.car_trip_drafts for select
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

create policy "members can mark their vehicle's trip drafts"
  on public.car_trip_drafts for update
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id())
  with check (vehicle_id = public.current_user_vehicle_id() and status in ('pending', 'used', 'discarded'));

create policy "members can delete their vehicle's trip drafts"
  on public.car_trip_drafts for delete
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- No insert policy: inserts only through car_submit_trip_draft.

-- 2. The signed call ------------------------------------------------------------------

-- p_draft = {"client_id","started_at","ended_at"(Unix ms),"trip_count","distance_km","energy_kwh","start_soc",
-- "end_soc","avg_speed_kmh","route":[[lat,lon],...],"charges":[{"started_at","ended_at","start_soc","end_soc",
-- "energy_kwh","end_reason","lat","lon"},...]}. Validated again here even though the Edge Function validates the
-- shape: the database is the boundary. Returns {"ok":true,"stored":bool} (stored=false: the same client_id was
-- already received), {"error":<guard reason>} or {"error":"bad_request"}.
create or replace function public.car_submit_trip_draft(p_device_id uuid, p_ts bigint, p_draft jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_client uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_trips integer;
  v_dist numeric;
  v_energy numeric;
  v_ssoc integer;
  v_esoc integer;
  v_speed numeric;
  v_route jsonb;
  v_charges jsonb;
  v_pair jsonb;
  v_c jsonb;
  v_rows integer;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    return jsonb_build_object('error', 'bad_request');
  end if;

  begin
    v_client := (p_draft ->> 'client_id')::uuid;
    v_start := to_timestamp((p_draft ->> 'started_at')::bigint / 1000.0);
    v_end := to_timestamp((p_draft ->> 'ended_at')::bigint / 1000.0);
    v_trips := (p_draft ->> 'trip_count')::integer;
    v_dist := (p_draft ->> 'distance_km')::numeric;
    v_energy := (p_draft ->> 'energy_kwh')::numeric;
    v_ssoc := (p_draft ->> 'start_soc')::integer;
    v_esoc := (p_draft ->> 'end_soc')::integer;
    v_speed := (p_draft ->> 'avg_speed_kmh')::numeric;
    v_route := coalesce(p_draft -> 'route', '[]'::jsonb);
    v_charges := coalesce(p_draft -> 'charges', '[]'::jsonb);
  exception when others then
    return jsonb_build_object('error', 'bad_request');
  end;

  if v_client is null or v_start is null or v_end is null or v_end < v_start
     or v_end > now() + interval '5 minutes' or v_start < now() - interval '90 days'
     or v_trips is null or v_trips < 1 or v_trips > 20
     or v_dist is null or v_dist < 0 or v_dist > 5000
     or (v_energy is not null and (v_energy < 0 or v_energy > 1000))
     or (v_ssoc is not null and (v_ssoc < 0 or v_ssoc > 100))
     or (v_esoc is not null and (v_esoc < 0 or v_esoc > 100))
     or (v_speed is not null and (v_speed < 0 or v_speed > 250))
     or jsonb_typeof(v_route) <> 'array' or jsonb_array_length(v_route) > 2000
     or jsonb_typeof(v_charges) <> 'array' or jsonb_array_length(v_charges) > 30 then
    return jsonb_build_object('error', 'bad_request');
  end if;

  -- every route element is [lat, lon] with numbers in range
  for v_pair in select value from jsonb_array_elements(v_route) loop
    if jsonb_typeof(v_pair) <> 'array' or jsonb_array_length(v_pair) <> 2
       or jsonb_typeof(v_pair -> 0) <> 'number' or jsonb_typeof(v_pair -> 1) <> 'number'
       or (v_pair ->> 0)::numeric not between -90 and 90 or (v_pair ->> 1)::numeric not between -180 and 180 then
      return jsonb_build_object('error', 'bad_request');
    end if;
  end loop;

  -- every charge is an object with known keys and numbers in range (lat/lon optional together)
  for v_c in select value from jsonb_array_elements(v_charges) loop
    if jsonb_typeof(v_c) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_c) k
                  where k not in ('started_at', 'ended_at', 'start_soc', 'end_soc', 'energy_kwh', 'end_reason', 'lat', 'lon'))
       or jsonb_typeof(v_c -> 'started_at') <> 'number' or jsonb_typeof(v_c -> 'ended_at') <> 'number'
       or (v_c ->> 'ended_at')::numeric < (v_c ->> 'started_at')::numeric
       or (v_c ? 'start_soc' and (v_c ->> 'start_soc')::numeric not between 0 and 100)
       or (v_c ? 'end_soc' and (v_c ->> 'end_soc')::numeric not between 0 and 100)
       or (v_c ? 'energy_kwh' and (v_c ->> 'energy_kwh')::numeric not between 0 and 200)
       or (v_c ? 'end_reason' and (v_c ->> 'end_reason') not in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos'))
       or ((v_c ? 'lat') <> (v_c ? 'lon'))
       or (v_c ? 'lat' and ((v_c ->> 'lat')::numeric not between -90 and 90 or (v_c ->> 'lon')::numeric not between -180 and 180)) then
      return jsonb_build_object('error', 'bad_request');
    end if;
  end loop;

  insert into public.car_trip_drafts
    (vehicle_id, device_id, client_id, started_at, ended_at, trip_count, distance_km, energy_kwh,
     start_soc, end_soc, avg_speed_kmh, route, charges)
  values
    (g.accepted_vehicle, p_device_id, v_client, v_start, v_end, v_trips, round(v_dist, 1),
     case when v_energy is null then null else round(v_energy, 2) end,
     v_ssoc, v_esoc, case when v_speed is null then null else round(v_speed, 1) end, v_route, v_charges)
  on conflict (vehicle_id, client_id) do nothing;
  get diagnostics v_rows = row_count;

  -- D7: at most 50 pending drafts per vehicle; the oldest pending ones go
  if v_rows > 0 then
    delete from public.car_trip_drafts d
     where d.vehicle_id = g.accepted_vehicle and d.status = 'pending'
       and d.id in (select id from public.car_trip_drafts
                     where vehicle_id = g.accepted_vehicle and status = 'pending'
                     order by received_at desc offset 50);
  end if;

  return jsonb_build_object('ok', true, 'stored', v_rows > 0);
exception when others then
  return jsonb_build_object('error', 'bad_request');
end;
$$;

-- 3. Privileges -----------------------------------------------------------------------

revoke execute on function public.car_submit_trip_draft(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.car_submit_trip_draft(uuid, bigint, jsonb) to service_role;
