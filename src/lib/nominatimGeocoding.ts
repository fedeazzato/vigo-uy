// Best-effort live geocoding fallback for an origin/destination city name
// that isn't in the curated cityCoordinates.json lookup -- either a
// Uruguayan town the curated list simply missed, or a trip that crosses
// into Argentina/Brazil. Uses OpenStreetMap's free Nominatim geocoder (no
// API key). Best-effort only, same spirit as osrmRouting.ts: any failure
// resolves to null so the caller just omits the pin.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

// Soft bias (not a hard filter -- bounded=0) toward the Southern Cone so an
// ambiguous name like "Torres" prefers the nearby Brazilian town over,
// say, Spain, without excluding a genuine match further away.
const SOUTHERN_CONE_VIEWBOX = '-62,-25,-48,-35'

interface NominatimResult {
  lat: string
  lon: string
}

export interface GeocodedPoint {
  lat: number
  lng: number
}

export async function geocodeCity(name: string): Promise<GeocodedPoint | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    limit: '1',
    viewbox: SOUTHERN_CONE_VIEWBOX,
    bounded: '0',
  })
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`)
    if (!res.ok) return null
    const data = (await res.json()) as NominatimResult[]
    const first = data[0]
    if (!first) return null
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}
