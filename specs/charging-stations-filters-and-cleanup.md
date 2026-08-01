# Charging station name cleanup + provider/city filters

## Context

`specs/charging-stations-seed.md` seeded 209 real stations from OpenChargeMap.
That raw data carries two rough edges the community list shouldn't keep:

1. **Redundant network tags in `name`.** OCM contributors habitually prefix a
   station's name with the operator, either bracketed (`[DMC] Estación
   Mercedes`, `[UTE] Plaza San Jacinto`) or plain (`UTE Joanicó`, `eOne Axion
   Carrasco`). `CommunityStations.tsx` already groups stations under a
   per-network `<Card>` (`net.name` as the heading), so the tag is pure
   duplication once it's under that heading — 59 of the 211 live rows carry
   one.
2. **No way to narrow ~211 stations.** The list is one long per-network
   sequence of `<Card>`s with no way to jump to a single provider or a single
   city/town.

## Requirements

### Name cleanup (data)

1. For each of the 59 affected rows, strip the redundant prefix, matched
   against that row's own `network` (never a different network's label, so a
   name that coincidentally starts with another operator's word is
   untouched):
   - A leading bracketed tag: `^\[<label>\]\s*` (`[UTE]`, `[UTE Uruguay]`,
     `[DMC]`, `[EOne]`/`[EONE]`, `[Evergo]`).
   - A leading plain-text label + space: `UTE `, `eOne `/`EOne `/`EONE `,
     `EVE `, etc. — case-insensitive, longest label first so `UTE Uruguay`
     doesn't leave a dangling `Uruguay`.
   - Collapse any resulting double space (`UTE Terminal del Cerro  2` had
     one even before cleanup).
2. Applied as explicit `update ... set name = '<after>' where id = '<uuid>'`
   statements (59 of them, one per affected row) rather than a live regex —
   the exact before/after pairs were generated from the actual current data
   and reviewed by hand, so the migration is a plain, auditable list rather
   than a pattern that could misfire on a name never actually checked.
3. Not touched: brand/host names that aren't the network itself (`Ancap
   Rocha`, `TaTa Tacuarembó`, `Estación X`, `Terminal X`) — those are
   genuinely part of the location's identity, not a redundant network tag.

### Provider + city filters (UI)

4. `CommunityStations.tsx` gains two filter controls above the per-network
   station cards, visible regardless of sign-in state (the list itself
   already renders signed-out):
   - **Red (provider)**: a `<select>` mirroring the add-station form's own
     network picker (`<optgroup>` per `COUNTRIES`/`COUNTRY_LABELS` from
     `src/lib/stations.ts`), default option "Todas las redes". Selecting one
     narrows the rendered network cards to just that network.
   - **Ciudad**: a text `<input type="search">` (styled via the shared
     `formStyles.input`, same pattern as `CommunityFeedPage`'s search row),
     filtering stations whose `city` contains the typed text — case- and
     accent-insensitive (reuse the `foldAccents` approach from
     `src/lib/cities.ts` rather than a second implementation).
5. Both filters combine (AND) and apply before the existing per-network
   grouping/empty-group filtering — a network card disappears entirely if
   the current filters leave it with zero stations, same as today's
   behavior when a network genuinely has no stations.
6. When both filters are active and yield zero results, show a short
   `Alert type="info"` ("No hay estaciones que coincidan con el filtro.")
   instead of silently rendering nothing.
7. A "Limpiar filtros" text button appears next to the controls only when
   at least one filter is non-empty, resetting both in one click.
8. Filters are local UI state only (`useState`, not persisted, not synced
   to the URL) — reset on navigating away and back, consistent with every
   other filter/search control already in the app (`CommunityFeedPage`'s
   type chips and search box behave the same way).

## Files to touch

- `supabase/migrations/0035_clean_station_names.sql` (new — 59 explicit
  per-row `update` statements)
- `src/components/CommunityStations.tsx` (filter state + controls +
  filtering logic)
- `src/components/CommunityStations.module.css` (styles for the new filter
  row, following `CommunityFeedPage.module.css`'s `.chipsRow`/`.searchRow`
  pattern for visual consistency)
- `src/components/CommunityStations.test.tsx` (new — no test file exists
  for this component yet)

No `CONTENT-MIGRATION.md` change — this doesn't touch the curated-vs
-community gate, only cleans up and filters existing community rows.

## Test plan

New `src/components/CommunityStations.test.tsx` (mock `fetchChargingStations`
et al. from `src/lib/communityData.ts`, same mocking approach already used
in `NewTripLogPage.test.tsx` for the same module):

- Renders stations grouped under their network `<Card>` by default (no
  filters applied).
- Selecting a network in the provider `<select>` hides cards for every
  other network.
- Typing in the city input narrows results to matching stations only,
  case- and accent-insensitively (e.g. "rocha" matches "Rocha").
- Combining both filters narrows to the intersection.
- A network whose stations are all filtered out doesn't render an empty
  `<Card>`.
- When filters exclude everything, the "No hay estaciones..." alert shows
  instead of an empty list.
- "Limpiar filtros" only renders when a filter is active, and resets both
  fields + the full list when clicked.

## Acceptance criteria

- [x] `0035_clean_station_names.sql` applied via `npx supabase db push`;
      spot-checked a handful of the 59 renamed rows live.
- [x] Provider and city filters implemented, combine correctly, empty-state
      alert shows when appropriate.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass,
      including the new `CommunityStations.test.tsx`.
- [x] Manual check on `/carga` (per the `verify` skill, mobile viewport):
      filtering by a provider and by a city both work and combine, "Limpiar
      filtros" resets the view, no console errors.
