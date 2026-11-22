-- Car diagnostics: whose car is each report (owner OK 2026-11-22; specs/car-diagnostics.md R3).
-- Moderators read every vehicle's diagnostics (0051) but RLS hides other vehicles' members and profiles, so the page could only
-- name cars that appear on the public km leaderboard. This function returns the display names of the non-banned members of the
-- given vehicles, ONLY for vehicles that have at least one diagnostic report the caller may read (can_read_car_diagnostic).
-- No other columns (no email, plate or ids of users) leave the function.

create or replace function public.car_diagnostic_vehicle_labels(p_ids uuid[])
returns table (vehicle_id uuid, member_names text[])
language sql
stable
security definer
set search_path = public
as $$
  select vm.vehicle_id,
         array_agg(p.display_name order by vm.joined_at, p.display_name) as member_names
  from public.vehicle_members vm
  join public.profiles p on p.id = vm.user_id
  where vm.vehicle_id = any (coalesce(p_ids, '{}'::uuid[]))
    and p.banned_at is null
    and public.can_read_car_diagnostic(vm.vehicle_id)
    and exists (select 1 from public.car_diagnostics d where d.vehicle_id = vm.vehicle_id)
  group by vm.vehicle_id;
$$;

revoke execute on function public.car_diagnostic_vehicle_labels(uuid[]) from public, anon;
grant execute on function public.car_diagnostic_vehicle_labels(uuid[]) to authenticated;
