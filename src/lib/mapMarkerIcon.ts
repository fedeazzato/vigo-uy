import L from 'leaflet'

// Small colored dot marker shared by every Leaflet map in the app (TripMap,
// StationsMap, LocationPicker). Fully inline-styled so no CSS module is
// needed just for this, and passing className: '' drops Leaflet's default
// white-box .leaflet-div-icon styling.
export function dotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;border:2px solid var(--surface);box-shadow:0 0 0 1px rgba(0,0,0,0.25);background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}
