-- Insurance providers (moderator-curated reference table, mirrors
-- charging_networks/0024) and community-submitted insurance quotes.
-- See specs/insurance-quotes.md.
-- Apply with `npx supabase db push`.

-- 1. Providers ----------------------------------------------------------------

create table public.insurance_providers (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);

alter table public.insurance_providers enable row level security;

create policy "insurance providers are readable by everyone"
  on public.insurance_providers for select
  to anon, authenticated
  using (true);

create policy "moderators insert insurance providers"
  on public.insurance_providers for insert
  to authenticated
  with check (public.is_active_moderator(auth.uid()));

create policy "moderators update insurance providers"
  on public.insurance_providers for update
  to authenticated
  using (public.is_active_moderator(auth.uid()))
  with check (public.is_active_moderator(auth.uid()));

-- Seed: 13 underwriters independently corroborated as active in the
-- Uruguayan auto insurance market (researched 2026-09-22, see spec Context).
-- Not a closed list -- moderators extend it with an INSERT, no migration
-- needed.
insert into public.insurance_providers (slug, name, sort_order) values
  ('bse',           'BSE (Banco de Seguros del Estado)', 10),
  ('mapfre',        'Mapfre Uruguay',                     20),
  ('sura',          'Sura Seguros',                       30),
  ('porto-seguro',  'Porto Seguro',                       40),
  ('san-cristobal', 'San Cristóbal Seguros',               50),
  ('sancor',        'Sancor Seguros',                      60),
  ('sbi',           'SBI Seguros',                         70),
  ('berkley',       'Berkley Seguros',                     80),
  ('metlife',       'MetLife Seguros',                     90),
  ('surco',         'SURCO (Compañía Cooperativa de Seguros)', 100),
  ('hdi',           'HDI Seguros',                         110),
  ('far',           'FAR Seguros',                         120),
  ('barbuss',       'Barbuss Seguros',                     130);

-- 2. Quotes ---------------------------------------------------------------

create table public.insurance_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  provider text not null references public.insurance_providers (slug),
  coverage_level text not null check (coverage_level in (
    'soa', 'terceros', 'terceros_completo',
    'todo_riesgo_franquicia', 'todo_riesgo_sin_franquicia'
  )),
  driver_count integer not null check (driver_count between 1 and 10),
  average_driver_age integer not null check (average_driver_age between 16 and 99),
  zone text not null check (zone in ('montevideo', 'area_metropolitana', 'interior')),
  hire_date date not null,
  period_years integer not null check (period_years between 1 and 5),
  -- Total cost for the whole contracted period (not per-year) -- see spec
  -- Context for why. Upper bound is 5x the single-year sanity ceiling.
  total_cost_uyu numeric not null check (total_cost_uyu between 0 and 5000000),
  -- Generated, not submitted: the per-year figure a promo-aware comparison
  -- actually needs. Postgres computes it once, authoritatively, instead of
  -- trusting client-side math or duplicating it in every reader.
  cost_per_year_uyu numeric generated always as (round(total_cost_uyu / period_years, 0)) stored,
  -- Nullable: not every coverage level carries a deductible (e.g. SOA,
  -- Terceros, Todo Riesgo sin Franquicia), and how insurers apply one to
  -- the tiers that do isn't uniform enough to enforce via CHECK against
  -- coverage_level -- left to the submitter to fill in or leave blank.
  deductible_uyu numeric check (deductible_uyu between 0 and 1000000),
  -- Free hail-storm repair is a covered-peril add-on some insurers bundle
  -- into a tier (research found it commonly included with Terceros
  -- Completo) rather than a tier of its own -- a boolean flag orthogonal
  -- to coverage_level, not a 6th coverage_level value, so it can vary
  -- independently within the same tier across insurers.
  hail_coverage boolean not null default false,
  -- Glass/windshield repair: whether it's covered at all, and if so,
  -- whether it's free/unlimited (limit null) or capped at a peso amount
  -- (limit set) -- same boolean-gates-a-nullable-amount shape as
  -- deductible_uyu, but glass coverage specifically needs the boolean
  -- because "not covered" and "covered, no cap" would otherwise both be
  -- represented as a null limit.
  glass_coverage boolean not null default false,
  glass_coverage_limit_uyu numeric check (glass_coverage_limit_uyu between 0 and 1000000),
  constraint glass_limit_requires_coverage check (glass_coverage_limit_uyu is null or glass_coverage),
  notes text check (char_length(notes) <= 500),
  is_public boolean not null default true,
  hidden boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.insurance_quotes enable row level security;

create policy "anon selects public insurance quotes"
  on public.insurance_quotes for select
  to anon
  using (is_public and not hidden and not public.is_user_banned(user_id));

create policy "select own, public, or any as moderator"
  on public.insurance_quotes for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden and not public.is_user_banned(user_id))
    or public.is_active_moderator(auth.uid())
  );

create policy "users can insert their own insurance quotes"
  on public.insurance_quotes for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

create policy "users can update their own insurance quotes, moderators any"
  on public.insurance_quotes for update
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()))
  with check (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

create policy "users can delete their own insurance quotes, moderators any"
  on public.insurance_quotes for delete
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

create trigger limit_insurance_quotes_per_day
  before insert on public.insurance_quotes
  for each row execute function public.enforce_daily_insert_limit();

create trigger set_insurance_quote_vehicle
  before insert or update on public.insurance_quotes
  for each row execute function public.set_vehicle_id_on_write();

create trigger protect_insurance_quote_verified
  before insert or update on public.insurance_quotes
  for each row execute function public.prevent_unauthorized_verify();

-- 3. Cost stats view --------------------------------------------------------
-- Windowed on hire_date, not created_at: a quote logged today for a policy
-- hired two years ago is stale pricing even though the row itself is new,
-- and a quote for a policy hired last month should count even if
-- backfilled into the app much later. 730-day (2-year) window, not 365
-- like charging_cost_stats: insurance quotes accrue far more slowly than
-- charging stops, and a policy's price is stable for at least a year, so a
-- longer rolling window is needed to keep enough samples live. Averaging
-- cost_per_year_uyu (not total_cost_uyu) is what makes 1-year and 5-year
-- policies comparable in the same average. GROUPING SETS mirrors
-- charging_cost_stats: per (provider, coverage_level) rows plus a
-- per-provider rollup (coverage_level null).

create view public.insurance_cost_stats
with (security_invoker = true) as
select
  provider,
  coverage_level,
  round(avg(cost_per_year_uyu), 0) as avg_cost_per_year_uyu,
  count(*) as sample_count
from public.insurance_quotes
where is_public
  and not hidden
  and hire_date >= (current_date - interval '730 days')
group by grouping sets ((provider, coverage_level), (provider));

grant select on public.insurance_cost_stats to anon, authenticated;
