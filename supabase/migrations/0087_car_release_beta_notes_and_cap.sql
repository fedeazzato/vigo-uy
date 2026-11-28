-- Car releases (specs/car-updates.md "Novedades" and "Alcance al publicar"; owner request 2026-11-28).
--
-- 1. car_release_notes also lists BETA releases for beta testers (members of a beta vehicle) and moderators, and says each
--    row's channel. Everyone else, signed out included, still gets stable only. Same public columns as 0072: never the rollout
--    salt, the signature, the download folder or any car. The release text itself is read by the page from the public GitHub
--    release r<serial>.
-- 2. admin_publish_car_release takes the reach limit (rollout_cap) too, so publishing and limiting are one step: no moment in
--    which a release is out without its limit. null = no limit, 0 = paused, n = at most n % (never above the signed percent;
--    beta cars take any release, as before).
--
-- Apply with `npx supabase db push`, then `npm run gen:types`.

-- 1. Notes ---------------------------------------------------------------------------------------------------------------------

drop function if exists public.car_release_notes(integer);          -- the return type gains a column

create function public.car_release_notes(p_limit integer default 30)
returns table (serial bigint, published_at timestamptz, note text, apps jsonb, notices jsonb, channel text)
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
                   where f[1] = 'notice' and array_length(f, 1) = 4), '[]'::jsonb) as notices,
         r.channel
  from public.car_releases r
  where not r.is_kill
    and (r.channel = 'stable'
         or (auth.uid() is not null
             and (public.is_active_moderator(auth.uid())
                  or exists (select 1 from public.car_update_beta b
                             where b.vehicle_id = public.current_user_vehicle_id()))))
  order by r.serial desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

comment on function public.car_release_notes(integer) is
  'D1: "Novedades" list of car releases (serial, date, note, app versions, Google notices, channel). Anon by design: stable only; beta rows only for beta testers and moderators.';

revoke execute on function public.car_release_notes(integer) from public;
grant execute on function public.car_release_notes(integer) to anon, authenticated;

-- 2. Publish with the limit ----------------------------------------------------------------------------------------------------

-- The 5-argument function goes (two overloads would be ambiguous for a call without p_cap); calls without p_cap still work.
drop function if exists public.admin_publish_car_release(text, text, text, text, text);

create function public.admin_publish_car_release(
  p_channel text, p_manifest text, p_signature text, p_download_base text, p_note text default null,
  p_cap smallint default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_car_release_publisher(auth.uid()) then
    raise exception 'solo el responsable de las versiones puede publicar';
  end if;
  if p_cap is not null and (p_cap < 0 or p_cap > 100) then
    raise exception 'porcentaje inválido';
  end if;
  v_id := public.admin0059_publish_car_release(p_channel, p_manifest, p_signature, p_download_base, p_note);
  if p_cap is not null then
    update public.car_releases set rollout_cap = p_cap where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.admin_publish_car_release(text, text, text, text, text, smallint) from public, anon;
grant execute on function public.admin_publish_car_release(text, text, text, text, text, smallint) to authenticated;
