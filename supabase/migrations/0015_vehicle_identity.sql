-- Phase 6 follow-up: vehicles have no name; members label them.
-- Vehicles don't need a public name -- people may be willing to record their
-- plate number, but not to share it. So: drop vehicles.name, add an optional
-- `plate` that is only ever visible to the vehicle's own members (the
-- members-only RLS from 0012 already covers it; the leaderboard view below
-- never selects it). Public labels are derived from member display names.
-- Also adds remove_vehicle_member so a vehicle's creator can remove a member
-- without SQL access.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

-- 1. Column swap (the leaderboard view depends on name, so it goes first).

drop view public.vehicle_km_leaderboard;

alter table public.vehicles drop column name;
alter table public.vehicles add column plate text;

create view public.vehicle_km_leaderboard as
select
  v.id as vehicle_id,
  coalesce(sum(t.distance_km), 0)::bigint as total_km,
  count(t.id) as trip_count,
  (
    select coalesce(array_agg(p.display_name order by p.display_name), '{}')
    from public.vehicle_members m
    join public.profiles p on p.id = m.user_id
    where m.vehicle_id = v.id and p.banned_at is null
  ) as member_names
from public.vehicles v
left join public.trip_logs t
  on t.vehicle_id = v.id
 and t.is_public
 and not t.hidden
 and not public.is_user_banned(t.user_id)
where exists (
  select 1
  from public.vehicle_members m
  join public.profiles p on p.id = m.user_id
  where m.vehicle_id = v.id and p.banned_at is null
)
group by v.id
order by total_km desc;

grant select on public.vehicle_km_leaderboard to anon, authenticated;

-- 2. Vehicle-creating functions no longer set a name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_vehicle_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));

  insert into public.vehicles (join_code, created_by)
  values (public.generate_join_code(), new.id)
  returning id into new_vehicle_id;

  insert into public.vehicle_members (vehicle_id, user_id)
  values (new_vehicle_id, new.id);

  return new;
end;
$$;

create or replace function public.reset_my_vehicle()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  old_vehicle_id uuid;
  new_vehicle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'No autorizado.';
  end if;

  select vehicle_id into old_vehicle_id
  from public.vehicle_members
  where user_id = auth.uid();

  delete from public.vehicle_members where user_id = auth.uid();

  insert into public.vehicles (model, color, join_code, created_by)
  values (me.model, me.color, public.generate_join_code(), auth.uid())
  returning id into new_vehicle_id;

  insert into public.vehicle_members (vehicle_id, user_id)
  values (new_vehicle_id, auth.uid());

  perform public.cleanup_orphan_vehicle(old_vehicle_id);
  return new_vehicle_id;
end;
$$;

-- 3. The vehicle's creator can remove another member. The removed member
--    gets a fresh vehicle of their own so the one-membership-per-user
--    invariant (and vehicle attribution of their future trips) holds.

create function public.remove_vehicle_member(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_vehicle_id uuid;
  vehicle_creator uuid;
  target_profile public.profiles;
  new_vehicle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if target_user = auth.uid() then
    raise exception 'Para salir del vehículo usá "Volver a mi propio vehículo".';
  end if;

  select vehicle_id into my_vehicle_id
  from public.vehicle_members
  where user_id = auth.uid();

  select created_by into vehicle_creator
  from public.vehicles
  where id = my_vehicle_id;

  if my_vehicle_id is null or vehicle_creator is distinct from auth.uid() then
    raise exception 'Solo quien creó el vehículo puede quitar integrantes.';
  end if;

  if not exists (
    select 1 from public.vehicle_members
    where vehicle_id = my_vehicle_id and user_id = target_user
  ) then
    raise exception 'Ese usuario no es integrante de tu vehículo.';
  end if;

  select * into target_profile from public.profiles where id = target_user;

  delete from public.vehicle_members where user_id = target_user;

  insert into public.vehicles (model, color, join_code, created_by)
  values (target_profile.model, target_profile.color, public.generate_join_code(), target_user)
  returning id into new_vehicle_id;

  insert into public.vehicle_members (vehicle_id, user_id)
  values (new_vehicle_id, target_user);
end;
$$;

revoke execute on function public.remove_vehicle_member(uuid) from public, anon;
grant execute on function public.remove_vehicle_member(uuid) to authenticated;

-- 4. admin_list_users: vehicle_name no longer exists; report how many people
--    share the user's vehicle instead. Return type changes, so drop first.

drop function public.admin_list_users();

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
  vehicle_member_count bigint
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
      select count(*)
      from public.vehicle_members m2
      where m2.vehicle_id = (
        select m.vehicle_id from public.vehicle_members m where m.user_id = p.id
      )
    )
  from public.profiles p
  order by p.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- 5. Belt and braces from the 0011 verification: Supabase's default
--    privileges grant EXECUTE to anon independently of PUBLIC, so strip anon
--    from the user RPCs explicitly (their internal auth.uid() checks are the
--    real boundary either way).

revoke execute on function public.join_vehicle_by_code(text) from anon;
revoke execute on function public.reset_my_vehicle() from anon;
revoke execute on function public.admin_set_user_moderator(uuid, boolean) from anon;
revoke execute on function public.admin_set_user_banned(uuid, boolean) from anon;
