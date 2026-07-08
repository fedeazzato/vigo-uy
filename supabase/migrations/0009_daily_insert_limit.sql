-- Phase 5: basic anti-spam. Caps how many service_entries/trip_logs rows a
-- single user can insert per rolling 24-hour window. 20/day is far above any
-- legitimate logging pace and just stops a compromised or malicious account
-- from flooding the community feed.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

create function public.enforce_daily_insert_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_per_day constant integer := 20;
  recent_count integer;
begin
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

create trigger limit_service_entries_per_day
  before insert on public.service_entries
  for each row execute function public.enforce_daily_insert_limit();

create trigger limit_trip_logs_per_day
  before insert on public.trip_logs
  for each row execute function public.enforce_daily_insert_limit();
