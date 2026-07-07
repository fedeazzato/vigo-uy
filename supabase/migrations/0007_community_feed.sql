-- Phase 4: community feed + moderation support.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

-- 1. RLS fix: moderators need to SELECT public rows even after hiding them
--    (the original select policy only exposed is_public + not-hidden rows to
--    non-owners, so a moderator who hides a row would immediately lose the
--    ability to see and un-hide it). Moderators can now see any public row
--    regardless of hidden state, but still can't see fully private rows
--    unless they own them.

drop policy "select own entries, or public+non-hidden entries" on public.service_entries;
create policy "select own, public+non-hidden, or moderator on public rows"
  on public.service_entries for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden)
    or (is_public and exists (select 1 from public.profiles where id = auth.uid() and is_moderator))
  );

drop policy "select own trip logs, or public+non-hidden trip logs" on public.trip_logs;
create policy "select own, public+non-hidden, or moderator on public trip logs"
  on public.trip_logs for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden)
    or (is_public and exists (select 1 from public.profiles where id = auth.uid() and is_moderator))
  );

-- 2. Aggregation views for the community feed's stat cards. security_invoker
--    makes the view run with the querying user's own permissions, so the
--    underlying tables' RLS still applies -- these views never bypass RLS.

create view public.service_cost_stats_by_city
with (security_invoker = true) as
select
  city,
  count(*) as entry_count,
  avg(cost_uyu) as avg_cost_uyu
from public.service_entries
where is_public and not hidden and city is not null
group by city;

create view public.trip_stats_by_model
with (security_invoker = true) as
select
  model,
  count(*) as trip_count,
  avg(distance_km) as avg_distance_km,
  avg(average_speed_kmh) as avg_speed_kmh
from public.trip_logs
where is_public and not hidden and model is not null
group by model;

grant select on public.service_cost_stats_by_city to authenticated;
grant select on public.trip_stats_by_model to authenticated;
