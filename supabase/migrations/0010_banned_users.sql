-- Phase 6: banned users.
-- Adds a moderator-controlled ban flag to profiles. A banned user cannot
-- insert new content, and their public content stops being visible to
-- everyone except moderators (visibility is enforced in 0011's policies).
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.profiles add column banned_at timestamptz;

-- Helper for RLS policies: anon has no SELECT on profiles, and policy
-- subqueries run with the caller's privileges, so a plain
-- `exists (select ... from profiles)` inside an anon policy would always be
-- empty. security definer lets the check bypass profiles RLS while exposing
-- only a boolean.
create function public.is_user_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and banned_at is not null
  );
$$;

revoke execute on function public.is_user_banned(uuid) from public;
grant execute on function public.is_user_banned(uuid) to anon, authenticated;

-- Extend the 0008 guard to cover banned_at too (the profiles UPDATE policy is
-- row-level, so without this a banned user could simply
-- `update profiles set banned_at = null`).
--
-- Contract with 0014's admin RPCs: those SECURITY DEFINER functions set the
-- transaction-local GUC `vigo.admin_action = 'on'` via set_config(..., true)
-- right before updating profiles, which lets their change through this
-- trigger. PostgREST clients cannot call set_config themselves (pg_catalog is
-- not an exposed schema), so the flag is only ever set by our own RPCs, which
-- verify the caller is a moderator first. The SQL Editor bootstrap path
-- ("promote the first moderator by hand") still works because auth.uid() is
-- null there. Same function + trigger name as 0008, so no trigger DDL needed.
create or replace function public.prevent_is_moderator_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and current_setting('vigo.admin_action', true) is distinct from 'on' then
    new.is_moderator := old.is_moderator;
    new.banned_at := old.banned_at;
  end if;
  return new;
end;
$$;

-- Banned users cannot insert new content. The policy is the boundary; the
-- friendly Spanish error for the UI comes from the trigger below.
drop policy "users can insert their own service entries" on public.service_entries;
create policy "users can insert their own service entries"
  on public.service_entries for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

drop policy "users can insert their own trip logs" on public.trip_logs;
create policy "users can insert their own trip logs"
  on public.trip_logs for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

-- Friendlier error than a bare RLS violation: reuse the 0009 per-day-limit
-- trigger (it already runs before insert on both content tables).
create or replace function public.enforce_daily_insert_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_per_day constant integer := 20;
  recent_count integer;
begin
  if public.is_user_banned(new.user_id) then
    raise exception 'Tu cuenta está suspendida.';
  end if;

  execute format(
    'select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 day''',
    TG_TABLE_NAME
  ) into recent_count using new.user_id;

  if recent_count >= max_per_day then
    raise exception 'Límite diario de % entradas alcanzado. Probá de nuevo mañana.', max_per_day;
  end if;

  return new;
end;
$$;
