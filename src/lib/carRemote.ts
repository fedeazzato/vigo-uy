// "Control remoto" (specs/car-remote-e3.md R6): remote orders for the linked car and its connection state. The status row is
// read only to drive the controls (stop button, limit stepper); "Estado del auto" (carStatus.ts) is the one that shows it.
// Fetch helpers + Spanish wording. The car picks an order up only while it is awake and online; an order it does not pick
// up within 2 minutes expires (server side, and shown as expired here as soon as the time has passed).
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { fetchAuthorNames } from './communityData'
import { formatRelativeTime } from './format'
import type { CarOrder, CarRemoteStatus } from '../types'

export { formatRemain, isLiveFresh, LIVE_FRESH_MS } from './carStatus'

export type CarOrderKind =
  'windows_open_all' | 'windows_close_all' | 'ventilate' | 'charge_limit' | 'charge_stop' | 'navigate'

/** A destination for a `navigate` order (specs/car-navigate-b2.md R1): coordinates plus the name the car shows. */
export interface CarDestination {
  lat: number
  lon: number
  label: string
}

// Explicit columns only (as every car table): car_devices refuses `*` for clients (0045 column grants).
const DEVICE_COLUMNS = 'id, last_seen_at, revoked_at'
const STATUS_COLUMNS =
  'vehicle_id, event, soc, range_km, charging, plugged, remain_charge_min, limit_pct, observed_at, received_at'
const ORDER_COLUMNS =
  'id, kind, args, state, created_by, created_at, expires_at, taken_at, finished_at, result_code, result_text'

export const ORDER_LIST_SIZE = 10
export const POLL_MS = 3000
/**
 * "En línea" when the car called within this time. It polls every 10 s while on or charging; 35 s (30 s plus a margin)
 * tolerates one late poll without flipping to "Sin conexión".
 */
export const ONLINE_MS = 35_000
/**
 * A taken order with no result after this long (since taken_at, server clock) shows as "Sin respuesta del auto". Display
 * only: the row stays `taken` and a late result still updates it.
 */
export const NO_RESPONSE_MS = 60_000
export const LIMIT_MIN = 60
export const LIMIT_MAX = 100
export const LIMIT_STEP = 5

export interface CarRemoteData {
  /** At least one non-revoked linked device. */
  hasCar: boolean
  /** Newest last_seen_at among the active devices. */
  lastSeenAt: string | null
  status: CarRemoteStatus | null
  orders: CarOrder[]
  /** created_by -> display name. */
  names: Record<string, string>
}

/**
 * Devices, status and the last orders of the caller's vehicle (RLS: members only). Any error -- including the table or the
 * new columns not existing yet because migration 0052 is not applied -- yields `null`: the card stays hidden.
 */
export async function fetchCarRemote(): Promise<CarRemoteData | null> {
  const client = supabase
  if (!client) return null
  try {
    const [devices, status, orders] = await Promise.all([
      client.from('car_devices').select(DEVICE_COLUMNS),
      client.from('car_status').select(STATUS_COLUMNS).maybeSingle(),
      client
        .from('car_orders')
        .select(ORDER_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(ORDER_LIST_SIZE),
    ])
    if (devices.error || status.error || orders.error) return null
    const active = (devices.data ?? []).filter((d) => !d.revoked_at)
    const lastSeenAt =
      active
        .map((d) => d.last_seen_at)
        .filter((t): t is string => Boolean(t))
        .sort()
        .pop() ?? null
    const list = orders.data ?? []
    const ids = [...new Set(list.map((o) => o.created_by).filter((id): id is string => Boolean(id)))]
    const names = ids.length > 0 ? await fetchAuthorNames(ids) : {}
    return { hasCar: active.length > 0, lastSeenAt, status: status.data ?? null, orders: list, names }
  } catch {
    return null
  }
}

const CREATE_ERRORS: Record<string, string> = {
  no_car: 'No hay un auto vinculado a tu vehículo.',
  rate_limited: 'Mandaste muchas órdenes seguidas. Esperá un minuto y probá de nuevo.',
  bad_request: 'Esa orden no es válida.',
}
const CANCEL_ERRORS: Record<string, string> = {
  not_queued: 'Ya no se puede cancelar: el auto la recibió o la orden venció.',
  not_found: 'No encontramos esa orden.',
}
const UNAVAILABLE = 'El control remoto no está disponible en este momento.'

function rpcError(data: unknown, table: Record<string, string>): string | null {
  const row = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
  if (!row) return UNAVAILABLE
  if (typeof row.error === 'string') return table[row.error] ?? UNAVAILABLE
  return row.ok === true ? null : UNAVAILABLE
}

/**
 * Queues an order; a newer order replaces a queued older one (the car only runs the latest intent). `navigate` takes its
 * destination through sendDestination (carNavigate.ts), which calls this with `dest`.
 */
export async function createCarOrder(
  kind: CarOrderKind,
  pct?: number,
  dest?: CarDestination
): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE }
  const p_args =
    kind === 'charge_limit'
      ? { pct: pct ?? 0 }
      : kind === 'navigate'
        ? { lat: dest?.lat ?? 0, lon: dest?.lon ?? 0, label: dest?.label ?? '' }
        : {}
  const { data, error } = await supabase.rpc('create_car_order', { p_kind: kind, p_args })
  if (error) return { error: toFriendlyError(error) }
  return { error: rpcError(data, CREATE_ERRORS) }
}

export async function cancelCarOrder(id: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE }
  const { data, error } = await supabase.rpc('cancel_car_order', { p_id: id })
  if (error) return { error: toFriendlyError(error) }
  return { error: rpcError(data, CANCEL_ERRORS) }
}

// ---------------------------------------------------------------------------------------------- wording

export function isOnline(lastSeenAt: string | null, now: Date = new Date()): boolean {
  if (!lastSeenAt) return false
  const t = new Date(lastSeenAt).getTime()
  return Number.isFinite(t) && now.getTime() - t < ONLINE_MS
}

/** "En línea" / "Sin conexión — visto hace 2 h" / "Sin conexión — todavía no se conectó". */
export function connectionLabel(lastSeenAt: string | null, now: Date = new Date()): string {
  if (isOnline(lastSeenAt, now)) return 'En línea'
  if (!lastSeenAt) return 'Sin conexión — todavía no se conectó'
  return `Sin conexión — visto ${formatRelativeTime(new Date(lastSeenAt), now)}`
}

/** Clamp to 60..100 on the 5 % grid of the stepper. */
export function clampLimit(pct: number): number {
  const stepped = Math.round(pct / LIMIT_STEP) * LIMIT_STEP
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, stepped))
}

function argPct(args: unknown): number | null {
  const pct = typeof args === 'object' && args !== null ? (args as Record<string, unknown>).pct : null
  return typeof pct === 'number' ? pct : null
}

/** The order in words: "Cerrar todas las ventanas", "Límite de carga: 80 %". */
export function orderKindLabel(o: Pick<CarOrder, 'kind' | 'args'>): string {
  switch (o.kind) {
    case 'windows_open_all':
      return 'Abrir todas las ventanas'
    case 'windows_close_all':
      return 'Cerrar todas las ventanas'
    case 'ventilate':
      return 'Ventilar'
    case 'charge_stop':
      return 'Detener la carga'
    case 'charge_limit': {
      const pct = argPct(o.args)
      return pct == null ? 'Límite de carga' : `Límite de carga: ${pct} %`
    }
    case 'navigate': {
      const label =
        typeof o.args === 'object' && o.args !== null ? (o.args as Record<string, unknown>).label : null
      return typeof label === 'string' && label ? `Navegar a ${label}` : 'Navegar a un destino'
    }
    default:
      return o.kind
  }
}

/** R3 result codes in words (why an order failed or expired). */
export const RESULT_WORDS: Record<string, string> = {
  remote_off: 'los comandos remotos están apagados en Copiloto',
  not_parked: 'el auto no estaba en P y detenido',
  not_calibrated: 'falta calibrar «Ventilar» en Copiloto',
  car_wash: 'el modo lavadero no deja abrir las ventanas',
  not_charging: 'el auto no estaba cargando',
  car_error: 'el auto no pudo hacerlo',
  busy: 'demasiadas órdenes seguidas en el auto',
  no_executor: 'Copiloto no respondió (¿está instalado?)',
  expired_on_car: 'le llegó tarde al auto y no la ejecutó',
  no_app: 'Waze no está instalado en el auto o no abrió el destino',
  not_picked_up: 'el auto no la recibió en 2 minutos',
  superseded: 'la reemplazó una orden más nueva',
}

export type OrderPhase = 'queued' | 'taken' | 'no_response' | 'done' | 'failed' | 'expired' | 'cancelled'

/**
 * The state to show: a queued order past expires_at is already expired (the server marks it on the next order call); a taken
 * order without a result for more than NO_RESPONSE_MS is "no_response" (the server keeps it taken).
 */
export function orderPhase(
  o: Pick<CarOrder, 'state' | 'expires_at' | 'taken_at'>,
  now: Date = new Date()
): OrderPhase {
  if (o.state === 'queued' && new Date(o.expires_at).getTime() <= now.getTime()) return 'expired'
  if (o.state === 'taken' && o.taken_at && now.getTime() - new Date(o.taken_at).getTime() > NO_RESPONSE_MS) {
    return 'no_response'
  }
  switch (o.state) {
    case 'queued':
    case 'taken':
    case 'done':
    case 'failed':
    case 'expired':
    case 'cancelled':
      return o.state
    default:
      return 'failed'
  }
}

export interface OrderStateView {
  icon: string
  label: string
  /** Muted explanation: the failure / expiry reason in words. */
  detail: string | null
}

export function orderStateView(o: CarOrder, now: Date = new Date()): OrderStateView {
  const phase = orderPhase(o, now)
  const reason = o.result_code ? (RESULT_WORDS[o.result_code] ?? null) : null
  switch (phase) {
    case 'queued':
      return { icon: '⏳', label: 'En cola', detail: 'Esperando que el auto la reciba' }
    case 'taken':
      return { icon: '📶', label: 'Recibida', detail: 'El auto la está ejecutando' }
    case 'no_response':
      return { icon: '❔', label: 'Sin respuesta del auto', detail: 'La recibió pero no avisó si la hizo' }
    case 'done':
      return { icon: '✅', label: 'Hecha', detail: null }
    case 'failed':
      return { icon: '⚠️', label: 'Falló', detail: reason }
    case 'expired':
      return { icon: '⌛', label: 'Vencida', detail: reason ?? RESULT_WORDS.not_picked_up }
    case 'cancelled':
      return { icon: '✖️', label: 'Cancelada', detail: null }
  }
}

/** "Ana · hace 5 min" (who sent it, when). */
export function orderMeta(o: CarOrder, names: Record<string, string>, now: Date = new Date()): string {
  const who = o.created_by ? (names[o.created_by] ?? 'un miembro') : 'una cuenta borrada'
  return `${who} · ${formatRelativeTime(new Date(o.created_at), now)}`
}
