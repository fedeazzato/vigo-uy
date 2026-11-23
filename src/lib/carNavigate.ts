// B2 "Enviar al auto" (specs/car-navigate-b2.md): send a destination (a station, a place or address, a stop of a trip) to the
// vehicle's linked car. It is a `navigate` remote order (carRemote.ts / migration 0055): the car opens Waze navigation to the
// coordinates and shows the label. The car only picks orders up while it is on (or charging) and online; an order it does not
// pick up within 2 minutes expires.
import { supabase } from './supabaseClient'
import { createCarOrder, type CarDestination } from './carRemote'

export const LABEL_MAX = 80

/** Control characters removed, spaces collapsed, trimmed, at most LABEL_MAX characters (the server applies the same cut). */
export function cleanLabel(label: string): string {
  const s = label
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
  return [...s].slice(0, LABEL_MAX).join('').trim()
}

/** A destination the server accepts: finite coordinates in range, not (0, 0), a non-empty label. */
export function validDestination(d: CarDestination): boolean {
  return (
    Number.isFinite(d.lat) &&
    Number.isFinite(d.lon) &&
    Math.abs(d.lat) <= 90 &&
    Math.abs(d.lon) <= 180 &&
    !(d.lat === 0 && d.lon === 0) &&
    cleanLabel(d.label).length > 0
  )
}

/** Queues the navigate order. Coordinates are rounded to 6 decimals (~10 cm), like the server does. */
export async function sendDestination(d: CarDestination): Promise<{ error: string | null }> {
  if (!validDestination(d)) return { error: 'Ese destino no tiene una ubicación válida.' }
  const round = (n: number) => Math.round(n * 1e6) / 1e6
  return createCarOrder('navigate', undefined, {
    lat: round(d.lat),
    lon: round(d.lon),
    label: cleanLabel(d.label),
  })
}

export interface CarLink {
  /** The signed-in member's vehicle has an active linked car. */
  hasCar: boolean
  /** Copiloto's "Comandos remotos" switch as the car last reported it; null = unknown (old car apps, or 0054 not applied). */
  remoteOn: boolean | null
}

const NO_CAR: CarLink = { hasCar: false, remoteOn: null }
const CACHE_MS = 60_000
let cache: { at: number; value: Promise<CarLink> } | null = null

/** Test hook: forget the cached link. */
export function resetCarLinkCache(): void {
  cache = null
}

async function loadCarLink(): Promise<CarLink> {
  const client = supabase
  if (!client) return NO_CAR
  try {
    // RLS: members see only their vehicle's rows. Explicit columns only (car_devices column grants, 0045).
    const devices = await client.from('car_devices').select('id, revoked_at')
    if (devices.error) return NO_CAR
    const hasCar = (devices.data ?? []).some((d) => !d.revoked_at)
    if (!hasCar) return NO_CAR
    // A separate read: before 0054 is applied the column does not exist and this fails; the button still works.
    const status = await client.from('car_status').select('remote_on').maybeSingle()
    const remoteOn = !status.error && status.data ? (status.data.remote_on ?? null) : null
    return { hasCar, remoteOn }
  } catch {
    return NO_CAR
  }
}

/** The caller's car link, cached for a minute (many "Enviar al auto" buttons on one page share one read). */
export function fetchCarLink(now: number = Date.now()): Promise<CarLink> {
  if (!cache || now - cache.at > CACHE_MS) cache = { at: now, value: loadCarLink() }
  return cache.value
}

/**
 * The notice shown before sending (spec R4): navigation is allowed while driving because it only sets a destination, but the
 * driver must not handle the screen. Kept here so the component and the tests share the exact wording.
 */
export const DRIVING_NOTICE =
  'Si el auto está en marcha, Waze cambia el destino en pantalla y el auto muestra quién lo mandó. Quien maneja no tiene que tocar nada.'
export const DELIVERY_NOTICE =
  'El auto lo recibe solo si está encendido (o cargando) y con internet; si no lo recibe en 2 minutos, se cancela.'
export const REMOTE_OFF_NOTICE =
  'Los comandos remotos están apagados en el auto (Copiloto › Ajustes › Comandos remotos). Activalos para recibir destinos.'
