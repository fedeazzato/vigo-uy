// CARTO's free, key-less basemap tiles, shared by every Leaflet map in the
// app (TripMap, StationsMap, LocationPicker) so they all follow the site's
// light/dark toggle the same way.
export const TILE_URL: Record<'light' | 'dark', string> = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
