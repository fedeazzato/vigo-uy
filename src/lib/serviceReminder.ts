// A4 "Service reminders from the odometer" (specs/car-service-reminders-a4.md): which service is next for the member's car,
// from the odometer the linked car reports (car_status.odometer_km, migration 0054) and the vehicle's own service entries.
// The schedule is the importer's, as src/data/mantenimiento.json states it: first service at 5.000 km (free), then every
// 15.000 km or 12 months, whichever comes first; every 30.000 km it is the general service. vigo-hack charge_app core
// ServiceSchedule.java pins the same numbers (the car's own reminder in Carga).
import { supabase } from './supabaseClient'

export const FIRST_SERVICE_KM = 5_000
export const SERVICE_EVERY_KM = 15_000
export const GENERAL_EVERY_KM = 30_000
export const SERVICE_EVERY_MONTHS = 12
/** A service done up to this many km before a milestone counts for it (people go a little early). */
export const EARLY_KM = 2_000
/** "Soon" when the next milestone is this close. */
export const SOON_KM = 1_000

/** The milestone after `km`: 5.000, 15.000, 30.000, 45.000, ... */
export function milestoneAfter(km: number): number {
  if (km < FIRST_SERVICE_KM) return FIRST_SERVICE_KM
  return (Math.floor(km / SERVICE_EVERY_KM) + 1) * SERVICE_EVERY_KM
}

/** The service's name for a milestone. */
export function milestoneLabel(m: number): string {
  const km = m.toLocaleString('es-UY')
  if (m === FIRST_SERVICE_KM) return `Primer service (${km} km)`
  if (m % GENERAL_EVERY_KM === 0) return `Service general de ${km} km`
  return `Service de ${km} km`
}

export interface ServiceEntryLite {
  service_date: string
  odometer_km: number
}

export type ReminderState = 'ok' | 'soon' | 'due'

export interface ServiceReminder {
  milestoneKm: number
  label: string
  /** Negative = past the milestone. */
  kmLeft: number
  state: ReminderState
  /** The 12-month rule fired (last service more than 12 months ago). */
  byTime: boolean
  lastService: ServiceEntryLite | null
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

/**
 * The next service: the first milestone after the last recorded service's odometer plus EARLY_KM (a service done a little
 * early counts for the milestone it was meant for). It stays "due" until a service is recorded; the 12-month rule also makes
 * it due.
 */
export function nextService(
  odometerKm: number,
  entries: ServiceEntryLite[],
  now: Date = new Date()
): ServiceReminder {
  const last = entries.reduce<ServiceEntryLite | null>(
    (best, e) => (best === null || e.odometer_km > best.odometer_km ? e : best),
    null
  )
  const base = last ? last.odometer_km + EARLY_KM : 0
  const m = milestoneAfter(base)
  const kmLeft = m - odometerKm
  const byTime =
    last !== null && addMonths(last.service_date, SERVICE_EVERY_MONTHS).getTime() <= now.getTime()
  const state: ReminderState = kmLeft <= 0 || byTime ? 'due' : kmLeft <= SOON_KM ? 'soon' : 'ok'
  return { milestoneKm: m, label: milestoneLabel(m), kmLeft, state, byTime, lastService: last }
}

/** "Faltan 820 km" / "Te pasaste 300 km" / "Ya corresponde por tiempo (12 meses)". */
export function reminderText(r: ServiceReminder): string {
  if (r.kmLeft <= 0) {
    return r.kmLeft === 0
      ? 'Llegaste al kilometraje del service.'
      : `Te pasaste ${(-r.kmLeft).toLocaleString('es-UY')} km.`
  }
  const left = `Faltan ${r.kmLeft.toLocaleString('es-UY')} km.`
  return r.byTime ? `${left} Por tiempo ya corresponde: pasaron 12 meses desde el último service.` : left
}

/** The prefilled "new service" form (the draft): nothing is saved until the owner submits it. */
export function draftLink(r: ServiceReminder, odometerKm: number): string {
  const p = new URLSearchParams({ km: String(odometerKm), tipo: r.label })
  return `/costos/nuevo?${p.toString()}`
}

export interface ServiceReminderData {
  odometerKm: number
  observedAt: string
  entries: ServiceEntryLite[]
}

/**
 * The car's odometer and the vehicle's service entries (RLS: members read their vehicle's status; service entries are read by
 * vehicle_id, own or public). null when there is no odometer yet (no car, old car apps, or 0054 not applied).
 */
export async function fetchServiceReminderData(): Promise<ServiceReminderData | null> {
  const client = supabase
  if (!client) return null
  try {
    const status = await client
      .from('car_status')
      .select('vehicle_id, odometer_km, observed_at')
      .maybeSingle()
    if (status.error || !status.data || status.data.odometer_km == null) return null
    const entries = await client
      .from('service_entries')
      .select('service_date, odometer_km')
      .eq('vehicle_id', status.data.vehicle_id)
      .order('odometer_km', { ascending: false })
      .limit(20)
    return {
      odometerKm: status.data.odometer_km,
      observedAt: status.data.observed_at,
      entries: entries.error ? [] : (entries.data ?? []),
    }
  } catch {
    return null
  }
}
