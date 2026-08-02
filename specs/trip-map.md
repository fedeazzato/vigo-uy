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

**Places outside the curated list.** Real trips named places `UY_CITIES`
doesn't cover — "Solymar"/"Punta Negra" (real Uruguayan towns the curated
81-city list simply missed) and "Torres" (a real cross-border trip to
Torres, Brazil, discovered from an actual `trip_logs` row: `Maldonado →
Torres` with a `pelotas` charging stop). Rather than keep manually patching
a static list forever, an unresolved place now gets a live geocoding
fallback (`src/lib/nominatimGeocoding.ts`, OpenStreetMap's free Nominatim
search, no API key) before the pin is given up on — see the origin/
destination bullet below and the `unresolvedOrigin`/`unresolvedDestination`
fields on `TripMapPoints`.

## Requirements

- A new "Ver en mapa" action is available anywhere a trip's full detail
  renders (`TripDetail`, used by `TripCard` and directly by the Comunidad
  feed's expand-in-place cards). Opens a modal (backdrop + dialog panel,
  `Escape` to close, same interaction pattern as `SiteSearch.tsx`) — no new
  route, consistent with the app having no dedicated trip detail page today.
- The map shows, in order: an origin pin, one pin per charging stop that
  resolves to a real location, a destination pin, and a polyline connecting
  them in trip order.
  - The polyline follows actual roads, not a straight line between points —
    fetched from OSRM's free public routing server (`router.project-osrm.org`,
    no API key, CORS-enabled). No line renders until the request settles
    (drawing a straight line first and swapping it a moment later reads as
    a glitch, not a placeholder): the road route draws once it arrives, and
    the straight line only ever appears as a genuine fallback, once the
    request has actually failed (network, rate limit, no drivable route
    between the points — OSRM's demo server has no SLA). See
    `src/lib/osrmRouting.ts`.
  - Origin/destination coordinates come first from a curated
    `src/data/cityCoordinates.json` lookup keyed by the exact `UY_CITIES`
    strings (accent/case-insensitive match via the existing
    `foldAccents` helper, mirroring `normalizeCityCasing`'s approach) — the
    fast path, no network needed. A city that misses this lookup falls back
    to a live Nominatim geocode (`geocodeCity` in
    `src/lib/nominatimGeocoding.ts`), biased toward the Southern Cone
    (`viewbox`, soft `bounded=0`) so an ambiguous name like "Torres"
    prefers the nearby Brazilian town over, say, Spain, without hard-
    excluding a genuine match elsewhere. Both this and the OSRM route fetch
    are gated on `open` — `TripMap` stays mounted whenever a trip's detail
    is expanded (not just while its map modal is visible), so without the
    gate every expanded trip with an unresolved place would fire a
    background network request whether or not its map was ever opened.
    While geocoding is pending and nothing has resolved yet, the modal
    says "Buscando ubicaciones…" instead of prematurely claiming it
    couldn't find anything. A place still unresolved after geocoding gets
    a specific note ("No encontramos "X" para ubicarlo en el mapa.")
    instead of silently vanishing.
  - Each pin's popup leads with a colored circle emoji matching its marker
    color instead of a formal "Origen:"/"Destino:"/"Carga:" text label —
    🟢 origin, 🟠 charge, 🔵 destination — followed by the place/stop name.
    A charge stop's popup also shows "⏱️ N min de carga" when the stop
    recorded `duration_minutes`; omitted when it didn't (`TripMapPoint`
    carries `durationMinutes` for exactly this).
  - A charging stop resolves to a pin only when it carries `station_id` AND
    that station (fetched via the existing `fetchChargingStations()`) has
    non-null `lat`/`lng`. Stops that don't resolve are counted, not shown as
    pins, and surfaced as a small disclosure line, e.g. "2 paradas sin
    ubicación registrada" — never silently dropped without explanation.
  - If **zero** points resolve at all (no origin, no destination, no
    stops), the modal shows an empty state instead of a blank map:
    "No pudimos ubicar este viaje en el mapa todavía."
  - `FittedMapContainer` (shared with `StationsMap`) re-fits the view via
    an imperative `useMap()` + `fitBounds`/`setView` effect keyed on the
    positions list, not just react-leaflet's `bounds`/`center`/`zoom`
    props on `MapContainer` — those only ever apply once, at creation.
    Without this, a pin that resolves *after* the initial render (the
    origin from the fast path, the destination arriving a moment later
    from geocoding) would never bring the view into frame: found live on
    "Maldonado → Torres" — the map stayed zoomed into Maldonado alone,
    with the Brazil-bound route line running off the edge of the visible
    area, until this fix.
- Map tiles follow the site's existing dark-mode toggle
  (`useUserPrefs().effectiveTheme`) — light tiles in light mode, dark tiles
  in dark mode — using CARTO's free, key-less basemap tiles (Positron/Dark
  Matter), attributed to OpenStreetMap + CARTO per their usage terms.
  CARTO's Dark Matter tiles read as near-black on their own (a user
  reported it as "extremely dark") — softened with a CSS filter
  (`brightness(1.3) contrast(0.8)` on `.leaflet-tile-pane`, dark theme
  only) in `FittedMapContainer.module.css` rather than switching tile
  sets, so labels/roads keep CARTO's intended styling, just lighter.
  Verified visually (no automated test — jsdom doesn't render CSS
  filters), not tunable further without eyeballing a screenshot.
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
- `src/lib/osrmRouting.ts` — new: `fetchRoute(points)`, a best-effort OSRM
  call returning a road-following `[lat, lng][]` route or `null` on failure.
- `src/lib/nominatimGeocoding.ts` — new: `geocodeCity(name)`, a best-effort
  Nominatim call returning `{ lat, lng }` or `null` on failure.
- `src/components/FittedMapContainer.tsx` — added the `FitBounds` child
  component (imperative `useMap()` re-fit on every `positions` change, not
  just the initial mount) — shared with `StationsMap`, so this fix isn't
  TripMap-specific.
- `src/components/TripMap.tsx` — new: the modal + Leaflet map component
  (`MapContainer`/`TileLayer`/`Marker`/`Polyline` from `react-leaflet`),
  theme-aware tile selection, empty state, unresolved-stop disclosure line,
  road-route fetch with straight-line placeholder/fallback, live-geocoding
  fallback for a place outside the curated lookup.
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
  - A resolved charge stop carries `durationMinutes` through when the stop
    recorded `duration_minutes`, and leaves it `undefined` when it didn't.
  - Point order matches trip order: origin, then stops in array order,
    then destination.
  - A trip where nothing resolves returns an empty points array (caller
    renders the empty state).
  - The raw origin/destination is reported via `unresolvedOrigin`/
    `unresolvedDestination` when it misses the curated lookup, and both
    are `null` when both resolve.
- `src/lib/nominatimGeocoding.test.ts`:
  - Blank name returns `null` without calling `fetch`.
  - Builds the Nominatim URL with the trimmed query and the Southern Cone
    `viewbox`/`bounded=0` bias, returning the first result as `{lat, lng}`.
  - Returns `null` (not a throw) on an empty result array, a non-ok HTTP
    response, or a network error.
- `src/components/TripMap.test.tsx`:
  - Smoke-render with a trip that has resolvable points (mock
    `react-leaflet`'s exports so the test doesn't depend on real tile
    loading/DOM measurement in jsdom) — asserts the right number of
    markers render and the unresolved-stop note appears when applicable.
  - Empty-state renders when `resolveTripMapPoints` returns no points.
  - No polyline renders while `fetchRoute` is still pending; it appears
    once the mocked promise resolves with a road route.
  - No polyline renders until `fetchRoute` resolves; only then does the
    straight-line fallback appear, when it resolves `null` (failure).
  - Popups show the emoji labels, not "Origen"/"Destino" text.
  - A charge stop's popup shows "⏱️ N min de carga" when recorded, and
    omits the line entirely when it wasn't.
  - Neither `geocodeCity` nor `fetchRoute` is called while `open` is
    `false`, even for a trip with an unresolved place.
  - "Buscando ubicaciones…" (not the final empty message) shows while
    geocoding is pending and nothing has resolved yet.
  - A pin from live geocoding appears once `geocodeCity` resolves it.
  - The final empty state shows once geocoding settles with nothing found.
  - "No encontramos "X" para ubicarlo en el mapa." names the place that
    stayed unresolved after geocoding, alongside a pin that did resolve.
- `src/lib/osrmRouting.test.ts`:
  - Fewer than 2 points returns `null` without calling `fetch`.
  - Builds the OSRM URL with `lng,lat` order and converts the response
    geometry back to `lat,lng` pairs.
  - Returns `null` (not a throw) on a non-ok HTTP response, an OSRM
    `code !== 'Ok'` response, or a network error.

## Acceptance criteria

- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes, including `tripMap.test.ts`, `TripMap.test.tsx`,
      `osrmRouting.test.ts`, and `nominatimGeocoding.test.ts`
- [x] Verified live via Playwright on the "Chuy → Ciudad de la Costa" trip:
      popups read "🟢 Chuy", "🟠 Rocha" + "⏱️ 28 min de carga", and
      "🔵 Ciudad de la Costa" — matching the trip's actual recorded stop
- [x] Verified live via Playwright on the two trips a user reported as
      broken: "Solymar → Punta Negra" (previously the empty state; now a
      full road route along the coast from Ciudad de la Costa to
      Piriápolis) and "Maldonado → Torres" (previously only the origin
      pin; now the full route from Maldonado into Rio Grande do Sul,
      Brazil, correctly zoomed out to show both ends — this second trip is
      what surfaced the `FitBounds` bug, since the first attempt still
      showed only Maldonado despite both pins existing in the DOM)
- [x] Manual check via the `verify` skill: open a community trip with at
      least one linked charging stop in the Comunidad feed, click "Ver en
      mapa", confirm pins + route line render, toggle dark mode and confirm
      the tile style switches
- [x] Empty-state coverage: no real published trip currently has an
      unresolvable origin/destination to click through live, so this is
      verified by `TripMap.test.tsx`'s "shows the empty state when nothing
      on the trip resolves" case instead of a manual click-through
- [x] Manual check: opened the "Chuy → Ciudad de la Costa" trip's map live
      (Playwright) — zero polylines exist immediately after opening (no
      straight-line flash), then one appears within ~2.5s with a 408-char
      SVG path, visibly following the coastal highway through Rocha/
      Maldonado instead of cutting a diagonal across the country
