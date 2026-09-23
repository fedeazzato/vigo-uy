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
Completo, Todo Riesgo con Deducible, Todo Riesgo sin Deducible. ("Franquicia"
was the original wording; renamed to "Deducible" — owner decision, more
widely recognized — the `todo_riesgo_franquicia`/`todo_riesgo_sin_franquicia`
DB slugs are unchanged, only the display label.)

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
    -- hail_coverage / glass_coverage / glass_coverage_limit_uyu lived here
    -- originally (this table, as first applied) but were dropped by 0044 in
    -- favor of the extensible insurance_addons/insurance_quote_addons
    -- tables -- see Requirement 7. This reproduction reflects the table's
    -- current (post-0044) shape, not its as-first-applied one.
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
- `MIN_INSURANCE_SAMPLES = 3` (mirrors `MIN_COST_SAMPLES`), module-private —
  unlike `MIN_COST_SAMPLES`, nothing outside this module needs the raw
  threshold; the two helpers below apply it internally.
- `insuranceCostStatsByProvider(stats, providers)` — pure helper: filters to
  provider-only rollup rows (`coverage_level === null`) at
  `sample_count >= MIN_INSURANCE_SAMPLES`, joins to `InsuranceProvider` by
  slug, sorted ascending by `avg_cost_per_year_uyu` (cheapest first, same
  reasoning as `networkCostStats`).
- `insuranceCostStatsByProviderAndCoverage(stats, providers)` — same shape,
  filtered to `coverage_level !== null` rows instead.
- `fetchInsuranceAddons()` — the addon catalog, TTL-cached, ordered by
  `sort_order`.
- `fetchInsuranceQuoteAddons(quoteIds)` — batch fetch of
  `insurance_quote_addons` rows for a set of quote ids in one round trip
  (`.in('quote_id', quoteIds)`), grouped into a `Map<quoteId, rows[]>` —
  same batching shape as `fetchReactions`/`fetchComments`.
- `insuranceQuoteAddonDisplays(rows, addons)` — pure helper: joins a quote's
  addon rows to their catalog entry (skipping any whose addon isn't in the
  given catalog), sorted by catalog `sort_order`, returning
  `{icon, badgeLabel, limitKind, limitUyu, limitCount}[]`.
- `addonBadgeText(addon)` — pure helper: renders one addon's badge text —
  `"{icon} {badgeLabel} sin cargo"` (kind `none`, or `cost`/`count` with no
  limit given), `"hasta $X"` (kind `cost` with `limitUyu` set), `"hasta
  Nx/año"` (kind `count` with `limitCount` set). Shared by
  `InsuranceQuoteCard` (JSX) and `DashboardPage`'s CSV export (plain text) —
  lives here rather than on the component so both can import it without
  tripping the `react-refresh/only-export-components` lint rule.
- `replaceInsuranceQuoteAddons(quoteId, selections)` — deletes all of a
  quote's existing addon rows, then inserts the given selection
  (`{addon, limitUyu, limitCount}[]`); simpler than diffing individual rows,
  and matches how the form always submits its full current selection.
  Returns the *raw* Supabase error (not pre-friendlied), because it's meant
  to compose inside the same `run()` a quote insert/update goes through —
  `useEntrySubmit`'s `submit()` already runs `toFriendlyError` exactly once
  on the end result; pre-friendlying here would get overwritten by a
  generic fallback when `submit()` tried to friendly an already-friendly
  string.

### 4. `/costos` page (`src/pages/CostsPage.tsx`)

- Fetch `fetchInsuranceProviders()`, `fetchInsuranceAddons()`,
  `fetchInsuranceCostStats()` alongside the existing community fetches, and
  `fetchInsuranceQuotes(50)` — whose result feeds a follow-up
  `fetchInsuranceQuoteAddons(quoteIds)` call once the quote ids are known
  (can't fetch a quote's addons before knowing which quotes are shown).
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
    together, not just the per-year one), and, when present, "Deducible
    $X" (omitted entirely for rows with no `deductible_uyu` rather than
    showing "Deducible: —"). Below that, one badge per addon the quote
    includes (`insuranceQuoteAddonDisplays` joined against the fetched
    catalog, rendered via `addonBadgeText`) — a quote with no addons shows
    no badge line at all, same silent-omission convention as deductible.
    This list grows automatically as the catalog does — no `CostsPage` code
    change needed when a moderator adds a 5th addon.
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
"Deducible (UYU)" — soft-required, not hard-required (owner decision, this
conversation): every coverage level except `todo_riesgo_sin_franquicia`
("Todo Riesgo sin Deducible", the one tier that structurally can't carry
one) usually has a deductible, but a submitter who doesn't know or doesn't
want to look it up must still be able to save. So: the field is hidden
entirely when `coverageLevel === 'todo_riesgo_sin_franquicia'` (and its
value, whatever state it holds, is forced to `null` on submit regardless of
what's in the input — no DB constraint enforces this, so the client must);
on every other level it's shown, and while it's empty a non-blocking warning
hint appears — *"⚠️ Esta cobertura suele tener deducible — falta este dato
(podés guardar igual)."* (`formStyles.hintWarning`, amber, new modifier
alongside the existing neutral `.hint`) — clearing as soon as a value is
typed.

Below that, one checkbox per row of `fetchInsuranceAddons()` (state keyed
by addon slug: `{checked, limitValue}` — a single text field regardless of
`limit_kind`, since only one of `limit_uyu`/`limit_count` ever applies to a
given addon) — *"{addon.icon} Incluye {addon.checkbox_label}"* (icon
prefixed on the checkbox itself, owner request, so the addon is visually
recognizable while scanning the list, not just once its limit input is
revealed). Unchecking clears
`limitValue` too, same as the old glass-specific checkbox did. When checked
and `addon.limit_kind !== 'none'`, one extra input appears: label
*"{addon.icon} Límite de cobertura (UYU)"* (`limit_kind: 'cost'`, decimal
input) or *"{addon.icon} Usos gratis por año"* (`limit_kind: 'count'`,
numeric input), with a matching hint (*"Dejalo vacío si es sin cargo / sin
límite."* / *"Dejalo vacío si no tiene límite de usos."*). This is the same
UX the old hardcoded granizo/cristales checkboxes had — just driven by
whatever rows the catalog returns, so a 3rd/4th/5th addon (any of the three
kinds) needs no form code change. `NotesField`, `ShareCheckbox`.
`useEntrySubmit('seguro')` (`SavedFlag` member).

**Submit is two writes, composed into the one `run()` `useEntrySubmit`
expects**: insert (new) or update (edit) the `insurance_quotes` row first —
for a new quote, `.select('id').single()` to get the id back, since it's
needed for the second write — then `replaceInsuranceQuoteAddons(quoteId,
selections)` with whichever addons are checked (each carrying its parsed
`limitUyu`/`limitCount`, validated synchronously beforehand — a `count`
value must be a positive integer, a `cost` value must be a non-negative
number — before either write runs, same as every other numeric field in
this form). Whichever step fails first is the error `submit()` surfaces;
only a fully successful pair navigates away and clears the toast.

**Edit mode** additionally loads the quote's existing addon selections with
a second query (`insurance_quote_addons` where `quote_id = id`, separate
from the quote row itself since it's a join across tables, not a column),
populating the same `{checked, limitValue}` state the checkboxes read.

### 6. Routing, dashboard, and the "Registrar" sheet

- `src/App.tsx`: `costos/seguro/nuevo` and `costos/seguro/:id/editar` routes
  → `NewInsuranceQuotePage` (lazy-loaded like the other entry pages).
- `src/lib/useEntrySubmit.ts`: add `'seguro'` to `SavedFlag`.
- `src/pages/DashboardPage.tsx`: a 4th "Mi actividad" section, "Seguros",
  mirroring "Costos de service" exactly — fetch own `insurance_quotes` (plus
  the addon catalog and the caller's own `insurance_quote_addons`, same
  fetch-then-fetch-addons chain as `CostsPage`), list with Editar/Eliminar,
  CSV export (`exportInsuranceCsv`, one "Adicionales incluidos" column —
  `addonBadgeText` joined with `"; "` — instead of separate hail/glass/
  glass-limit columns), `+ Nueva entrada` link to `/costos/seguro/nuevo`,
  `SAVED_MESSAGES.seguro`.
- `src/components/Layout.tsx`: 4th link in the "¿Qué querés registrar?"
  sheet — "Un seguro" / "Aseguradora, cobertura y costo anual" / 🛡️ icon →
  `/costos/seguro/nuevo`.

### 7. Migration 0044: extensible addons (`insurance_addons`, `insurance_quote_addons`)

**Why.** Hail and glass repair started as two boolean/nullable-amount columns
directly on `insurance_quotes` (Requirement 1). The owner then asked for
this to be extensible — more "included at no extra cost" perks are common
in the Uruguayan market (roadside assistance, a designated-driver service
for parties) and more will surface over time — without a schema change each
time. New file `supabase/migrations/0044_insurance_addons.sql`:

- **`insurance_addons`** (moderator-curated catalog, mirrors
  `insurance_providers`):
  ```sql
  create table public.insurance_addons (
    slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
    icon text not null check (char_length(icon) between 1 and 8),
    checkbox_label text not null check (char_length(checkbox_label) between 1 and 100),
    badge_label text not null check (char_length(badge_label) between 1 and 40),
    limit_kind text not null default 'none' check (limit_kind in ('none', 'count', 'cost')),
    sort_order smallint not null default 100,
    created_at timestamptz not null default now()
  );
  ```
  `checkbox_label` is the full suffix rendered as "Incluye {checkbox_label}"
  (free text, not a template, so per-addon wording like "sin cargo" can be
  baked in where it fits — e.g. granizo's, but not cristales'/auxilio's,
  since those can carry a cap). `badge_label` is the short name used on
  quote cards. `limit_kind` drives which single input (if any) the form
  shows for that addon: `none` (flatly included, nothing extra to fill in),
  `cost` (an optional "up to $X/year" peso cap), `count` (an optional "up to
  N times/year" cap). RLS matches `insurance_providers` exactly (open
  select, moderator insert/update, no delete). Seeded with 4 rows
  (owner-provided/approved, this conversation): `granizo` (🧊, `none`),
  `cristales` (🪟, `cost`), `auxilio-ruta` (🆘, `count`), `chofer-designado`
  (🚕, `count`). Not a closed list — a moderator adds a 5th with one
  `INSERT`; no migration, no frontend change.

- **`insurance_quote_addons`** (junction: one row per addon a quote
  includes):
  ```sql
  create table public.insurance_quote_addons (
    quote_id uuid not null references public.insurance_quotes (id) on delete cascade,
    addon text not null references public.insurance_addons (slug),
    limit_uyu numeric check (limit_uyu between 0 and 1000000),
    limit_count integer check (limit_count between 1 and 365),
    primary key (quote_id, addon)
  );
  ```
  A `before insert or update` trigger
  (`enforce_insurance_quote_addon_limit_kind`) looks up the addon's catalog
  `limit_kind` and nulls out whichever of `limit_uyu`/`limit_count` doesn't
  match, so a row can never drift out of sync with its addon's configured
  kind regardless of what a client sent — the same self-correcting shape as
  `set_vehicle_id_on_write`/`prevent_unauthorized_verify` elsewhere in this
  schema, chosen over a same-table `CHECK` because the "which kind" fact
  lives on the *other* table, out of a `CHECK`'s reach. RLS: `select`
  mirrors the parent quote's own visibility via an `EXISTS` against
  `insurance_quotes` (anon: public+non-hidden+non-banned; authenticated:
  own, public+non-hidden+non-banned, or moderator); `insert` requires owning
  the parent quote and not being banned; `delete` requires owning the
  parent quote or being a moderator. No `update` policy — a quote's addon
  set is edited by replacing it wholesale (delete then insert), never by
  updating a row in place, so there's nothing to update. No dedicated daily-
  insert-limit trigger — bounded by the already-limited parent
  `insurance_quotes` insert and by the primary key (one row per distinct
  addon per quote, and the catalog itself is small).
- Backfill: any existing `hail_coverage`/`glass_coverage` data is migrated
  into `insurance_quote_addons` rows before the old columns are dropped
  (same statement batch, see Requirement 1's note).

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
- Editing/retiring `insurance_addons` from the UI — same moderator-only-via-
  `INSERT`/`UPDATE` situation as providers.
- An addon carrying both a count cap and a cost cap simultaneously (e.g.
  "3 repairs/year, each up to $5,000") — `limit_kind` is one of the three
  values, not a combination; if that shape turns out to be needed, it's a
  new `limit_kind` value plus a second nullable column, not a redesign.
- Per-provider addon catalogs (which addons a given provider actually
  bundles) — same reasoning as the coverage-level bullet above; addons are
  offered uniformly regardless of selected provider.

## Files to touch

- `supabase/migrations/0043_insurance_quotes.sql` — new (providers, quotes,
  cost stats).
- `supabase/migrations/0044_insurance_addons.sql` — new (addon catalog,
  junction table, backfill, drops the three old columns).
- `src/lib/database.types.ts` — regenerate (`npm run gen:types`) after each
  migration.
- `src/types.ts` — `InsuranceCoverageLevel`, `InsuranceZone`,
  `INSURANCE_COVERAGE_LABELS`, `INSURANCE_ZONE_LABELS`, `InsuranceProvider`,
  `InsuranceQuote`, `InsuranceCostStat`, `InsuranceAddonLimitKind`,
  `InsuranceAddon`, `InsuranceQuoteAddon`.
- `src/lib/communityData.ts` — fetchers, `MIN_INSURANCE_SAMPLES`,
  `insuranceCostStatsByProvider`, `insuranceCostStatsByProviderAndCoverage`,
  `fetchInsuranceAddons`, `fetchInsuranceQuoteAddons`,
  `insuranceQuoteAddonDisplays`, `addonBadgeText`,
  `replaceInsuranceQuoteAddons`.
- `src/lib/communityData.test.ts` — tests for all the pure helpers above.
- `src/lib/useEntrySubmit.ts` — `SavedFlag` gains `'seguro'`.
- `src/components/InsuranceQuoteCard.tsx` — renders one addon badge per row
  via `addonBadgeText`, instead of hardcoded hail/glass JSX.
- `src/pages/CostsPage.tsx` — fetch + render the new Seguro section,
  D1-gated, addon badges wired through.
- New `src/pages/NewInsuranceQuotePage.tsx` + a colocated test file — dynamic
  addon checkboxes, two-write submit.
- `src/pages/DashboardPage.tsx` — Seguros section, CSV export (addon
  column), `SAVED_MESSAGES.seguro`.
- `src/components/Layout.tsx` — 4th register-sheet link.
- `src/App.tsx` — new routes, lazy import.
- `specs/CONTENT-MIGRATION.md` — new row: `costs.json (insurance)` →
  `insurance_quotes` → `≥5 public entries` → gated.

## Test plan

`src/lib/communityData.test.ts` (mirrors `NewPartPurchasePage.test.tsx`'s
scoping precedent: this repo tests pure helpers thoroughly and reaches for
full-component render tests mainly on the more complex forms — neither
`CostsPage`-as-a-component nor `DashboardPage` has one, so this feature
doesn't add one either; its own `NewInsuranceQuotePage.test.tsx` is the
component-level test, matching `NewPartPurchasePage`'s own precedent):
- `insuranceCostStatsByProvider`: keeps only `coverage_level === null` rows
  at/above `MIN_INSURANCE_SAMPLES`, drops thinner ones, joins to
  `InsuranceProvider` by slug (skips unmatched slugs), sorts ascending by
  `avg_cost_per_year_uyu`.
- `insuranceCostStatsByProviderAndCoverage`: same, for
  `coverage_level !== null` rows.
- `insuranceQuoteAddonDisplays`: joins rows to their catalog entry in
  catalog `sort_order` regardless of row order; skips a row whose addon
  isn't in the given catalog; carries `limit_count` through unchanged for a
  `count`-kind addon.
- `addonBadgeText`: `"sin cargo"` for a `none`-kind addon; `"hasta $X"` for
  `cost` with a limit given, `"sin cargo"` for `cost` with none given;
  `"hasta Nx/año"` for `count` with a limit given.

`src/pages/NewInsuranceQuotePage.test.tsx`:
- Required-field validation (provider, coverage level, driver count in
  range, average age in range, zone, valid hire date, period 1-5, total
  cost) surfaces `FormError` without submitting; deductible and every addon
  are not part of this check (all optional).
- The deductible field is hidden only when coverage level is
  `todo_riesgo_sin_franquicia`, shown for every other level (including the
  unselected default); while shown and empty, the "falta este dato" warning
  hint renders, and it disappears as soon as a value is typed.
- The live per-year preview recomputes as `total_cost_uyu`/`period_years`
  change (e.g. 150000 over 3 años → shows "$50.000/año") and is absent/blank
  when either input is empty or invalid.
- One checkbox renders per catalog addon (from the mocked
  `fetchInsuranceAddons`); a `none`-kind addon shows no limit input at all
  when checked; a `cost`-kind addon reveals a decimal-mode "Límite de
  cobertura (UYU)" input on check, clears it on uncheck; a `count`-kind
  addon reveals a numeric-mode "Usos gratis por año" input on check. A
  non-integer value in a `count`-kind addon's limit surfaces its own
  `FormError` (*"La cantidad de usos de {badge_label} debe ser un número
  entero válido."*) without submitting — proof the validation is driven by
  the catalog's `limit_kind`, not hardcoded per addon.

Manual/runtime verification (via the `verify` skill, mobile viewport):
- `/costos` renders the existing static Seguro blurb unchanged (no
  Supabase data yet / below threshold), no console errors.
- The "Registrar" sheet shows the "Un seguro" option (signed-in branch,
  confirmed by direct review of `Layout.tsx` — not independently driveable
  by the headless browser, see below); `/costos/seguro/nuevo` redirects to
  `/login` when signed out, same as every other entry-form route.
- Provider/coverage/zone/addon fields populate and behave correctly;
  submitting a quote while signed in (where feasible — same auth-gated-flow
  limitation noted in `specs/trip-draft-autosave.md`, Turnstile's closed
  shadow DOM blocks a captcha-less OTP) is otherwise covered by the
  component tests above.

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
- [x] Migration 0044 applied (`npx supabase db push`); `insurance_addons`
      seeded with granizo/cristales/auxilio-ruta/chofer-designado;
      `insurance_quote_addons`'s `enforce_insurance_quote_addon_limit_kind`
      trigger keeps `limit_uyu`/`limit_count` in sync with the addon's
      catalog `limit_kind`; `hail_coverage`/`glass_coverage`/
      `glass_coverage_limit_uyu` dropped from `insurance_quotes` after a
      successful backfill.
- [x] `npm run gen:types` run again after 0044; `src/lib/database.types.ts`
      committed.
- [x] Form renders addon checkboxes/limit-inputs entirely from
      `fetchInsuranceAddons()` — verified by mocking a 3rd, previously-
      unseen `count`-kind addon in tests and confirming it renders and
      validates correctly with no form code referencing its slug.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [x] Manual verification per the test plan above — `/costos` renders the
      curated blurb cleanly (0 live quotes, gate stays on the "grupo" side)
      with no console errors; `/costos/seguro/nuevo` correctly redirects to
      `/login` when signed out (`RequireAuth`, same as every other entry
      form). The signed-in "Registrar" sheet entry and full submit flow
      aren't independently driveable by the headless verify browser (same
      documented Turnstile/OTP limitation as `specs/trip-draft-autosave.md`)
      — covered instead by `NewInsuranceQuotePage.test.tsx`'s validation/
      preview/addon tests, and by direct review of `Layout.tsx`'s sheet JSX.
- [ ] Commit and push to `origin/main`.
