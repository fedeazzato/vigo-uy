// OpenFreeMap vector basemaps (free, no API key, no usage limits; https://openfreemap.org), shared by every Leaflet map in the app
// (TripMap, StationsMap, LocationPicker) so they all follow the site's light/dark toggle the same way. Day = "Bright",
// night = "Fiord" (owner's choice, specs/openfreemap-basemaps.md). Rendered through MapLibre GL inside Leaflet by
// src/components/BaseMap.tsx. Replaces CARTO's raster tiles, which need an API key since 2026-09-25.
export const MAP_STYLE: Record<'light' | 'dark', string> = {
  light: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/fiord',
}

// OpenFreeMap's requested credit line.
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
