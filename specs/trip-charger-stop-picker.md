# Trip form: fix charging-stop data loss + filterable charger picker

## Context

`/viajes/nuevo` (`src/pages/NewTripLogPage.tsx`) lets a member log charging
stops on a trip. Two problems reported by a user:

1. **Silent data loss.** `parseStopDrafts` skips a stop entirely whenever
   `!s.name.trim()` — i.e. whenever the free-text "Nombre del cargador"
   field is empty *and* no community station was picked (picking one
   auto-fills `name`). If someone fills in duration/cost/energy/notes for a
   stop but never names it or picks a charger, the whole stop silently
   vanishes on save.
2. **Unusable charger picker.** `StopCard` renders one giant `<select>`
   with every community-submitted station (~211 as of
   `specs/charging-stations-map.md`) grouped by network in `<optgroup>`s,
   with no way to narrow it by network, city, or location.

`src/components/CommunityStations.tsx` already solved a near-identical
"browse stations" problem: a network+city filter toolbar and an
all-stations map (`src/components/StationsMap.tsx`, built on the shared
`MapModal`/`FittedMapContainer`/`dotIcon` primitives). `LocationPicker.tsx`
already knows how to call `navigator.geolocation.getCurrentPosition` for a
"usar mi ubicación" affordance. This change reuses those existing pieces
rather than inventing new ones, and adds a small `haversineKm` helper (no
distance-calculation utility exists yet anywhere in the codebase) for
"near me" sorting.

## Requirements

**Fix 1 — never silently drop a stop with data in it**

In `parseStopDrafts`:
- A stop with **no data at all** (no name, no `stationId`, every other
  field blank) is still silently skipped — the normal case of an unused
  "+ Agregar parada" card.
- A stop with **some data but no name and no station selected** is now a
  validation error (same mechanism as the existing percentage/speed/cost/
  energy errors): `"Ponele un nombre a la parada N o elegí un cargador de
  la lista."` (N = 1-based stop index). It must never be silently dropped.
- A stop with a name or a linked station keeps working exactly as today.

**Fix 2 — filterable + map + "near me" charger picker**

Replace `StopCard`'s giant `<select>` with:
- A **"🔎 Buscar cargador…"** button (shown only when `stations.length > 0`,
  same as today) that opens a new `StationPickerModal`.
- Once a station is linked, a chip showing its name (+ city if present)
  with **"Cambiar"** (reopen the picker) and **"Quitar"** (clear
  `stationId`/`name`, same effect as today's "No está en la lista")
  actions.

`StationPickerModal` (`open`, `onClose`, `stations`, `networks`,
`onSelect`):
- **Filters**: network `<select>` + city text `<input>`, matching
  `CommunityStations`' existing toolbar fields/behavior (`foldAccents` city
  matching). Kept local to this component — `CommunityStations` itself is
  unchanged.
- **"📍 Cerca mío"**: calls `navigator.geolocation.getCurrentPosition` like
  `LocationPicker.useMyLocation` (same options, same inline Spanish error
  on failure/unsupported). On success, every filtered station gets a
  computed distance (`haversineKm`) and the list sorts nearest-first with
  a "≈ X.X km" chip per row.
- **View toggle: Lista / Mapa**:
  - *Lista* (default): scrollable list of buttons — name, "Oficial" badge,
    network, city/connector/current/power meta, distance chip when
    available. Clicking calls `onSelect(station)` then `onClose()`.
  - *Mapa*: `FittedMapContainer` with one marker per filtered station
    (same rendering as `StationsMap`), each popup adding a "✅ Elegir esta
    estación" button that calls `onSelect`/`onClose`. When geolocated, an
    extra non-selectable marker in a different color marks the user's own
    position and is included in the fit-bounds call.
  - Empty-filter state: "No hay estaciones que coincidan con el filtro."
    (same message `CommunityStations` already uses).
- Filters and the geolocation point reset when the modal closes.

`NewTripLogPage` owns a single `pickerForIndex: number | null` state (one
modal instance reused across stop cards, mirroring `CommunityStations`'
single `mapStations` state for its per-station map links); `onSelect` calls
the existing `setStopStation(pickerForIndex, station.id)`. The free-text
name fallback and `AddStationInline` (formalizing a free-text stop into a
community station) are unchanged.

**New helper — `src/lib/geo.ts`**

`haversineKm(a: {lat,lng}, b: {lat,lng}): number` — standard haversine
formula, Earth radius 6371 km.

## Files to touch

- `src/pages/NewTripLogPage.tsx` — `parseStopDrafts` fix; `StopCard` picker
  trigger + chip; `pickerForIndex` state + `<StationPickerModal>` instance.
- `src/pages/NewTripLogPage.test.tsx` — extended (see test plan).
- `src/components/StationPickerModal.tsx` + `.module.css` — new.
- `src/components/StationPickerModal.test.tsx` — new.
- `src/lib/geo.ts` + `src/lib/geo.test.ts` — new.

`specs/CONTENT-MIGRATION.md` is unaffected — charging stations are already
100%-community (D4), no curated/community gate changes here.

## Test plan

- `src/lib/geo.test.ts`: `haversineKm` against known Uruguayan point pairs
  (e.g. Montevideo↔Punta del Este ≈ 130 km, tolerance a few km) and the
  zero-distance case (same point twice → 0).
- `src/pages/NewTripLogPage.test.tsx` (`parseStopDrafts`):
  - A stop with e.g. `durationMinutes`/`cost` filled but empty `name` and
    no `stationId` returns `{ error }`, not a silently-shrunk stop list.
  - A fully blank stop (all fields empty, no `stationId`) is still silently
    skipped (regression guard for the existing "unused stop card" case).
  - A stop with only a `stationId` (name auto-filled by station selection)
    still parses successfully.
- `src/components/StationPickerModal.test.tsx` (mocking `react-leaflet` the
  same way `StationsMap.test.tsx` does):
  - Renders the filtered list; network filter and city filter each narrow
    it correctly.
  - Selecting a list row calls `onSelect` with that station and `onClose`.
  - Map view renders one marker per filtered station; clicking a marker's
    popup "Elegir" button calls `onSelect` + `onClose`.
  - "Cerca mío" success path (mocked `navigator.geolocation`) sorts the
    list by distance and renders a distance chip.
  - "Cerca mío" failure path (mocked error callback) shows the inline
    Spanish message and leaves the list as it was.
  - Empty-filter state renders the "No hay estaciones..." message.
- `src/pages/NewTripLogPage.test.tsx` (picker wiring): "Buscar cargador…"
  opens the modal for the right stop index; selecting a station sets
  `stationId`/`name` on that stop and closes the modal; "Cambiar"/"Quitar"
  on an already-linked stop behave as described above.

## Acceptance criteria

- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes, including all new/extended test files above
      (265 tests, 27 files)
- [ ] Not yet done: a real signed-in click-through of `/viajes/nuevo` (fill
      a stop with only duration+cost and confirm the new validation error;
      pick a station via list filters, via the map, and via "Cerca mío";
      "Cambiar"/"Quitar" on a linked stop; edit a saved trip back open and
      confirm the stop's data round-trips). `/viajes/nuevo` is behind
      `RequireAuth` and Turnstile blocks driving the OTP login flow
      headlessly (same limitation `specs/charging-stations-map.md` hit for
      `LocationPicker` — needs a manual pass in a signed-in browser
      session). The interactive logic itself has full automated coverage
      in `StationPickerModal.test.tsx` and the extended
      `NewTripLogPage.test.tsx` above.
