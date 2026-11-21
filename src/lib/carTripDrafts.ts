// Trips shared from the linked car as drafts (specs/car-trip-drafts.md R3): fetch, mark, station match and the conversion
// into the new-trip form's state. Everything degrades to "no drafts" when the table is missing (migration 0050 not applied).
import { supabase } from './supabaseClient'
import { haversineKm } from './geo'
import type { CarTripDraftRow, ChargingStation, Model } from '../types'
import type { StopDraft, TripDraftState } from '../pages/NewTripLogPage'

const DRAFT_COLUMNS =
  'id, vehicle_id, device_id, client_id, started_at, ended_at, trip_count, distance_km, energy_kwh, start_soc, end_soc, avg_speed_kmh, route, charges, status, used_at, received_at'

/** D5: a charge counts as "at" a community station when it is this close. */
export const STATION_MATCH_KM = 0.3

export interface CarDraftCharge {
  started_at: number
  ended_at: number
  start_soc?: number
  end_soc?: number
  energy_kwh?: number
  end_reason?: string
  lat?: number
  lon?: number
}

/**
 * Pending drafts of the caller's vehicle (RLS: members only), newest first. `null` = the feature is not there (table
 * missing, signed out, any error): callers render nothing.
 */
export async function fetchPendingDrafts(): Promise<CarTripDraftRow[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('car_trip_drafts')
      .select(DRAFT_COLUMNS)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(50)
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/** Marks a draft used (after filling the trip form) or discarded. Returns false on any error. */
export async function markDraft(id: string, status: 'used' | 'discarded'): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase
      .from('car_trip_drafts')
      .update({ status, used_at: status === 'used' ? new Date().toISOString() : null })
      .eq('id', id)
    return !error
  } catch {
    return false
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** The stored route as `[lat, lng]` pairs; anything malformed is skipped. */
export function draftRoute(row: Pick<CarTripDraftRow, 'route'>): [number, number][] {
  if (!Array.isArray(row.route)) return []
  const out: [number, number][] = []
  for (const p of row.route) {
    if (Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1])) out.push([p[0], p[1]])
  }
  return out
}

/** The stored charges, oldest first; anything malformed is skipped. */
export function draftCharges(row: Pick<CarTripDraftRow, 'charges'>): CarDraftCharge[] {
  if (!Array.isArray(row.charges)) return []
  const out: CarDraftCharge[] = []
  for (const c of row.charges) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue
    const o = c as Record<string, unknown>
    if (!isNum(o.started_at) || !isNum(o.ended_at)) continue
    const charge: CarDraftCharge = { started_at: o.started_at, ended_at: o.ended_at }
    if (isNum(o.start_soc)) charge.start_soc = o.start_soc
    if (isNum(o.end_soc)) charge.end_soc = o.end_soc
    if (isNum(o.energy_kwh)) charge.energy_kwh = o.energy_kwh
    if (typeof o.end_reason === 'string') charge.end_reason = o.end_reason
    if (isNum(o.lat) && isNum(o.lon)) {
      charge.lat = o.lat
      charge.lon = o.lon
    }
    out.push(charge)
  }
  return out.sort((a, b) => a.started_at - b.started_at)
}

/** D5: nearest visible community station within 300 m of the charge's location, or null. */
export function nearestStation(
  lat: number | undefined,
  lon: number | undefined,
  stations: ChargingStation[],
  maxKm: number = STATION_MATCH_KM
): ChargingStation | null {
  if (!isNum(lat) || !isNum(lon)) return null
  let best: ChargingStation | null = null
  let bestKm = maxKm
  for (const s of stations) {
    if (s.hidden) continue
    const km = haversineKm({ lat, lng: lon }, { lat: s.lat, lng: s.lng })
    if (km <= bestKm) {
      best = s
      bestKm = km
    }
  }
  return best
}

function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmt(n: number, digits: number): string {
  return n.toLocaleString('es-UY', { maximumFractionDigits: digits })
}

const REASON_WORDS: Record<string, string> = {
  completa: 'carga completa',
  limite: 'llegó al límite',
  desenchufado: 'desenchufado',
  fallo: 'con un fallo',
  detenida: 'se detuvo',
}

/** Note for a stop: the battery energy (D6: not the charger-billed `energy_kwh`) and how the charge ended. */
export function chargeNote(c: CarDraftCharge): string {
  const parts: string[] = []
  if (c.energy_kwh != null) parts.push(`${fmt(c.energy_kwh, 1)} kWh a la batería (dato del auto)`)
  const reason = c.end_reason ? REASON_WORDS[c.end_reason] : undefined
  if (reason) parts.push(reason)
  return parts.join(' · ')
}

/**
 * D6: the new-trip form's state, filled from a car draft. Origin and destination stay blank (the car sends no place names);
 * each charge becomes a stop, linked to the nearest community station when one is within 300 m.
 */
export function draftToTripState(
  row: CarTripDraftRow,
  stations: ChargingStation[],
  model: Model | '' = ''
): TripDraftState {
  const stops: StopDraft[] = draftCharges(row).map((c) => {
    const station = nearestStation(c.lat, c.lon, stations)
    const minutes = Math.round((c.ended_at - c.started_at) / 60000)
    return {
      name: station?.name ?? '',
      note: chargeNote(c),
      distanceFromPrevious: '',
      arrivalPercentage: c.start_soc != null ? String(c.start_soc) : '',
      departurePercentage: c.end_soc != null ? String(c.end_soc) : '',
      durationMinutes: minutes > 0 ? String(minutes) : '',
      averageSpeed: '',
      cost: '',
      energyKwh: '',
      stationId: station?.id ?? '',
    }
  })
  const started = new Date(row.started_at)
  return {
    step: 0,
    origin: '',
    destination: '',
    distanceKm: String(Math.round(Number(row.distance_km))),
    tripDate: Number.isNaN(started.getTime()) ? localIsoDate(new Date()) : localIsoDate(started),
    model,
    startingCharge: row.start_soc != null ? String(row.start_soc) : '',
    endingCharge: row.end_soc != null ? String(row.end_soc) : '',
    averageSpeed: row.avg_speed_kmh != null ? String(Math.round(Number(row.avg_speed_kmh))) : '',
    stops,
    rating: null,
    notes: '',
    isPublic: true,
    showDetails: stops.length > 0 || row.avg_speed_kmh != null,
  }
}

export interface CarDraftSummary {
  title: string
  stats: { value: string; label: string }[]
}

/** "Sáb 21 nov · 2 viajes" + distance / energy / battery / duration tiles. */
export function describeDraft(row: CarTripDraftRow): CarDraftSummary {
  const start = new Date(row.started_at)
  const end = new Date(row.ended_at)
  const day = Number.isNaN(start.getTime())
    ? 'Viaje'
    : start.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' })
  const trips = row.trip_count > 1 ? ` · ${row.trip_count} viajes` : ''
  const stats: { value: string; label: string }[] = [
    { value: `${fmt(Number(row.distance_km), 1)} km`, label: 'Distancia' },
  ]
  if (row.energy_kwh != null) stats.push({ value: `${fmt(Number(row.energy_kwh), 1)} kWh`, label: 'Energía' })
  if (row.start_soc != null && row.end_soc != null)
    stats.push({ value: `${row.start_soc} → ${row.end_soc} %`, label: 'Batería' })
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000)
  if (minutes > 0) {
    const h = Math.floor(minutes / 60)
    stats.push({ value: h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`, label: 'Duración' })
  }
  const charges = draftCharges(row).length
  if (charges > 0) stats.push({ value: String(charges), label: charges === 1 ? 'Carga' : 'Cargas' })
  return { title: `${day.charAt(0).toUpperCase()}${day.slice(1)}${trips}`, stats }
}
