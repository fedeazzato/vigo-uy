import L from 'leaflet'

// Small colored dot marker shared by every Leaflet map in the app (TripMap,
// StationsMap, LocationPicker). Fully inline-styled so no CSS module is
// needed just for this, and passing className: '' drops Leaflet's default
// white-box .leaflet-div-icon styling. `color` is any CSS colour, normally a
// design token (`var(--accent)`): the markup lives in the page, so the
// token follows the active theme. Flat like the car's legend dots: a ring in
// the card colour plus a hairline outline instead of a shadow.
export function dotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;border:2px solid var(--surface);outline:1px solid var(--border-strong);background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}
