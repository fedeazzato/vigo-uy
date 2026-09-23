# Insurance providers, coverage levels, and community quotes

## Context

`/costos`'s "Seguro" section (`CostsPage.tsx:225-236`) is currently a single
static blurb transcribed from the WhatsApp group (`costs.json.insurance`):
a price range, a disclaimer, and a flat list of insurer names as strings. It
carries no structure — no per-provider breakdown, no coverage-level
distinction, and no way to see how price actually varies with the things
that drive it (how many people drive the car, their average age, and where
it mostly circulates).

This spec replaces that with a real submission flow: users log their actual
insurance quotes/policies (provider, coverage level, driver count, average
driver age, circulation zone, hire date, contracted period, and total
cost — with cost-per-year computed automatically), and the page shows
both an aggregated comparison and the individual submissions, the same
two-layer shape `/carga` already uses for charging costs (D4,
`specs/D4-charging-stations.md`; provider-averages built on top in
`specs/charging-cost-provider-averages-and-station-linking.md`).

**Why a reference table for providers, not free text.** A pricing matrix
with 5 input dimensions (provider × coverage × driver count × age × zone)
only stays comparable if provider/coverage naming doesn't fragment into
"BSE" vs "Banco de Seguros del Estado" vs "bse seguros". `charging_networks`
(0024) solved the identical problem for charging providers: a small
moderator-managed table, seeded once, extensible later via `INSERT` — no
migration needed to add a provider. Coverage level, by contrast, is a small,
stable, industry-wide set of tiers with no provider-specific metadata worth
a table (same reasoning `charging_stations.connector`/`current_type` used a
`CHECK` enum instead of a table) — it's a fixed `CHECK` constraint, not a
second reference table.

**Provider seed data.** Researched from public sources (owner-approved
2026-09-22, see conversation): 13 underwriters independently corroborated as
active in the Uruguayan auto insurance market — BSE, Mapfre, Sura, Porto
Seguro, San Cristóbal, Sancor, SBI, Berkley, MetLife, SURCO, HDI, FAR, and
Barbuss. (Zurich Santander, ACU, and OCA turned up in the same research but
were dropped by owner decision — ACU/OCA's status as risk-carrying
underwriters vs. resellers of another insurer's policy was unclear.) Not a
closed list: moderators extend it via `INSERT`, same as `charging_networks`.
Note `costs.json`'s current `insurers` list ("ACAU", "MAPFRE", "Aseguradora
Basan") is informal WhatsApp-group text, not necessarily the same set — that
curated list stays as-is until the D1 gate below flips it off; the two
lists are not required to match.

**Coverage levels.** Five tiers, generic industry terminology rather than
per-company branded plan names (branded names couldn't be verified reliably
— see conversation): SOA, Responsabilidad Civil (Terceros), Terceros
Completo, Todo Riesgo con Franquicia, Todo Riesgo sin Franquicia.

**Zone.** Coarse fixed enum (owner decision, this conversation), not the
`CityCombobox` free-text pattern used elsewhere — insurers themselves mostly
price by capital-vs-interior rather than by city, and a fixed 3-value enum
keeps zone-level aggregation meaningful at small sample sizes: Montevideo,
Área Metropolitana (Canelones/San José), Interior.

**Attribution.** Tied to `vehicle_id` (owner decision, this conversation),
forced server-side by the same `set_vehicle_id_on_write()` trigger
`service_entries`/`trip_logs` already use (0012) — the client never sends
it, and reattribution across families is impossible by construction.

**Cost is captured as (total, period), not a hand-amortized annual
figure.** Some insurers run multi-year promotions (e.g. pay 2 years, get a
3rd free) — a raw invoice amount from a promo year isn't comparable to a
regular year's cost from another provider. Rather than asking the submitter
to do that math themselves (error-prone, ambiguous, unverifiable), the form
captures what they can state as plain fact — `hire_date` (when the policy
started), `period_years` (the contracted term, 1-5), and `total_cost_uyu`
(what the whole period actually costs/cost) — and the per-year figure is a
generated column, `cost_per_year_uyu = round(total_cost_uyu / period_years,
0)`, computed by Postgres and shown next to the raw total everywhere a quote
is displayed. A 3-for-2 promo falls out correctly on its own: total cost of
2 years' premium ÷ a 3-year period.

**Why aggregation is provider+coverage only, not the full 5-dimension
cross-tab.** With a community this size, grouping by all five submitted
dimensions at once would almost never clear a minimum-sample threshold —
every bucket would be its own island. `charging_cost_stats`'s
`GROUPING SETS` rollup (station-level + network-level) is the precedent:
aggregate at the two granularities that will actually accumulate samples
(per provider+coverage, and per provider overall), and let the individual
quote list — which does carry all 5 dimensions per row — be where a reader
eyeballs the effect of driver count/age/zone directly, the same way
`/costos`' service-entry list already works today.

## Requirements

### 1. Migration: `insurance_providers`, `insurance_quotes`, `insurance_cost_stats`

New file `supabase/migrations/0043_insurance_quotes.sql`:

- **`insurance_providers`** (mirrors `charging_networks`, 0024):
  ```sql
  create table public.insurance_providers (
    slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
    name text not null check (char_length(name) between 1 and 60),
    sort_order smallint not null default 100,
    created_at timestamptz not null default now()
  );
  ```
  RLS: `select` open to `anon, authenticated`; `insert`/`update` gated by
  `public.is_active_moderator(auth.uid())`. No `delete` policy (moderators
  retire a provider by leaving it out of new quotes, same as networks).
  Seed 13 rows (`sort_order` 10-130 in this order):
  `bse`/BSE (Banco de Seguros del Estado), `mapfre`/Mapfre Uruguay,
  `sura`/Sura Seguros, `porto-seguro`/Porto Seguro,
  `san-cristobal`/San Cristóbal Seguros, `sancor`/Sancor Seguros,
  `sbi`/SBI Seguros, `berkley`/Berkley Seguros, `metlife`/MetLife Seguros,
  `surco`/SURCO (Compañía Cooperativa de Seguros), `hdi`/HDI Seguros,
  `far`/FAR Seguros, `barbuss`/Barbuss Seguros.

- **`insurance_quotes`** (mirrors `service_entries` + the `charging_stations`
  RLS/trigger stack):
  ```sql
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
  ```
  RLS (current-convention shape, i.e. `charging_stations`'
  `is_user_banned`-aware version, not the older `service_entries` one):
  - `anon` select: `not hidden and is_public and not public.is_user_banned(user_id)`.
  - `authenticated` select: own rows, or `(is_public and not hidden and not
    is_user_banned(user_id))`, or moderator.
  - `authenticated` insert: `auth.uid() = user_id and not
    is_user_banned(auth.uid())`.
  - `authenticated` update/delete: own row or moderator.
  Triggers: `limit_insurance_quotes_per_day` (existing
  `enforce_daily_insert_limit()`), `set_insurance_quote_vehicle` (existing
  `set_vehicle_id_on_write()`), `protect_insurance_quote_verified` (existing
  `prevent_unauthorized_verify()`).

- **`insurance_cost_stats`** view (mirrors `charging_cost_stats`'
  `GROUPING SETS` shape):
  ```sql
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
  ```
  Windowed on `hire_date`, not `created_at`: a quote logged today for a
  policy hired two years ago is stale pricing even though the row itself is
  new, and a quote for a policy hired last month should count even if
  backfilled into the app much later. 730-day (2-year) window, not 365 like
  charging: insurance quotes accrue far more slowly than charging stops,
  and a policy's price is stable for at least a year, so a longer rolling
  window is needed to keep enough samples live. Averaging `cost_per_year_uyu`
  (not `total_cost_uyu`) is what makes 1-year and 5-year policies
  comparable in the same average. `grant select ... to anon, authenticated;`
  like the charging views.

### 2. Types (`src/types.ts`)

- `InsuranceCoverageLevel` union (the 5 slugs above) and a
  `INSURANCE_COVERAGE_LABELS: Record<InsuranceCoverageLevel, string>` map
  (Spanish display labels, per Context).
- `InsuranceZone` union (`montevideo` / `area_metropolitana` / `interior`)
  and `INSURANCE_ZONE_LABELS` map.
- `InsuranceProvider` — matches the generated `insurance_providers` row
  shape (alias of `Tables<'insurance_providers'>`, per CLAUDE.md's DB-backed
  type convention).
- `InsuranceQuote` — alias of `Tables<'insurance_quotes'>` (includes the
  generated `cost_per_year_uyu`, which the generated types pick up as a
  normal readonly numeric column).
- `InsuranceCostStat` — matches the view's row shape (`provider`,
  `coverage_level` both nullable per the `GROUPING SETS` rollup row, like
  `ChargingCostStat.station_id`; `avg_cost_per_year_uyu`, `sample_count`).
- Regenerate `src/lib/database.types.ts` via `npm run gen:types` after the
  migration is applied (CLAUDE.md standing instruction).

### 3. `src/lib/communityData.ts`

- `fetchInsuranceProviders()`, `fetchInsuranceQuotes(limit)`,
  `fetchInsuranceCostStats()` — same TTL-cached, `supabase`-null-guarded
  shape as the existing charging/service fetchers.
- `MIN_INSURANCE_SAMPLES = 3` (mirrors `MIN_COST_SAMPLES`), exported.
- `insuranceCostStatsByProvider(stats, providers)` — pure helper: filters to
  provider-only rollup rows (`coverage_level === null`) at
  `sample_count >= MIN_INSURANCE_SAMPLES`, joins to `InsuranceProvider` by
  slug, sorted ascending by `avg_cost_per_year_uyu` (cheapest first, same
  reasoning as `networkCostStats`).
- `insuranceCostStatsByProviderAndCoverage(stats, providers)` — same shape,
  filtered to `coverage_level !== null` rows instead.

### 4. `/costos` page (`src/pages/CostsPage.tsx`)

- Fetch `fetchInsuranceProviders()`, `fetchInsuranceQuotes(50)`,
  `fetchInsuranceCostStats()` alongside the existing community fetches.
- D1 gate, same pattern as `realCases`/`service_entries`:
  `preferCommunity({ curated: insurance, community: quotes, minSamples: 5
  })`. Below threshold: render today's static blurb unchanged. At/above:
  replace it with —
  - A "Promedio por aseguradora" table (provider name + `$X/año` + sample
    count), gated per-row at `MIN_INSURANCE_SAMPLES`.
  - A "Promedio por cobertura" breakdown using the provider+coverage rollup.
  - A list of the 10 most recent individual quotes (`verifiedFirst(...).
    slice(0, 10)`, matching the service-entries list), each row showing
    provider, coverage level label, driver count, average age, zone label,
    hire date, cost as `$total (N años) → $porAño/año` (both figures
    together, not just the per-year one), and, when present, "Franquicia
    $X" (omitted entirely for rows with no `deductible_uyu` rather than
    showing "Franquicia: —"). Rows with `hail_coverage` true get a small
    "🧊 Granizo sin cargo" badge; `false` rows show nothing (silence, not a
    "sin granizo" negative badge, matching the deductible-omission
    convention). Rows with `glass_coverage` true get a "🪟 Cristales sin
    cargo" badge, or "🪟 Cristales hasta $X" when `glass_coverage_limit_uyu`
    is also set; `false` rows show nothing, same silent-omission convention
    — this is where the growing dimension detail is actually visible.
  - A "Registrar mi seguro" link to `/costos/seguro/nuevo`.

### 5. New submission page: `src/pages/NewInsuranceQuotePage.tsx`

Mirrors `NewServiceEntryPage.tsx` structure (`EntryFormShell`,
`useEntrySubmit`, edit-mode load-by-id): provider `<select>` (from
`fetchInsuranceProviders()`), coverage level `<select>` (from
`INSURANCE_COVERAGE_LABELS`), driver count number input, average driver age
number input, zone `<select>` (from `INSURANCE_ZONE_LABELS`), hire date
input (`type="date"`, same `todayIsoDate()`/`validateIsoDate()` pattern as
`service-date`), period `<select>` 1-5 años, and total cost input — labeled
"Costo total del período". Next to the total-cost/period inputs, a small
live-computed, non-submitted preview: *"= $X/año"*, recalculated
client-side from `total_cost_uyu / period_years` as the user types (purely
a preview — the server's generated `cost_per_year_uyu` is what's actually
stored and is not sent by the client). An optional deductible input —
"Franquicia (UYU)" — with a hint: *"Dejalo vacío si tu cobertura no tiene
franquicia."*; empty submits `null`. A checkbox — "Incluye reparación de
granizo sin cargo" — defaulting unchecked, for `hail_coverage`. A second
checkbox — "Incluye reparación de cristales (parabrisas, etc.)" — for
`glass_coverage`, which when checked reveals an optional "Límite de
cobertura (UYU)" input with a hint: *"Dejalo vacío si es sin cargo / sin
límite."*; unchecking the box clears and hides that input (so an unchecked
box can never submit a limit, satisfying the DB's
`glass_limit_requires_coverage` constraint by construction rather than by
a separate client-side check). `NotesField`, `ShareCheckbox`.
`useEntrySubmit('seguro')` (new `SavedFlag` member).

### 6. Routing, dashboard, and the "Registrar" sheet

- `src/App.tsx`: `costos/seguro/nuevo` and `costos/seguro/:id/editar` routes
  → `NewInsuranceQuotePage` (lazy-loaded like the other entry pages).
- `src/lib/useEntrySubmit.ts`: add `'seguro'` to `SavedFlag`.
- `src/pages/DashboardPage.tsx`: a 4th "Mi actividad" section, "Seguros",
  mirroring "Costos de service" exactly — fetch own `insurance_quotes`,
  list with Editar/Eliminar, CSV export (`exportInsuranceCsv`), `+ Nueva
  entrada` link to `/costos/seguro/nuevo`, `SAVED_MESSAGES.seguro`.
- `src/components/Layout.tsx`: 4th link in the "¿Qué querés registrar?"
  sheet — "Un seguro" / "Aseguradora, cobertura y costo anual" / 🛡️ icon →
  `/costos/seguro/nuevo`.

### Out of scope

- Editing/retiring `insurance_providers` from the UI — moderator-only via
  direct `INSERT`/`UPDATE` (or a future admin RPC, not this spec), same as
  `charging_networks` today.
- A `$/km`-style unit conversion — not applicable to insurance.
- Verifying submitted quotes against real policy documents — `verified` is
  the same self-reported-but-moderator-flaggable signal used everywhere
  else in the app, not a claims-verification system.
- Per-provider coverage-level catalogs (i.e. which tiers a given provider
  actually sells) — the 5 tiers are offered uniformly in the form regardless
  of selected provider; no provider↔tier mapping table.

## Files to touch

- `supabase/migrations/0043_insurance_quotes.sql` — new.
- `src/lib/database.types.ts` — regenerate (`npm run gen:types`).
- `src/types.ts` — `InsuranceCoverageLevel`, `InsuranceZone`,
  `INSURANCE_COVERAGE_LABELS`, `INSURANCE_ZONE_LABELS`, `InsuranceProvider`,
  `InsuranceQuote`, `InsuranceCostStat`.
- `src/lib/communityData.ts` — fetchers, `MIN_INSURANCE_SAMPLES`,
  `insuranceCostStatsByProvider`, `insuranceCostStatsByProviderAndCoverage`.
- `src/lib/communityData.test.ts` — tests for the two new pure helpers.
- `src/lib/useEntrySubmit.ts` — `SavedFlag` gains `'seguro'`.
- `src/pages/CostsPage.tsx` — fetch + render the new Seguro section,
  D1-gated.
- `src/pages/CostsPage.test.tsx` (or equivalent) — gate behavior.
- New `src/pages/NewInsuranceQuotePage.tsx` + a colocated test file.
- `src/pages/DashboardPage.tsx` — Seguros section, CSV export,
  `SAVED_MESSAGES.seguro`.
- `src/components/Layout.tsx` — 4th register-sheet link.
- `src/App.tsx` — new routes, lazy import.
- `specs/CONTENT-MIGRATION.md` — new row: `costs.json (insurance)` →
  `insurance_quotes` → `≥5 public entries` → gated.

## Test plan

`src/lib/communityData.test.ts`:
- `insuranceCostStatsByProvider`: keeps only `coverage_level === null` rows
  at/above `MIN_INSURANCE_SAMPLES`, drops thinner ones, joins to
  `InsuranceProvider` by slug (skips unmatched slugs), sorts ascending by
  `avg_cost_per_year_uyu`.
- `insuranceCostStatsByProviderAndCoverage`: same, for
  `coverage_level !== null` rows.
- Fetchers resolve to empty arrays/`null` error when `supabase` is
  unconfigured, matching every other fetcher's null-guard convention.

`src/pages/CostsPage.test.tsx`:
- Below 5 public quotes: static `insurance` blurb from `costs.json` still
  renders; below-threshold community stats/list don't replace it.
- At/above 5: the curated blurb is replaced by the aggregated tables and
  quote list; each quote row shows provider name, coverage level label,
  driver count, average age, zone label, hire date, and both the total
  cost and the computed per-year cost; a row with `deductible_uyu` set
  shows "Franquicia $X", a row with it `null` shows no deductible line at
  all; a row with `hail_coverage: true` shows the hail badge, `false` shows
  no badge (not a "no incluye" negative badge); a row with `glass_coverage:
  true` and a `glass_coverage_limit_uyu` shows "Cristales hasta $X", `true`
  with no limit shows "Cristales sin cargo", `false` shows no glass badge.

`src/pages/NewInsuranceQuotePage.test.tsx`:
- Required-field validation (provider, coverage level, driver count in
  range, average age in range, zone, valid hire date, period 1-5, total
  cost) surfaces `FormError` without submitting; deductible, hail coverage,
  and glass coverage are not part of this check (all optional, the two
  booleans default `false`).
- The glass-coverage limit input only renders while its checkbox is
  checked; unchecking it after entering a value clears the stored value too
  (not just hides the input).
- The live per-year preview recomputes as `total_cost_uyu`/`period_years`
  change (e.g. 150000 over 3 años → shows "$50.000/año") and is absent/blank
  when either input is empty or invalid.
- Successful submit inserts the expected payload — `hire_date`,
  `period_years`, `total_cost_uyu` as entered, `deductible_uyu` as `null`
  when left blank or the entered number otherwise, `hail_coverage` and
  `glass_coverage` matching their checkbox states, `glass_coverage_limit_uyu`
  matching that input (or `null` when its checkbox is unchecked or the
  input is left blank), no client-computed `cost_per_year_uyu` field sent —
  and navigates to `/mi-actividad` with `{ saved: 'seguro' }`.
- Edit mode loads an existing quote by id and pre-fills every field
  (including reconstructing the per-year preview from the loaded row).

`src/pages/DashboardPage.test.tsx`:
- New "Seguros" section lists the signed-in user's own `insurance_quotes`,
  Editar/Eliminar work, CSV export produces the expected header row.

Manual/runtime verification (via the `verify` skill, mobile viewport):
- `/costos` renders the existing static Seguro blurb unchanged (no
  Supabase data yet / below threshold).
- The "Registrar" sheet shows the new "Un seguro" option; following it opens
  the new form.
- Provider/coverage/zone `<select>`s populate correctly; submitting a quote
  while signed in (where feasible — same auth-gated-flow limitation noted in
  `specs/trip-draft-autosave.md`) is otherwise covered by the component
  tests above.

## Acceptance criteria

- [x] Migration applied (`npx supabase db push`); `insurance_providers`
      seeded with the 13 providers; `insurance_quotes` RLS matches the
      `charging_stations`-era pattern (anon/authenticated/banned-aware);
      `insurance_cost_stats` view grants select to `anon, authenticated`.
- [x] `npm run gen:types` run; `src/lib/database.types.ts` committed.
- [x] Types, fetchers, and pure helpers implemented and unit tested.
- [x] `/costos` Seguro section is D1-gated (`preferCommunity`,
      `minSamples: 5`) and renders correctly on both sides of the gate.
- [x] New quote form (new + edit) works, including the live total→per-year
      cost preview.
- [x] Dashboard "Seguros" section, CSV export, and the register-sheet entry
      are wired up.
- [x] `specs/CONTENT-MIGRATION.md` updated with the new tracked row.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [x] Manual verification per the test plan above — `/costos` renders the
      curated blurb cleanly (0 live quotes, gate stays on the "grupo" side)
      with no console errors; `/costos/seguro/nuevo` correctly redirects to
      `/login` when signed out (`RequireAuth`, same as every other entry
      form). The signed-in "Registrar" sheet entry and full submit flow
      aren't independently driveable by the headless verify browser (same
      documented Turnstile/OTP limitation as `specs/trip-draft-autosave.md`)
      — covered instead by `NewInsuranceQuotePage.test.tsx`'s validation/
      preview/glass-toggle tests, and by direct review of `Layout.tsx`'s
      sheet JSX.
- [ ] Commit and push to `origin/main`.
