// "Modo invitado" from WikiVigo (specs/guest-mode.md R4, migration 0085). The owner (or a member with control) turns the car's
// guest mode on or off from Mi Vigo; turning it off here needs no PIN, so it is also the way back when the PIN is forgotten.
// Read only through get_car_guest_mode(), which answers allowed:false for view-only members and people without a vehicle.
// Every read error -- including the function not existing before 0085 is applied -- yields null: the card stays hidden.
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { formatRelativeTime } from './format'
import { isOnline } from './carRemote'

export type GuestCarState = 'on' | 'off' | 'unsupported'
export type GuestRequestState = 'pending' | 'done' | 'failed' | 'cancelled' | 'expired'

export interface GuestCar {
  state: GuestCarState
  since: string | null
  reportedAt: string
}

export interface GuestRequest {
  id: string
  want: 'on' | 'off'
  state: GuestRequestState
  code: string | null
  /** Display name of who asked; '' when the profile has none; null when the account was deleted. */
  by: string | null
  createdAt: string
  sentAt: string | null
  finishedAt: string | null
  expiresAt: string | null
}

export type CarGuestState =
  | { allowed: false }
  | {
      allowed: true
      linked: boolean
      lastSeenAt: string | null
      car: GuestCar | null
      request: GuestRequest | null
    }

/** Poll while a request waits for the car; slower otherwise (the car may have changed it on its own screen). */
export const GUEST_POLL_PENDING_MS = 3_000
export const GUEST_POLL_IDLE_MS = 30_000
/** A request the car received but did not confirm within this time shows "Sin respuesta del auto" (as remote orders, E3). */
export const GUEST_NO_RESPONSE_MS = 60_000

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** get_car_guest_mode's JSON, checked field by field; null for anything unexpected. */
export function parseCarGuest(raw: unknown): CarGuestState | null {
  const o = record(raw)
  if (!o || typeof o.allowed !== 'boolean') return null
  if (!o.allowed) return { allowed: false }
  if (typeof o.linked !== 'boolean') return null
  let car: GuestCar | null = null
  const c = record(o.car)
  if (c) {
    if (
      (c.state !== 'on' && c.state !== 'off' && c.state !== 'unsupported') ||
      typeof c.reported_at !== 'string'
    )
      return null
    car = { state: c.state, since: str(c.since), reportedAt: c.reported_at }
  }
  let request: GuestRequest | null = null
  const r = record(o.request)
  if (r) {
    const states: GuestRequestState[] = ['pending', 'done', 'failed', 'cancelled', 'expired']
    if (
      typeof r.id !== 'string' ||
      (r.want !== 'on' && r.want !== 'off') ||
      !states.includes(r.state as GuestRequestState) ||
      typeof r.created_at !== 'string'
    )
      return null
    request = {
      id: r.id,
      want: r.want,
      state: r.state as GuestRequestState,
      code: str(r.code),
      by: str(r.by),
      createdAt: r.created_at,
      sentAt: str(r.sent_at),
      finishedAt: str(r.finished_at),
      expiresAt: str(r.expires_at),
    }
  }
  return { allowed: true, linked: o.linked, lastSeenAt: str(o.last_seen_at), car, request }
}

export async function fetchCarGuest(): Promise<CarGuestState | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('get_car_guest_mode')
    if (error) return null
    return parseCarGuest(data)
  } catch {
    return null
  }
}

const UNAVAILABLE = 'Sin conexión con el servidor.'
const SET_ERRORS: Record<string, string> = {
  not_allowed: 'Tu permiso en este vehículo es solo ver. Pedile a quien creó el vehículo que te dé control.',
  no_car: 'Tu vehículo todavía no tiene la pantalla del auto conectada.',
  not_supported: 'Tu auto todavía no tiene el modo invitado. Actualizá las mejoras con el instalador.',
  rate_limited: 'Lo cambiaste muchas veces seguidas. Esperá un rato y probá de nuevo.',
  not_pending: 'Ese pedido ya no estaba pendiente.',
  bad_request: 'No se pudo hacer el pedido.',
}

function rpcError(data: unknown): string | null {
  const o = record(data)
  if (o && o.ok === true) return null
  const code = o && typeof o.error === 'string' ? o.error : 'bad_request'
  return SET_ERRORS[code] ?? SET_ERRORS.bad_request
}

/** "Activar modo invitado" (true) / "Desactivar modo invitado" (false). Returns an error message or null. */
export async function setCarGuest(on: boolean): Promise<string | null> {
  if (!supabase) return UNAVAILABLE
  const { data, error } = await supabase.rpc('set_car_guest_mode', { p_on: on })
  if (error) return toFriendlyError(error)
  return rpcError(data)
}

/** "Cancelar pedido". Returns an error message or null. */
export async function cancelCarGuest(): Promise<string | null> {
  if (!supabase) return UNAVAILABLE
  const { data, error } = await supabase.rpc('cancel_car_guest_request')
  if (error) return toFriendlyError(error)
  return rpcError(data)
}

// ---------------------------------------------------------------------------------------------- wording

export const GUEST_EXPLAINER =
  'Esconde tus datos personales en la pantalla del auto (viajes, ubicación, Dashcam, fotos y las apps con tu cuenta) cuando ' +
  'se lo dejás a otra persona, por ejemplo en el lavadero o a un valet. El auto se maneja igual. En el auto se sale con tu PIN; ' +
  'desde acá lo podés desactivar sin PIN, también si te lo olvidaste.'

export const GUEST_FOOTER =
  'Lo ven y lo cambian solo quien creó el vehículo y quienes tienen control. Todos los integrantes reciben un aviso cuando cambia.'

const FAIL_WORDS: Record<string, string> = {
  unsupported: 'el auto no tiene el modo invitado instalado',
  no_pin: 'en el auto todavía no hay un PIN del dueño',
  failed: 'el auto no pudo cambiarlo',
  expired_on_car: 'le llegó tarde al auto y no lo aplicó',
}

export interface GuestView {
  /** Bold line: the car's state ("Modo invitado activado"). */
  title: string
  /** Muted line under the title: since when / how old the data is / connection. */
  detail: string
  /** The pending request or the last result, in words; null when there is nothing to say. */
  note: string | null
  /** The main button, or null while a request waits (then only "Cancelar pedido"). */
  action: { on: boolean; label: string } | null
  canCancel: boolean
  /** True while the card should poll quickly. */
  pending: boolean
}

function ago(iso: string, now: Date): string {
  return formatRelativeTime(new Date(iso), now)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function who(r: GuestRequest): string {
  if (r.by === null) return 'una cuenta borrada'
  return r.by || 'un integrante'
}

/** What the card shows for a supported car (car state on/off). Pure, so it is tested without React. */
export function guestView(
  s: { lastSeenAt: string | null; car: GuestCar; request: GuestRequest | null },
  now: Date = new Date()
): GuestView {
  const on = s.car.state === 'on'
  const title = on ? 'Modo invitado activado' : 'Modo invitado desactivado'
  const parts: string[] = []
  if (on && s.car.since) parts.push(`Desde ${ago(s.car.since, now)}`)
  parts.push(`Dato del auto de ${ago(s.car.reportedAt, now)}`)
  if (!isOnline(s.lastSeenAt, now)) parts.push('el auto ahora está sin conexión')
  const detail = parts.join(' · ')

  const r = s.request
  const verb = (want: 'on' | 'off') => (want === 'on' ? 'activar' : 'desactivar')
  let note: string | null = null
  let pending = false
  if (r && r.state === 'pending') {
    pending = true
    const asked = `${cap(who(r))} pidió ${verb(r.want)} el modo invitado ${ago(r.createdAt, now)}.`
    if (!r.sentAt) {
      note = isOnline(s.lastSeenAt, now)
        ? `${asked} Enviando al auto…`
        : `${asked} El auto está sin conexión: lo aplica cuando se encienda con internet.` +
          (r.want === 'on' ? ' Si no se conecta en 12 horas, el pedido se cancela solo.' : '')
    } else if (now.getTime() - new Date(r.sentAt).getTime() <= GUEST_NO_RESPONSE_MS) {
      note = `${asked} El auto lo recibió; esperando que confirme…`
    } else {
      note = `${asked} Sin respuesta del auto: lo recibió pero todavía no confirmó.`
    }
  } else if (r && r.finishedAt && now.getTime() - new Date(r.finishedAt).getTime() < 24 * 3600_000) {
    // Only the last day: an old result would only confuse.
    if (r.state === 'done') note = `Hecho: ${who(r)} lo pidió ${ago(r.createdAt, now)}.`
    else if (r.state === 'failed')
      note = `No se pudo ${verb(r.want)}: ${FAIL_WORDS[r.code ?? ''] ?? FAIL_WORDS.failed}.`
    else if (r.state === 'expired') note = 'El pedido se canceló solo: el auto no se conectó en 12 horas.'
    else if (r.state === 'cancelled') note = 'Pedido cancelado.'
  }

  return {
    title,
    detail,
    note,
    action: pending
      ? null
      : on
        ? { on: false, label: 'Desactivar modo invitado' }
        : { on: true, label: 'Activar modo invitado' },
    canCancel: pending,
    pending,
  }
}

export const GUEST_UNSUPPORTED_TEXT =
  'Tu auto todavía no puede usar el modo invitado desde acá. Actualizá las mejoras con el instalador (Preparar mi Vigo).'

export const GUEST_CONFIRM_ON =
  '¿Activar el modo invitado? La pantalla del auto va a esconder tus datos personales hasta que lo desactives con tu PIN en el auto o desde acá.'
export const GUEST_CONFIRM_OFF =
  '¿Desactivar el modo invitado? Quien tenga el auto va a volver a ver tus datos personales en la pantalla.'
