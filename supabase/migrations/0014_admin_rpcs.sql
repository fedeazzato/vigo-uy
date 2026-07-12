-- Phase 6: in-app user management for moderators.
-- Moderators can promote/demote moderators and ban/unban users from the app,
-- without the SQL Editor. Every function verifies the caller server-side --
-- the RequireModerator route guard is UX only.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

-- Internal caller check shared by the RPCs below.
create function public.assert_moderator()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_moderator and banned_at is null
  ) then
    raise exception 'No autorizado.';
  end if;
end;
$$;

revoke execute on function public.assert_moderator() from public;

-- Promote/demote a moderator. The profiles trigger (0008/0010) reverts
-- is_moderator changes from client sessions unless the transaction-local
-- 'vigo.admin_action' GUC is set -- only these RPCs set it, after verifying
-- the caller, and set_config(..., true) dies at transaction end. PostgREST
-- clients cannot call set_config themselves (pg_catalog is not exposed).
create function public.admin_set_user_moderator(target_user uuid, make_moderator boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_moderator();

  if target_user = auth.uid() and not make_moderator then
    raise exception 'No podés quitarte la moderación a vos mismo.';
  end if;

  -- Belt and braces: unreachable through the self-demotion guard above for
  -- moderator callers, but keeps the invariant if callers ever change.
  if not make_moderator and not exists (
    select 1 from public.profiles
    where is_moderator and id <> target_user
  ) then
    raise exception 'No se puede quitar al último moderador.';
  end if;

  perform set_config('vigo.admin_action', 'on', true);
  update public.profiles set is_moderator = make_moderator where id = target_user;

  if not found then
    raise exception 'Usuario no encontrado.';
  end if;
end;
$$;

revoke execute on function public.admin_set_user_moderator(uuid, boolean) from public;
grant execute on function public.admin_set_user_moderator(uuid, boolean) to authenticated;

-- Ban/unban a user. Banned users cannot insert content (0010) and their
-- public content is hidden from everyone except moderators (0011).
create function public.admin_set_user_banned(target_user uuid, banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_moderator();

  if target_user = auth.uid() and banned then
    raise exception 'No podés banearte a vos mismo.';
  end if;

  if banned and exists (
    select 1 from public.profiles where id = target_user and is_moderator
  ) then
    raise exception 'No se puede banear a un moderador. Quitale la moderación primero.';
  end if;

  perform set_config('vigo.admin_action', 'on', true);
  update public.profiles
  set banned_at = case when banned then now() else null end
  where id = target_user;

  if not found then
    raise exception 'Usuario no encontrado.';
  end if;
end;
$$;

revoke execute on function public.admin_set_user_banned(uuid, boolean) from public;
grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;

-- One-call listing for the moderation page: all users with content counts and
-- vehicle name. Keeps profiles RLS narrow (no is_moderator/banned_at exposure
-- to regular users beyond their own row's context).
create function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  city text,
  model text,
  is_moderator boolean,
  banned_at timestamptz,
  created_at timestamptz,
  service_count bigint,
  trip_count bigint,
  vehicle_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_moderator();

  return query
  select
    p.id,
    p.display_name,
    p.city,
    p.model,
    p.is_moderator,
    p.banned_at,
    p.created_at,
    (select count(*) from public.service_entries e where e.user_id = p.id),
    (select count(*) from public.trip_logs t where t.user_id = p.id),
    (
      select v.name
      from public.vehicle_members m
      join public.vehicles v on v.id = m.vehicle_id
      where m.user_id = p.id
    )
  from public.profiles p
  order by p.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;
