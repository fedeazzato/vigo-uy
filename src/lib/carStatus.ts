// Status of the linked car (specs/car-status-e1.md R4): fetch + wording. "Estado del auto" is the only place the site shows
// the car's status (battery, range, cable and, for a fresh live row, time to full and charge limit); "Control remoto" reads
// the row only to drive its controls.
import { supabase } from './supabaseClient'
import { formatRelativeTime } from './format'
import type { CarStatus } from '../types'

const CAR_STATUS_COLUMNS =
  'vehicle_id, event, soc, range_km, charging, plugged, charge_end_reason, remain_charge_min, limit_pct, observed_at, received_at'

/** A live snapshot older than this (server receive time) is not shown as live (specs/car-remote-e3.md R2). */
export const LIVE_FRESH_MS = 2 * 60_000
/** The card re-reads the row this often while the page is visible (the car sends a live row every 10 s while on). */
export const STATUS_POLL_MS = 10_000

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

/** True for a live snapshot the server received recently (server clock: the car's clock may be off). */
export function isLiveFresh<T extends Pick<CarStatus, 'event' | 'received_at'>>(
  s: T | null,
  now: Date = new Date()
): s is T {
  if (!s || s.event !== 'live') return false
  const t = new Date(s.received_at).getTime()
  return Number.isFinite(t) && now.getTime() - t < LIVE_FRESH_MS
}

/** 95 -> "~1 h 35 min", 120 -> "~2 h", 40 -> "~40 min", 0 -> "menos de 1 min". */
export function formatRemain(minutes: number): string {
  if (minutes < 1) return 'menos de 1 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `~${m} min`
  return m === 0 ? `~${h} h` : `~${h} h ${m} min`
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
  /** A fresh live row: the car is on and sending right now. */
  live: boolean
  /** "Carga completa en ~1 h 35 min": fresh live row while charging only. */
  remain: string | null
  /** "Límite de carga 90 %": fresh live row only. */
  limit: string | null
}

/**
 * Spanish wording of a status row: "Batería 80 %", "Autonomía 266 km", "Enchufado", "al terminar una carga: llegó al límite · hace 2 h";
 * for a fresh live row also "Carga completa en ~1 h 35 min" (while charging) and "Límite de carga 90 %".
 */
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
  const live = isLiveFresh(s, now)
  return {
    battery: s.soc == null ? null : `${s.soc} %`,
    range: s.range_km == null ? null : `${s.range_km} km`,
    plug,
    when: `${event}${ago}`,
    live,
    remain:
      live && s.charging === true && s.remain_charge_min != null
        ? `Carga completa en ${formatRemain(s.remain_charge_min)}`
        : null,
    limit: live && s.limit_pct != null ? `Límite de carga ${s.limit_pct} %` : null,
  }
}
