// Charging check-in drafts from the car (specs/car-charge-checkins.md, PLAN A2): Carga noticed a charge (or a failed
// attempt) at a WikiVigo station; the server matched the station and kept only that. Members review them on "Borradores
// del auto"; confirming writes a normal public check-in in the member's name. Degrades to "no drafts" before 0060.
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import type { Tables } from './database.types'

export type CarChargeDraftRow = Tables<'car_charge_drafts'> & {
  charging_stations?: { name: string } | null
}

const COLUMNS =
  'id, vehicle_id, device_id, client_id, station_id, distance_m, result, started_at, ended_at, energy_kwh, max_kw, avg_kw, charging_min, start_soc, end_soc, end_reason, status, report_id, received_at, charging_stations(name)'

export async function fetchPendingChargeDrafts(): Promise<CarChargeDraftRow[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('car_charge_drafts')
      .select(COLUMNS)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(50)
    if (error || !data) return null
    return data as unknown as CarChargeDraftRow[]
  } catch {
    return null
  }
}

export type CheckinStatus = 'funciono' | 'fallo' | 'ocupado'

/** Publishes the check-in (station_reports row in the caller's name). Returns an error text or null. */
export async function confirmChargeDraft(
  id: string,
  status: CheckinStatus,
  note: string
): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('confirm_car_charge_draft', {
    p_id: id,
    p_status: status,
    p_note: note.trim() || null,
  })
  return error ? toFriendlyError(error) : null
}

export async function discardChargeDraft(id: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.from('car_charge_drafts').update({ status: 'discarded' }).eq('id', id)
    return !error
  } catch {
    return false
  }
}

const fmt1 = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: 1 })

/** Title and detail line of a draft, in the words of the check-in form. */
export function describeChargeDraft(d: CarChargeDraftRow): { title: string; detail: string } {
  const station = d.charging_stations?.name ?? 'una estación'
  const date = new Date(d.started_at).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' })
  if (d.result === 'fallo') {
    const minutes = Math.max(1, Math.round((Date.parse(d.ended_at) - Date.parse(d.started_at)) / 60000))
    return {
      title: `¿Falló la carga en ${station}?`,
      detail: `${date} · el auto estuvo enchufado ${minutes} min sin recibir corriente`,
    }
  }
  const parts = [date]
  if (d.max_kw != null) parts.push(`hasta ${fmt1(d.max_kw)} kW`)
  if (d.energy_kwh != null) parts.push(`${fmt1(d.energy_kwh)} kWh`)
  if (d.charging_min != null) parts.push(`${d.charging_min} min`)
  if (d.start_soc != null && d.end_soc != null) parts.push(`${d.start_soc} → ${d.end_soc} %`)
  return {
    title:
      d.max_kw != null
        ? `¿Cargaste en ${station}? Funcionó a ${fmt1(d.max_kw)} kW`
        : `¿Cargaste en ${station}?`,
    detail: parts.join(' · '),
  }
}
