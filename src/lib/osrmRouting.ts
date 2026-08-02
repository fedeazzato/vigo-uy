// Real road-following route between trip stops, via OSRM's free public
// routing server (no API key, CORS-enabled -- confirmed with a live
// request during development). Best-effort only: their demo server has no
// SLA, so any failure (network, rate limit, no drivable route between the
// points) resolves to null and the caller falls back to a straight line
// rather than breaking the map. See specs/trip-map.md.
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving'

interface OsrmResponse {
  code: string
  routes?: { geometry?: { coordinates?: [number, number][] } }[]
}

// `points` and the return value are both [lat, lng] pairs (how the rest of
// the app and Leaflet handle positions) -- OSRM itself speaks lng,lat, so
// the conversion happens at the edges here.
export async function fetchRoute(points: [number, number][]): Promise<[number, number][] | null> {
  if (points.length < 2) return null
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';')
  try {
    const res = await fetch(`${OSRM_ROUTE_URL}/${coords}?overview=full&geometries=geojson`)
    if (!res.ok) return null
    const data = (await res.json()) as OsrmResponse
    const geometry = data.routes?.[0]?.geometry?.coordinates
    if (data.code !== 'Ok' || !geometry) return null
    return geometry.map(([lng, lat]) => [lat, lng])
  } catch {
    return null
  }
}
