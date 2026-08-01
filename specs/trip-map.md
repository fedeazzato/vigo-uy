# Trip map view

## Context

Community trip logs (`trip_logs`) already record an origin, a destination,
and an ordered list of charging stops (`charging_stops` jsonb), and are
rendered today as a vertical CSS timeline (`RouteMap` in
`src/components/TripCard.tsx`). That timeline shows the *order* of stops but
gives no sense of the actual geography of a trip. This adds a real
geographic map — origin pin, one pin per charging stop, destination pin,
connected by a route line — as a "Ver en mapa" action wherever a trip
already renders (Comunidad feed, Mi Vigo "Mi actividad", Rutas).

Two prior specs (`specs/D4-charging-stations.md`,
`specs/charging-cost-provider-averages-and-station-linking.md`) both
explicitly listed a map view as out of scope. This is the first pass at it.

**The coordinate gap.** `trip_logs.origin`/`destination` are free text (city
names, via `CityCombobox`/`src/lib/cities.ts`'s `UY_CITIES` — no
coordinates anywhere today). A `TripChargingStop` only has coordinates
indirectly, via an optional `station_id` FK into `charging_stations` (which
does have nullable `lat`/`lng`); free-text-only stops (no linked station)
have no coordinates at all and never will without the user re-linking them.

This spec closes the origin/destination gap with a small curated
city→coordinate lookup (one-time static data, matching `UY_CITIES`) and
accepts the charging-stop gap as a display-time filter: stops without a
resolvable station location are silently excluded from the map's pins, but
a one-line note discloses how many were skipped so the map doesn't look
mysteriously incomplete. No DB migration, no backfill.

## Requirements

- A new "Ver en mapa" action is available anywhere a trip's full detail
  renders (`TripDetail`, used by `TripCard` and directly by the Comunidad
  feed's expand-in-place cards). Opens a modal (backdrop + dialog panel,
  `Escape` to close, same interaction pattern as `SiteSearch.tsx`) — no new
  route, consistent with the app having no dedicated trip detail page today.
- The map shows, in order: an origin pin, one pin per charging stop that
  resolves to a real location, a destination pin, and a polyline connecting
  them in trip order.
  - Origin/destination coordinates come from a new curated
    `src/data/cityCoordinates.json` lookup keyed by the exact `UY_CITIES`
    strings (accent/case-insensitive match via the existing
    `foldAccents` helper, mirroring `normalizeCityCasing`'s approach). A
    city not in the lookup (e.g. a trip abroad, or free text that doesn't
    match any curated city) is simply omitted as a pin — no error state.
  - A charging stop resolves to a pin only when it carries `station_id` AND
    that station (fetched via the existing `fetchChargingStations()`) has
    non-null `lat`/`lng`. Stops that don't resolve are counted, not shown as
    pins, and surfaced as a small disclosure line, e.g. "2 paradas sin
    ubicación registrada" — never silently dropped without explanation.
  - If **zero** points resolve at all (no origin, no destination, no
    stops), the modal shows an empty state instead of a blank map:
    "No pudimos ubicar este viaje en el mapa todavía."
- Map tiles follow the site's existing dark-mode toggle
  (`useUserPrefs().effectiveTheme`) — light tiles in light mode, dark tiles
  in dark mode — using CARTO's free, key-less basemap tiles (Positron/Dark
  Matter), attributed to OpenStreetMap + CARTO per their usage terms.
- Coordinate-resolution logic (matching origin/destination to
  `cityCoordinates.json`, matching stops to stations, counting unresolved
  stops) is a pure, testable function separate from the Leaflet rendering —
  it must not require mounting a real map to test.
- This is scoped to community `TripLog` trips only. Curated `routes.json`
  entries (`Route.stops`, hand-authored text with no backing city/station
  data) are unaffected and keep using the existing `RouteMap` timeline only.

## Files to touch

- `package.json` — add `leaflet`, `react-leaflet` (runtime deps) and
  `@types/leaflet` (dev dep).
- `src/data/cityCoordinates.json` — new curated lookup, one entry per
  `UY_CITIES` city (lat/lng in decimal degrees).
- `src/lib/tripMap.ts` — new: `resolveTripMapPoints(trip, stations)` pure
  function; exported `TripMapPoint` type.
- `src/components/TripMap.tsx` — new: the modal + Leaflet map component
  (`MapContainer`/`TileLayer`/`Marker`/`Polyline` from `react-leaflet`),
  theme-aware tile selection, empty state, unresolved-stop disclosure line.
- `src/components/TripMap.module.css` — new: modal chrome (reuse
  `SiteSearch.module.css`'s backdrop/panel pattern), map container sizing.
- `src/components/TripCard.tsx` — add the "Ver en mapa" trigger button to
  `TripDetail`, holding the modal's open/closed state.
- No changes needed to `specs/CONTENT-MIGRATION.md` — this doesn't touch
  the curated/community data-source gate, only adds a display for data that
  already exists on both sides of it.

## Test plan

- `src/lib/tripMap.test.ts`:
  - Origin and destination both resolve when they exactly match a
    `cityCoordinates.json` entry.
  - Accent/case-insensitive match (e.g. `"montevideo"` still resolves to
    Montevideo's coordinates).
  - A city not present in the lookup is omitted (no pin, no throw).
  - A charging stop with `station_id` matching a station that has
    `lat`/`lng` resolves to a pin with the station's coordinates.
  - A charging stop with `station_id` matching a station whose `lat`/`lng`
    are null is counted as unresolved, not returned as a point.
  - A charging stop with no `station_id` is counted as unresolved.
  - Point order matches trip order: origin, then stops in array order,
    then destination.
  - A trip where nothing resolves returns an empty points array (caller
    renders the empty state).
- `src/components/TripMap.test.tsx`:
  - Smoke-render with a trip that has resolvable points (mock
    `react-leaflet`'s exports so the test doesn't depend on real tile
    loading/DOM measurement in jsdom) — asserts the right number of
    markers render and the unresolved-stop note appears when applicable.
  - Empty-state renders when `resolveTripMapPoints` returns no points.

## Acceptance criteria

- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes, including the new `tripMap.test.ts` and
      `TripMap.test.tsx`
- [x] Manual check via the `verify` skill: open a community trip with at
      least one linked charging stop in the Comunidad feed, click "Ver en
      mapa", confirm pins + route line render, toggle dark mode and confirm
      the tile style switches
- [x] Empty-state coverage: no real published trip currently has an
      unresolvable origin/destination to click through live, so this is
      verified by `TripMap.test.tsx`'s "shows the empty state when nothing
      on the trip resolves" case instead of a manual click-through
