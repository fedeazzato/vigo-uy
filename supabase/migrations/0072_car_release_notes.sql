-- D1 "Update notices" gap (specs/car-updates.md, section "Novedades"): a page listing what each published release brings. The car
-- already learns of a release from the signed manifest (updater) and shows "Actualización disponible" in Mi Vigo 2.9; what was
-- missing is a human-readable list per release. This function is the only read of car_releases outside moderators: STABLE channel,
-- not kill manifests, and only the public parts (serial, publish date, the moderator's note, and the app / notice lines parsed from
-- the signed text: package, versionName, label). Never the rollout salt, the signature, the download folder or any car.
--
-- NEW ANON SURFACE (by design, owner OK required, decision O-N1 in the spec): executable by anon so the page also works signed out
-- (owners check "qué hay de nuevo" before installing). Revoke anon to make it members-only.
--
-- NOT APPLIED (owner OK required). Needs 0059. Apply with `npx supabase db push`, then `npm run gen:types`.

create or replace function public.car_release_notes(p_limit integer default 30)
returns table (serial bigint, published_at timestamptz, note text, apps jsonb, notices jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select r.serial,
         r.created_at as published_at,
         r.note,
         coalesce((select jsonb_agg(jsonb_build_object('package', f[2], 'version', f[4]) order by f[2])
                   from (select string_to_array(l, ' ') as f
                         from unnest(string_to_array(r.manifest, E'\n')) as l) x
                   where f[1] = 'app' and array_length(f, 1) = 5), '[]'::jsonb) as apps,
         coalesce((select jsonb_agg(jsonb_build_object('package', f[2], 'label', replace(f[4], '_', ' ')) order by f[2])
                   from (select string_to_array(l, ' ') as f
                         from unnest(string_to_array(r.manifest, E'\n')) as l) x
                   where f[1] = 'notice' and array_length(f, 1) = 4), '[]'::jsonb) as notices
  from public.car_releases r
  where r.channel = 'stable' and not r.is_kill
  order by r.serial desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

comment on function public.car_release_notes(integer) is
  'D1: public "Novedades" list of stable car releases (serial, date, note, app versions, Google notices). Anon by design.';

revoke execute on function public.car_release_notes(integer) from public;
grant execute on function public.car_release_notes(integer) to anon, authenticated;
