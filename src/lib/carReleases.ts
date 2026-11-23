// Car updates (specs/car-updates.md): the signed release list the moderator page publishes, the per-car status, and
// the Google notices for "Estado del auto". The server never signs: the maintainer signs each manifest offline
// (vigo-hack updater/tools/SignManifest.java) and this page only checks the signature before publishing, so a wrong
// paste is refused early. The car verifies again with its own compiled-in keys (the real boundary).
import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import type { Json, Tables } from './database.types'

export type CarReleaseRow = Tables<'car_releases'>
export type CarUpdateStatusRow = Tables<'car_update_status'>

/** The maintainer's public keys: identical to vigo-hack updater core Crypto.TRUSTED_KEYS (primary + spare, owner O1). */
export const TRUSTED_RELEASE_KEYS = [
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAENbMebmBR2dCXoCgVlX8AmUPnBlnk6t/SJ0i9J2pD7J252Q7KeibgBj1zHD5Ksm+GF4f+GUeVgoTTRTnY4rViWQ==',
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEwaoeGFe0cG6knbwuxI/Wr++JL6aIjjao/ilV/ga0b5OqyTOpbZa52Z2ZcrpZ3jq/35AlLuS7wPmT9RBTyT8vQQ==',
]

export const MANIFEST_HEADER = 'vigo-update 1'
export const GITHUB_DOWNLOAD_BASE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[A-Za-z0-9_.+-]+\/$/

export interface ManifestApp {
  pkg: string
  versionCode: number
  versionName: string
  files: { name: string; size: number; blob: string }[]
}

export interface ManifestNotice {
  pkg: string
  versionCode: number
  label: string
}

export interface ManifestSummary {
  serial: number
  issued: number
  expires: number
  kill: boolean
  rolloutPercent: number
  rolloutSalt: string
  firmware: string[]
  apps: ManifestApp[]
  notices: ManifestNotice[]
}

/**
 * Reads the manifest text the way the car does (updater core Manifest.parse, structure only: the car re-checks every
 * field). Returns an error text in Spanish for the moderator, or the summary.
 */
export function parseManifest(text: string): { summary: ManifestSummary } | { error: string } {
  if (text.includes('\r'))
    return { error: 'El texto tiene saltos de línea CRLF: pegá el archivo tal cual (LF).' }
  if (!text.startsWith(MANIFEST_HEADER + '\n')) return { error: 'Falta la primera línea "vigo-update 1".' }
  if (!text.endsWith('end\n'))
    return { error: 'El manifiesto debe terminar en una línea "end" y un salto de línea.' }
  if (new TextEncoder().encode(text).length > 65536) return { error: 'El manifiesto supera 64 KB.' }
  const s: Partial<ManifestSummary> = { firmware: [], apps: [], notices: [] }
  const lines = text.split('\n').slice(1, -1)
  let cur: ManifestApp | null = null
  for (const l of lines) {
    const f = l.split(' ')
    const n = (i: number) => (/^[0-9]{1,18}$/.test(f[i] ?? '') ? Number(f[i]) : NaN)
    switch (f[0]) {
      case 'serial':
        s.serial = n(1)
        break
      case 'issued':
        s.issued = n(1)
        break
      case 'expires':
        s.expires = n(1)
        break
      case 'kill':
        s.kill = f[1] === '1'
        break
      case 'rollout':
        s.rolloutPercent = n(1)
        s.rolloutSalt = f[2]
        break
      case 'firmware':
        s.firmware!.push(f[1])
        break
      case 'app':
        cur = { pkg: f[1], versionCode: n(2), versionName: f[3], files: [] }
        s.apps!.push(cur)
        break
      case 'file':
        if (!cur) return { error: `Línea "file" antes de una "app": ${l}` }
        cur.files.push({ name: f[1], size: n(2), blob: f[4] })
        break
      case 'notice':
        s.notices!.push({ pkg: f[1], versionCode: n(2), label: (f[3] ?? '').replace(/_/g, ' ') })
        break
      case 'end':
        break
      default:
        return { error: `Línea desconocida: ${l.slice(0, 60)}` }
    }
  }
  for (const k of ['serial', 'issued', 'expires', 'rolloutPercent'] as const) {
    if (s[k] === undefined || Number.isNaN(s[k])) return { error: `Falta o es inválido: ${k}` }
  }
  if (s.kill === undefined || !s.rolloutSalt) return { error: 'Faltan "kill" o "rollout".' }
  if ((s.rolloutPercent as number) > 100) return { error: 'El porcentaje de rollout es mayor a 100.' }
  return { summary: s as ManifestSummary }
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64.trim())
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** DER ECDSA signature (Java SHA256withECDSA) to the 64-byte r||s form WebCrypto verifies. null when malformed. */
export function derToP1363(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (der.length < 8 || der[0] !== 0x30) return null
  let i = 2
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f)
  const out = new Uint8Array(64)
  for (let part = 0; part < 2; part++) {
    if (der[i] !== 0x02) return null
    const len = der[i + 1]
    let v = der.subarray(i + 2, i + 2 + len)
    if (v.length !== len) return null
    while (v.length > 32 && v[0] === 0) v = v.subarray(1)
    if (v.length > 32) return null
    out.set(v, part * 32 + (32 - v.length))
    i += 2 + len
  }
  return i === der.length ? out : null
}

/** True when `signatureB64` (DER, base64, as SignManifest prints it) signs the exact manifest bytes with a trusted key. */
export async function verifyManifestSignature(
  manifest: string,
  signatureB64: string,
  keys: string[] = TRUSTED_RELEASE_KEYS
): Promise<boolean> {
  const der = b64ToBytes(signatureB64)
  const sig = der ? derToP1363(der) : null
  if (!sig) return false
  const data = new TextEncoder().encode(manifest)
  for (const k of keys) {
    try {
      const spki = b64ToBytes(k)
      if (!spki) continue
      const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
        'verify',
      ])
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)) return true
    } catch {
      // try the next key
    }
  }
  return false
}

/** Effective rollout percent: the signed one, capped by the server-side withhold. */
export function effectivePercent(r: Pick<CarReleaseRow, 'rollout_percent' | 'rollout_cap'>): number {
  return r.rollout_cap == null ? r.rollout_percent : Math.min(r.rollout_percent, r.rollout_cap)
}

export const PHASE_LABEL: Record<string, string> = {
  IDLE: 'Al día',
  STAGING: 'Descargando',
  STAGED: 'Lista para instalar',
  APPLYING: 'Instalando',
  TRIAL: 'Probando la actualización',
  ROLLING_BACK: 'Volviendo a la versión anterior',
}

export function phaseLabel(phase: string | null): string {
  return phase ? (PHASE_LABEL[phase] ?? phase) : 'Sin datos'
}

/** Counts per phase (moderator summary); cars that never checked count as "Sin datos". */
export function countPhases(rows: { phase: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = phaseLabel(r.phase)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

export interface CarUpdateAdminRow {
  vehicle_id: string
  members: string | null
  beta: boolean
  channel: string | null
  firmware: string | null
  installed: Json
  phase: string | null
  last_line: string | null
  serial: number | null
  offered_serial: number | null
  checked_at: string | null
  reported_at: string | null
}

export async function fetchReleases(): Promise<{ rows: CarReleaseRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: null }
  const { data, error } = await supabase
    .from('car_releases')
    .select('*')
    .order('serial', { ascending: false })
    .limit(30)
  return { rows: data ?? [], error: error ? toFriendlyError(error) : null }
}

export async function fetchCarUpdates(): Promise<{ rows: CarUpdateAdminRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: null }
  const { data, error } = await supabase.rpc('admin_list_car_updates')
  return { rows: (data ?? []), error: error ? toFriendlyError(error) : null }
}

export async function publishRelease(args: {
  channel: 'stable' | 'beta'
  manifest: string
  signature: string
  downloadBase: string
  note: string
}): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('admin_publish_car_release', {
    p_channel: args.channel,
    p_manifest: args.manifest,
    p_signature: args.signature.trim(),
    p_download_base: args.downloadBase.trim(),
    p_note: args.note,
  })
  return error ? toFriendlyError(error) : null
}

export async function setReleaseCap(id: string, cap: number | null): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  // null = no cap; the generated RPC arg type omits null
  const { error } = await supabase.rpc('admin_set_car_release_cap', { p_release: id, p_cap: cap as number })
  return error ? toFriendlyError(error) : null
}

export async function setCarBeta(vehicleId: string, beta: boolean): Promise<string | null> {
  if (!supabase) return 'Sin conexión con el servidor.'
  const { error } = await supabase.rpc('admin_set_car_beta', { p_vehicle: vehicleId, p_beta: beta })
  return error ? toFriendlyError(error) : null
}

// ---- "Estado del auto" (members) ----

export interface GoogleNotice {
  package: string
  version_code: number
  label: string
}

/** Google apps we watch for "Estado del auto" (owner O6), with the names owners know. */
export const GOOGLE_APP_NAMES: Record<string, string> = {
  'com.google.android.gms': 'Servicios de Google Play',
  'com.waze': 'Waze',
}

/** The member's own car update row (RLS); null when there is none or before migration 0059. */
export async function fetchMyCarUpdate(): Promise<CarUpdateStatusRow | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('car_update_status').select('*').limit(1).maybeSingle()
    return error ? null : data
  } catch {
    return null
  }
}

export async function fetchUpdateNotices(): Promise<GoogleNotice[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('car_update_notices')
    return error || !data ? [] : data
  } catch {
    return []
  }
}

/** The notices whose versionCode is newer than what the car reported installed (unknown installed = shown). */
export function pendingNotices(notices: GoogleNotice[], installed: Json | null | undefined): GoogleNotice[] {
  const inst =
    installed && typeof installed === 'object' && !Array.isArray(installed)
      ? (installed as Record<string, Json>)
      : {}
  return notices.filter((n) => {
    const v = inst[n.package]
    return typeof v !== 'number' || v < n.version_code
  })
}
