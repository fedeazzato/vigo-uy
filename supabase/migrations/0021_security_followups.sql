-- Audit item D3: minor security follow-ups.
--  1. profiles SELECT narrowed to own row (ban status, city, model, color
--     were readable by any signed-in user; moderation reads now come from
--     the admin_list_users RPC, public names from public_profiles).
--  2. join_vehicle_by_code rate limit: 10 failed attempts per hour per user.
--  3. Document the accepted is_user_banned anon-execute oracle.
-- Apply with `npx supabase db push`.

-- 1. Own-row profiles policy. Everything else that reads profiles is either
--    SECURITY DEFINER (public_profiles view, admin RPCs, is_user_banned,
--    is_active_moderator), owner-rights (vehicle_km_leaderboard view), or an
--    own-row subquery (the moderator checks in content-table policies run as
--    the caller against their own profile row) — all unaffected.

drop policy "profiles are readable by authenticated users" on public.profiles;

create policy "users can read their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- 2. Rate-limit join_vehicle_by_code. Brute-forcing the 31^6 code space is
--    impractical, but the RPC was unmetered. Failed attempts are recorded in
--    a table only ever touched inside this SECURITY DEFINER function (RLS
--    enabled with no policies = inaccessible to clients).

create table public.join_code_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index join_code_attempts_user_time_idx
  on public.join_code_attempts (user_id, attempted_at);

alter table public.join_code_attempts enable row level security;

-- Behavior change: an invalid code now RETURNS NULL instead of raising.
-- A raise would roll back the just-inserted attempt row (exceptions abort
-- the whole transaction), so failed attempts would never accumulate. The
-- frontend maps the null to the same Spanish message.
create or replace function public.join_vehicle_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  old_vehicle_id uuid;
  recent_failures int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if public.is_user_banned(auth.uid()) then
    raise exception 'Tu cuenta está suspendida.';
  end if;

  -- Opportunistic cleanup, then count this user's recent failures.
  delete from public.join_code_attempts
  where user_id = auth.uid() and attempted_at < now() - interval '1 hour';

  select count(*) into recent_failures
  from public.join_code_attempts
  where user_id = auth.uid() and attempted_at >= now() - interval '1 hour';

  if recent_failures >= 10 then
    raise exception 'Demasiados intentos. Esperá una hora e intentá de nuevo.';
  end if;

  select id into target_id
  from public.vehicles
  where join_code = upper(trim(code));

  if target_id is null then
    insert into public.join_code_attempts (user_id) values (auth.uid());
    return null; -- "Código no válido." — mapped by the frontend
  end if;

  select vehicle_id into old_vehicle_id
  from public.vehicle_members
  where user_id = auth.uid();

  if old_vehicle_id = target_id then
    return target_id; -- already a member: no-op
  end if;

  delete from public.vehicle_members where user_id = auth.uid();
  insert into public.vehicle_members (vehicle_id, user_id)
  values (target_id, auth.uid());

  perform public.cleanup_orphan_vehicle(old_vehicle_id);

  -- Success wipes the counter.
  delete from public.join_code_attempts where user_id = auth.uid();
  return target_id;
end;
$$;

-- 3. Accepted risk, documented so future audits don't re-flag it.
comment on function public.is_user_banned(uuid) is
  'Executable by anon BY DESIGN: the anon RLS policies on content tables call '
  'it, and policy expressions run with the caller''s privileges, so EXECUTE '
  'cannot be revoked. It reveals ban status for arbitrary UUIDs; accepted '
  'because UUIDs are not enumerable.';
