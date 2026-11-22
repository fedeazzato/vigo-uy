-- Car remote actions E3, "Control remoto" (specs/car-remote-e3.md): a member of a vehicle with a linked car queues an order
-- on the web (open / close all windows, ventilate, charge limit, stop charging); the car picks it up over the signed channel
-- while it is awake and online, runs it through Copiloto (which checks its own "Comandos remotos" switch, P + speed 0) and
-- reports the result. An order not picked up within 2 minutes expires. While polling, the car also sends a "live" status.
--
-- Trust model: unchanged from 0045. The car signs every call, the Edge Function `car-device` verifies the signature (actions
-- "orders" and "order_result") and calls car_poll_orders / car_order_result (service role only), which run the common guard
-- car_device_accept first (replay, freshness, rate limit, revocation, bound vehicle). The web writes only through
-- create_car_order / cancel_car_order (authenticated, members of the vehicle); no client can insert or update car_orders.
--
-- The guard gets an optional p_kind: 'poll' calls (a 10-60 s poll while the car is awake) count against a separate cap of
-- 600/hour; every other call keeps the phase-0 cap of 120/hour (same window logic, same columns as before).
--
-- Anon surface added: none. Apply with `npx supabase db push`, deploy the Edge Function, then `npm run gen:types`.

-- 1. car_devices: a separate hourly window for poll calls -------------------------------------------------------------------

-- Not granted to `authenticated` (0045 grants an explicit column list), like the phase-0 counters.
alter table public.car_devices
  add column if not exists poll_window_started_at timestamptz,
  add column if not exists poll_window_count integer not null default 0;

-- 2. The guard, with an optional p_kind ------------------------------------------------------------------------------------
--
-- Replaces public.car_device_accept(uuid, bigint) as last defined in 0045_car_link.sql (section 8; no later migration
-- redefines it: 0048-0051 only call it). The body below is that definition unchanged except for the rate-limit window,
-- which is chosen by p_kind. Every existing caller -- car_heartbeat, car_unpair (0045), car_submit_status (0048, redefined
-- below with the same guard call), car_vault_inbox_key / car_vault_inbox_put (0049), car_submit_trip_draft (0050),
-- car_submit_diag_part (0051) -- calls car_device_accept(p_device_id, p_ts) with two arguments, which now resolves to this
-- function with p_kind = 'default': same checks, same order, same 120/hour window (window_started_at / window_count).
--
-- The old two-argument function must be dropped: a second overload car_device_accept(uuid, bigint, text default ...) next to
-- it would make every two-argument call ambiguous. PL/pgSQL bodies are not dependency-tracked, so the drop does not cascade;
-- the callers resolve the new function on their next call (the whole migration runs in one transaction).
drop function public.car_device_accept(uuid, bigint);

create function public.car_device_accept(
  p_device_id uuid,
  p_ts bigint,
  p_kind text default 'default',
  out accepted_vehicle uuid,
  out reject_reason text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  max_skew_ms constant bigint := 300000;
  max_per_hour constant integer := 120;          -- every call but a poll (phase 0)
  max_polls_per_hour constant integer := 600;    -- 'poll' (E3: every 10 s for 10 min, then every 60 s)
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_dev public.car_devices;
  v_is_poll boolean;
  v_window_start timestamptz;
  v_window_count integer;
begin
  if p_kind is null or p_kind not in ('default', 'poll') then
    raise exception 'car_device_accept: unknown kind %', p_kind;
  end if;
  v_is_poll := p_kind = 'poll';

  -- Row lock: two concurrent requests with the same ts cannot both pass.
  select * into v_dev from public.car_devices d where d.id = p_device_id for update;

  if v_dev.id is null then
    reject_reason := 'unknown';
    return;
  end if;
  if v_dev.revoked_at is not null then
    reject_reason := 'revoked';
    return;
  end if;
  -- A vehicle nobody belongs to any more (its last member moved away and it
  -- was kept for its content) cannot be managed by anyone: retire the device.
  if not exists (select 1 from public.vehicle_members m where m.vehicle_id = v_dev.vehicle_id) then
    update public.car_devices d set revoked_at = now() where d.id = v_dev.id;
    reject_reason := 'revoked';
    return;
  end if;
  if p_ts is null or abs(p_ts - now_ms) > max_skew_ms then
    reject_reason := 'clock';
    return;
  end if;
  -- One replay counter for every kind: polls and other calls share the strictly increasing ts.
  if p_ts <= v_dev.last_request_ts then
    reject_reason := 'replay';
    return;
  end if;

  if v_is_poll then
    v_window_start := v_dev.poll_window_started_at;
    v_window_count := v_dev.poll_window_count;
  else
    v_window_start := v_dev.window_started_at;
    v_window_count := v_dev.window_count;
  end if;
  if v_window_start is null or v_window_start < now() - interval '1 hour' then
    v_window_start := now();
    v_window_count := 0;
  end if;
  if v_window_count >= (case when v_is_poll then max_polls_per_hour else max_per_hour end) then
    reject_reason := 'rate_limited';
    return;
  end if;

  if v_is_poll then
    update public.car_devices d
    set last_request_ts = p_ts,
        last_seen_at = now(),
        poll_window_started_at = v_window_start,
        poll_window_count = v_window_count + 1
    where d.id = v_dev.id;
  else
    update public.car_devices d
    set last_request_ts = p_ts,
        last_seen_at = now(),
        window_started_at = v_window_start,
        window_count = v_window_count + 1
    where d.id = v_dev.id;
  end if;

  accepted_vehicle := v_dev.vehicle_id;
end;
$$;

-- 3. car_status additions (R2) ---------------------------------------------------------------------------------------------

alter table public.car_status
  add column if not exists remain_charge_min smallint check (remain_charge_min between 0 and 1440),
  add column if not exists limit_pct smallint check (limit_pct between 60 and 100);

-- `event` adds 'live' (a snapshot sent with a poll while the car is awake). The inline check of 0048 got Postgres's default
-- name car_status_event_check.
alter table public.car_status drop constraint car_status_event_check;   -- fails loudly if the name ever differs
alter table public.car_status
  add constraint car_status_event_check check (event in ('trip_end', 'charge_end', 'live'));

comment on column public.car_status.remain_charge_min is
  'Minutes to full while charging (car PDCU_BMS_REMAIN_CHRG_TIME); null when not charging or unknown.';
comment on column public.car_status.limit_pct is 'The car''s charge limit, 60-100 %; null = unknown.';

-- Validation + newest-wins upsert shared by car_submit_status (events trip_end / charge_end) and car_poll_orders (event
-- live). Internal: called only from those definer functions, after the guard. Returns {"ok":true,"stored":bool} or
-- {"error":"bad_request"}.
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
  v_rows integer;
begin
  if p_status is null or jsonb_typeof(p_status) <> 'object' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- Unknown keys: nothing extra (e.g. a location) can be stored.
  if exists (select 1 from jsonb_object_keys(p_status) k
             where k not in ('event', 'observed_at', 'soc', 'range_km', 'charging', 'plugged', 'charge_end_reason',
                             'remain_charge_min', 'limit_pct')) then
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
     or (v_reason is not null and (v_event <> 'charge_end'
         or v_reason not in ('completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos'))) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  insert into public.car_status as s
    (vehicle_id, device_id, event, soc, range_km, charging, plugged, charge_end_reason, remain_charge_min, limit_pct,
     observed_at, received_at)
  values
    (p_vehicle_id, p_device_id, v_event, v_soc, v_range, v_charging, v_plugged, v_reason, v_remain, v_limit,
     v_observed, now())
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
        observed_at = excluded.observed_at,
        received_at = excluded.received_at
    where s.observed_at < excluded.observed_at;   -- the newest snapshot wins; a late older one is ignored
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'stored', v_rows > 0);
end;
$$;

-- Same signature, contract and guard call as 0048; it now also accepts the optional remain_charge_min / limit_pct (old cars
-- that do not send them keep working) and refuses unknown keys like the Edge Function does. Events stay trip_end / charge_end:
-- 'live' only arrives through car_poll_orders.
create or replace function public.car_submit_status(p_device_id uuid, p_ts bigint, p_status jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  return public.car_store_status(g.accepted_vehicle, p_device_id, p_status, false);
end;
$$;

-- 4. Orders ----------------------------------------------------------------------------------------------------------------

create table if not exists public.car_orders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  -- Always set on insert (auth.uid() in create_car_order); null only after the account is deleted.
  created_by uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('windows_open_all', 'windows_close_all', 'ventilate', 'charge_limit', 'charge_stop')),
  -- charge_limit: exactly {"pct": <integer 60..100>}; every other kind: {}. Nested CASEs so the cast runs only on digits.
  args jsonb not null default '{}'::jsonb check (
    case when kind = 'charge_limit'
      then case when jsonb_typeof(args) = 'object' and args ? 'pct' and args - 'pct' = '{}'::jsonb
                     and jsonb_typeof(args -> 'pct') = 'number' and (args ->> 'pct') ~ '^[0-9]{1,3}$'
                then (args ->> 'pct')::integer between 60 and 100
                else false
           end
      else args = '{}'::jsonb
    end
  ),
  state text not null default 'queued'
    check (state in ('queued', 'taken', 'done', 'failed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes',
  taken_at timestamptz,
  finished_at timestamptz,
  result_code text check (result_code in (
    'ok', 'remote_off', 'not_parked', 'not_calibrated', 'car_wash', 'not_charging', 'car_error', 'busy', 'no_executor',
    'expired_on_car', 'not_picked_up', 'superseded')),
  result_text text check (char_length(result_text) <= 200),
  device_id uuid references public.car_devices (id) on delete set null
);

create index if not exists car_orders_vehicle_idx on public.car_orders (vehicle_id, created_at desc);

comment on table public.car_orders is
  'Remote orders for the vehicle''s linked car (specs/car-remote-e3.md). Written only by create_car_order / cancel_car_order '
  '(members) and car_poll_orders / car_order_result (the car, service role).';

alter table public.car_orders enable row level security;
revoke all on public.car_orders from anon, authenticated;
grant select on public.car_orders to authenticated;

create policy "members can select their vehicle's car orders"
  on public.car_orders for select
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- No insert/update/delete policies (and no grants): writes only through the functions below.

-- Queued orders past expires_at become 'expired' / 'not_picked_up'. Internal; run by every order function, so a vehicle whose
-- car is offline still sees its old orders expire the next time anyone touches its orders.
create or replace function public.car_orders_expire(p_vehicle_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.car_orders o
     set state = 'expired', result_code = 'not_picked_up', finished_at = now()
   where o.vehicle_id = p_vehicle_id and o.state = 'queued' and o.expires_at < now();
$$;

-- Web: queue an order. Returns {"ok":true,"id":"<uuid>"} or {"error": no_car | bad_request | rate_limited}.
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
  v_id uuid;
begin
  if auth.uid() is null or v_vehicle is null
     or not exists (select 1 from public.car_devices d where d.vehicle_id = v_vehicle and d.revoked_at is null) then
    return jsonb_build_object('error', 'no_car');
  end if;

  if p_kind is null or p_kind not in ('windows_open_all', 'windows_close_all', 'ventilate', 'charge_limit', 'charge_stop')
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
  -- The car only ever runs the latest intent: older queued orders are superseded.
  update public.car_orders o
     set state = 'expired', result_code = 'superseded', finished_at = now()
   where o.vehicle_id = v_vehicle and o.state = 'queued';

  insert into public.car_orders (vehicle_id, created_by, kind, args)
  values (v_vehicle, auth.uid(), p_kind, v_args)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Web: cancel a queued order. Returns {"ok":true} or {"error": not_found | not_queued}.
create or replace function public.cancel_car_order(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  o public.car_orders;
begin
  select * into o from public.car_orders c where c.id = p_id for update;
  if o.id is null or v_vehicle is null or o.vehicle_id <> v_vehicle then
    return jsonb_build_object('error', 'not_found');
  end if;
  perform public.car_orders_expire(o.vehicle_id);
  update public.car_orders c
     set state = 'cancelled', finished_at = now()
   where c.id = p_id and c.state = 'queued';
  if not found then
    return jsonb_build_object('error', 'not_queued');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Car: the poll. Guard (kind 'poll'), expire, store the live snapshot if given, hand over at most 3 orders.
-- Returns {"ok":true,"orders":[{"id","kind","args","created_at":<ms>,"expires_at":<ms>}]} or {"error": <guard> | bad_request}.
create or replace function public.car_poll_orders(p_device_id uuid, p_ts bigint, p_live jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_live jsonb;
  v_orders jsonb;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts, 'poll');
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  perform public.car_orders_expire(g.accepted_vehicle);

  if p_live is not null and jsonb_typeof(p_live) <> 'null' then
    v_live := public.car_store_status(g.accepted_vehicle, p_device_id, p_live, true);
    if v_live ? 'error' then
      return v_live;   -- bad_request; no order is handed over
    end if;
  end if;

  with picked as (
    select o.id
      from public.car_orders o
     where o.vehicle_id = g.accepted_vehicle and o.state = 'queued' and o.expires_at >= now()
     order by o.created_at
     limit 3
       for update skip locked
  ), taken as (
    update public.car_orders o
       set state = 'taken', taken_at = now(), device_id = p_device_id
      from picked
     where o.id = picked.id
    returning o.id, o.kind, o.args, o.created_at, o.expires_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'kind', t.kind,
           'args', t.args,
           'created_at', floor(extract(epoch from t.created_at) * 1000)::bigint,
           'expires_at', floor(extract(epoch from t.expires_at) * 1000)::bigint
         ) order by t.created_at), '[]'::jsonb)
    into v_orders
    from taken t;

  return jsonb_build_object('ok', true, 'orders', v_orders);
end;
$$;

-- Car: the result of an order it took. Returns {"ok":true} or {"error": <guard> | bad_request}.
-- Only the device that took the order may report it, once. A repeat of the exact same result by that device (a retry after a
-- lost reply) answers ok again without changing anything.
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
                                         'car_error', 'busy', 'no_executor', 'expired_on_car')
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

-- 5. Privileges ------------------------------------------------------------------------------------------------------------
-- Supabase's default privileges grant EXECUTE to anon/authenticated (and service_role) independently of PUBLIC (see 0015
-- section 5): revoke from each explicitly.

-- Internal: definer-to-definer calls only; not even the service role may skip the guard or the validation.
revoke execute on function public.car_device_accept(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.car_store_status(uuid, uuid, jsonb, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.car_orders_expire(uuid) from public, anon, authenticated, service_role;

-- Web: signed-in members.
revoke execute on function public.create_car_order(text, jsonb) from public, anon;
grant execute on function public.create_car_order(text, jsonb) to authenticated;
revoke execute on function public.cancel_car_order(uuid) from public, anon;
grant execute on function public.cancel_car_order(uuid) to authenticated;

-- Car: only the Edge Function (service role). car_submit_status keeps its 0048 grants (create or replace keeps them).
revoke execute on function public.car_poll_orders(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.car_poll_orders(uuid, bigint, jsonb) to service_role;
revoke execute on function public.car_order_result(uuid, bigint, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.car_order_result(uuid, bigint, uuid, text, text, text) to service_role;
