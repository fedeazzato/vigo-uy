-- Fix 0070: car_role_guard() read new.revoked_at on car_orders too ("record new has no field revoked_at"), which made EVERY
-- remote order fail (found at the car 2026-11-23). PL/pgSQL resolves every field in an AND expression, so the car_devices-only
-- check must be a nested IF.
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
  if tg_table_name = 'car_devices' and tg_op = 'UPDATE' then
    if new.revoked_at is not distinct from old.revoked_at then
      return new;                                 -- not a revoke (e.g. last_seen bookkeeping)
    end if;
  end if;
  if not public.can_control_car(new.vehicle_id) then
    raise exception 'Tu permiso en este vehículo es solo ver. Pedile a quien creó el vehículo que te dé control.';
  end if;
  return new;
end;
$$;

revoke all on function public.car_role_guard() from public, anon, authenticated;
