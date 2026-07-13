-- Spec D4: community charging stations, reliability reports, and COMPUTED
-- cost per kWh. Stations deliberately carry no price columns — prices rot.
-- Cost figures come from what members actually paid: trip charging_stops
-- (jsonb) gain cost_uyu / energy_kwh / station_id fields client-side, and
-- charging_cost_stats averages them over a rolling 365 days per station and
-- per network.
-- Apply with `npx supabase db push`.

-- 1. Stations: one row per physical charging location. Public data by
--    nature (no is_public), not a personal event (no vehicle_id — must not
--    feed the leaderboard or consumption stats).

create table public.charging_stations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  network text not null check (network in ('ute', 'eone', 'dmc', 'evergo', 'eosvolt', 'otro')),
  city text check (char_length(city) <= 80),
  address text check (char_length(address) <= 200),
  lat numeric check (lat between -90 and 90),
  lng numeric check (lng between -180 and 180),
  connector text not null check (connector in ('Tipo 2', 'CCS2', 'GB/T', 'otro')),
  current_type text not null check (current_type in ('AC', 'DC')),
  max_power_kw numeric check (max_power_kw between 0 and 1000),
  access_notes text check (char_length(access_notes) <= 2000),
  hidden boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.charging_stations enable row level security;

create policy "anon selects visible stations"
  on public.charging_stations for select
  to anon
  using (not hidden and not public.is_user_banned(user_id));

create policy "select visible, own, or any as moderator"
  on public.charging_stations for select
  to authenticated
  using (
    auth.uid() = user_id
    or (not hidden and not public.is_user_banned(user_id))
    or public.is_active_moderator(auth.uid())
  );

create policy "users can insert their own stations"
  on public.charging_stations for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

create policy "users can update their own stations, moderators any"
  on public.charging_stations for update
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()))
  with check (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

create policy "users can delete their own stations, moderators any"
  on public.charging_stations for delete
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

create trigger limit_charging_stations_per_day
  before insert on public.charging_stations
  for each row execute function public.enforce_daily_insert_limit();

-- verified is self-assignment-protected like the content tables (0020).
create trigger protect_charging_station_verified
  before insert or update on public.charging_stations
  for each row execute function public.prevent_unauthorized_verify();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger charging_stations_updated_at
  before update on public.charging_stations
  for each row execute function public.set_updated_at();

-- 2. Reports: one row per visit outcome. Reliability signal, not pricing.
--    Immutable (no update policy) — delete own / moderator only.

create table public.station_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.charging_stations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('funciono', 'fallo', 'ocupado')),
  achieved_kw numeric check (achieved_kw between 0 and 1000),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index station_reports_station_time_idx
  on public.station_reports (station_id, created_at desc);

alter table public.station_reports enable row level security;

create policy "anon selects reports from non-banned authors"
  on public.station_reports for select
  to anon
  using (not public.is_user_banned(user_id));

create policy "select reports from non-banned authors or own"
  on public.station_reports for select
  to authenticated
  using (auth.uid() = user_id or not public.is_user_banned(user_id));

create policy "users can insert their own reports"
  on public.station_reports for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

create policy "users can delete their own reports, moderators any"
  on public.station_reports for delete
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

create trigger limit_station_reports_per_day
  before insert on public.station_reports
  for each row execute function public.enforce_daily_insert_limit();

-- 3. Views. security_invoker: the caller's own RLS filters (hidden stations,
--    banned authors) apply inside the views automatically.

create view public.station_reliability
with (security_invoker = true) as
select
  station_id,
  count(*) as report_count,
  count(*) filter (where status = 'fallo') as failure_count,
  round(count(*) filter (where status = 'fallo')::numeric / count(*), 2) as failure_ratio,
  max(created_at) as last_report_at
from public.station_reports
where created_at >= now() - interval '90 days'
group by station_id;

-- Cost per kWh, computed from real charges: stops that carry BOTH cost_uyu
-- and energy_kwh (as billed by the charger — percentage-derived energy is
-- deliberately excluded: charging losses would overstate $/kWh) and link a
-- station. Rolling 365 days by trip_date. GROUPING SETS emits per-station
-- rows plus a per-network rollup (station_id null); sample_count lets the
-- UI gate on >=3 charges. avg() per owner decision (2026-07-13); switching
-- to a median later is a view-only change.
create view public.charging_cost_stats
with (security_invoker = true) as
with charges as (
  select
    (cs->>'station_id')::uuid as station_id,
    (cs->>'cost_uyu')::numeric as cost_uyu,
    (cs->>'energy_kwh')::numeric as energy_kwh
  from public.trip_logs t,
       lateral jsonb_array_elements(t.charging_stops) cs
  where t.is_public
    and not t.hidden
    and t.trip_date >= (current_date - interval '365 days')
    and jsonb_typeof(cs->'cost_uyu') = 'number'
    and jsonb_typeof(cs->'energy_kwh') = 'number'
    and (cs->>'station_id') ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
)
select
  s.network,
  c.station_id,
  round(avg(c.cost_uyu / c.energy_kwh), 2) as avg_cost_per_kwh,
  count(*) as sample_count
from charges c
join public.charging_stations s on s.id = c.station_id
-- Sanity bounds live here because CHECK constraints can't reach inside
-- jsonb array elements.
where c.energy_kwh between 1 and 120
  and c.cost_uyu between 0 and 20000
  and c.cost_uyu / c.energy_kwh between 1 and 100
group by grouping sets ((s.network, c.station_id), (s.network));

grant select on public.station_reliability to anon, authenticated;
grant select on public.charging_cost_stats to anon, authenticated;
