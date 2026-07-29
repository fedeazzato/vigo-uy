# Provider-grouped charging cost averages + station-linking UX

## Context

D4 (`specs/D4-charging-stations.md`, done 2026-07-13) already computes
real-world $/kWh averages per station and per network from what members
actually paid (`charging_cost_stats`), and renders them on `/carga` — but
only per curated network card (`ChargingPage.networkAverage`) or per
individual community-submitted station (`CommunityStations`, via
`pickCostStat`). There is no single place to compare providers against each
other.

Separately, a real gap surfaced while reviewing this: `charging_cost_stats`
only counts a trip's charging stop when it carries a `station_id` pointing at
a row in `charging_stations` (`join public.charging_stations s on s.id =
c.station_id` in the view) — by design, "a bare name is not a provider"
(D4 spec, section 2). Today the only way to get a `station_id` onto a stop is
to pick an already-listed station from `NewTripLogPage`'s dropdown; a user
who types a free-text charger name (e.g. "Terminal Punta del Diablo") gets no
prompt to formalize it, so that charge silently never counts toward any
average — not "below the 3-sample threshold", but literally invisible to the
view. Fixing this is a UX addition, not a schema/view change (owner decision,
this conversation): keep the "bare name ≠ provider" rule, make it easy to
stop being a bare name.

A third idea (a `$/km` ⟷ `$/kWh` unit toggle) was considered and dropped
(owner decision, this conversation): `$/kWh` is the exact unit the community
data is entered in (`cost_uyu` / `energy_kwh` per stop); a `$/km` figure
would require multiplying by a separately-estimated kWh/100km consumption
figure, i.e. an estimate layered on an estimate. Out of scope for this spec.

## Requirements

### 1. Provider-grouped averages on `/carga`

- New pure helper in `src/lib/communityData.ts`:
  ```ts
  export interface NetworkCostStat {
    network: ChargingNetwork
    stat: ChargingCostStat
  }
  export function networkCostStats(
    stats: ChargingCostStat[],
    networks: ChargingNetwork[]
  ): NetworkCostStat[]
  ```
  Filters `stats` to network rollups (`station_id === null`) at
  `sample_count >= MIN_COST_SAMPLES`, joins each to its `ChargingNetwork` (by
  `network.slug`, skipping any stat whose network isn't in the list), sorted
  ascending by `avg_cost_per_kwh` (cheapest provider first — the practical
  reason to compare providers side by side).
- `ChargingPage.tsx` fetches `fetchChargingNetworks()` alongside the existing
  `fetchChargingCostStats()` call (both already cached/null-guarded, so this
  is one extra cheap call, deduped with `CommunityStations`' own fetch of the
  same cached promise).
- New Card, "📊 Promedio por proveedor", rendered right after the public-
  charging warning `Alert` and before the curated `chargers` cards (so it's
  the first thing a visitor comparing providers sees, ahead of reading each
  card individually). Each row: network name + country badge (reusing the
  `COUNTRY_LABELS`/badge pattern already in `CommunityStations`) + `$X/kWh`
  + `(n cargas, último año)`. Only rendered when `supabase` is configured and
  the list is non-empty (same guard style as the rest of the page).

### 2. Station-linking UX in the trip form

- New shared helper in `src/lib/communityData.ts`, replacing the inline
  `supabase.from('charging_stations').insert(...)` currently duplicated
  nowhere but about to be needed in a second place:
  ```ts
  export interface NewChargingStationInput {
    userId: string
    name: string
    network: string
    city?: string | null
    connector: StationConnector
    currentType: StationCurrentType
    maxPowerKw?: number | null
    accessNotes?: string | null
  }
  export function createChargingStation(
    input: NewChargingStationInput
  ): Promise<{ station: ChargingStation | null; error: string | null }>
  ```
  Inserts, `.select().single()`s the new row back, calls
  `invalidateCommunityCache()` on success. `CommunityStations.addStation` is
  refactored to call this helper instead of building the insert inline
  (same behavior, one insert shape instead of two).
- `NewTripLogPage.tsx`'s `StopCard`: when a stop has a non-empty free-text
  `name` and no `stationId` (i.e. "No está en la lista" is in effect), show a
  small toggle: "+ Agregar esta parada como estación de la comunidad".
  Expanding it reveals a compact inline form — network `<select>` (options
  from the `networks` prop already passed to `StopCard`), current type +
  connector `<select>`s (reusing `CONNECTORS_BY_CURRENT`/`DEFAULT_CONNECTOR`
  from `src/lib/stations.ts`, same as `CommunityStations`), and an optional
  city text input — prefilled `name` = the stop's typed name (read-only,
  it's what makes the stop payload match). Submitting calls
  `createChargingStation` (via a new `onStationCreated(index, station)`
  callback threaded from `NewTripLogPage`, which owns `user`/`stations`
  state) and on success: appends the new station to `stations` state and
  sets that stop's `stationId`/`name` to the created station (mirroring what
  picking it from the dropdown would have done), collapsing the mini-form.
  Available identically in both new-trip and edit-trip mode, since both use
  the same `StopCard` — editing a past trip and linking a previously
  free-text stop this way is how the "Terminal Punta del Diablo" case in
  the motivating report gets fixed, without any backfill/migration.
- This is additive UX only — no change to `parseStopDrafts`, the payload
  shape, or the `charging_cost_stats` view. The linking rule from D4 ("a bare
  name is not a provider") is unchanged; this just makes it easy to stop
  being a bare name, whether logging a new trip or fixing an old one.

### Out of scope

- `$/km` conversion or a unit toggle (dropped, see Context).
- Changing `charging_cost_stats` to roll up unlinked/free-text stops by name
  (dropped in favor of the linking UX above).
- Map view, backfilling existing free-text stops automatically, moderator
  merge/dedup of near-duplicate station names — all pre-existing D4 "out of
  scope" items, unaffected by this change.

## Files to touch

- `src/lib/communityData.ts` — `networkCostStats`, `createChargingStation`.
- `src/lib/communityData.test.ts` — tests for both new helpers.
- `src/pages/ChargingPage.tsx` — fetch networks, render the provider-average
  Card.
- `src/components/CommunityStations.tsx` — `addStation` calls the shared
  `createChargingStation` helper instead of inserting inline.
- `src/pages/NewTripLogPage.tsx` — `StopCard` gains the inline
  "add as station" affordance; `NewTripLogPage` gains `onStationCreated`
  wiring and passes `userId` down.
- `src/pages/NewTripLogPage.test.tsx` — tests for the new affordance.
- No migration, no `database.types.ts` regeneration (no schema change), no
  `CONTENT-MIGRATION.md` update (the D4 row's gate/source doesn't change —
  this is additive UI over the same computed view).

## Test plan

`src/lib/communityData.test.ts`:
- `networkCostStats`: returns only `station_id === null` rows at or above
  `MIN_COST_SAMPLES`, dropping thin ones; joins each to its `ChargingNetwork`
  by slug; sorts ascending by `avg_cost_per_kwh`; skips a stat whose network
  slug isn't present in the given `networks` list.
- `createChargingStation`: builds the insert payload from the input
  (including `null` defaults for omitted optional fields), calls
  `invalidateCommunityCache()` and returns the inserted row on success;
  returns a friendly error and does not invalidate the cache on failure;
  resolves to `{ station: null, error: null }` when `supabase` is
  unconfigured (mirrors every other fetcher's null-guard).

`src/pages/NewTripLogPage.test.tsx`:
- The "add as station" toggle only appears for a stop with a typed name and
  no selected station; it's absent once a station is selected from the
  dropdown, and absent for an empty-name stop.
- Submitting the inline form calls the (mocked) station-creation helper with
  the expected payload (name from the stop, chosen network/current
  type/connector/city) and, on success, the stop's station select reflects
  the newly created station (i.e. the free-text name input disappears, same
  as picking an existing station) without a page reload.
- On a creation error, the inline form shows the error and the stop stays
  unlinked (free-text name input still shown).

Manual/runtime verification (via the `verify` skill, mobile viewport):
- `/carga` shows the new "Promedio por proveedor" card ranked cheapest-first
  when at least one network has ≥3 qualifying charges; absent otherwise.
- In `/viajes/nuevo` (or editing an existing trip), typing a free-text
  charger name reveals "+ Agregar esta parada como estación de la
  comunidad"; completing it links the stop and the station then appears in
  `/carga`'s "Estaciones de la comunidad" list.

## Acceptance criteria

- [x] `networkCostStats` and `createChargingStation` implemented and unit
      tested.
- [x] `/carga` renders a provider-ranked averages card when data supports it,
      correctly gated by `MIN_COST_SAMPLES`, Spanish UI, provenance labelled
      ("promedio último año (n cargas)", wording consistent with the rest of
      the page).
- [x] Trip form (new + edit) offers inline station creation for free-text
      charging stops, reusing the shared helper; `CommunityStations`'
      existing add-station flow still works unchanged after the refactor.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [x] Manual verification per the test plan above — live `/carga` (with real
      Supabase data) renders with no console/page errors; the provider-
      averages card correctly stays hidden since no network yet clears
      `MIN_COST_SAMPLES`; the trip form's inline affordance is covered by
      component tests (auth-gated route, can't be driven by the headless
      verification browser — see `specs/verify` skill notes).
- [ ] Commit and push to `origin/main`.
