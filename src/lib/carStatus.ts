// Last known status of the linked car (specs/car-status-e1.md R4): fetch + wording.
import { supabase } from './supabaseClient'
import { formatRelativeTime } from './format'
import type { CarStatus } from '../types'

const CAR_STATUS_COLUMNS =
  'vehicle_id, event, soc, range_km, charging, plugged, charge_end_reason, observed_at, received_at'

/**
 * The caller's vehicle status row (RLS: members of that vehicle only). Any error -- including the table not existing yet
 * because migration 0048 is not applied -- yields `null`: the card simply stays hidden, the page never breaks.
 */
export async function fetchCarStatus(): Promise<CarStatus | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('car_status').select(CAR_STATUS_COLUMNS).maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

const REASON_WORDS: Record<string, string> = {
  completa: 'carga completa',
  limite: 'llegó al límite',
  desenchufado: 'lo desenchufaron',
  fallo: 'con un fallo',
  detenida: 'se detuvo',
}

export interface CarStatusView {
  battery: string | null
  range: string | null
  plug: string | null
  when: string
}

/** Spanish wording of a status row: "Batería 80 %", "Autonomía 266 km", "Enchufado", "al terminar una carga: llegó al límite · hace 2 h". */
export function describeCarStatus(s: CarStatus, now: Date = new Date()): CarStatusView {
  const plug = s.charging === true ? 'Cargando' : s.plugged === true ? 'Enchufado' : s.plugged === false ? 'Desenchufado' : null
  // 'live' (specs/car-remote-e3.md R2): a snapshot the car sent while awake, with its orders poll.
  let event =
    s.event === 'charge_end'
      ? 'al terminar una carga'
      : s.event === 'live'
        ? 'con el auto encendido'
        : 'al terminar un viaje'
  const reason = s.event === 'charge_end' && s.charge_end_reason ? REASON_WORDS[s.charge_end_reason] : undefined
  if (reason) event += `: ${reason}`
  const observed = new Date(s.observed_at)
  const ago = Number.isNaN(observed.getTime()) ? '' : ` · ${formatRelativeTime(observed, now)}`
  return {
    battery: s.soc == null ? null : `${s.soc} %`,
    range: s.range_km == null ? null : `${s.range_km} km`,
    plug,
    when: `${event}${ago}`,
  }
}
