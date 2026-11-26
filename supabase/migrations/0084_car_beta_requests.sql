-- Beta requests (specs/car-updates.md "Pedir beta", owner request 2026-11-25): owners ask to join beta testing of car updates
-- from Mi Vigo ("Probar versiones beta"); the release maintainer approves or rejects in Moderación › Versiones del auto › Autos.
-- Approving has exactly the effect of "Marcar como beta" (it calls admin_set_car_beta, which since 0080 is publisher-only).
-- The owner can leave beta (or cancel a pending request) at any time without asking anybody.
--
-- Who may ask / leave: the same people who may act on the car (0070 can_control_car: the vehicle's creator and members with
-- the 'control' role). View-only members get allowed:false and the card stays hidden.
-- Who sees the list: active moderators (read, like admin_list_car_updates). Who decides: car release publishers only (0080).
-- The requester learns the result on the card and through a notification ('car_beta'); publishers get one ('car_beta_request')
-- per new request.
--
-- Clients never touch the table: no grants, no policies; everything goes through the functions below.
-- Anon surface added: none. NOT APPLIED (owner OK required). Apply with `npx supabase db push`, then `npm run gen:types`.

-- 1. Table ----------------------------------------------------------------------------------------------------------------------

create table if not exists public.car_beta_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null))
);

-- At most one pending request per car.
create unique index if not exists car_beta_requests_one_pending_idx
  on public.car_beta_requests (vehicle_id) where status = 'pending';
create index if not exists car_beta_requests_vehicle_idx on public.car_beta_requests (vehicle_id, created_at desc);

comment on table public.car_beta_requests is
  'Owner requests to join beta car updates (specs/car-updates.md). Written and read only through the 0084 functions.';

alter table public.car_beta_requests enable row level security;
revoke all on public.car_beta_requests from public, anon, authenticated;
-- No policies and no grants (like car_location, 0083).

-- 2. Notification kinds ---------------------------------------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('station_failure', 'comment', 'reaction', 'vehicle_trip', 'vehicle_service', 'car_rollback', 'car_charge_draft',
                  'car_beta_request', 'car_beta'));

-- 3. Owner functions ------------------------------------------------------------------------------------------------------------

-- The caller's beta state for the card:
--   {"allowed":false}                                                     no vehicle, or view-only member
--   {"allowed":true,"beta":bool,"request":null | {"status","created_at","decided_at"}}   latest request of the car
create or replace function public.my_car_beta()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  r record;
  v_has boolean;
begin
  if auth.uid() is null or v_vehicle is null or not public.can_control_car(v_vehicle) then
    return jsonb_build_object('allowed', false);
  end if;
  select q.status, q.created_at, q.decided_at into r
    from public.car_beta_requests q
   where q.vehicle_id = v_vehicle and q.status <> 'cancelled'
   order by q.created_at desc
   limit 1;
  v_has := found;
  return jsonb_build_object(
    'allowed', true,
    'beta', exists (select 1 from public.car_update_beta b where b.vehicle_id = v_vehicle),
    'request', case when not v_has then null
                    else jsonb_build_object('status', r.status, 'created_at', r.created_at, 'decided_at', r.decided_at) end);
end;
$$;

revoke execute on function public.my_car_beta() from public, anon;
grant execute on function public.my_car_beta() to authenticated;

-- "Quiero probar las versiones beta". Returns 'pending' (new or already pending) or 'beta' (the car already is a beta car).
-- At most 5 requests per car per day (cancel + ask again cannot flood the publishers' notifications).
create or replace function public.request_car_beta()
returns text
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
    raise exception 'Primero creá tu vehículo o unite a uno en Mi Vigo.';
  end if;
  if not public.can_control_car(v_vehicle) then
    raise exception 'Tu permiso en este vehículo es solo ver. Pedile a quien creó el vehículo que te dé control.';
  end if;
  if exists (select 1 from public.car_update_beta b where b.vehicle_id = v_vehicle) then
    return 'beta';
  end if;
  if exists (select 1 from public.car_beta_requests q where q.vehicle_id = v_vehicle and q.status = 'pending') then
    return 'pending';
  end if;
  if (select count(*) from public.car_beta_requests q
       where q.vehicle_id = v_vehicle and q.created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya pediste varias veces hoy. Probá de nuevo mañana.';
  end if;

  -- two members asking at the same moment: the partial unique index keeps one pending row, the second call just reports it
  insert into public.car_beta_requests (vehicle_id, requested_by) values (v_vehicle, auth.uid())
  on conflict (vehicle_id) where status = 'pending' do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 'pending';
  end if;

  begin
    insert into public.notifications (user_id, kind, actor_id, title)
    select p.user_id, 'car_beta_request', auth.uid(), 'Nuevo pedido para probar versiones beta'
      from public.car_release_publishers p
     where public.is_active_moderator(p.user_id);
  exception when others then
    null;                                                       -- a notification problem never blocks the request
  end;
  return 'pending';
end;
$$;

revoke execute on function public.request_car_beta() from public, anon;
grant execute on function public.request_car_beta() to authenticated;

-- "Salir de beta" / "Cancelar pedido": the car stops taking beta releases (its next update_check sees stable only) and any
-- pending request is cancelled. Needs nobody's approval.
create or replace function public.leave_car_beta()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
begin
  if auth.uid() is null or v_vehicle is null then
    raise exception 'Primero creá tu vehículo o unite a uno en Mi Vigo.';
  end if;
  if not public.can_control_car(v_vehicle) then
    raise exception 'Tu permiso en este vehículo es solo ver. Pedile a quien creó el vehículo que te dé control.';
  end if;
  delete from public.car_update_beta where vehicle_id = v_vehicle;
  update public.car_beta_requests
     set status = 'cancelled', decided_by = auth.uid(), decided_at = now()
   where vehicle_id = v_vehicle and status = 'pending';
end;
$$;

revoke execute on function public.leave_car_beta() from public, anon;
grant execute on function public.leave_car_beta() to authenticated;

-- 4. Moderator functions --------------------------------------------------------------------------------------------------------

-- Pending requests, oldest first (vehicles have no public name: labelled by member display names, like admin_list_car_updates).
create or replace function public.admin_list_car_beta_requests()
returns table (id uuid, vehicle_id uuid, members text, requested_by_name text, created_at timestamptz, linked boolean,
               beta boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_moderator(auth.uid()) then
    raise exception 'not a moderator';
  end if;
  return query
    select q.id, q.vehicle_id,
           (select string_agg(coalesce(p.display_name, '?'), ', ' order by p.display_name)
              from public.vehicle_members m left join public.profiles p on p.id = m.user_id
             where m.vehicle_id = q.vehicle_id),
           (select p.display_name from public.profiles p where p.id = q.requested_by),
           q.created_at,
           exists (select 1 from public.car_devices cd where cd.vehicle_id = q.vehicle_id and cd.revoked_at is null),
           exists (select 1 from public.car_update_beta b where b.vehicle_id = q.vehicle_id)
      from public.car_beta_requests q
     where q.status = 'pending'
     order by q.created_at;
end;
$$;

revoke execute on function public.admin_list_car_beta_requests() from public, anon;
grant execute on function public.admin_list_car_beta_requests() to authenticated;

-- Aprobar / Rechazar. Approve = admin_set_car_beta(vehicle, true) (same effect and same publisher-only rule as "Marcar como
-- beta"). The requester gets a 'car_beta' notification with the result.
create or replace function public.admin_decide_car_beta_request(p_request uuid, p_approve boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  q record;
begin
  if not public.is_car_release_publisher(auth.uid()) then
    raise exception 'solo el responsable de las versiones puede aprobar pedidos de beta';
  end if;
  if p_approve is null then
    raise exception 'decisión inválida';
  end if;
  select * into q from public.car_beta_requests where id = p_request for update;
  if not found or q.status <> 'pending' then
    raise exception 'Ese pedido ya no está pendiente.';
  end if;

  if p_approve then
    perform public.admin_set_car_beta(q.vehicle_id, true);
  end if;
  update public.car_beta_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
   where id = q.id;

  if q.requested_by is not null then
    begin
      insert into public.notifications (user_id, kind, actor_id, title)
      values (q.requested_by, 'car_beta', auth.uid(),
              case when p_approve then 'Tu auto ya recibe las versiones beta'
                   else 'Tu pedido para probar versiones beta no fue aprobado esta vez' end);
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke execute on function public.admin_decide_car_beta_request(uuid, boolean) from public, anon;
grant execute on function public.admin_decide_car_beta_request(uuid, boolean) to authenticated;
