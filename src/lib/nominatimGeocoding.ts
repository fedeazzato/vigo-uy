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

interface NominatimPlace extends NominatimResult {
  display_name?: string
  name?: string
}

export interface FoundPlace {
  lat: number
  lon: number
  /** Short name for the car (the first part of Nominatim's display name). */
  label: string
  /** The full display name, to tell similar results apart. */
  detail: string
}

/**
 * Free-text place / address search for "Enviar al auto" (specs/car-navigate-b2.md R5): up to 5 results, Uruguay first (soft
 * Southern Cone bias, as geocodeCity). Best-effort: any failure is an empty list.
 */
export async function searchPlaces(query: string): Promise<FoundPlace[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []
  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    limit: '5',
    viewbox: SOUTHERN_CONE_VIEWBOX,
    bounded: '0',
    'accept-language': 'es',
  })
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`)
    if (!res.ok) return []
    const data = (await res.json()) as NominatimPlace[]
    if (!Array.isArray(data)) return []
    const out: FoundPlace[] = []
    for (const r of data) {
      const lat = Number(r.lat)
      const lon = Number(r.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const detail = (r.display_name ?? '').trim()
      const label = (r.name && r.name.trim()) || detail.split(',')[0].trim() || trimmed
      out.push({ lat, lon, label, detail: detail || label })
    }
    return out
  } catch {
    return []
  }
}
