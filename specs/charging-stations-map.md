# Charging stations map view + location picker

## Context

`specs/D4-charging-stations.md` stored `lat`/`lng` on `charging_stations`
from the start but explicitly listed "map view (lat/lng are stored but
unrendered)" as out of scope. `specs/trip-map.md` (just shipped) rendered a
*single trip's* stops on a map, but the "add station" form
(`src/components/CommunityStations.tsx`) never captured `lat`/`lng` at all
— every community-submitted station has always landed with `null`
coordinates. That gap is exactly what let "Terminal Punta del Diablo" go
live with no location (fixed one-off in migration
`0040_terminal_punta_del_diablo_coords.sql`, found via a user report that
the trip map couldn't place that stop).

This closes both gaps at once: a "Ver en mapa" view of all (filtered)
charging stations, and a click/drag map picker in the add-station form so
new submissions always carry a real location — plus a DB constraint so the
gap can't quietly reopen.

## Requirements

**All-stations map**

- A "Ver en mapa" button sits next to "+ Agregar estación" in
  `CommunityStations`'s intro card, opening a modal (`StationsMap`, same
  backdrop/`role="dialog"`/`useEscapeToClose` pattern as `TripMap`).
- It renders exactly the stations the toolbar's four filters
  (network/city/connector/min power) currently match — i.e. it's given
  `filteredStations`, not the full unfiltered list — so the map and the
  network cards below it always agree.
- One marker per station; popup shows name, network, city, connector +
  current type, max power (when set), and the "Oficial" verified badge
  when applicable. Price/reliability in the popup is explicitly out of
  scope for this pass (see below).
- Bounds fit all markers (reuse `TripMap`'s bounds/single-point-fallback
  logic). Empty state text when the filtered list is empty: "No hay
  estaciones para mostrar con los filtros actuales."
- Each individual station in the network-grouped list also gets its own
  small "🗺️ Ver en mapa" link (below its city/connector/power meta line),
  opening the same `StationsMap` modal scoped to just that one station —
  `CommunityStations` holds a single `mapStations: ChargingStation[] | null`
  state (null = closed) that either the toolbar button (`filteredStations`)
  or a station's own link (`[station]`) can populate. When `StationsMap`
  receives exactly one station, its modal title is that station's name
  instead of the generic "Estaciones de carga (N)" count. The toolbar
  button and each per-station link share the same visible text, so they
  need distinct `aria-label`s ("Ver todas las estaciones en el mapa" vs.
  "Ver {name} en el mapa") to stay distinguishable to assistive tech and
  to tests.
- Tiles follow `effectiveTheme` exactly like `TripMap` — the CARTO
  light/dark URL + attribution constants move to a new shared
  `src/lib/mapTiles.ts` so `TripMap`, `StationsMap`, and `LocationPicker`
  don't each hardcode them. Dark mode also gets the same
  `.leaflet-tile-pane` brightness/contrast filter as `TripMap` (see
  `specs/trip-map.md`) so CARTO's near-black Dark Matter tiles read
  softer here too — same `FittedMapContainer.module.css` rule covers
  `StationsMap`, `LocationPicker.module.css` has its own copy.

**Location picker on the add-station form**

- New `LocationPicker` component: a Leaflet map where clicking places a
  draggable marker, dragging the marker updates the value, and a "Usar mi
  ubicación" button calls `navigator.geolocation.getCurrentPosition` and
  places/moves the marker there. Geolocation failure (denied, unsupported,
  timeout) shows an inline message and leaves the picker exactly as it
  was — never throws, never blocks the rest of the form.
- Controlled API: `value: { lat: number; lng: number } | null`,
  `onChange(next)`. No value yet → centered on a Uruguay-wide default view
  (not a specific city) rather than defaulting to Montevideo, since a
  submitted station could be anywhere in the country.
- Setting a location is **required** to submit the add-station form —
  submitting without one shows the same inline Spanish validation pattern
  already used for the name/power fields ("Marcá la ubicación de la
  estación en el mapa.") and does not call `createChargingStation`.
- On successful submit, the picker's value resets along with the rest of
  the form fields.

**Data layer + DB constraint**

- `NewChargingStationInput` (`src/lib/communityData.ts`) gains required
  `lat: number` / `lng: number` fields (not optional — the form guarantees
  a value before calling this); `createChargingStation`'s insert passes
  them through.
- There's a second call site: `AddStationInline` in `src/pages/NewTripLogPage.tsx`
  (the trip form's inline "link this stop to a real station" affordance) —
  this is almost certainly how "Terminal Punta del Diablo" went live with
  no coordinates in the first place. It gets the same `LocationPicker`
  field and required-location validation as `CommunityStations`'s form.
- New migration makes `charging_stations.lat`/`lng` `NOT NULL`. Safe now:
  every existing row already has coordinates (the Punta del Diablo fix was
  the last gap), and after this change `createChargingStation` is the only
  insert path and always supplies them. If any hidden/undiscovered row
  still has a null, the migration fails loudly against the remote DB
  instead of silently succeeding — that's the desired failure mode, not a
  case to code defensively around.
- `npm run gen:types` after the migration (narrows `lat`/`lng` from
  `number | null` to `number` in the generated `Row`/`Insert` types;
  `ChargingStation` in `src/types.ts` inherits the narrower type with no
  changes needed there).

**Out of scope**

- Editing/correcting the location of an *existing* station. There is still
  no station edit flow at all (author or moderator) — D4 explicitly
  deferred that, and it's unaffected by this change. A future null-island
  or wrong-pin case still needs a one-off migration like `0040`'s, same as
  before.
- Price/reliability info in the all-stations map's popups (the existing
  network-grouped list below the map already shows this).
- Marker clustering or per-network marker colors — a single consistent
  marker style is enough at ~211 stations.

## Files to touch

- `src/lib/mapTiles.ts` — new: `TILE_URL`, `TILE_ATTRIBUTION` (moved out
  of `TripMap.tsx`).
- `src/lib/mapMarkerIcon.ts` — new: `dotIcon(color)`, the small inline-styled
  colored-dot marker factory (moved out of `TripMap.tsx`, reused by
  `StationsMap`/`LocationPicker`).
- `src/components/MapModal.tsx` + `.module.css` — new: shared
  backdrop/dialog/header/close-button chrome, extracted once `StationsMap`
  needed the exact same modal shell `TripMap` already had.
- `src/components/FittedMapContainer.tsx` + `.module.css` — new: shared
  bounds-fitted `MapContainer`+`TileLayer`+empty-state body, extracted for
  the same reason.
- `src/components/TripMap.tsx` (+ trimmed `.module.css`) — refactored onto
  `MapModal`/`FittedMapContainer`/`dotIcon` instead of its own copies.
- `src/components/StationsMap.tsx` — new (no separate `.module.css` needed —
  built entirely from the shared pieces above).
- `src/components/LocationPicker.tsx` + `.module.css` — new.
- `src/components/CommunityStations.tsx` — add `location` state, render
  `LocationPicker` in the form, required-field validation, wire lat/lng
  into `addStation`'s `createChargingStation` call, "Ver en mapa" button +
  `StationsMap` modal state.
- `src/components/CommunityStations.module.css` — button/field styles for
  the above.
- `src/pages/NewTripLogPage.tsx` — same `LocationPicker` + required
  validation in `AddStationInline`.
- `src/lib/communityData.ts` — `NewChargingStationInput`/`createChargingStation`.
- `src/lib/communityData.test.ts` — existing `createChargingStation` tests
  updated with the now-required `lat`/`lng`.
- `supabase/migrations/0041_charging_stations_require_coordinates.sql` —
  new.
- `src/lib/database.types.ts` — regenerated after the migration.

## Test plan

- `src/components/StationsMap.test.tsx` (mocking `react-leaflet` the same
  way `TripMap.test.tsx` does):
  - Renders one marker per station passed in.
  - Empty state renders when given an empty station list.
  - Popup content includes the station's name and network.
  - A single station renders its own name as the modal title, not the
    generic "Estaciones de carga (1)" count.
- `src/components/LocationPicker.test.tsx`:
  - Clicking the map calls `onChange` with the clicked coordinates (mock
    `useMapEvents`'s `click` handler invocation).
  - Dragging the marker calls `onChange` with the new coordinates (mock
    `Marker`'s `eventHandlers.dragend`).
  - "Usar mi ubicación" success path calls `onChange` with the geolocation
    coordinates (mock `navigator.geolocation.getCurrentPosition`).
  - "Usar mi ubicación" failure path (mock the error callback) shows an
    inline message and does not call `onChange`.
- `src/components/CommunityStations.test.tsx` (extend the existing file):
  - Submitting the add-station form without a location shows the Spanish
    validation message and `createChargingStation` is not called.
  - Submitting with a location calls `createChargingStation` with the
    chosen `lat`/`lng`.
  - "Ver en mapa" opens `StationsMap` with exactly the currently filtered
    stations (assert against an active-filter scenario, not just the
    unfiltered list).
  - A station's own "Ver en mapa" link opens `StationsMap` with just that
    one station.
- `src/pages/NewTripLogPage.test.tsx` (extend): `AddStationInline`'s
  "Guardar estación" blocks with the same validation message when no
  location is set, and passes `lat`/`lng` through when one is.

## Acceptance criteria

- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes, including the new/extended test files above
      (186 tests, 23 files)
- [x] `npx supabase db push` applies migration `0041` cleanly against the
      linked project (confirms no hidden row had a null lat/lng);
      `npm run gen:types` run afterward
- [x] Verified live via Playwright: on `/carga`, filtering to "Rocha" and
      clicking "Ver en mapa" shows exactly the 3 matching stations as
      pins, with a working popup (name, "Oficial" badge, city/connector/
      power); confirmed again in dark mode (tiles switch to
      `dark_all`, all 211 stations render unfiltered)
- [x] Verified live via Playwright: clicking a single station's own
      "Ver en mapa" link ("19 de Abril") opens the modal with exactly 1
      marker and the station's name as the title, not a count
- [ ] Not yet done: a real signed-in click-through of `LocationPicker`
      itself (click/drag/"Usar mi ubicación") on `/carga`'s add-station
      form and `/viajes/nuevo`'s inline one. Turnstile blocks driving the
      OTP login flow headlessly (see the `verify` skill's notes), so this
      needs a manual pass in a signed-in browser session. The interactive
      logic itself (click, drag, geolocation success/failure) has full
      automated coverage in `LocationPicker.test.tsx`, and the map
      rendering primitives it shares with `StationsMap`/`TripMap` are
      confirmed working above — the gap is purely "does it look right
      signed in," not untested logic.
- [x] Geolocation success/failure paths covered by mocked
      `navigator.geolocation` in `LocationPicker.test.tsx` (real permission
      prompts can't be driven headlessly either way)
