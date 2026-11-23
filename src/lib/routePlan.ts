// Route plans with charging stops (specs/route-plans.md, PLAN.md B3). Pure
// planning logic, kept apart from RoutePlannerPage so it is testable
// without a map or network: the page fetches the OSRM road route
// (osrmRouting.ts) and the WikiVigo stations, this file turns them into
// legs with expected arrival battery percentages.
import { haversineKm } from './geo'
import type { Model, TripLog } from '../types'

// Gross battery capacity per model (charging.json "batería E2/E2+").
export const BATTERY_KWH: Record<Model, number> = { E2: 44.94, 'E2+': 51.87 }

// Fallback when the community has too few usable trips: the curated
// "Ruta con aire" band (14-16 kWh/100 km, charging.json) -- the planner is
// for road trips, so the city figure would be optimistic.
export const FALLBACK_CONSUMPTION = 15
export const MIN_CONSUMPTION_SAMPLES = 3

// Stations further than this from the road are not suggested.
export const MAX_DETOUR_KM = 10
// Charge target at a stop: above ~80% the car slows down a lot (charging.json).
export const CHARGE_TO_SOC = 80
const MAX_STOPS = 12

export interface ConsumptionEstimate {
  kwhPer100: number
  samples: number
  source: 'comunidad' | 'manual'
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Real-world kWh/100 km from public trip logs: battery used (start -> end
// SOC) plus the energy billed at every charging stop, over the distance.
// Only trips where that adds up: >= 40 km, both SOCs, and every stop with
// energy_kwh (a stop without it would make the trip look too efficient).
export function tripConsumption(trip: TripLog, batteryKwh: number): number | null {
  const { distance_km, starting_charge_percentage: start, ending_charge_percentage: end } = trip
  if (distance_km == null || distance_km < 40 || start == null || end == null) return null
  let kwh = ((start - end) / 100) * batteryKwh
  for (const stop of trip.charging_stops) {
    if (stop.energy_kwh == null) return null
    kwh += stop.energy_kwh
  }
  const per100 = (kwh / distance_km) * 100
  return per100 >= 6 && per100 <= 35 ? per100 : null
}

export function communityConsumption(trips: TripLog[], model: Model): ConsumptionEstimate {
  const values = trips
    .filter((t) => t.model === model || t.model === null)
    .map((t) => tripConsumption(t, BATTERY_KWH[model]))
    .filter((v): v is number => v !== null)
  if (values.length < MIN_CONSUMPTION_SAMPLES) {
    return { kwhPer100: FALLBACK_CONSUMPTION, samples: values.length, source: 'manual' }
  }
  return { kwhPer100: Math.round(median(values) * 10) / 10, samples: values.length, source: 'comunidad' }
}

// km the battery covers between two SOCs.
export function rangeKm(fromSoc: number, toSoc: number, batteryKwh: number, kwhPer100: number): number {
  if (fromSoc <= toSoc) return 0
  return (((fromSoc - toSoc) / 100) * batteryKwh * 100) / kwhPer100
}

export function socAfter(soc: number, km: number, batteryKwh: number, kwhPer100: number): number {
  return soc - ((km * kwhPer100) / 100 / batteryKwh) * 100
}

// ── Route geometry ───────────────────────────────────────────────────────

export interface RouteGeometry {
  coords: [number, number][]
  // Cumulative km at each vertex; last entry is the total.
  cumKm: number[]
}

export function buildRouteGeometry(coords: [number, number][]): RouteGeometry {
  const cumKm = [0]
  for (let i = 1; i < coords.length; i++) {
    const [aLat, aLng] = coords[i - 1]
    const [bLat, bLng] = coords[i]
    cumKm.push(cumKm[i - 1] + haversineKm({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }))
  }
  return { coords, cumKm }
}

export function totalKm(route: RouteGeometry): number {
  return route.cumKm[route.cumKm.length - 1] ?? 0
}

// Nearest route vertex to a point: how far along the route it is and how
// far off the road. OSRM's full overview is dense (a vertex every few
// hundred metres on highways), so vertex snapping is accurate enough here.
export function projectOntoRoute(route: RouteGeometry, lat: number, lng: number): { alongKm: number; offKm: number } {
  let best = Infinity
  let bestIndex = 0
  route.coords.forEach(([vLat, vLng], i) => {
    const d = haversineKm({ lat, lng }, { lat: vLat, lng: vLng })
    if (d < best) {
      best = d
      bestIndex = i
    }
  })
  return { alongKm: route.cumKm[bestIndex] ?? 0, offKm: best }
}

// ── Planning ─────────────────────────────────────────────────────────────

export interface StopCandidate {
  id: string
  name: string
  network: string
  lat: number
  lng: number
  alongKm: number
  offKm: number
  dc: boolean
  maxPowerKw: number | null
  // Many failures in the last 90 days (station_reliability).
  flaky: boolean
  // A recent "falló" check-in not followed by a "funcionó" (stationAlerts.ts).
  failing: boolean
}

export interface PlanInputs {
  totalKm: number
  batteryKwh: number
  kwhPer100: number
  startSoc: number
  minArrivalSoc: number
}

export interface PlannedStop {
  candidate: StopCandidate
  arrivalSoc: number
  departureSoc: number
}

export interface Plan {
  stops: PlannedStop[]
  arrivalSoc: number
  // false when the trip can't be completed with the suggested stations.
  feasible: boolean
  // Stations on the route skipped because of a recent failure report.
  skippedFailing: StopCandidate[]
}

// Greedy plan: from the current position, look at the stations reachable
// while keeping the minimum arrival SOC (detour counted both ways), and go
// to the furthest one -- preferring a fast (DC) and non-flaky one when it
// is not much closer. Stations with a recent failure are never suggested.
export function planCharging(candidates: StopCandidate[], inputs: PlanInputs): Plan {
  const { totalKm: total, batteryKwh, kwhPer100, startSoc, minArrivalSoc } = inputs
  const usable = candidates.filter((c) => c.offKm <= MAX_DETOUR_KM)
  const skippedFailing = usable.filter((c) => c.failing)
  const pool = usable.filter((c) => !c.failing).sort((a, b) => a.alongKm - b.alongKm)
  const stops: PlannedStop[] = []
  let pos = 0
  let soc = startSoc
  let posOffKm = 0 // detour back to the road from the last stop

  while (stops.length <= MAX_STOPS) {
    const reach = rangeKm(soc, minArrivalSoc, batteryKwh, kwhPer100)
    if (total - pos + posOffKm <= reach) {
      return { stops, arrivalSoc: socAfter(soc, total - pos + posOffKm, batteryKwh, kwhPer100), feasible: true, skippedFailing }
    }
    const reachable = pool.filter(
      (c) => c.alongKm > pos + 1 && c.alongKm - pos + posOffKm + c.offKm <= reach
    )
    if (reachable.length === 0) break
    const furthest = reachable[reachable.length - 1]
    // Within the last 30% of the reach, a DC, non-flaky station wins.
    const window = reachable.filter((c) => c.alongKm >= pos + (furthest.alongKm - pos) * 0.7)
    const pick =
      [...window].reverse().find((c) => c.dc && !c.flaky) ??
      [...window].reverse().find((c) => !c.flaky) ??
      furthest
    const arrivalSoc = socAfter(soc, pick.alongKm - pos + posOffKm + pick.offKm, batteryKwh, kwhPer100)
    const departureSoc = Math.max(arrivalSoc, CHARGE_TO_SOC)
    stops.push({ candidate: pick, arrivalSoc, departureSoc })
    pos = pick.alongKm
    posOffKm = pick.offKm
    soc = departureSoc
  }
  return {
    stops,
    arrivalSoc: socAfter(soc, total - pos + posOffKm, batteryKwh, kwhPer100),
    feasible: false,
    skippedFailing,
  }
}

// ── Share link ───────────────────────────────────────────────────────────

export interface PlanQuery {
  origin: string
  destination: string
  model: Model
  startSoc: number
  minArrivalSoc: number
  // Optional override; absent means "use the community estimate".
  kwhPer100?: number
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const n = value == null ? NaN : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function planQueryToSearch(q: PlanQuery): string {
  const params = new URLSearchParams({
    o: q.origin,
    d: q.destination,
    m: q.model,
    soc: String(q.startSoc),
    min: String(q.minArrivalSoc),
  })
  if (q.kwhPer100 != null) params.set('c', String(q.kwhPer100))
  return params.toString()
}

export function parsePlanQuery(search: string, defaultModel: Model): PlanQuery | null {
  const params = new URLSearchParams(search)
  const origin = params.get('o')?.trim() ?? ''
  const destination = params.get('d')?.trim() ?? ''
  if (!origin || !destination) return null
  const m = params.get('m')
  const c = Number(params.get('c'))
  return {
    origin: origin.slice(0, 120),
    destination: destination.slice(0, 120),
    model: m === 'E2' || m === 'E2+' ? m : defaultModel,
    startSoc: clampInt(params.get('soc'), 5, 100, 100),
    minArrivalSoc: clampInt(params.get('min'), 0, 50, 15),
    kwhPer100: params.has('c') && c >= 5 && c <= 40 ? c : undefined,
  }
}
