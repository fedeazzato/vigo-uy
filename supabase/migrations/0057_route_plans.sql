-- Route plans with charging stops (specs/route-plans.md, PLAN.md B3). NOT APPLIED YET.
--
-- A plan is computed in the browser (OSRM route + WikiVigo stations + range from community consumption). Sharing does not
-- need this table at all: the share link carries the inputs (#/rutas/planificar?o=..&d=..&soc=..) and recomputes. This
-- table only lets a signed-in user keep "Mis planes" across devices, with a snapshot of the result so the list renders
-- without re-routing. Private, own-row only: no anon surface, no public read.
--
-- Apply with `npx supabase db push`, then `npm run gen:types`.

create table if not exists public.route_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  origin text not null check (char_length(origin) between 1 and 120),
  destination text not null check (char_length(destination) between 1 and 120),
  model text check (model in ('E2', 'E2+')),
  start_soc integer not null check (start_soc between 5 and 100),
  min_arrival_soc integer not null check (min_arrival_soc between 0 and 50),
  consumption_kwh_100km numeric not null check (consumption_kwh_100km between 5 and 40),
  -- Snapshot of the computed plan: { distance_km, stops: [{ station_id, name, km, arrival_soc, departure_soc }],
  -- arrival_soc }. Display only; the plan page always recomputes from the inputs.
  snapshot jsonb not null default '{}'::jsonb check (pg_column_size(snapshot) <= 16384),
  created_at timestamptz not null default now()
);

create index if not exists route_plans_user_idx on public.route_plans (user_id, created_at desc);

alter table public.route_plans enable row level security;

create policy "own route plans: select"
  on public.route_plans for select to authenticated
  using (auth.uid() = user_id);

create policy "own route plans: insert"
  on public.route_plans for insert to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

create policy "own route plans: delete"
  on public.route_plans for delete to authenticated
  using (auth.uid() = user_id);

-- 20 per day per user, same generic guard as every other user table (also rejects banned users).
create trigger limit_route_plans_per_day
  before insert on public.route_plans
  for each row execute function public.enforce_daily_insert_limit();

revoke all on public.route_plans from anon;
grant select, insert, delete on public.route_plans to authenticated;
