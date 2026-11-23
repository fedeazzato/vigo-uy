-- Charging check-ins from real charges, PLAN A2 (specs/car-charge-checkins.md). NOT APPLIED YET.
--
-- Carga (on the car) notices a finished charge, or a failed attempt (cable in, no current), and hands Mi Vigo a draft of
-- kind "charge" through the existing trip-draft outbox (car-device action "trip_draft", draft.kind = "charge"). The draft
-- carries the car's position at the charger; car_submit_charge_draft matches it to a visible WikiVigo station within
-- 100 m and stores ONLY the station (the position is never stored). No station nearby = nothing stored.
--
-- Privacy: the draft is members-only. Nothing becomes public until a member confirms it on "Borradores del auto"
-- (confirm_car_charge_draft), which writes a normal station_reports row in that member's name (feeds B4 station alerts).
--
-- Anon surface added: none (station_reports gains three nullable columns, readable like the rest of the row).
-- Apply with `npx supabase db push` (after 0059), deploy car-device, then `npm run gen:types`.

-- 1. station_reports: what the car measured ----------------------------------

alter table public.station_reports
  add column if not exists energy_kwh numeric check (energy_kwh between 0 and 200),
  add column if not exists duration_min integer check (duration_min between 0 and 1440),
  add column if not exists from_car boolean not null default false;

comment on column public.station_reports.from_car is
  'True when the numbers come from the car (confirmed charge draft, specs/car-charge-checkins.md). Only confirm_car_charge_draft sets it.';

-- from_car is set only by confirm_car_charge_draft (transaction-local GUC), never by a client insert.
create or replace function public.protect_station_report_from_car()
returns trigger
language plpgsql
as $$
begin
  if new.from_car and coalesce(current_setting('vigo.car_checkin', true), '') <> 'on' then
    new.from_car := false;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_station_report_from_car on public.station_reports;
create trigger protect_station_report_from_car
  before insert on public.station_reports
  for each row execute function public.protect_station_report_from_car();

-- 2. Drafts -----------------------------------------------------------------

create table if not exists public.car_charge_drafts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  client_id uuid not null,
  station_id uuid not null references public.charging_stations (id) on delete cascade,
  distance_m integer not null check (distance_m between 0 and 100),
  result text not null check (result in ('funciono', 'fallo')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  energy_kwh numeric(6, 2) check (energy_kwh between 0 and 200),
  max_kw numeric(5, 1) check (max_kw between 0 and 400),
  avg_kw numeric(5, 1) check (avg_kw between 0 and 400),
  charging_min integer check (charging_min between 0 and 1440),
  start_soc smallint check (start_soc between 0 and 100),
  end_soc smallint check (end_soc between 0 and 100),
  end_reason text check (end_reason in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'discarded')),
  report_id uuid references public.station_reports (id) on delete set null,
  received_at timestamptz not null default now(),
  unique (vehicle_id, client_id),
  check (ended_at >= started_at)
);

create index if not exists car_charge_drafts_vehicle_status_idx on public.car_charge_drafts (vehicle_id, status, received_at desc);

comment on table public.car_charge_drafts is
  'Charging check-in drafts from the car (specs/car-charge-checkins.md). Members only; public only after confirm_car_charge_draft.';

alter table public.car_charge_drafts enable row level security;
revoke all on public.car_charge_drafts from anon, authenticated;
grant select, delete on public.car_charge_drafts to authenticated;
grant update (status) on public.car_charge_drafts to authenticated;

create policy "members select their vehicle's charge drafts"
  on public.car_charge_drafts for select to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- A client may only discard (confirming goes through confirm_car_charge_draft, which also writes the report).
create policy "members discard their vehicle's charge drafts"
  on public.car_charge_drafts for update to authenticated
  using (vehicle_id = public.current_user_vehicle_id() and status = 'pending')
  with check (vehicle_id = public.current_user_vehicle_id() and status = 'discarded');

create policy "members delete their vehicle's charge drafts"
  on public.car_charge_drafts for delete to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- 3. The signed call (car-device "trip_draft" with draft.kind = "charge") ----

-- p_draft = {"kind":"charge","client_id","started_at","ended_at"(ms),"status":"funciono"|"fallo","lat","lon",
-- "energy_kwh"?,"max_kw"?,"avg_kw"?,"charging_min"?,"start_soc"?,"end_soc"?,"end_reason"?}.
-- Returns {"ok":true,"stored":bool} (false: same client_id already stored, or no station within 100 m),
-- {"error":<guard reason>} or {"error":"bad_request"}.
create or replace function public.car_submit_charge_draft(p_device_id uuid, p_ts bigint, p_draft jsonb)
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
  v_result text;
  v_lat double precision;
  v_lon double precision;
  v_energy numeric;
  v_max numeric;
  v_avg numeric;
  v_min integer;
  v_ssoc integer;
  v_esoc integer;
  v_reason text;
  v_station uuid;
  v_name text;
  v_dist double precision;
  v_rows integer;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or p_draft ->> 'kind' <> 'charge'
     or exists (select 1 from jsonb_object_keys(p_draft) k
                where k not in ('kind', 'client_id', 'started_at', 'ended_at', 'status', 'lat', 'lon', 'energy_kwh',
                                'max_kw', 'avg_kw', 'charging_min', 'start_soc', 'end_soc', 'end_reason')) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  begin
    v_client := (p_draft ->> 'client_id')::uuid;
    v_start := to_timestamp((p_draft ->> 'started_at')::bigint / 1000.0);
    v_end := to_timestamp((p_draft ->> 'ended_at')::bigint / 1000.0);
    v_result := p_draft ->> 'status';
    v_lat := (p_draft ->> 'lat')::double precision;
    v_lon := (p_draft ->> 'lon')::double precision;
    v_energy := (p_draft ->> 'energy_kwh')::numeric;
    v_max := (p_draft ->> 'max_kw')::numeric;
    v_avg := (p_draft ->> 'avg_kw')::numeric;
    v_min := (p_draft ->> 'charging_min')::integer;
    v_ssoc := (p_draft ->> 'start_soc')::integer;
    v_esoc := (p_draft ->> 'end_soc')::integer;
    v_reason := p_draft ->> 'end_reason';
  exception when others then
    return jsonb_build_object('error', 'bad_request');
  end;

  if v_client is null or v_start is null or v_end is null or v_end < v_start
     or v_end > now() + interval '5 minutes' or v_start < now() - interval '90 days'
     or v_result is null or v_result not in ('funciono', 'fallo')
     or v_lat is null or v_lat not between -90 and 90 or v_lon is null or v_lon not between -180 and 180
     or (v_energy is not null and v_energy not between 0 and 200)
     or (v_max is not null and v_max not between 0 and 400)
     or (v_avg is not null and v_avg not between 0 and 400)
     or (v_min is not null and v_min not between 0 and 1440)
     or (v_ssoc is not null and v_ssoc not between 0 and 100)
     or (v_esoc is not null and v_esoc not between 0 and 100)
     or (v_reason is not null and v_reason not in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos')) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  -- nearest visible station within 100 m (haversine; a 0.002° box first)
  select s.id, s.name, d.m into v_station, v_name, v_dist
    from public.charging_stations s,
         lateral (select 6371000 * 2 * asin(sqrt(
                    power(sin(radians(s.lat::double precision - v_lat) / 2), 2)
                    + cos(radians(v_lat)) * cos(radians(s.lat::double precision))
                      * power(sin(radians(s.lng::double precision - v_lon) / 2), 2))) as m) d
   where not s.hidden and not public.is_user_banned(s.user_id)
     and s.lat between v_lat - 0.002 and v_lat + 0.002
     and s.lng between v_lon - 0.003 and v_lon + 0.003
     and d.m <= 100
   order by d.m
   limit 1;
  if v_station is null then
    return jsonb_build_object('ok', true, 'stored', false);      -- not at a known station: the position is dropped
  end if;

  insert into public.car_charge_drafts
    (vehicle_id, device_id, client_id, station_id, distance_m, result, started_at, ended_at, energy_kwh, max_kw, avg_kw,
     charging_min, start_soc, end_soc, end_reason)
  values
    (g.accepted_vehicle, p_device_id, v_client, v_station, round(v_dist)::integer, v_result, v_start, v_end,
     round(v_energy, 2), round(v_max, 1), round(v_avg, 1), v_min, v_ssoc, v_esoc, v_reason)
  on conflict (vehicle_id, client_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    -- at most 50 pending per vehicle, oldest go
    delete from public.car_charge_drafts
     where id in (select id from public.car_charge_drafts
                   where vehicle_id = g.accepted_vehicle and status = 'pending'
                   order by received_at desc offset 50);
    begin
      insert into public.notifications (user_id, kind, station_id, title)
      select m.user_id, 'car_charge_draft', v_station,
             left(case when v_result = 'fallo' then '¿Falló la carga en ' else '¿Cargaste en ' end || v_name
                  || '? Confirmá el check-in', 200)
        from public.vehicle_members m
       where m.vehicle_id = g.accepted_vehicle;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'stored', v_rows > 0);
exception when others then
  return jsonb_build_object('error', 'bad_request');
end;
$$;

revoke execute on function public.car_submit_charge_draft(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.car_submit_charge_draft(uuid, bigint, jsonb) to service_role;

-- 4. Confirm (the only way a car draft becomes public) -----------------------

-- The member confirms (optionally correcting the result to 'ocupado' or adding a note): one station_reports row in the
-- caller's name, with achieved_kw = the peak the car measured, energy and charging minutes; the draft is marked confirmed.
create or replace function public.confirm_car_charge_draft(p_id uuid, p_status text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.car_charge_drafts;
  v_report uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if public.is_user_banned(auth.uid()) then
    raise exception 'banned';
  end if;
  select * into d from public.car_charge_drafts
   where id = p_id and vehicle_id = public.current_user_vehicle_id() and status = 'pending'
   for update;
  if d.id is null then
    raise exception 'borrador no encontrado';
  end if;
  v_status := coalesce(p_status, d.result);
  if v_status not in ('funciono', 'fallo', 'ocupado') then
    raise exception 'estado inválido';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'nota demasiado larga';
  end if;

  perform set_config('vigo.car_checkin', 'on', true);
  insert into public.station_reports (station_id, user_id, status, achieved_kw, energy_kwh, duration_min, note, from_car, created_at)
  values (d.station_id, auth.uid(), v_status,
          case when v_status = 'funciono' then d.max_kw end,
          case when v_status = 'funciono' then d.energy_kwh end,
          d.charging_min, nullif(trim(p_note), ''), true, d.ended_at)
  returning id into v_report;
  perform set_config('vigo.car_checkin', 'off', true);

  update public.car_charge_drafts set status = 'confirmed', report_id = v_report where id = d.id;
  return v_report;
end;
$$;

revoke execute on function public.confirm_car_charge_draft(uuid, text, text) from public, anon;
grant execute on function public.confirm_car_charge_draft(uuid, text, text) to authenticated;
