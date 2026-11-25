// "Dónde está tu auto" (specs/car-location.md R5): the car's last known position and, in mode "spots", its parking spots of the
// last 7 days. Read only through get_car_location (migration 0083), which answers allowed:false for view-only members and for
// people without a vehicle. Every error -- including the function not existing before 0083 is applied -- yields null: the card
// stays hidden and the page never breaks.
import { supabase } from './supabaseClient'
import { formatRelativeTime } from './format'

export type CarLocationMode = 'last' | 'spots'

export interface CarLocationPoint {
  kind: 'driving' | 'parked'
  lat: number
  lon: number
  accM: number | null
  observedAt: string
}

export interface CarParkingSpot {
  lat: number
  lon: number
  accM: number | null
  observedAt: string
}

export type CarLocationState =
  | { allowed: false }
  | { allowed: true; mode: CarLocationMode | null; last: CarLocationPoint | null; spots: CarParkingSpot[] }

/** The card re-reads this often while the page is visible (the car sends at most one point every 5 minutes). */
export const LOCATION_POLL_MS = 60_000

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v // numeric columns may arrive as strings
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function time(v: unknown): string | null {
  return typeof v === 'string' && Number.isFinite(new Date(v).getTime()) ? v : null
}

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function coords(o: Record<string, unknown>): { lat: number; lon: number; accM: number | null } | null {
  const lat = num(o.lat)
  const lon = num(o.lon)
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon, accM: num(o.acc_m) }
}

/** get_car_location's JSON, checked field by field; null for anything unexpected. */
export function parseCarLocation(raw: unknown): CarLocationState | null {
  const o = record(raw)
  if (!o || typeof o.allowed !== 'boolean') return null
  if (!o.allowed) return { allowed: false }
  const mode = o.mode === 'last' || o.mode === 'spots' ? o.mode : null
  let last: CarLocationPoint | null = null
  const l = record(o.last)
  if (l) {
    const c = coords(l)
    const at = time(l.observed_at)
    if (c && at && (l.kind === 'driving' || l.kind === 'parked'))
      last = { kind: l.kind, ...c, observedAt: at }
  }
  const spots: CarParkingSpot[] = []
  if (mode === 'spots' && Array.isArray(o.spots)) {
    for (const item of o.spots) {
      const s = record(item)
      const c = s && coords(s)
      const at = s && time(s.observed_at)
      if (c && at) spots.push({ ...c, observedAt: at })
    }
  }
  return { allowed: true, mode, last: mode ? last : null, spots }
}

export async function fetchCarLocation(): Promise<CarLocationState | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('get_car_location')
    if (error) return null
    return parseCarLocation(data)
  } catch {
    return null
  }
}

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const two = (n: number) => String(n).padStart(2, '0')

/** "lun 23/11 18:40" in the viewer's local time. */
export function formatSpotTime(iso: string): string {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export interface CarLocationView {
  /** "Estacionado" / "En viaje". */
  state: string
  /** "hace 2 h". */
  when: string
  /** "precisión ~12 m", or null when the car did not say. */
  accuracy: string | null
}

export function describeCarLocation(p: CarLocationPoint, now: Date = new Date()): CarLocationView {
  return {
    state: p.kind === 'parked' ? 'Estacionado' : 'En viaje',
    when: formatRelativeTime(new Date(p.observedAt), now),
    accuracy: p.accM !== null && p.accM > 0 ? `precisión ~${Math.round(p.accM)} m` : null,
  }
}

/** Google Maps walking/driving directions to the car, opened in a new tab (no map provider is embedded for this). */
export function directionsUrl(p: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`
}

export const LOCATION_EMPTY_TEXT =
  'Viene apagado. Para verlo acá, en la pantalla del auto entrá a Mi Vigo › Ajustes › Ubicación del auto y elegí ' +
  '«Última ubicación» o «Con estacionamientos».'
export const LOCATION_WAITING_TEXT = 'Activado. La primera ubicación llega cuando el auto ande con internet.'

export function privacyNote(mode: CarLocationMode): string {
  return (
    'Lo ven solo quien creó el vehículo y quienes tienen control. Se guarda solo la última ubicación' +
    (mode === 'spots' ? ' y los estacionamientos de 7 días' : '') +
    '. Se cambia en la pantalla del auto.'
  )
}
