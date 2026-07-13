# D4 — Community charging stations + computed cost per kWh

**Status:** Done (2026-07-13) — code complete; migration 0022 pending apply (CLI blocked by Windows App Control — paste into SQL Editor, then `migration repair --status applied 0022`) · **Phase:** D (post-audit follow-up) · **Depends on:** D2
(verified pattern), C1/C2 (CLI migrations + generated types)

## Context

`charging.json` mixes three kinds of knowledge: reference content that stays
curated (home charging, V2L, troubleshooting, autonomy), **network-level
pricing that rots** (UTE/EONE/DMC tariffs change), and **location-level
reports** currently squeezed into a hand-edited `alerts` array ("los Ecotap de
30 kW fallan en Rocha"). The community already produces the raw material for
the last two on every trip.

Owner decision (2026-07-13): **prices are never stored as station fields** —
they are *computed* from what members actually paid. Trip charging stops gain
a cost and an energy figure; cost per kWh is derived per provider from a
rolling window of real charges.

## Requirements

### 1. Migration `0022_charging_stations.sql`

**`charging_stations`** — one row per physical location:

- `id uuid pk`, `name text not null` (≤120), `network text not null`
  (slug from a curated list: `ute`, `eone`, `dmc`, `evergo`, `eosvolt`,
  `otro` — CHECK constraint), `city text` (≤80), `address text` (≤200),
  `lat`/`lng numeric` (nullable; CHECK sane ranges),
  `connector text not null` (`Tipo 2`, `CCS2`, `GB/T`, `otro`),
  `current_type text not null` (`AC`/`DC`), `max_power_kw numeric`
  (CHECK 0–1000, nullable), `access_notes text` (≤2000),
  `user_id uuid not null → auth.users`, `hidden boolean default false`,
  `verified boolean default false`, `created_at`, `updated_at`.
- **No price columns.** No `is_public` (stations are inherently public data),
  no `vehicle_id` (not a personal event; must not touch leaderboard/stats).
- RLS mirroring the content tables: anon/authenticated SELECT of non-hidden
  rows from non-banned authors (+ moderator visibility of hidden), INSERT for
  non-banned authenticated users, UPDATE/DELETE own-or-moderator. Reuse
  `enforce_daily_insert_limit` and attach `prevent_unauthorized_verify`
  (the D2 trigger fn is table-agnostic).

**`station_reports`** — one row per visit outcome (reliability, not price):

- `id`, `station_id → charging_stations on delete cascade`,
  `user_id → auth.users`, `status text` (`funciono`, `fallo`, `ocupado` —
  CHECK), `achieved_kw numeric` (CHECK 0–1000, nullable), `note text`
  (≤500), `created_at`. Same RLS family; daily-cap trigger.

**Views** (both `security_invoker = true`, grant anon + authenticated):

- `station_reliability`: per station, count + failure ratio of reports in the
  last 90 days.
- `charging_cost_stats`: cost per kWh per **network** and per **station**,
  from public non-hidden trips' `charging_stops` where the stop has both
  `cost_uyu` and `energy_kwh`, `trip_date` within the last **365 days**.
  Expand the jsonb with `jsonb_array_elements` (lateral); sanity-filter
  in the view (`energy_kwh` 1–120, `cost_uyu` 0–20000, ratio 1–100 $/kWh)
  since CHECKs can't reach inside jsonb elements. Owner picked **average**
  (`avg`), per stated requirement; expose `sample_count` so the UI can gate
  on it (and so a later switch to median stays a view-only change).

### 2. Trip charging stops carry the money

Extend the `charging_stops` jsonb element shape (`TripChargingStop`):

- `cost_uyu?: number` — total paid at that stop.
- `energy_kwh?: number` — **as billed by the charger display**, entered by
  the user. Do NOT derive energy from arrival/departure percentages for the
  cost stats: battery-gained kWh understates billed kWh (charging losses), so
  derived values would systematically overstate $/kWh. Percentage-derived
  energy stays out of `charging_cost_stats`.
- `station_id?: string` — optional link to `charging_stations`; the free-text
  `name` remains for unlisted chargers. Stats group by `station_id` when
  present, else fall back to nothing (a bare name is not a provider).

Trip form (`NewTripLogPage`): per stop, add "Costo (UYU)" and "Energía
cargada (kWh)" inputs (both optional, string state parsed on submit like the
rest) and a station selector (native `<select>` over fetched stations,
grouped by network, with "Otro / no está en la lista" keeping free text).
`vehicle_id`-style rule: never send derived values; the payload carries only
what the user entered.

### 3. ChargingPage rendering

- New "Estaciones de la comunidad" section: stations grouped by network,
  each with connector/power info, reliability from `station_reliability`
  (badge: e.g. red when >30% failures in 90 days, n ≥ 3), and computed
  **$/kWh** from `charging_cost_stats` — station-level when
  `sample_count ≥ 3`, else network-level, else no price shown.
- Label computed prices with the window: "promedio último año (n cargas)".
- `preferCommunity` gate: the curated `chargers` network cards remain until
  a network has computed pricing (≥3 qualifying charges), then that card's
  hardcoded price text yields to the computed figure (badge the provenance,
  as everywhere). Update `specs/CONTENT-MIGRATION.md` (charging.json row →
  "gated (D4)" for the chargers/alerts sections; home/V2L/troubleshooting/
  autonomy stay curated).
- Curated `alerts` shrink as `station_reports` cover the same ground —
  manual retirement, note it in the tracker.

### 4. Types & tests

- `npm run gen:types` after the migration; alias the new rows/views in
  `src/types.ts` following the C2 conventions (NonNullableRow for coalesced
  view columns, unions for `network`/`connector`/`status`).
- Unit tests: stop parsing with cost/energy (payload shape), the
  station/network fallback selection logic, and the reliability badge
  thresholds. DB-level tests for the new RLS join tier 2 when Docker/WSLC
  lands.

## Files

- `supabase/migrations/0022_charging_stations.sql` (new)
- `src/pages/NewTripLogPage.tsx`, `src/pages/ChargingPage.tsx`
- `src/lib/communityData.ts` (fetch helpers for stations/stats, cached)
- `src/types.ts`, `src/lib/database.types.ts` (regenerated)
- `specs/CONTENT-MIGRATION.md`

## Acceptance criteria

- A signed-in user can add a station; it appears for anon visitors; a
  moderator can verify/hide it; a banned author's stations disappear.
- A trip stop saved with cost + kWh shows up in `charging_cost_stats`
  within its network/station group; a stop missing either field never does.
- Charges older than 365 days stop influencing the average (verify by
  seeding an old trip).
- ChargingPage shows computed $/kWh only at ≥3 samples, station-level
  preferred over network-level; curated price text still renders below the
  threshold; Spanish UI; `npm run type-check` + `npm test` pass.

## Out of scope

Map view (lat/lng are stored but unrendered), PlugShare-style photos,
editing others' stations (moderators only), migrating percentage-derived
energy into the stats.
