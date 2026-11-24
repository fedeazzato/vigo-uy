// Car link, phase 0 (specs/car-link-phase0.md): the web side of pairing a
// car head unit to the signed-in member's vehicle, and the linked-devices
// list. The car side (and the signed device protocol) live in the companion
// repo and in supabase/functions/car-device.
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { fetchAuthorNames } from './communityData'
import { formatDate, formatRelativeTime } from './format'
import type { CarDevice } from '../types'

// Same alphabet as the vehicle join code: no lookalikes (I/L/O/0/1).
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const PAIRING_CODE_LENGTH = 6
export const MAX_DEVICE_NAME_LENGTH = 40

// Explicit columns only: `authenticated` is not granted public_key or the
// replay/rate counters (migration 0045), so a `select('*')` is refused.
export const CAR_DEVICE_COLUMNS =
  'id, vehicle_id, name, app_version, created_by, created_at, last_seen_at, revoked_at, revoked_by'

export const INVALID_PAIRING_CODE_MESSAGE =
  'Código no válido o vencido. Pedí uno nuevo en la pantalla del auto.'
const UNAVAILABLE_MESSAGE = 'Conectar la pantalla no está disponible en este momento.'

/**
 * Accepts what people paste or type: "k7q2m9", "K7Q-2M9", " K7Q 2M9 ", or the
 * whole link from the car's QR (".../#/mi-vigo/vincular?c=K7Q2M9").
 * Returns uppercase letters and digits only; validity is a separate check.
 */
export function normalizePairingCode(input: string): string {
  const fromLink = /[?&]c=([^&#\s]*)/i.exec(input)
  const raw = fromLink ? fromLink[1] : input
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidPairingCode(code: string): boolean {
  return code.length === PAIRING_CODE_LENGTH && [...code].every((ch) => PAIRING_CODE_ALPHABET.includes(ch))
}

/** True when the code has a character the car never shows (I, L, O, 0, 1). */
export function hasLookalikeCharacters(code: string): boolean {
  return /[ILO01]/.test(code)
}

export interface ClaimedDevice {
  deviceId: string
  name: string
}

/** Binds the car that showed `code` to the caller's vehicle. */
export async function claimCarPairing(
  code: string,
  name: string
): Promise<{ device: ClaimedDevice | null; error: string | null }> {
  if (!supabase) return { device: null, error: UNAVAILABLE_MESSAGE }
  const trimmed = name.trim()
  const { data, error } = await supabase.rpc('claim_car_pairing', {
    p_code: code,
    ...(trimmed ? { p_name: trimmed.slice(0, MAX_DEVICE_NAME_LENGTH) } : {}),
  })
  if (error) return { device: null, error: toFriendlyError(error) }
  // Unknown, expired and already-used codes return null instead of raising,
  // so the server can count the failed attempt (rate limit).
  const row = data as { device_id?: unknown; name?: unknown } | null
  if (!row || typeof row.device_id !== 'string') return { device: null, error: INVALID_PAIRING_CODE_MESSAGE }
  return {
    device: { deviceId: row.device_id, name: typeof row.name === 'string' ? row.name : '' },
    error: null,
  }
}

/** Active devices first, newest first within each group. */
export function sortCarDevices(devices: CarDevice[]): CarDevice[] {
  return [...devices].sort((a, b) => {
    const ar = a.revoked_at ? 1 : 0
    const br = b.revoked_at ? 1 : 0
    if (ar !== br) return ar - br
    return b.created_at.localeCompare(a.created_at)
  })
}

/** The caller's vehicle's devices (RLS: members only). */
export async function fetchCarDevices(): Promise<{ devices: CarDevice[]; error: string | null }> {
  if (!supabase) return { devices: [], error: null }
  const { data, error } = await supabase.from('car_devices').select(CAR_DEVICE_COLUMNS)
  if (error) return { devices: [], error: toFriendlyError(error) }
  return { devices: sortCarDevices(data ?? []), error: null }
}

export async function revokeCarDevice(deviceId: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: UNAVAILABLE_MESSAGE }
  const { error } = await supabase.rpc('revoke_car_device', { p_device_id: deviceId })
  return { error: error ? toFriendlyError(error) : null }
}

/** Display names of the caller's vehicle members, sorted (who the car will be linked to). */
export async function fetchMyVehicleMemberNames(): Promise<string[]> {
  if (!supabase) return []
  const { data } = await supabase.from('vehicle_members').select('user_id')
  const ids = (data ?? []).map((m: { user_id: string }) => m.user_id)
  if (ids.length === 0) return []
  const names = await fetchAuthorNames(ids)
  return ids.map((id) => names[id] ?? 'un usuario').sort((a, b) => a.localeCompare(b, 'es'))
}

function localIsoDate(timestamp: string): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "13 nov" / "13 nov 2025" for a timestamptz. */
export function formatTimestampDate(timestamp: string, now: Date = new Date()): string {
  return formatDate(localIsoDate(timestamp), now)
}

export function lastSeenLabel(lastSeenAt: string | null, now: Date = new Date()): string {
  if (!lastSeenAt) return 'Todavía no se conectó'
  return `Última conexión: ${formatRelativeTime(new Date(lastSeenAt), now)}`
}
