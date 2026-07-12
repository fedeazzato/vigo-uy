-- Leaderboard fix: don't list vehicles with no tracked kilometers.
-- Every user gets a vehicles row on signup, so the ranking was padded with
-- 0 km entries (people who never logged a trip). Same definition as 0015,
-- plus a HAVING clause that keeps only vehicles with at least one counted
-- kilometer. Columns are unchanged, so create or replace works and existing
-- grants (anon + authenticated) are preserved.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Re-run note: safely re-runnable (create or replace).

create or replace view public.vehicle_km_leaderboard as
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
having coalesce(sum(t.distance_km), 0) > 0
order by total_km desc;
