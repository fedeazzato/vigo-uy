-- Car data features (specs/car-data-a3-a9.md, vigo-hack wikivigo/PLAN.md 2A: A3, A5, A6, A7, A9).
--
-- NOT APPLIED. Built offline 2026-11-23 (branch wave3-data). Apply with `npx supabase db push` after 0060, deploy car-device,
-- then `npm run gen:types` (database.types.ts was extended by hand to match this file).
--
--   A3 verified kilometres  : car_odometer_log, filled by a trigger from the signed car_status snapshots (odometer_km, 0054).
--                             verified_km_leaderboard() lists ONLY vehicles whose members switched on verified_km_public.
--   A5 battery health       : car_battery_samples, one row per charge (kWh added vs SOC delta); private chart for the members;
--                             battery_health_community() = anonymous aggregate of opted-in vehicles (battery_community).
--   A6 consumption atlas    : car_drive_samples (one row per trip, NO location); consumption_atlas() = anonymous aggregates of
--                             opted-in vehicles (consumption_atlas) by season / outside temperature / speed band.
--   A7 eco-driving board    : same car_drive_samples (regen_kwh, brake_events, regen_pct from Carga's Frenadas); private
--                             monthly summary for the members; eco_league() lists ONLY opted-in vehicles (eco_league).
--   A9 fault / warning log  : car_fault_events, private to the members. fault_code_counts() = "otros dueños vieron esto":
--                             number of opted-in vehicles (fault_matching) that saw each code, never which ones.
--
-- Privacy (PLAN 1.4): every row is members-only (RLS). Every public / aggregate function reads only vehicles whose members
-- switched the matching flag on in vehicle_data_sharing (all off by default), aggregates need >= 5 distinct vehicles per bucket
-- (3 for fault codes), and nothing carries a location, a VIN or a plate. Members can delete any of their rows at any time.
--
-- Anon surface added: verified_km_leaderboard(), consumption_atlas(), battery_health_community(), eco_league(date) -
-- opted-in / aggregate data only. fault_code_counts() is authenticated only.

-- 0. Opt-ins ----------------------------------------------------------------

create table if not exists public.vehicle_data_sharing (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  verified_km_public boolean not null default false,
  battery_community boolean not null default false,
  consumption_atlas boolean not null default false,
  eco_league boolean not null default false,
  fault_matching boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.vehicle_data_sharing is
  'Per-vehicle opt-ins for sharing car data (specs/car-data-a3-a9.md). No row = everything off. Written only by set_vehicle_data_sharing.';

alter table public.vehicle_data_sharing enable row level security;
revoke all on public.vehicle_data_sharing from anon, authenticated;
grant select on public.vehicle_data_sharing to authenticated;

create policy "members read their vehicle's sharing choices"
  on public.vehicle_data_sharing for select to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

create or replace function public.set_vehicle_data_sharing(p_key text, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
begin
  if auth.uid() is null or v_vehicle is null or public.is_user_banned(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if p_key not in ('verified_km_public', 'battery_community', 'consumption_atlas', 'eco_league', 'fault_matching')
     or p_on is null then
    raise exception 'bad request';
  end if;
  insert into public.vehicle_data_sharing (vehicle_id) values (v_vehicle) on conflict (vehicle_id) do nothing;
  execute format('update public.vehicle_data_sharing set %I = $1, updated_by = $2, updated_at = now() where vehicle_id = $3', p_key)
    using p_on, auth.uid(), v_vehicle;
end;
$$;

revoke execute on function public.set_vehicle_data_sharing(text, boolean) from public, anon;
grant execute on function public.set_vehicle_data_sharing(text, boolean) to authenticated;

-- Internal: is this sharing flag on for the vehicle?
create or replace function public.vehicle_shares(p_vehicle uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select case p_key
                            when 'verified_km_public' then s.verified_km_public
                            when 'battery_community' then s.battery_community
                            when 'consumption_atlas' then s.consumption_atlas
                            when 'eco_league' then s.eco_league
                            when 'fault_matching' then s.fault_matching
                          end
                     from public.vehicle_data_sharing s where s.vehicle_id = p_vehicle), false)
$$;

revoke execute on function public.vehicle_shares(uuid, text) from public, anon, authenticated;

-- Internal: display names of a vehicle's non-banned members (the leaderboard's label; vehicles have no public name).
create or replace function public.vehicle_member_names(p_vehicle uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.display_name order by p.display_name), '{}')
    from public.vehicle_members m join public.profiles p on p.id = m.user_id
   where m.vehicle_id = p_vehicle and p.banned_at is null
$$;

revoke execute on function public.vehicle_member_names(uuid) from public, anon, authenticated;

-- 1. A3 verified kilometres --------------------------------------------------

create table if not exists public.car_odometer_log (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  day date not null,
  odometer_km integer not null check (odometer_km between 0 and 999999),
  -- true when this day's reading is LOWER than an earlier day's: a replaced cluster, a different car, or tampering.
  -- Any anomaly keeps the vehicle off the verified leaderboard until the members clear the log.
  anomaly boolean not null default false,
  primary key (vehicle_id, day)
);

comment on table public.car_odometer_log is
  'Daily odometer from the signed car_status snapshots (A3, specs/car-data-a3-a9.md). Written only by a trigger. Members only.';

alter table public.car_odometer_log enable row level security;
revoke all on public.car_odometer_log from anon, authenticated;
grant select, delete on public.car_odometer_log to authenticated;

create policy "members read their vehicle's odometer log"
  on public.car_odometer_log for select to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

create policy "members clear their vehicle's odometer log"
  on public.car_odometer_log for delete to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

create or replace function public.car_status_log_odometer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
  v_prev integer;
begin
  if new.odometer_km is null then
    return new;
  end if;
  v_day := (new.observed_at at time zone 'America/Montevideo')::date;
  select max(l.odometer_km) into v_prev from public.car_odometer_log l where l.vehicle_id = new.vehicle_id and l.day < v_day;
  insert into public.car_odometer_log as l (vehicle_id, day, odometer_km, anomaly)
  values (new.vehicle_id, v_day, new.odometer_km, v_prev is not null and new.odometer_km < v_prev)
  on conflict (vehicle_id, day) do update
    set odometer_km = greatest(l.odometer_km, excluded.odometer_km),
        anomaly = l.anomaly or excluded.anomaly or excluded.odometer_km < l.odometer_km;
  return new;
end;
$$;

revoke execute on function public.car_status_log_odometer() from public, anon, authenticated;

drop trigger if exists car_status_log_odometer on public.car_status;
create trigger car_status_log_odometer
  after insert or update of odometer_km, observed_at on public.car_status
  for each row execute function public.car_status_log_odometer();

-- Public: opted-in vehicles only, no anomaly, at least 2 readings. km_verified = km the car reported since the first reading.
create or replace function public.verified_km_leaderboard()
returns table (vehicle_id uuid, odometer_km integer, km_verified integer, verified_since date, member_names text[])
language sql
stable
security definer
set search_path = public
as $$
  select l.vehicle_id,
         max(l.odometer_km) as odometer_km,
         (max(l.odometer_km) - min(l.odometer_km)) as km_verified,
         min(l.day) as verified_since,
         public.vehicle_member_names(l.vehicle_id) as member_names
    from public.car_odometer_log l
   where public.vehicle_shares(l.vehicle_id, 'verified_km_public')
   group by l.vehicle_id
  having count(*) >= 2 and not bool_or(l.anomaly) and cardinality(public.vehicle_member_names(l.vehicle_id)) > 0
   order by 2 desc
$$;

revoke execute on function public.verified_km_leaderboard() from public;
grant execute on function public.verified_km_leaderboard() to anon, authenticated;

-- 2. Samples from the car (A5, A6/A7, A9) -------------------------------------

create table if not exists public.car_battery_samples (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  client_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  energy_kwh numeric(6, 2) not null check (energy_kwh between 0.5 and 200),
  start_soc smallint not null check (start_soc between 0 and 100),
  end_soc smallint not null check (end_soc between 0 and 100),
  temp_c smallint check (temp_c between -40 and 70),
  odometer_km integer check (odometer_km between 0 and 999999),
  -- usable capacity estimate: kWh added per 100 % of SOC; only for charges of at least 20 points (smaller ones are too noisy).
  capacity_kwh numeric(6, 1) generated always as (
    case when end_soc - start_soc >= 20 then round(energy_kwh * 100.0 / (end_soc - start_soc), 1) end
  ) stored,
  received_at timestamptz not null default now(),
  unique (vehicle_id, client_id),
  check (ended_at >= started_at),
  check (end_soc > start_soc)
);

create index if not exists car_battery_samples_vehicle_idx on public.car_battery_samples (vehicle_id, ended_at desc);

create table if not exists public.car_drive_samples (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  client_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_km numeric(7, 1) not null check (distance_km between 0.5 and 2000),
  energy_kwh numeric(6, 2) check (energy_kwh between 0 and 200),
  avg_speed_kmh numeric(5, 1) check (avg_speed_kmh between 0 and 200),
  temp_c smallint check (temp_c between -40 and 70),
  regen_kwh numeric(6, 2) check (regen_kwh between 0 and 200),
  brake_events integer check (brake_events between 0 and 10000),
  regen_pct numeric(4, 1) check (regen_pct between 0 and 100),
  received_at timestamptz not null default now(),
  unique (vehicle_id, client_id),
  check (ended_at >= started_at),
  check (energy_kwh is not null or regen_kwh is not null)
);

create index if not exists car_drive_samples_vehicle_idx on public.car_drive_samples (vehicle_id, ended_at desc);

create table if not exists public.car_fault_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  client_id uuid not null,
  observed_at timestamptz not null,
  source text not null check (source in ('cluster', 'tpms', 'charge', 'traction')),
  code text not null check (code ~ '^[a-z0-9_]{1,40}$'),
  value integer not null,
  odometer_km integer check (odometer_km between 0 and 999999),
  received_at timestamptz not null default now(),
  unique (vehicle_id, client_id)
);

create index if not exists car_fault_events_vehicle_idx on public.car_fault_events (vehicle_id, observed_at desc);

comment on table public.car_battery_samples is 'A5: one row per charge from Carga (specs/car-data-a3-a9.md). Members only.';
comment on table public.car_drive_samples is 'A6/A7: one row per trip from Carga, no location (specs/car-data-a3-a9.md). Members only.';
comment on table public.car_fault_events is 'A9: cluster / TPMS / charge warnings seen by Carga (specs/car-data-a3-a9.md). Members only.';

do $$
declare
  t text;
begin
  foreach t in array array['car_battery_samples', 'car_drive_samples', 'car_fault_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "members read their vehicle''s rows" on public.%I', t);
    execute format('create policy "members read their vehicle''s rows" on public.%I for select to authenticated '
                   'using (vehicle_id = public.current_user_vehicle_id())', t);
    execute format('drop policy if exists "members delete their vehicle''s rows" on public.%I', t);
    execute format('create policy "members delete their vehicle''s rows" on public.%I for delete to authenticated '
                   'using (vehicle_id = public.current_user_vehicle_id())', t);
  end loop;
end;
$$;

-- 3. The signed call: car-device "trip_draft" with draft.kind in (battery, drive, fault) -> car_submit_data ---------------
--
-- battery = {"kind","client_id","started_at","ended_at"(ms),"energy_kwh" 0.5..200,"start_soc","end_soc" (end > start),
--            "temp_c"? -40..70,"odometer_km"?}
-- drive   = {"kind","client_id","started_at","ended_at","distance_km" 0.5..2000,"energy_kwh"?,"avg_speed_kmh"? 0..200,"temp_c"?,
--            "regen_kwh"?,"brake_events"? 0..10000,"regen_pct"? 0..100}  (energy_kwh or regen_kwh required)
-- fault   = {"kind","client_id","observed_at"(ms),"source" cluster|tpms|charge|traction,"code" [a-z0-9_]{1,40},"value" int,
--            "odometer_km"?}
-- Unknown keys refused. At most 200 rows per vehicle and kind per day (on top of the guard's own limit); older than 90 days
-- refused. Returns {"ok":true,"stored":bool} (false = same client_id already stored), {"error":<guard>} or {"error":"bad_request"}.

create or replace function public.car_submit_data(p_device_id uuid, p_ts bigint, p_draft jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_kind text;
  v_keys text[];
  v_client uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_num jsonb;
  v_rows integer := 0;
  v_today integer;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  v_kind := p_draft ->> 'kind';
  v_keys := case v_kind
    when 'battery' then array['kind', 'client_id', 'started_at', 'ended_at', 'energy_kwh', 'start_soc', 'end_soc', 'temp_c', 'odometer_km']
    when 'drive' then array['kind', 'client_id', 'started_at', 'ended_at', 'distance_km', 'energy_kwh', 'avg_speed_kmh', 'temp_c',
                            'regen_kwh', 'brake_events', 'regen_pct']
    when 'fault' then array['kind', 'client_id', 'observed_at', 'source', 'code', 'value', 'odometer_km']
  end;
  if v_keys is null or exists (select 1 from jsonb_object_keys(p_draft) k where k <> all (v_keys)) then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- integer keys must be integral JSON numbers (12.5 would round in the cast)
  if exists (select 1 from jsonb_each(p_draft) e
              where e.key in ('start_soc', 'end_soc', 'temp_c', 'odometer_km', 'brake_events', 'value', 'started_at', 'ended_at',
                              'observed_at')
                and (jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^-?[0-9]{1,13}$'))
     or exists (select 1 from jsonb_each(p_draft) e
                 where e.key in ('energy_kwh', 'distance_km', 'avg_speed_kmh', 'regen_kwh', 'regen_pct')
                   and jsonb_typeof(e.value) <> 'number') then
    return jsonb_build_object('error', 'bad_request');
  end if;

  begin
    v_client := (p_draft ->> 'client_id')::uuid;
    v_start := to_timestamp(coalesce(p_draft ->> 'started_at', p_draft ->> 'observed_at')::bigint / 1000.0);
    v_end := to_timestamp(coalesce(p_draft ->> 'ended_at', p_draft ->> 'observed_at')::bigint / 1000.0);
  exception when others then
    return jsonb_build_object('error', 'bad_request');
  end;
  if v_client is null or v_start is null or v_end is null or v_end < v_start
     or v_end > now() + interval '5 minutes' or v_start < now() - interval '90 days' then
    return jsonb_build_object('error', 'bad_request');
  end if;

  execute format('select count(*) from public.%I where vehicle_id = $1 and received_at > now() - interval ''1 day''',
                 case v_kind when 'battery' then 'car_battery_samples' when 'drive' then 'car_drive_samples' else 'car_fault_events' end)
    into v_today using g.accepted_vehicle;
  if v_today >= 200 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  begin
    if v_kind = 'battery' then
      insert into public.car_battery_samples
        (vehicle_id, device_id, client_id, started_at, ended_at, energy_kwh, start_soc, end_soc, temp_c, odometer_km)
      values
        (g.accepted_vehicle, p_device_id, v_client, v_start, v_end, (p_draft ->> 'energy_kwh')::numeric,
         (p_draft ->> 'start_soc')::smallint, (p_draft ->> 'end_soc')::smallint, (p_draft ->> 'temp_c')::smallint,
         (p_draft ->> 'odometer_km')::integer)
      on conflict (vehicle_id, client_id) do nothing;
    elsif v_kind = 'drive' then
      insert into public.car_drive_samples
        (vehicle_id, device_id, client_id, started_at, ended_at, distance_km, energy_kwh, avg_speed_kmh, temp_c, regen_kwh,
         brake_events, regen_pct)
      values
        (g.accepted_vehicle, p_device_id, v_client, v_start, v_end, (p_draft ->> 'distance_km')::numeric,
         (p_draft ->> 'energy_kwh')::numeric, (p_draft ->> 'avg_speed_kmh')::numeric, (p_draft ->> 'temp_c')::smallint,
         (p_draft ->> 'regen_kwh')::numeric, (p_draft ->> 'brake_events')::integer, (p_draft ->> 'regen_pct')::numeric)
      on conflict (vehicle_id, client_id) do nothing;
    else
      insert into public.car_fault_events (vehicle_id, device_id, client_id, observed_at, source, code, value, odometer_km)
      values
        (g.accepted_vehicle, p_device_id, v_client, v_start, p_draft ->> 'source', p_draft ->> 'code', (p_draft ->> 'value')::integer,
         (p_draft ->> 'odometer_km')::integer)
      on conflict (vehicle_id, client_id) do nothing;
    end if;
    get diagnostics v_rows = row_count;
  exception when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then
    return jsonb_build_object('error', 'bad_request');
  end;

  return jsonb_build_object('ok', true, 'stored', v_rows > 0);
end;
$$;

revoke execute on function public.car_submit_data(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.car_submit_data(uuid, bigint, jsonb) to service_role;

-- 4. Anonymous aggregates (opted-in vehicles only; >= 5 distinct vehicles per bucket) -------------------------------

-- A6: kWh/100 km by season (southern hemisphere), outside temperature band and average speed band.
create or replace function public.consumption_atlas()
returns table (dimension text, bucket text, vehicles integer, trips integer, km numeric, kwh_per_100km numeric)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select s.vehicle_id, s.distance_km, s.energy_kwh,
           case extract(month from s.started_at at time zone 'America/Montevideo')::int
             when 12 then 'verano' when 1 then 'verano' when 2 then 'verano'
             when 3 then 'otono' when 4 then 'otono' when 5 then 'otono'
             when 6 then 'invierno' when 7 then 'invierno' when 8 then 'invierno'
             else 'primavera' end as season,
           case when s.temp_c is null then null when s.temp_c < 5 then 'lt5' when s.temp_c < 15 then '5_15'
                when s.temp_c < 25 then '15_25' else 'ge25' end as temp_band,
           case when s.avg_speed_kmh is null then null when s.avg_speed_kmh < 30 then 'lt30' when s.avg_speed_kmh < 60 then '30_60'
                when s.avg_speed_kmh < 90 then '60_90' else 'ge90' end as speed_band
      from public.car_drive_samples s
     where s.energy_kwh is not null and s.distance_km >= 2
       and s.energy_kwh * 100 / s.distance_km between 3 and 60          -- drop implausible trips
       and public.vehicle_shares(s.vehicle_id, 'consumption_atlas')
  ), b as (
    select 'season' as dimension, season as bucket, vehicle_id, distance_km, energy_kwh from d
    union all select 'temp', temp_band, vehicle_id, distance_km, energy_kwh from d where temp_band is not null
    union all select 'speed', speed_band, vehicle_id, distance_km, energy_kwh from d where speed_band is not null
  )
  select dimension, bucket, count(distinct vehicle_id)::int, count(*)::int, round(sum(distance_km), 0),
         round(sum(energy_kwh) * 100 / sum(distance_km), 1)
    from b
   group by dimension, bucket
  having count(distinct vehicle_id) >= 5
   order by dimension, bucket
$$;

-- A5: median usable-capacity estimate by model and odometer band (20 000 km), one value per vehicle per band first.
create or replace function public.battery_health_community()
returns table (model text, km_band integer, vehicles integer, median_capacity_kwh numeric)
language sql
stable
security definer
set search_path = public
as $$
  with per_vehicle as (
    select coalesce(v.model, 'sin_modelo') as model, (s.odometer_km / 20000) * 20000 as km_band, s.vehicle_id,
           percentile_cont(0.5) within group (order by s.capacity_kwh) as cap
      from public.car_battery_samples s join public.vehicles v on v.id = s.vehicle_id
     where s.capacity_kwh is not null and s.odometer_km is not null
       and public.vehicle_shares(s.vehicle_id, 'battery_community')
     group by 1, 2, 3
  )
  select model, km_band, count(*)::int, round(percentile_cont(0.5) within group (order by cap)::numeric, 1)
    from per_vehicle
   group by model, km_band
  having count(*) >= 5
   order by model, km_band
$$;

-- A7: monthly eco league, opted-in vehicles only (labelled by member names like the km leaderboard), >= 3 trips with braking data.
create or replace function public.eco_league(p_month date default null)
returns table (vehicle_id uuid, member_names text[], trips integer, km numeric, regen_pct numeric, regen_kwh numeric)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select date_trunc('month', coalesce(p_month, (now() at time zone 'America/Montevideo')::date))::date as first_day
  )
  select s.vehicle_id, public.vehicle_member_names(s.vehicle_id), count(*)::int, round(sum(s.distance_km), 0),
         round(sum(s.regen_pct * s.distance_km) / sum(s.distance_km), 1), round(sum(coalesce(s.regen_kwh, 0)), 1)
    from public.car_drive_samples s, m
   where s.regen_pct is not null
     and (s.started_at at time zone 'America/Montevideo')::date >= m.first_day
     and (s.started_at at time zone 'America/Montevideo')::date < (m.first_day + interval '1 month')::date
     and public.vehicle_shares(s.vehicle_id, 'eco_league')
   group by s.vehicle_id
  having count(*) >= 3 and cardinality(public.vehicle_member_names(s.vehicle_id)) > 0
   order by 5 desc
$$;

-- A9: how many OTHER opted-in vehicles saw each code (never which ones); >= 3 vehicles.
create or replace function public.fault_code_counts()
returns table (source text, code text, vehicles integer)
language sql
stable
security definer
set search_path = public
as $$
  select f.source, f.code, count(distinct f.vehicle_id)::int
    from public.car_fault_events f
   where public.vehicle_shares(f.vehicle_id, 'fault_matching')
   group by f.source, f.code
  having count(distinct f.vehicle_id) >= 3
$$;

revoke execute on function public.consumption_atlas() from public;
revoke execute on function public.battery_health_community() from public;
revoke execute on function public.eco_league(date) from public;
revoke execute on function public.fault_code_counts() from public, anon;
grant execute on function public.consumption_atlas() to anon, authenticated;
grant execute on function public.battery_health_community() to anon, authenticated;
grant execute on function public.eco_league(date) to anon, authenticated;
grant execute on function public.fault_code_counts() to authenticated;

-- 5. "Eliminar mis datos": a member deletes every row of one kind of their vehicle (the RLS delete policies allow the same
-- row by row; this is the one-call version for the buttons).
create or replace function public.delete_my_car_data(p_kind text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  v_rows integer;
begin
  if auth.uid() is null or v_vehicle is null then
    raise exception 'not allowed';
  end if;
  if p_kind = 'battery' then
    delete from public.car_battery_samples where vehicle_id = v_vehicle;
  elsif p_kind = 'drive' then
    delete from public.car_drive_samples where vehicle_id = v_vehicle;
  elsif p_kind = 'fault' then
    delete from public.car_fault_events where vehicle_id = v_vehicle;
  elsif p_kind = 'odometer' then
    delete from public.car_odometer_log where vehicle_id = v_vehicle;
  else
    raise exception 'bad request';
  end if;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.delete_my_car_data(text) from public, anon;
grant execute on function public.delete_my_car_data(text) to authenticated;
