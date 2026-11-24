-- One-time family invite codes (specs/site-audit-2026-11.md, owner decision 2026-11-24 #4, security concern).
--
-- Before: every vehicle had one static 6-char vehicles.join_code, always visible to its members and valid forever. Anyone who
-- ever saw it could join the vehicle (and see the linked car's status) at any later time.
-- After:
--   * create_family_invite() makes a NEW random 8-char code each time it is called. Only the vehicle's creator or a member with
--     car_role = 'control' (0070, can_control_car) may call it. The code is returned ONCE; the table stores only its SHA-256.
--   * A code is valid for ONE join and expires INVITE_TTL (24 h, constant below) after creation if unused.
--   * join_vehicle_by_code(code) accepts only an unused, unexpired invite whose creator still has control of that vehicle, and
--     consumes it atomically (row lock + used_at/used_by in the same transaction as the membership change).
--   * The static join_code is retired: the join RPC no longer reads it, existing values are nulled and new vehicles get none.
--     Existing members stay where they are.
--   * Only the LATEST code of a vehicle works (owner decision 2026-11-24): creating a code expires every earlier unused code of
--     that vehicle in the same transaction.
--   * Rate limits: 10 failed join attempts per hour per user (unchanged, join_code_attempts from 0021); 10 invites per hour per
--     user.
--   * vehicle_invites: RLS on, no policies, no grants = unreachable from any client session (only the SECURITY DEFINER RPCs).
--
-- Owner approved 2026-11-24 (applied by the lead). Apply with `npx supabase db push`, then `npm run gen:types`.

-- 1. Table -----------------------------------------------------------------------------------------------------------------------
create table if not exists public.vehicle_invites (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  code_hash text not null unique,                 -- hex SHA-256 of the normalized code; the code itself is never stored
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create index if not exists vehicle_invites_creator_time_idx on public.vehicle_invites (created_by, created_at);
create index if not exists vehicle_invites_vehicle_idx on public.vehicle_invites (vehicle_id);

alter table public.vehicle_invites enable row level security;
revoke all on table public.vehicle_invites from public, anon, authenticated;

comment on table public.vehicle_invites is
  'One-time family invites (0082). Only SECURITY DEFINER RPCs touch it; stores a SHA-256 of the code, never the code.';

-- 2. Internal helpers ------------------------------------------------------------------------------------------------------------
create or replace function public.family_invite_hash(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

revoke execute on function public.family_invite_hash(text) from public, anon, authenticated;

-- 8 chars from the same 31-letter lookalike-free alphabet, CSPRNG via gen_random_uuid() (same method as 0045).
create or replace function public.generate_family_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  b bytea;
  v integer;
begin
  while length(v_code) < 8 loop
    b := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      continue when i = 6 or i = 8;
      v := get_byte(b, i);
      continue when v >= 248;
      v_code := v_code || substr(alphabet, 1 + (v % 31), 1);
      exit when length(v_code) = 8;
    end loop;
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.generate_family_invite_code() from public, anon, authenticated;

-- 3. create_family_invite --------------------------------------------------------------------------------------------------------
create or replace function public.create_family_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  invite_ttl constant interval := interval '24 hours';   -- owner may change
  max_per_hour constant int := 10;
  v_vehicle uuid := public.current_user_vehicle_id();
  v_code text;
  v_expires timestamptz := now() + invite_ttl;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if public.is_user_banned(auth.uid()) then
    raise exception 'Tu cuenta está suspendida.';
  end if;
  if v_vehicle is null or not public.can_control_car(v_vehicle) then
    raise exception 'Solo quien creó el vehículo o tiene permiso de control puede sumar a alguien.';
  end if;

  -- Opportunistic cleanup of old rows (kept 30 days for the record).
  delete from public.vehicle_invites i
  where i.vehicle_id = v_vehicle and coalesce(i.used_at, i.expires_at) < now() - interval '30 days';

  if (select count(*) from public.vehicle_invites i
      where i.created_by = auth.uid() and i.created_at >= now() - interval '1 hour') >= max_per_hour then
    raise exception 'Creaste muchos códigos seguidos. Esperá una hora y probá de nuevo.';
  end if;
  -- Only the latest code works: expire the vehicle's earlier unused codes (same transaction as the insert below). Rows are
  -- locked so a join racing with this either consumed the old code first or finds it expired.
  update public.vehicle_invites i set expires_at = now()
  where i.vehicle_id = v_vehicle and i.used_at is null and i.expires_at > now();

  loop
    v_code := public.generate_family_invite_code();
    begin
      insert into public.vehicle_invites (vehicle_id, code_hash, created_by, expires_at)
      values (v_vehicle, public.family_invite_hash(v_code), auth.uid(), v_expires);
      exit;
    exception when unique_violation then
      -- astronomically rare collision: draw again
    end;
  end loop;

  return query select v_code, v_expires;
end;
$$;

revoke execute on function public.create_family_invite() from public, anon;
grant execute on function public.create_family_invite() to authenticated;

-- 4. join_vehicle_by_code: invites only, consumed atomically ---------------------------------------------------------------------
-- Same signature and contract as 0021 (returns the vehicle id, or NULL for an invalid code so the failed attempt is recorded).
create or replace function public.join_vehicle_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.vehicle_invites%rowtype;
  old_vehicle_id uuid;
  recent_failures int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if public.is_user_banned(auth.uid()) then
    raise exception 'Tu cuenta está suspendida.';
  end if;

  delete from public.join_code_attempts
  where user_id = auth.uid() and attempted_at < now() - interval '1 hour';

  select count(*) into recent_failures
  from public.join_code_attempts
  where user_id = auth.uid() and attempted_at >= now() - interval '1 hour';

  if recent_failures >= 10 then
    raise exception 'Demasiados intentos. Esperá una hora e intentá de nuevo.';
  end if;

  -- Lock the invite row: two people racing with the same code serialize here; the second sees used_at set.
  select * into v_invite
  from public.vehicle_invites i
  where i.code_hash = public.family_invite_hash(code)
    and i.used_at is null
    and i.expires_at > now()
  for update;

  -- The creator must still be in that vehicle with control (a removed or downgraded member's codes die with their rights).
  if v_invite.id is null
     or not exists (
       select 1 from public.vehicle_members m
       join public.vehicles v on v.id = m.vehicle_id
       where m.vehicle_id = v_invite.vehicle_id and m.user_id = v_invite.created_by
         and (v.created_by = v_invite.created_by or m.car_role = 'control')) then
    insert into public.join_code_attempts (user_id) values (auth.uid());
    return null; -- "Código no válido." — mapped by the frontend
  end if;

  select vehicle_id into old_vehicle_id from public.vehicle_members where user_id = auth.uid();

  if old_vehicle_id = v_invite.vehicle_id then
    return v_invite.vehicle_id; -- already a member: no-op, the code stays usable for the person it was meant for
  end if;

  update public.vehicle_invites set used_at = now(), used_by = auth.uid() where id = v_invite.id;

  delete from public.vehicle_members where user_id = auth.uid();
  insert into public.vehicle_members (vehicle_id, user_id) values (v_invite.vehicle_id, auth.uid());  -- car_role defaults to 'view'

  perform public.cleanup_orphan_vehicle(old_vehicle_id);

  delete from public.join_code_attempts where user_id = auth.uid();
  return v_invite.vehicle_id;
end;
$$;

revoke execute on function public.join_vehicle_by_code(text) from public, anon;
grant execute on function public.join_vehicle_by_code(text) to authenticated;

-- 5. Retire the static join code -------------------------------------------------------------------------------------------------
-- The signup / reset / remove-member functions still call generate_join_code() when they insert a vehicle; it now returns NULL so
-- they keep working unchanged and new vehicles have no static code.
alter table public.vehicles alter column join_code drop not null;

create or replace function public.generate_join_code()
returns text
language sql
as $$
  select null::text;
$$;

revoke execute on function public.generate_join_code() from public;

-- auth.uid() is null in a migration, so prevent_join_code_update (0070) lets this through.
update public.vehicles set join_code = null where join_code is not null;

comment on column public.vehicles.join_code is
  'Retired by 0082 (always NULL). Family joins use one-time codes from create_family_invite().';
