-- Guest mode ("Modo invitado") from WikiVigo, phase 2 (specs/guest-mode.md; car-side plan vigo-hack docs/GUEST_MODE.md, owner
-- decision D7 2026-11-26). Guest mode hides the owner's personal info on the car screen while it is left with someone else (car
-- wash, valet). On the car, leaving it needs the owner PIN; WikiVigo is the second way to switch it on/off and the recovery for a
-- forgotten PIN (turning it off from here needs no PIN: the account role authorises it).
--
-- Model: a REQUEST (desired state) per vehicle, not a 2-minute order. The car may be asleep when the owner asks; an "off" request
-- waits until the car is online again (forgotten-PIN recovery must not expire), an "on" request expires after 12 hours (so a
-- forgotten request does not surprise the owner days later). At most one pending request per vehicle; a newer one supersedes it.
-- The car learns the pending request and reports its ACTUAL state in its existing "orders" poll (no new call, no new process):
--   car -> server  orders body  "guest": {"state","since","last_id","last_code"}      (optional; old cars omit it)
--   server -> car  orders reply "guest": null | {"id","want","at","expires_at","sender"} (only when the car sent "guest")
--
-- Who: reading and changing it = the vehicle's creator and members with the 'control' role (0070 can_control_car). Every member
-- of the vehicle (also view-only) gets a notification ('car_guest_mode') when someone asks for a change and when the car confirms
-- that it entered or left guest mode (also when that happened on the car screen), so a family member sees it.
--
-- Trust model: unchanged from 0045/0052. The car signs the poll, the Edge Function `car-device` verifies it and calls
-- car_poll_orders (service role only), which runs the guard car_device_accept first. Clients never touch the tables.
--
-- Anon surface added: none. NOT APPLIED (owner OK required). Apply with `npx supabase db push`, deploy `car-device`, then
-- `npm run gen:types`.

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------

-- What the car last said about itself. One row per vehicle; written only by the car's poll.
create table if not exists public.car_guest_state (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  state text not null check (state in ('on', 'off', 'unsupported')),
  since timestamptz,                                   -- when guest mode began on the car (state 'on' only, optional)
  device_id uuid references public.car_devices (id) on delete set null,
  reported_at timestamptz not null default now(),
  check (state = 'on' or since is null)
);

comment on table public.car_guest_state is
  'Guest mode as the car last reported it (specs/guest-mode.md). Written only by car_poll_orders; read through get_car_guest_mode.';

-- What members asked for. History is kept (the card shows the latest one); only one pending per vehicle.
create table if not exists public.car_guest_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  want text not null check (want in ('on', 'off')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                              -- 'on': created_at + 12 h; 'off': null (never expires)
  sent_at timestamptz,                                 -- first time a poll handed it to the car
  device_id uuid references public.car_devices (id) on delete set null,
  state text not null default 'pending'
    check (state in ('pending', 'done', 'failed', 'cancelled', 'expired', 'superseded')),
  result_code text check (result_code in ('ok', 'unsupported', 'no_pin', 'failed', 'expired_on_car')),
  finished_at timestamptz,
  check ((state = 'pending') = (finished_at is null)),
  check ((want = 'on') = (expires_at is not null))
);

create unique index if not exists car_guest_requests_one_pending_idx
  on public.car_guest_requests (vehicle_id) where state = 'pending';
create index if not exists car_guest_requests_vehicle_idx on public.car_guest_requests (vehicle_id, created_at desc);

comment on table public.car_guest_requests is
  'Guest mode on/off requests from WikiVigo (specs/guest-mode.md). Written only by the 0085 functions.';

alter table public.car_guest_state enable row level security;
alter table public.car_guest_requests enable row level security;
revoke all on public.car_guest_state from public, anon, authenticated;
revoke all on public.car_guest_requests from public, anon, authenticated;
-- No policies and no grants (like car_location 0083, car_beta_requests 0084): everything goes through the functions below.

-- 2. Notification kind ----------------------------------------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('station_failure', 'comment', 'reaction', 'vehicle_trip', 'vehicle_service', 'car_rollback', 'car_charge_draft',
                  'car_beta_request', 'car_beta', 'car_guest_mode'));

-- 3. Internal helpers -----------------------------------------------------------------------------------------------------------

-- Pending 'on' requests past expires_at become 'expired'. 'off' requests never expire.
create or replace function public.car_guest_expire(p_vehicle uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.car_guest_requests
     set state = 'expired', finished_at = now()
   where vehicle_id = p_vehicle and state = 'pending' and expires_at is not null and expires_at < now();
$$;

-- Notifies members of the vehicle (never p_except). Swallows its own errors: a notification never blocks the change.
create or replace function public.car_guest_notify(p_vehicle uuid, p_actor uuid, p_except uuid, p_title text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, actor_id, title)
  select m.user_id, 'car_guest_mode', p_actor, left(p_title, 200)
    from public.vehicle_members m
   where m.vehicle_id = p_vehicle and (p_except is null or m.user_id <> p_except);
exception when others then
  null;
end;
$$;

-- The car's "guest" object from an orders poll: validates it (the database is the boundary), stores the state, settles the
-- request the car says it handled, and notifies the members when the car entered or left guest mode.
-- p_guest = {"state":"on"|"off"|"unsupported","since":<ms>|null,"last_id":<uuid>|null,"last_code":<code>|null}.
-- Returns null when stored, or {"error":"bad_request"}.
create or replace function public.car_guest_store(p_vehicle uuid, p_device uuid, p_guest jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_state text;
  v_since timestamptz;
  v_last uuid;
  v_code text;
  v_prev text;
  v_by uuid;
  v_from_web boolean;
  v_name text;
begin
  if jsonb_typeof(p_guest) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_guest) k where k not in ('state', 'since', 'last_id', 'last_code'))
     or jsonb_typeof(p_guest -> 'state') is distinct from 'string'
     or coalesce(jsonb_typeof(p_guest -> 'since'), 'null') not in ('null', 'number')
     or coalesce(jsonb_typeof(p_guest -> 'last_id'), 'null') not in ('null', 'string')
     or coalesce(jsonb_typeof(p_guest -> 'last_code'), 'null') not in ('null', 'string') then
    return jsonb_build_object('error', 'bad_request');
  end if;

  v_state := p_guest ->> 'state';
  v_code := p_guest ->> 'last_code';
  if v_state not in ('on', 'off', 'unsupported')
     or (jsonb_typeof(p_guest -> 'since') = 'number' and v_state <> 'on')
     or ((p_guest ->> 'last_id') is null) <> (v_code is null)
     or (v_code is not null and v_code not in ('ok', 'unsupported', 'no_pin', 'failed', 'expired_on_car')) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  begin
    if jsonb_typeof(p_guest -> 'since') = 'number' then
      if (p_guest ->> 'since') !~ '^[1-9][0-9]{0,15}$' then
        return jsonb_build_object('error', 'bad_request');
      end if;
      v_since := to_timestamp((p_guest ->> 'since')::bigint / 1000.0);
      if v_since > now() + interval '5 minutes' or v_since < timestamptz '2025-01-01' then
        return jsonb_build_object('error', 'bad_request');
      end if;
    end if;
    if (p_guest ->> 'last_id') is not null then
      if (p_guest ->> 'last_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return jsonb_build_object('error', 'bad_request');
      end if;
      v_last := (p_guest ->> 'last_id')::uuid;
    end if;
  exception when others then
    return jsonb_build_object('error', 'bad_request');
  end;

  select s.state into v_prev from public.car_guest_state s where s.vehicle_id = p_vehicle for update;

  insert into public.car_guest_state as s (vehicle_id, state, since, device_id, reported_at)
  values (p_vehicle, v_state, v_since, p_device, now())
  on conflict (vehicle_id) do update
    set state = excluded.state, since = excluded.since, device_id = excluded.device_id, reported_at = excluded.reported_at;

  -- The request the car handled: only a pending one of this vehicle is settled (a retry, or an id of another vehicle, is a no-op).
  if v_last is not null then
    update public.car_guest_requests r
       set state = case when v_code = 'ok' then 'done' else 'failed' end,
           result_code = v_code, finished_at = now(), device_id = p_device
     where r.id = v_last and r.vehicle_id = p_vehicle and r.state = 'pending';
  end if;

  -- Entered / left guest mode (first report 'on' counts as entering; 'unsupported' never notifies).
  if v_state in ('on', 'off') and ((v_prev is null and v_state = 'on') or (v_prev in ('on', 'off') and v_prev <> v_state)) then
    -- Was it a WikiVigo request (done in the last 5 minutes, same direction)? Then say who asked.
    select r.created_by into v_by
      from public.car_guest_requests r
     where r.vehicle_id = p_vehicle and r.state = 'done' and r.want = v_state and r.finished_at > now() - interval '5 minutes'
     order by r.finished_at desc
     limit 1;
    v_from_web := found;
    if v_by is not null then
      select p.display_name into v_name from public.profiles p where p.id = v_by;
    end if;
    perform public.car_guest_notify(
      p_vehicle,
      v_by,
      null,
      case when v_state = 'on' then 'El auto entró en modo invitado' else 'El auto salió del modo invitado' end
        || case when v_name is not null then ' (lo pidió ' || v_name || ' desde WikiVigo)'
                when v_from_web then ' (pedido desde WikiVigo)'
                else ' (desde la pantalla del auto)' end);
  end if;

  return null;
end;
$$;

-- 4. Web functions (creator / control members) ----------------------------------------------------------------------------------

-- The card's state:
--   {"allowed":false}                                       no vehicle, or a view-only member
--   {"allowed":true,"linked":bool,"last_seen_at":<iso>|null,
--    "car":null | {"state","since","reported_at"},
--    "request":null | {"id","want","state","code","by","created_at","sent_at","finished_at","expires_at"}}   latest request
-- Volatile: it expires old 'on' requests first.
create or replace function public.get_car_guest_mode()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  v_car jsonb;
  v_req jsonb;
begin
  if auth.uid() is null or v_vehicle is null or not public.can_control_car(v_vehicle) then
    return jsonb_build_object('allowed', false);
  end if;
  perform public.car_guest_expire(v_vehicle);

  select jsonb_build_object('state', s.state, 'since', s.since, 'reported_at', s.reported_at) into v_car
    from public.car_guest_state s where s.vehicle_id = v_vehicle;

  select jsonb_build_object(
           'id', r.id, 'want', r.want, 'state', r.state, 'code', r.result_code,
           'by', case when r.created_by is null then null else coalesce(p.display_name, '') end,
           'created_at', r.created_at, 'sent_at', r.sent_at, 'finished_at', r.finished_at, 'expires_at', r.expires_at)
    into v_req
    from public.car_guest_requests r
    left join public.profiles p on p.id = r.created_by
   where r.vehicle_id = v_vehicle and r.state <> 'superseded'
   order by r.created_at desc
   limit 1;

  return jsonb_build_object(
    'allowed', true,
    'linked', exists (select 1 from public.car_devices d where d.vehicle_id = v_vehicle and d.revoked_at is null),
    'last_seen_at', (select max(d.last_seen_at) from public.car_devices d
                      where d.vehicle_id = v_vehicle and d.revoked_at is null),
    'car', v_car,
    'request', v_req);
end;
$$;

-- "Activar modo invitado" (p_on true) / "Desactivar modo invitado" (p_on false; also the forgotten-PIN recovery).
-- Returns {"ok":true,"id":<uuid>} or {"error": not_allowed | no_car | not_supported | rate_limited | bad_request}.
-- not_supported: the car never reported guest mode support (old Mi Vigo) or reported 'unsupported' (old root helper): nobody on
-- the car would ever pick the request up.
create or replace function public.set_car_guest_mode(p_on boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  v_want text;
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null or v_vehicle is null or not public.can_control_car(v_vehicle) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if p_on is null then
    return jsonb_build_object('error', 'bad_request');
  end if;
  if not exists (select 1 from public.car_devices d where d.vehicle_id = v_vehicle and d.revoked_at is null) then
    return jsonb_build_object('error', 'no_car');
  end if;
  if not exists (select 1 from public.car_guest_state s where s.vehicle_id = v_vehicle and s.state in ('on', 'off')) then
    return jsonb_build_object('error', 'not_supported');
  end if;

  -- Two members tapping at once: one at a time per vehicle (also keeps the rate count exact).
  perform pg_advisory_xact_lock(hashtext('car_guest:' || v_vehicle::text));
  if (select count(*) from public.car_guest_requests r
       where r.vehicle_id = v_vehicle and r.created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  perform public.car_guest_expire(v_vehicle);
  update public.car_guest_requests
     set state = 'superseded', finished_at = now()
   where vehicle_id = v_vehicle and state = 'pending';

  v_want := case when p_on then 'on' else 'off' end;
  insert into public.car_guest_requests (vehicle_id, want, created_by, expires_at)
  values (v_vehicle, v_want, auth.uid(), case when p_on then now() + interval '12 hours' end)
  returning id into v_id;

  select p.display_name into v_name from public.profiles p where p.id = auth.uid();
  perform public.car_guest_notify(
    v_vehicle, auth.uid(), auth.uid(),
    coalesce(v_name, 'Alguien') || ' pidió ' || case when p_on then 'activar' else 'desactivar' end
      || ' el modo invitado del auto');

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- "Cancelar pedido". Returns {"ok":true} or {"error": not_allowed | not_pending}.
create or replace function public.cancel_car_guest_request()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
begin
  if auth.uid() is null or v_vehicle is null or not public.can_control_car(v_vehicle) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  perform public.car_guest_expire(v_vehicle);
  update public.car_guest_requests
     set state = 'cancelled', finished_at = now()
   where vehicle_id = v_vehicle and state = 'pending';
  if not found then
    return jsonb_build_object('error', 'not_pending');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- 5. The car's poll: car_poll_orders gains an optional p_guest ------------------------------------------------------------------
-- Same body as 0052 plus the guest steps. The 3-argument version is dropped (two overloads would make the Edge Function's call
-- ambiguous); p_guest defaults to null, so a car-device build that does not pass it keeps working unchanged.
-- Returns {"ok":true,"orders":[…]} and, only when p_guest was given, "guest": null | {"id","want","at","expires_at","sender"}.

drop function if exists public.car_poll_orders(uuid, bigint, jsonb);

create or replace function public.car_poll_orders(p_device_id uuid, p_ts bigint, p_live jsonb, p_guest jsonb default null)
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
  v_err jsonb;
  v_guest jsonb;
  v_has_guest boolean := p_guest is not null and jsonb_typeof(p_guest) <> 'null';
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

  if v_has_guest then
    v_err := public.car_guest_store(g.accepted_vehicle, p_device_id, p_guest);
    if v_err is not null then
      return v_err;    -- bad_request; nothing is handed over
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
    returning o.id, o.kind, o.args, o.created_at, o.expires_at, o.created_by
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'kind', t.kind,
           'args', t.args,
           'created_at', floor(extract(epoch from t.created_at) * 1000)::bigint,
           'expires_at', floor(extract(epoch from t.expires_at) * 1000)::bigint,
           'sender', public.car_order_sender(p.display_name)
         ) order by t.created_at), '[]'::jsonb)
    into v_orders
    from taken t
    left join public.profiles p on p.id = t.created_by;

  if not v_has_guest then
    return jsonb_build_object('ok', true, 'orders', v_orders);   -- old cars: byte-identical reply
  end if;

  -- The pending request, handed over on every poll until the car reports it handled (the car runs each id once).
  perform public.car_guest_expire(g.accepted_vehicle);
  with pending as (
    update public.car_guest_requests r
       set sent_at = coalesce(r.sent_at, now()), device_id = p_device_id
     where r.vehicle_id = g.accepted_vehicle and r.state = 'pending'
    returning r.id, r.want, r.created_at, r.expires_at, r.created_by
  )
  select jsonb_build_object(
           'id', q.id,
           'want', q.want,
           'at', floor(extract(epoch from q.created_at) * 1000)::bigint,
           'expires_at', case when q.expires_at is null then null
                              else floor(extract(epoch from q.expires_at) * 1000)::bigint end,
           'sender', public.car_order_sender(p.display_name))
    into v_guest
    from pending q
    left join public.profiles p on p.id = q.created_by
   limit 1;

  return jsonb_build_object('ok', true, 'orders', v_orders, 'guest', v_guest);
end;
$$;

-- 6. Unlinked car: forget its state ---------------------------------------------------------------------------------------------
-- When the vehicle has no active device left, the stored state is stale (the card hides anyway) and a pending request would be
-- picked up by whatever screen is linked next: drop the state and cancel the request.
create or replace function public.car_guest_forget_unlinked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle uuid;
begin
  if tg_op = 'DELETE' then
    v_vehicle := old.vehicle_id;
  else
    v_vehicle := new.vehicle_id;
  end if;
  if v_vehicle is not null
     and not exists (select 1 from public.car_devices d where d.vehicle_id = v_vehicle and d.revoked_at is null) then
    delete from public.car_guest_state where vehicle_id = v_vehicle;
    update public.car_guest_requests
       set state = 'cancelled', finished_at = now()
     where vehicle_id = v_vehicle and state = 'pending';
  end if;
  return null;
end;
$$;

drop trigger if exists car_guest_forget_unlinked on public.car_devices;
create trigger car_guest_forget_unlinked
  after update of revoked_at or delete on public.car_devices
  for each row execute function public.car_guest_forget_unlinked();

-- 7. Privileges -----------------------------------------------------------------------------------------------------------------
-- Supabase's default privileges grant EXECUTE to anon/authenticated/service_role independently of PUBLIC: revoke from each.

-- Internal: definer-to-definer calls only.
revoke execute on function public.car_guest_expire(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.car_guest_notify(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.car_guest_store(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.car_guest_forget_unlinked() from public, anon, authenticated;

-- Web: signed-in members (the functions check creator / control themselves).
revoke execute on function public.get_car_guest_mode() from public, anon;
grant execute on function public.get_car_guest_mode() to authenticated;
revoke execute on function public.set_car_guest_mode(boolean) from public, anon;
grant execute on function public.set_car_guest_mode(boolean) to authenticated;
revoke execute on function public.cancel_car_guest_request() from public, anon;
grant execute on function public.cancel_car_guest_request() to authenticated;

-- Car: only the Edge Function (service role).
revoke execute on function public.car_poll_orders(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.car_poll_orders(uuid, bigint, jsonb, jsonb) to service_role;
