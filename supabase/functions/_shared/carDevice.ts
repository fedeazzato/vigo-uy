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
export const MAX_BODY_BYTES = 8192
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
  | { action: 'inbox_key'; ts: number; deviceId: string }
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
      if (typeof ct !== 'string' || ct.length < 24 || ct.length > 1400 || ct.length % 4 !== 0 || !BASE64.test(ct)) return null
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

    // heartbeat / unpair / inbox: verify with the device's stored key first.
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
      if (!isP256Spki(inboxRow.public_key) || typeof inboxRow.key_id !== 'string' || typeof inboxRow.user_id !== 'string') {
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
