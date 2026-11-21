// Car device protocol v1 (specs/car-link-phase0.md R2): signature
// verification and request handling for the `car-device` Edge Function.
//
// Pure TypeScript on WebCrypto, no imports: the Deno entry point
// (../car-device/index.ts) injects the database access, and Vitest tests
// this module directly under Node.
//
// Every request is a JSON body signed by the car's Android Keystore key
// (ECDSA P-256, SHA-256) over "vigo-car-v1\n" + the exact body bytes; the
// signature travels base64-encoded in IEEE P1363 form (r || s, 64 bytes) in
// the x-vigo-signature header. The SQL functions do the stateful part
// (replay guard, rate limit, revocation, bound vehicle) after this module has
// verified the signature.

export const PROTOCOL_VERSION = 1
export const SIGNING_PREFIX = 'vigo-car-v1\n'
export const SIGNATURE_HEADER = 'x-vigo-signature'
// 32 KB since the trip_draft action (specs/car-trip-drafts.md D4): every action keeps its own strict parser.
export const MAX_BODY_BYTES = 32768
export const MAX_SKEW_MS = 5 * 60 * 1000

// The fixed 27-byte DER prefix of an uncompressed P-256 SubjectPublicKeyInfo,
// base64; same pattern as public.is_p256_spki in migration 0045.
const P256_SPKI = /^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$/
const PAIRING_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APP_VERSION = /^[0-9A-Za-z._+-]{1,20}$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const IV_B64 = /^[A-Za-z0-9+/]{16}$/

export type CarErrorCode =
  | 'bad_request'
  | 'bad_signature'
  | 'clock'
  | 'method'
  | 'replay'
  | 'revoked'
  | 'too_large'
  | 'rate_limited'
  | 'server'
  | 'no_inbox'
  | 'stale_key'

const STATUS: Record<CarErrorCode, number> = {
  bad_request: 400,
  bad_signature: 401,
  clock: 401,
  method: 405,
  replay: 409,
  revoked: 410,
  too_large: 413,
  rate_limited: 429,
  server: 500,
  no_inbox: 404,
  stale_key: 409,
}

/** What the SQL guard (car_device_accept) may answer, mapped to the wire. */
const GUARD_ERRORS: Record<string, CarErrorCode> = {
  unknown: 'bad_signature', // indistinguishable from a bad signature: no oracle
  revoked: 'revoked',
  clock: 'clock',
  replay: 'replay',
  rate_limited: 'rate_limited',
  bad_request: 'bad_request', // car_submit_status: a value the database refuses
  no_inbox: 'no_inbox', // Bóveda inbox: nobody to send to (no key published / recipient left the vehicle)
  stale_key: 'stale_key', // Bóveda inbox: encrypted to a rotated key
}

export interface RpcResult {
  data: unknown
  error: string | null
}

/** Calls a SQL function with the service role (PostgREST /rest/v1/rpc). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>

export interface HandlerDeps {
  rpc: Rpc
  now: () => number
  log?: (message: string) => void
}

export type CarRequest =
  | { action: 'poll'; ts: number; code: string }
  | { action: 'heartbeat'; ts: number; deviceId: string; appVersion: string | null }
  | { action: 'unpair'; ts: number; deviceId: string }
  | { action: 'status'; ts: number; deviceId: string; status: CarStatus }
  | { action: 'inbox_key'; ts: number; deviceId: string }
  | { action: 'trip_draft'; ts: number; deviceId: string; draft: CarTripDraft }
  | {
      action: 'inbox_put'
      ts: number
      deviceId: string
      kind: 'dashcam_recovery'
      keyId: string
      epk: string
      iv: string
      ciphertext: string
    }

/** Last known status snapshot (specs/car-status-e1.md); no location field exists. */
export interface CarStatus {
  event: 'trip_end' | 'charge_end'
  observed_at: number
  soc: number | null
  range_km: number | null
  charging: boolean | null
  plugged: boolean | null
  charge_end_reason: string | null
}

/** A trip shared from the car as a draft (specs/car-trip-drafts.md); route and charge locations are what the driver chose to share. */
export interface CarTripDraftCharge {
  started_at: number
  ended_at: number
  start_soc?: number
  end_soc?: number
  energy_kwh?: number
  end_reason?: string
  lat?: number
  lon?: number
}

export interface CarTripDraft {
  client_id: string
  started_at: number
  ended_at: number
  trip_count: number
  distance_km: number
  energy_kwh: number | null
  start_soc: number | null
  end_soc: number | null
  avg_speed_kmh: number | null
  route: [number, number][]
  charges: CarTripDraftCharge[]
}

const CHARGE_END_REASONS = ['completa', 'limite', 'desenchufado', 'fallo', 'detenida', 'sin_datos']
const STATUS_KEYS = ['event', 'observed_at', 'soc', 'range_km', 'charging', 'plugged', 'charge_end_reason']

function optInt(v: unknown, min: number, max: number): number | null | undefined {
  if (v === undefined || v === null) return null
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined
}

function optBool(v: unknown): boolean | null | undefined {
  if (v === undefined || v === null) return null
  return typeof v === 'boolean' ? v : undefined
}

/** Validates the "status" object of a status call; null = bad_request. Unknown keys are refused (nothing extra is stored). */
export function parseCarStatus(raw: unknown): CarStatus | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (Object.keys(o).some((k) => !STATUS_KEYS.includes(k))) return null
  if (o.event !== 'trip_end' && o.event !== 'charge_end') return null
  const observed = o.observed_at
  if (typeof observed !== 'number' || !Number.isSafeInteger(observed) || observed <= 0) return null
  const soc = optInt(o.soc, 0, 100)
  const range = optInt(o.range_km, 0, 1500)
  const charging = optBool(o.charging)
  const plugged = optBool(o.plugged)
  if (soc === undefined || range === undefined || charging === undefined || plugged === undefined) return null
  let reason: string | null = null
  if (o.charge_end_reason !== undefined && o.charge_end_reason !== null) {
    if (o.event !== 'charge_end' || typeof o.charge_end_reason !== 'string') return null
    if (!CHARGE_END_REASONS.includes(o.charge_end_reason)) return null
    reason = o.charge_end_reason
  }
  return {
    event: o.event,
    observed_at: observed,
    soc,
    range_km: range,
    charging,
    plugged,
    charge_end_reason: reason,
  }
}

const DRAFT_KEYS = [
  'client_id',
  'started_at',
  'ended_at',
  'trip_count',
  'distance_km',
  'energy_kwh',
  'start_soc',
  'end_soc',
  'avg_speed_kmh',
  'route',
  'charges',
]
const CHARGE_KEYS = [
  'started_at',
  'ended_at',
  'start_soc',
  'end_soc',
  'energy_kwh',
  'end_reason',
  'lat',
  'lon',
]
export const MAX_ROUTE_POINTS = 2000
export const MAX_DRAFT_CHARGES = 30

function isMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0
}

function optNum(v: unknown, min: number, max: number): number | null | undefined {
  if (v === undefined || v === null) return null
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined
}

function isLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
}

function isLon(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180
}

function parseDraftCharge(c: unknown): CarTripDraftCharge | null {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return null
  const r = c as Record<string, unknown>
  if (Object.keys(r).some((k) => !CHARGE_KEYS.includes(k))) return null
  if (!isMs(r.started_at) || !isMs(r.ended_at) || r.ended_at < r.started_at) return null
  const out: CarTripDraftCharge = { started_at: r.started_at, ended_at: r.ended_at }
  if (r.start_soc !== undefined) {
    const v = optInt(r.start_soc, 0, 100)
    if (v == null) return null
    out.start_soc = v
  }
  if (r.end_soc !== undefined) {
    const v = optInt(r.end_soc, 0, 100)
    if (v == null) return null
    out.end_soc = v
  }
  if (r.energy_kwh !== undefined) {
    const v = optNum(r.energy_kwh, 0, 200)
    if (v == null) return null
    out.energy_kwh = v
  }
  if (r.end_reason !== undefined) {
    if (typeof r.end_reason !== 'string' || !CHARGE_END_REASONS.includes(r.end_reason)) return null
    out.end_reason = r.end_reason
  }
  if ((r.lat === undefined) !== (r.lon === undefined)) return null
  if (r.lat !== undefined) {
    if (!isLat(r.lat) || !isLon(r.lon)) return null
    out.lat = r.lat
    out.lon = r.lon
  }
  return out
}

/** Validates the "draft" object of a trip_draft call; null = bad_request. Unknown keys are refused at every level. */
export function parseTripDraft(raw: unknown): CarTripDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (Object.keys(o).some((k) => !DRAFT_KEYS.includes(k))) return null
  if (typeof o.client_id !== 'string' || !UUID.test(o.client_id)) return null
  if (!isMs(o.started_at) || !isMs(o.ended_at) || o.ended_at < o.started_at) return null
  const trips = o.trip_count
  if (typeof trips !== 'number' || !Number.isInteger(trips) || trips < 1 || trips > 20) return null
  const dist = o.distance_km
  if (typeof dist !== 'number' || !Number.isFinite(dist) || dist < 0 || dist > 5000) return null
  const energy = optNum(o.energy_kwh, 0, 1000)
  const ssoc = optInt(o.start_soc, 0, 100)
  const esoc = optInt(o.end_soc, 0, 100)
  const speed = optNum(o.avg_speed_kmh, 0, 250)
  if (energy === undefined || ssoc === undefined || esoc === undefined || speed === undefined) return null
  const routeRaw = o.route ?? []
  if (!Array.isArray(routeRaw) || routeRaw.length > MAX_ROUTE_POINTS) return null
  const route: [number, number][] = []
  for (const p of routeRaw as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !isLat(p[0]) || !isLon(p[1])) return null
    route.push([p[0], p[1]])
  }
  const chargesRaw = o.charges ?? []
  if (!Array.isArray(chargesRaw) || chargesRaw.length > MAX_DRAFT_CHARGES) return null
  const charges: CarTripDraftCharge[] = []
  for (const c of chargesRaw as unknown[]) {
    const parsedCharge = parseDraftCharge(c)
    if (!parsedCharge) return null
    charges.push(parsedCharge)
  }
  return {
    client_id: o.client_id.toLowerCase(),
    started_at: o.started_at,
    ended_at: o.ended_at,
    trip_count: trips,
    distance_km: dist,
    energy_kwh: energy,
    start_soc: ssoc,
    end_soc: esoc,
    avg_speed_kmh: speed,
    route,
    charges,
  }
}

export function isP256Spki(key: unknown): key is string {
  return typeof key === 'string' && P256_SPKI.test(key)
}

/** Strict base64 to bytes; null for anything else. */
export function decodeBase64(text: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64.test(text)) return null
  try {
    const bin = atob(text)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function signedMessage(body: Uint8Array): Uint8Array<ArrayBuffer> {
  const prefix = new TextEncoder().encode(SIGNING_PREFIX)
  const msg = new Uint8Array(prefix.length + body.length)
  msg.set(prefix, 0)
  msg.set(body, prefix.length)
  return msg
}

/**
 * True only for a valid P1363 ECDSA P-256/SHA-256 signature of
 * SIGNING_PREFIX + body made with the key in `spkiBase64`. Never throws.
 */
export async function verifyCarSignature(
  spkiBase64: string,
  signatureBase64: string,
  body: Uint8Array
): Promise<boolean> {
  try {
    if (!isP256Spki(spkiBase64)) return false
    const sig = decodeBase64(signatureBase64)
    const spki = decodeBase64(spkiBase64)
    if (!sig || sig.length !== 64 || !spki) return false
    const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ])
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, signedMessage(body))
  } catch {
    return false
  }
}

/** Parses and validates a request body; null = bad_request. */
export function parseCarRequest(text: string): CarRequest | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== PROTOCOL_VERSION) return null
  const ts = o.ts
  if (typeof ts !== 'number' || !Number.isSafeInteger(ts) || ts <= 0) return null
  switch (o.action) {
    case 'poll':
      if (typeof o.code !== 'string' || !PAIRING_CODE.test(o.code)) return null
      return { action: 'poll', ts, code: o.code }
    case 'heartbeat': {
      if (typeof o.device_id !== 'string' || !UUID.test(o.device_id)) return null
      const v = o.app_version
      if (v !== undefined && v !== null && (typeof v !== 'string' || !APP_VERSION.test(v))) return null
      return { action: 'heartbeat', ts, deviceId: o.device_id.toLowerCase(), appVersion: v ?? null }
    }
    case 'unpair':
      if (typeof o.device_id !== 'string' || !UUID.test(o.device_id)) return null
      return { action: 'unpair', ts, deviceId: o.device_id.toLowerCase() }
    case 'status': {
      if (typeof o.device_id !== 'string' || !UUID.test(o.device_id)) return null
      const status = parseCarStatus(o.status)
      if (!status) return null
      return { action: 'status', ts, deviceId: o.device_id.toLowerCase(), status }
    }
    // Car trip drafts (specs/car-trip-drafts.md): a trip the driver chose to share, stored as a draft.
    case 'trip_draft': {
      if (typeof o.device_id !== 'string' || !UUID.test(o.device_id)) return null
      const draft = parseTripDraft(o.draft)
      if (!draft) return null
      return { action: 'trip_draft', ts, deviceId: o.device_id.toLowerCase(), draft }
    }
    // Bóveda inbox (specs/vault-onboarding.md Phase C): the owner's inbox public key / ECIES ciphertext upload.
    case 'inbox_key':
      if (typeof o.device_id !== 'string' || !UUID.test(o.device_id)) return null
      return { action: 'inbox_key', ts, deviceId: o.device_id.toLowerCase() }
    case 'inbox_put': {
      if (typeof o.device_id !== 'string' || !UUID.test(o.device_id)) return null
      if (o.kind !== 'dashcam_recovery') return null
      if (typeof o.key_id !== 'string' || !UUID.test(o.key_id)) return null
      if (!isP256Spki(o.epk)) return null
      if (typeof o.iv !== 'string' || !IV_B64.test(o.iv)) return null
      const ct = o.ciphertext
      if (
        typeof ct !== 'string' ||
        ct.length < 24 ||
        ct.length > 1400 ||
        ct.length % 4 !== 0 ||
        !BASE64.test(ct)
      )
        return null
      return {
        action: 'inbox_put',
        ts,
        deviceId: o.device_id.toLowerCase(),
        kind: 'dashcam_recovery',
        keyId: o.key_id.toLowerCase(),
        epk: o.epk,
        iv: o.iv,
        ciphertext: ct,
      }
    }
    default:
      return null
  }
}

function reply(status: number, body: Record<string, unknown>, now: number): Response {
  return new Response(JSON.stringify({ ...body, server_time: now }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function fail(code: CarErrorCode, now: number): Response {
  return reply(STATUS[code], { ok: false, error: code }, now)
}

/** Reads at most `max` bytes of the body; null when it is larger. */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) return null
  if (!req.body) return new Uint8Array(0)
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function memberNames(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function handleCarDevice(req: Request, deps: HandlerDeps): Promise<Response> {
  const now = deps.now()
  const log = deps.log ?? (() => undefined)
  if (req.method !== 'POST') return fail('method', now)

  const bytes = await readCapped(req, MAX_BODY_BYTES)
  if (!bytes) return fail('too_large', now)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail('bad_request', now)
  }
  const parsed = parseCarRequest(text)
  if (!parsed) return fail('bad_request', now)
  const signature = req.headers.get(SIGNATURE_HEADER)?.trim() ?? ''
  if (!signature) return fail('bad_signature', now)
  // Cheap freshness check before any database work; the SQL guard re-checks
  // with the database clock for state-changing calls.
  if (Math.abs(parsed.ts - now) > MAX_SKEW_MS) return fail('clock', now)

  try {
    if (parsed.action === 'poll') {
      const res = await deps.rpc('poll_car_pairing', { p_code: parsed.code })
      if (res.error) {
        log(`poll_car_pairing failed: ${res.error}`)
        return fail('server', now)
      }
      const row = asRecord(res.data)
      // Unknown code and bad signature look the same to the caller.
      if (!row || !isP256Spki(row.public_key)) return fail('bad_signature', now)
      if (!(await verifyCarSignature(row.public_key, signature, bytes))) return fail('bad_signature', now)
      switch (row.status) {
        case 'pending':
          return reply(200, { ok: true, status: 'pending', expires_in: Number(row.expires_in) || 0 }, now)
        case 'claimed':
          return reply(
            200,
            {
              ok: true,
              status: 'claimed',
              device_id: row.device_id,
              device_name: row.device_name,
              members: memberNames(row.members),
            },
            now
          )
        default:
          return reply(200, { ok: true, status: 'expired' }, now)
      }
    }

    // heartbeat / unpair / status / inbox: verify with the device's stored key first.
    const keyRes = await deps.rpc('car_device_public_key', { p_device_id: parsed.deviceId })
    if (keyRes.error) {
      log(`car_device_public_key failed: ${keyRes.error}`)
      return fail('server', now)
    }
    const key = keyRes.data
    if (!isP256Spki(key)) return fail('bad_signature', now)
    if (!(await verifyCarSignature(key, signature, bytes))) return fail('bad_signature', now)

    if (parsed.action === 'inbox_key' || parsed.action === 'inbox_put') {
      const inboxRes =
        parsed.action === 'inbox_key'
          ? await deps.rpc('car_vault_inbox_key', { p_device_id: parsed.deviceId, p_ts: parsed.ts })
          : await deps.rpc('car_vault_inbox_put', {
              p_device_id: parsed.deviceId,
              p_ts: parsed.ts,
              p_kind: parsed.kind,
              p_key_id: parsed.keyId,
              p_epk: parsed.epk,
              p_iv: parsed.iv,
              p_ciphertext: parsed.ciphertext,
            })
      if (inboxRes.error) {
        log(`${parsed.action} failed: ${inboxRes.error}`)
        return fail('server', now)
      }
      const inboxRow = asRecord(inboxRes.data)
      if (!inboxRow) return fail('server', now)
      if (typeof inboxRow.error === 'string') return fail(GUARD_ERRORS[inboxRow.error] ?? 'server', now)
      if (parsed.action === 'inbox_put') return reply(200, { ok: true }, now)
      if (
        !isP256Spki(inboxRow.public_key) ||
        typeof inboxRow.key_id !== 'string' ||
        typeof inboxRow.user_id !== 'string'
      ) {
        log('inbox_key: malformed row')
        return fail('server', now)
      }
      return reply(
        200,
        { ok: true, user_id: inboxRow.user_id, key_id: inboxRow.key_id, public_key: inboxRow.public_key },
        now
      )
    }

    const res =
      parsed.action === 'heartbeat'
        ? await deps.rpc('car_heartbeat', {
            p_device_id: parsed.deviceId,
            p_ts: parsed.ts,
            p_app_version: parsed.appVersion,
          })
        : parsed.action === 'status'
          ? await deps.rpc('car_submit_status', {
              p_device_id: parsed.deviceId,
              p_ts: parsed.ts,
              p_status: parsed.status,
            })
          : parsed.action === 'trip_draft'
            ? await deps.rpc('car_submit_trip_draft', {
                p_device_id: parsed.deviceId,
                p_ts: parsed.ts,
                p_draft: parsed.draft,
              })
            : await deps.rpc('car_unpair', { p_device_id: parsed.deviceId, p_ts: parsed.ts })
    if (res.error) {
      log(`${parsed.action} failed: ${res.error}`)
      return fail('server', now)
    }
    const row = asRecord(res.data)
    if (!row) {
      log(`${parsed.action}: unexpected empty result`)
      return fail('server', now)
    }
    if (typeof row.error === 'string') return fail(GUARD_ERRORS[row.error] ?? 'server', now)
    if (parsed.action === 'unpair') return reply(200, { ok: true }, now)
    if (parsed.action === 'status' || parsed.action === 'trip_draft')
      return reply(200, { ok: true, stored: row.stored === true }, now)
    return reply(
      200,
      { ok: true, device_id: row.device_id, device_name: row.device_name, members: memberNames(row.members) },
      now
    )
  } catch (e) {
    log(`car-device: ${e instanceof Error ? e.message : String(e)}`)
    return fail('server', now)
  }
}
