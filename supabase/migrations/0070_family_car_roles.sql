-- E2 "Family sharing" (specs/family-car-roles.md): vehicle members already see the car's status and notices (RLS of car_status,
-- car_orders, notifications: every member of the vehicle). This adds a per-member ROLE that the vehicle's creator grants, and makes
-- the car-acting paths check it:
--   view    = sees status, orders and notices; cannot act on the car (default for anyone who joins from now on)
--   control = can also send "Enviar al auto" / Control remoto orders, cancel them, link and unlink the car
-- The creator (vehicles.created_by) always has control. Existing members are backfilled to 'control' so nothing they can do today
-- stops working the day this is applied (owner decision O-F1 in the spec: switch the backfill to 'view' if preferred).
--
-- Enforcement is in TRIGGERS on car_orders / car_devices (not inside create_car_order etc.), so a later `create or replace` of those
-- functions cannot drop the check. The triggers act only for signed-in callers (auth.uid() not null); the car's own writes go through
-- the car-device Edge Function with the service role (auth.uid() null) and are untouched.
--
-- RLS review fix (found while reviewing E2): the "members can update their vehicle" policy is row-level, and only join_code was pinned
-- (0012 prevent_join_code_update). Any member could therefore rewrite vehicles.created_by to themselves and become the creator (remove
-- other members, and with this migration grant roles). The trigger now also pins created_by, id and created_at for client sessions.
--
-- NOT APPLIED (owner OK required). Apply with `npx supabase db push`, then `npm run gen:types`.

-- 1. Role column -----------------------------------------------------------------------------------------------------------------
alter table public.vehicle_members
  add column if not exists car_role text not null default 'view' check (car_role in ('view', 'control'));

update public.vehicle_members set car_role = 'control' where car_role = 'view';   -- backfill (O-F1)

comment on column public.vehicle_members.car_role is
  'E2: view = sees the car; control = may also send orders and link/unlink the car. Set only by set_vehicle_member_role (creator).';

-- 2. Pin identity columns of vehicles for client sessions (fix, see header) ---------------------------------------------------------
create or replace function public.prevent_join_code_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.join_code := old.join_code;
    new.created_by := old.created_by;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- 3. Helpers ---------------------------------------------------------------------------------------------------------------------
-- True when the signed-in caller may act on the car of p_vehicle_id: its creator, or a member with car_role = 'control'.
create or replace function public.can_control_car(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and p_vehicle_id is not null and (
    exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.created_by = auth.uid())
    or exists (select 1 from public.vehicle_members m
               where m.vehicle_id = p_vehicle_id and m.user_id = auth.uid() and m.car_role = 'control'));
$$;

revoke execute on function public.can_control_car(uuid) from public, anon;
grant execute on function public.can_control_car(uuid) to authenticated;

-- The caller's own role on their vehicle: 'owner' (creator) | 'control' | 'view' | null (no vehicle). For the UI.
create or replace function public.my_car_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when v.created_by = auth.uid() then 'owner'
           else m.car_role
         end
  from public.vehicle_members m
  join public.vehicles v on v.id = m.vehicle_id
  where m.user_id = auth.uid();
$$;

revoke execute on function public.my_car_role() from public, anon;
grant execute on function public.my_car_role() to authenticated;

-- Creator only: set another member's role.
create or replace function public.set_vehicle_member_role(p_user uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if p_role is null or p_role not in ('view', 'control') then
    raise exception 'Rol no válido.';
  end if;
  if v_vehicle is null or not exists (select 1 from public.vehicles v where v.id = v_vehicle and v.created_by = auth.uid()) then
    raise exception 'Solo quien creó el vehículo puede cambiar los permisos.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Quien creó el vehículo siempre tiene control.';
  end if;
  update public.vehicle_members m set car_role = p_role where m.vehicle_id = v_vehicle and m.user_id = p_user;
  if not found then
    raise exception 'Ese usuario no es integrante de tu vehículo.';
  end if;
end;
$$;

revoke execute on function public.set_vehicle_member_role(uuid, text) from public, anon;
grant execute on function public.set_vehicle_member_role(uuid, text) to authenticated;

-- 4. Enforcement triggers ----------------------------------------------------------------------------------------------------------
-- Spanish message passed through by src/lib/errors.ts (KNOWN_TRIGGER_MESSAGES).
create or replace function public.car_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;                                   -- the car (service role) and migrations
  end if;
  if tg_table_name = 'car_devices' and tg_op = 'UPDATE' and new.revoked_at is not distinct from old.revoked_at then
    return new;                                   -- not a revoke (e.g. last_seen bookkeeping)
  end if;
  if not public.can_control_car(new.vehicle_id) then
    raise exception 'Tu permiso en este vehículo es solo ver. Pedile a quien creó el vehículo que te dé control.';
  end if;
  return new;
end;
$$;

revoke all on function public.car_role_guard() from public, anon, authenticated;

drop trigger if exists car_role_guard_orders on public.car_orders;
create trigger car_role_guard_orders
  before insert or update on public.car_orders
  for each row execute function public.car_role_guard();

drop trigger if exists car_role_guard_devices on public.car_devices;
create trigger car_role_guard_devices
  before insert or update on public.car_devices
  for each row execute function public.car_role_guard();

-- 5. join_vehicle_by_code inserts with the column default ('view'); remove_vehicle_member / reset_my_vehicle create a fresh own vehicle
--    where the user is the creator (owner), so nothing else changes.
