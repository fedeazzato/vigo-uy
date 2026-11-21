-- Car status E1, "last known status" (specs/car-status-e1.md): the linked car
-- reports its battery (SOC), range and charging state when a trip or a
-- charging session ends and it is online at that moment. One row per vehicle,
-- the newest snapshot wins; members read it in Mi Vigo.
--
-- Trust model: unchanged from 0045. The car signs the call, the Edge Function
-- `car-device` verifies the signature (action "status"), then calls
-- car_submit_status (service role only), which runs the common guard
-- car_device_accept first (replay, freshness, rate limit, revocation, bound
-- vehicle). No location is stored: the column does not exist (a later,
-- opt-in spec would add it).
--
-- Anon surface added: none. Apply with `npx supabase db push`, deploy the
-- Edge Function, then `npm run gen:types`.

-- 1. Table ----------------------------------------------------------------------------

create table if not exists public.car_status (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  event text not null check (event in ('trip_end', 'charge_end')),
  soc smallint check (soc between 0 and 100),
  range_km smallint check (range_km between 0 and 1500),
  charging boolean,
  plugged boolean,
  charge_end_reason text check (
    charge_end_reason in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos')
  ),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  check (event = 'charge_end' or charge_end_reason is null)
);

comment on table public.car_status is
  'Last known status reported by the vehicle''s linked car (specs/car-status-e1.md). Written only by car_submit_status.';

alter table public.car_status enable row level security;
revoke all on public.car_status from anon, authenticated;
grant select on public.car_status to authenticated;

create policy "members can select their vehicle's car status"
  on public.car_status for select
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- No insert/update/delete policies: writes only through car_submit_status.

-- 2. The signed call ------------------------------------------------------------------

-- p_status = {"event","observed_at"(Unix ms),"soc","range_km","charging","plugged","charge_end_reason"}
-- (all but event/observed_at may be null). Validated again here even though
-- the Edge Function validates the shape: the database is the boundary.
-- Returns {"ok":true,"stored":bool} (stored=false: an older snapshot than the
-- one already kept, accepted but ignored), {"error":<guard reason>}, or
-- {"error":"bad_request"} for a value out of range.
create or replace function public.car_submit_status(p_device_id uuid, p_ts bigint, p_status jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_event text;
  v_observed timestamptz;
  v_soc integer;
  v_range integer;
  v_charging boolean;
  v_plugged boolean;
  v_reason text;
  v_rows integer;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  if p_status is null or jsonb_typeof(p_status) <> 'object' then
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
  exception when others then
    return jsonb_build_object('error', 'bad_request');
  end;

  if v_event is null or v_event not in ('trip_end', 'charge_end')
     or v_observed is null
     or v_observed > now() + interval '5 minutes'
     or v_observed < now() - interval '7 days'
     or (v_soc is not null and (v_soc < 0 or v_soc > 100))
     or (v_range is not null and (v_range < 0 or v_range > 1500))
     or (v_reason is not null and (v_event <> 'charge_end'
         or v_reason not in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos'))) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  insert into public.car_status as s
    (vehicle_id, device_id, event, soc, range_km, charging, plugged, charge_end_reason, observed_at, received_at)
  values
    (g.accepted_vehicle, p_device_id, v_event, v_soc, v_range, v_charging, v_plugged, v_reason, v_observed, now())
  on conflict (vehicle_id) do update
    set device_id = excluded.device_id,
        event = excluded.event,
        soc = excluded.soc,
        range_km = excluded.range_km,
        charging = excluded.charging,
        plugged = excluded.plugged,
        charge_end_reason = excluded.charge_end_reason,
        observed_at = excluded.observed_at,
        received_at = excluded.received_at
    where s.observed_at < excluded.observed_at;   -- the newest snapshot wins; a late older one is ignored
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'stored', v_rows > 0);
end;
$$;

-- 3. Privileges -----------------------------------------------------------------------

-- Supabase's default privileges grant EXECUTE to anon/authenticated
-- independently of PUBLIC (see 0015 section 5): revoke from each explicitly.
revoke execute on function public.car_submit_status(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.car_submit_status(uuid, bigint, jsonb) to service_role;
