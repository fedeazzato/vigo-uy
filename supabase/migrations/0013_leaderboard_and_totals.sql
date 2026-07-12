-- Phase 6: km leaderboard + community totals for the public pages.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

-- 1. Vehicles ranked by total public km. Deliberately a plain (security
--    definer) view: it must bypass vehicles/vehicle_members RLS (anon can
--    read neither table) while exposing only safe columns -- crucially it
--    NEVER selects join_code. Only vehicles with at least one non-banned
--    member appear; only public, non-hidden trips from non-banned authors
--    count toward the totals.
create view public.vehicle_km_leaderboard as
select
  v.id as vehicle_id,
  v.name,
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
group by v.id, v.name
order by total_km desc;

grant select on public.vehicle_km_leaderboard to anon, authenticated;

-- 2. Headline numbers for the home page. security_invoker: the caller's own
--    RLS (anon policies from 0011, incl. the banned-author filter) applies.
create view public.community_totals
with (security_invoker = true) as
select
  (select count(*) from public.trip_logs where is_public and not hidden) as total_trips,
  (select coalesce(sum(distance_km), 0)::bigint from public.trip_logs where is_public and not hidden) as total_km,
  (
    select count(distinct user_id) from (
      select user_id from public.trip_logs where is_public and not hidden
      union
      select user_id from public.service_entries where is_public and not hidden
    ) contributors
  ) as contributor_count;

grant select on public.community_totals to anon, authenticated;
