// Car data features (specs/car-data-a3-a9.md, PLAN A3/A5/A6/A7/A9): verified kilometres, battery health, consumption atlas,
// eco-driving board and the dashboard warnings log. Every row is private to the vehicle's members; the community views only
// include vehicles whose members switched the matching option on (vehicle_data_sharing, all off by default). Every fetch
// degrades to null / [] before migration 0061 is applied.
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import type { Database, Tables } from './database.types'

export type BatterySample = Tables<'car_battery_samples'>
export type DriveSample = Tables<'car_drive_samples'>
export type FaultEvent = Tables<'car_fault_events'>
export type OdometerDay = Tables<'car_odometer_log'>
export type DataSharing = Tables<'vehicle_data_sharing'>
type Fn<N extends keyof Database['public']['Functions']> = Database['public']['Functions'][N]['Returns']
export type VerifiedKmRow = Fn<'verified_km_leaderboard'>[number]
export type AtlasRow = Fn<'consumption_atlas'>[number]
export type EcoRow = Fn<'eco_league'>[number]
export type BatteryCommunityRow = Fn<'battery_health_community'>[number]
export type FaultCountRow = Fn<'fault_code_counts'>[number]

export type SharingKey =
  'verified_km_public' | 'battery_community' | 'consumption_atlas' | 'eco_league' | 'fault_matching'
export type DataKind = 'battery' | 'drive' | 'fault' | 'odometer'

export const SHARING_KEYS: SharingKey[] = [
  'verified_km_public',
  'battery_community',
  'consumption_atlas',
  'eco_league',
  'fault_matching',
]

/** Consent texts (Spanish, shown next to each switch). Everything is off until a member turns it on. */
export const SHARING_TEXT: Record<SharingKey, { title: string; hint: string }> = {
  verified_km_public: {
    title: 'Mostrar mis km verificados en el ranking',
    hint: 'Publica el odómetro que informa el auto y los km recorridos desde la primera lectura, con los nombres de los miembros del vehículo.',
  },
  battery_community: {
    title: 'Sumar mi batería a la curva de la comunidad',
    hint: 'Anónimo: solo una mediana por modelo y tramo de 20 000 km, y solo si hay al menos 5 autos en ese tramo.',
  },
  consumption_atlas: {
    title: 'Sumar mis consumos al atlas de la comunidad',
    hint: 'Anónimo: promedios de kWh/100 km por estación, temperatura y velocidad, con al menos 5 autos por grupo. Nunca se guarda por dónde andás.',
  },
  eco_league: {
    title: 'Participar en la liga de manejo eficiente',
    hint: 'Publica cada mes tu % de energía recuperada al frenar, km y viajes, con los nombres de los miembros del vehículo.',
  },
  fault_matching: {
    title: 'Contar mis avisos en “otros dueños vieron esto”',
    hint: 'Solo para usuarios con sesión: cuántos autos vieron cada aviso (desde 3), nunca cuáles.',
  },
}

const MONTHS_BACK = 12

async function safe<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await p
    return error ? null : data
  } catch {
    return null
  }
}

export interface MyCarData {
  sharing: DataSharing | null
  odometer: OdometerDay[]
  battery: BatterySample[]
  drives: DriveSample[]
  faults: FaultEvent[]
}

/** Everything the member's vehicle has, or null when the tables do not exist yet (0061 not applied) or no Supabase. */
export async function fetchMyCarData(now = new Date()): Promise<MyCarData | null> {
  if (!supabase) return null
  const since = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1).toISOString()
  const [sharing, odometer, battery, drives, faults] = await Promise.all([
    safe(supabase.from('vehicle_data_sharing').select('*').limit(1)),
    safe(supabase.from('car_odometer_log').select('*').order('day', { ascending: true }).limit(2000)),
    safe(
      supabase
        .from('car_battery_samples')
        .select('*')
        .gte('ended_at', since)
        .order('ended_at', { ascending: true })
        .limit(1000)
    ),
    safe(
      supabase
        .from('car_drive_samples')
        .select('*')
        .gte('started_at', since)
        .order('started_at', { ascending: true })
        .limit(3000)
    ),
    safe(supabase.from('car_fault_events').select('*').order('observed_at', { ascending: false }).limit(200)),
  ])
  if (!odometer || !battery || !drives || !faults || !sharing) return null
  return { sharing: sharing[0] ?? null, odometer, battery, drives, faults }
}

export async function setSharing(key: SharingKey, on: boolean): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('set_vehicle_data_sharing', { p_key: key, p_on: on })
  return error ? toFriendlyError(error) : null
}

/** "Eliminar": deletes every row of that kind of the member's vehicle (delete_my_car_data). */
export async function deleteMyCarData(kind: DataKind): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.rpc('delete_my_car_data', { p_kind: kind })
    return !error
  } catch {
    return false
  }
}

export async function fetchVerifiedKm(): Promise<VerifiedKmRow[]> {
  if (!supabase) return []
  return (await safe(supabase.rpc('verified_km_leaderboard'))) ?? []
}
export async function fetchConsumptionAtlas(): Promise<AtlasRow[]> {
  if (!supabase) return []
  return (await safe(supabase.rpc('consumption_atlas'))) ?? []
}
export async function fetchEcoLeague(month?: string): Promise<EcoRow[]> {
  if (!supabase) return []
  return (await safe(supabase.rpc('eco_league', month ? { p_month: month } : {}))) ?? []
}
export async function fetchBatteryCommunity(): Promise<BatteryCommunityRow[]> {
  if (!supabase) return []
  return (await safe(supabase.rpc('battery_health_community'))) ?? []
}
export async function fetchFaultCounts(): Promise<FaultCountRow[]> {
  if (!supabase) return []
  return (await safe(supabase.rpc('fault_code_counts'))) ?? []
}

// ---- pure helpers (tested) ----

export const fmt = (n: number, digits = 1) => n.toLocaleString('es-UY', { maximumFractionDigits: digits })

export interface VerifiedKm {
  odometer: number
  since: string
  kmVerified: number
  anomaly: boolean
}

/** A3 summary of the member's own odometer log (ascending by day); null without readings. */
export function verifiedSummary(log: OdometerDay[]): VerifiedKm | null {
  if (log.length === 0) return null
  const kms = log.map((d) => d.odometer_km)
  const max = Math.max(...kms)
  return {
    odometer: max,
    since: log[0].day,
    kmVerified: max - Math.min(...kms),
    anomaly: log.some((d) => d.anomaly),
  }
}

export interface CapacityPoint {
  t: number
  kwh: number
  cold: boolean
}

/**
 * A5: usable-capacity points (kWh per 100 % SOC, server-computed for charges of >= 20 points). Charges below 10 °C are
 * marked "cold" (a cold pack takes less energy and charges slower); the trend uses only the others when it can.
 */
export function capacityPoints(samples: BatterySample[]): CapacityPoint[] {
  return samples
    .filter((s) => s.capacity_kwh != null)
    .map((s) => ({
      t: Date.parse(s.ended_at),
      kwh: Number(s.capacity_kwh),
      cold: s.temp_c != null && s.temp_c < 10,
    }))
    .sort((a, b) => a.t - b.t)
}

/** Median of the last `n` usable (non-cold when possible) points: the "today" estimate. */
export function capacityEstimate(points: CapacityPoint[], n = 5): number | null {
  const warm = points.filter((p) => !p.cold)
  const use = (warm.length >= 3 ? warm : points).slice(-n).map((p) => p.kwh)
  if (use.length === 0) return null
  const s = [...use].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10
}

export interface MonthDrive {
  month: string // YYYY-MM
  trips: number
  km: number
  kwhPer100: number | null
  regenPct: number | null
  regenKwh: number
}

/** A6/A7 private monthly summary (newest first). Consumption uses trips with energy; regen % is km-weighted. */
export function monthlyDrives(drives: DriveSample[]): MonthDrive[] {
  const by = new Map<string, DriveSample[]>()
  for (const d of drives) {
    const m = d.started_at.slice(0, 7)
    by.set(m, [...(by.get(m) ?? []), d])
  }
  return [...by.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, list]) => {
      const km = list.reduce((s, d) => s + Number(d.distance_km), 0)
      const withE = list.filter((d) => d.energy_kwh != null)
      const eKm = withE.reduce((s, d) => s + Number(d.distance_km), 0)
      const e = withE.reduce((s, d) => s + Number(d.energy_kwh), 0)
      const withR = list.filter((d) => d.regen_pct != null)
      const rKm = withR.reduce((s, d) => s + Number(d.distance_km), 0)
      return {
        month,
        trips: list.length,
        km: Math.round(km),
        kwhPer100: eKm > 0 ? Math.round((e * 1000) / eKm) / 10 : null,
        regenPct:
          rKm > 0
            ? Math.round(
                (withR.reduce((s, d) => s + Number(d.regen_pct) * Number(d.distance_km), 0) / rKm) * 10
              ) / 10
            : null,
        regenKwh: Math.round(list.reduce((s, d) => s + Number(d.regen_kwh ?? 0), 0) * 10) / 10,
      }
    })
}

const FAULT_LABELS: Record<string, string> = {
  braking_system: 'Sistema de frenos',
  esp: 'Control de estabilidad (ESP)',
  steer_system: 'Dirección',
  dynamical_system: 'Sistema de propulsión',
  driver_assist_system: 'Asistencias a la conducción',
  motor_oil_pressure: 'Presión de aceite / refrigeración',
  airbag: 'Airbag',
  elec_low_quantity: 'Batería baja',
  tire_pressure_alarm: 'Presión de neumáticos',
  tpms_fl: 'Presión neumático delantero izquierdo',
  tpms_fr: 'Presión neumático delantero derecho',
  tpms_rl: 'Presión neumático trasero izquierdo',
  tpms_rr: 'Presión neumático trasero derecho',
  charge_fault: 'Falla de carga',
  traction_alarm: 'Alarma de tracción',
}

/** Spanish label of a warning code; unknown codes are shown as they come. */
export function faultLabel(code: string): string {
  return FAULT_LABELS[code] ?? code.replace(/_/g, ' ')
}

const BUCKET_LABELS: Record<string, string> = {
  verano: 'Verano',
  otono: 'Otoño',
  invierno: 'Invierno',
  primavera: 'Primavera',
  lt5: 'Menos de 5 °C',
  '5_15': '5 a 15 °C',
  '15_25': '15 a 25 °C',
  ge25: '25 °C o más',
  lt30: 'Menos de 30 km/h',
  '30_60': '30 a 60 km/h',
  '60_90': '60 a 90 km/h',
  ge90: '90 km/h o más',
}

export const ATLAS_DIMENSIONS: { key: string; title: string; order: string[] }[] = [
  { key: 'season', title: 'Por estación', order: ['verano', 'otono', 'invierno', 'primavera'] },
  { key: 'temp', title: 'Por temperatura exterior', order: ['lt5', '5_15', '15_25', 'ge25'] },
  { key: 'speed', title: 'Por velocidad promedio', order: ['lt30', '30_60', '60_90', 'ge90'] },
]

export function bucketLabel(bucket: string): string {
  return BUCKET_LABELS[bucket] ?? bucket
}

/** Atlas rows of one dimension in display order. */
export function atlasRows(rows: AtlasRow[], dimension: string): AtlasRow[] {
  const order = ATLAS_DIMENSIONS.find((d) => d.key === dimension)?.order ?? []
  return rows
    .filter((r) => r.dimension === dimension)
    .sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket))
}

/** "Mes" label: 2026-11 -> "noviembre 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })
}
