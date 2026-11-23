-- Only the maintainer may publish, pause or limit car releases and mark beta cars (owner decision 2026-11-23, updater O3/"only me").
-- Moderators keep READ access to the per-car update status (admin_list_car_updates is unchanged).
-- The publisher list is filled outside migrations (no account id in the public repo):
--   insert into public.car_release_publishers (user_id) values ('<uuid>');
create table if not exists public.car_release_publishers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.car_release_publishers enable row level security;   -- no policies: only the definer functions below read it
revoke all on public.car_release_publishers from public, anon, authenticated;

create or replace function public.is_car_release_publisher(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_moderator(uid) and exists (select 1 from public.car_release_publishers where user_id = uid);
$$;
revoke execute on function public.is_car_release_publisher(uuid) from public, anon;
grant execute on function public.is_car_release_publisher(uuid) to authenticated;

-- Re-check in the three write functions: wrap them so the new rule runs first, then the 0059 body.
do $$
declare f text;
begin
  foreach f in array array[
    'admin_publish_car_release(text, text, text, text, text)',
    'admin_set_car_release_cap(uuid, smallint)',
    'admin_set_car_beta(uuid, boolean)'] loop
    execute format('alter function public.%s rename to %s', f, replace(split_part(f, '(', 1), 'admin_', 'admin0059_'));
    execute format('revoke execute on function public.%s from public, anon, authenticated',
      replace(split_part(f, '(', 1), 'admin_', 'admin0059_') || '(' || split_part(f, '(', 2));
  end loop;
end $$;

create or replace function public.admin_publish_car_release(
  p_channel text, p_manifest text, p_signature text, p_download_base text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_car_release_publisher(auth.uid()) then raise exception 'solo el responsable de las versiones puede publicar'; end if;
  return public.admin0059_publish_car_release(p_channel, p_manifest, p_signature, p_download_base, p_note);
end; $$;

create or replace function public.admin_set_car_release_cap(p_release uuid, p_cap smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_car_release_publisher(auth.uid()) then raise exception 'solo el responsable de las versiones puede cambiar el alcance'; end if;
  perform public.admin0059_set_car_release_cap(p_release, p_cap);
end; $$;

create or replace function public.admin_set_car_beta(p_vehicle uuid, p_beta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_car_release_publisher(auth.uid()) then raise exception 'solo el responsable de las versiones puede marcar autos beta'; end if;
  perform public.admin0059_set_car_beta(p_vehicle, p_beta);
end; $$;

revoke execute on function public.admin_publish_car_release(text, text, text, text, text) from public, anon;
grant execute on function public.admin_publish_car_release(text, text, text, text, text) to authenticated;
revoke execute on function public.admin_set_car_release_cap(uuid, smallint) from public, anon;
grant execute on function public.admin_set_car_release_cap(uuid, smallint) to authenticated;
revoke execute on function public.admin_set_car_beta(uuid, boolean) from public, anon;
grant execute on function public.admin_set_car_beta(uuid, boolean) to authenticated;
