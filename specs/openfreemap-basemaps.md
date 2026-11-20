# OpenFreeMap basemaps (Bright by day, Fiord by night)

Status: implemented 2026-11-20 (owner request).

## Context

Every map in the app (TripMap, StationsMap via FittedMapContainer, LocationPicker) drew CARTO's raster `light_all` / `dark_all` tiles
without a key. Since 2026-09-25 CARTO serves raster tiles only with an API key; key-less requests get tiles stamped
"API KEY REQUIRED", so the live maps were watermarked. The owner chose OpenFreeMap (https://openfreemap.org: free, no API key,
no registration, no usage limits; attribution required) with its **Bright** style for the day (light) theme and **Fiord** for the
night (dark) theme, matching the head-unit look (`specs/stock-head-unit-look.md`).

## Requirements

- OpenFreeMap styles are vector (MapLibre GL style JSON): `https://tiles.openfreemap.org/styles/bright` and `.../styles/fiord`.
- Keep Leaflet / react-leaflet for everything else (markers, routes, popups, fit-bounds, click picking). Render the basemap with
  MapLibre GL inside Leaflet through `@maplibre/maplibre-gl-leaflet` (the bridge OpenFreeMap's quick start recommends).
- One shared component, `src/components/BaseMap.tsx`, used where `<TileLayer>` was; it follows `effectiveTheme` and swaps the style
  when the theme changes.
- MapLibre (~290 kB gzip) loads on demand when a map mounts, never in the main bundle.
- Attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" with links, shown in Leaflet's attribution control
  (`attributionControl.customAttribution` of the bridge).
- Versions pinned exactly: `maplibre-gl` 5.24.0 (v6 resolves its worker at run time, which Vite does not emit: "Worker failed to load"; v5 inlines the worker), `@maplibre/maplibre-gl-leaflet` 0.1.4.

### Non-goals
- No change to map behaviour, markers or routing; no style customisation (the styles are used as published).
- No key or account anywhere.

## Files
- `src/lib/mapTiles.ts`: `MAP_STYLE` (light → bright, dark → fiord) and `MAP_ATTRIBUTION` replace `TILE_URL` / `TILE_ATTRIBUTION`.
- New `src/components/BaseMap.tsx`.
- `src/components/FittedMapContainer.tsx`, `src/components/LocationPicker.tsx`: `<BaseMap theme={effectiveTheme} />`.
- Tests that mock react-leaflet also mock `./BaseMap` (jsdom has no WebGL).
- `package.json` / lock: the two dependencies.

## Test plan
- Unit/component tests: existing map tests pass with `BaseMap` mocked; type-check, lint, build.
- Manual (owner, after deploy): Carga → "Ver en mapa", a trip map, and the location picker in both themes: streets and labels
  visible, no watermark, credits shown, theme switch swaps Bright/Fiord, markers and popups unchanged; check on the phone too.
- WebGL is required by MapLibre: confirm on the car's browser at the next visit.

## Acceptance criteria
- No CARTO URL remains in `src/`; maps show OpenFreeMap Bright (light) / Fiord (dark) with the OpenFreeMap credit.
- MapLibre is a separate lazily loaded chunk.

## Rollback
Revert the commit and redeploy (`npm run deploy`).
