// @vitest-environment node
// Real WebCrypto (Node), no network: the database is a fake `rpc`.
import { describe, it, expect, beforeAll } from 'vitest'
import {
  decodeBase64,
  handleCarDevice,
  isP256Spki,
  MAX_BODY_BYTES,
  parseCarRequest,
  SIGNATURE_HEADER,
  SIGNING_PREFIX,
  verifyCarSignature,
  type Rpc,
  type RpcResult,
} from './carDevice'

// Cross-language vector from the spec: made with the JDK's SHA256withECDSA
// (what the Android Keystore produces) and converted DER -> P1363.
const SPKI =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEgGSLj9m2SBQna08UIFyIJavl7cVrlJ6CkwBHxi/GFf+lzWZHJNvJge17xBBGCbxpSENqS1/AD1ICMgk7TdnVZQ=='
const BODY =
  '{"v":1,"action":"heartbeat","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"app_version":"2.0"}'
const SIG = 'dIFlvU00qEIqt7o8x0Uj2+gq7MkfG5d2a6pBv2ScX3mp1BrqPMhXQC5yuOKPM7UQAYHfEBcSkibS67Q/ik6msA=='
const SIG_DER =
  'MEUCIHSBZb1NNKhCKre6PMdFI9voKuzJHxuXdmuqQb9knF95AiEAqdQa6jzIV0AucrjijzO1EAGB3xAXEpIm0uu0P4pOprA='
const BODY2 = '{"v":1,"action":"poll","code":"K7Q2M9","ts":1763640000000}'
const SIG2 = 'sJWREXr0kOv6DUoUaM8AfQXPwKsy8iqrpoP37wSnmGUbuv8bzSwISgIRwhBtoaT2JPRMqML7bP+WImX+KBgv/A=='
const VECTOR_NOW = 1763640000000
const DEVICE = '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f'

const enc = (s: string) => new TextEncoder().encode(s)

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s)
}

let fresh: { spki: string; sign: (body: string) => Promise<string> }

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])
  fresh = {
    spki: b64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    sign: async (body: string) =>
      b64(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          pair.privateKey,
          enc(SIGNING_PREFIX + body)
        )
      ),
  }
})

describe('verifyCarSignature', () => {
  it('verifies the Java-made vectors', async () => {
    expect(await verifyCarSignature(SPKI, SIG, enc(BODY))).toBe(true)
    expect(await verifyCarSignature(SPKI, SIG2, enc(BODY2))).toBe(true)
  })

  it('rejects a one-character change of the body', async () => {
    expect(await verifyCarSignature(SPKI, SIG, enc(BODY.replace('"2.0"', '"2.1"')))).toBe(false)
  })

  it('rejects the signature of another body (no cross-message reuse)', async () => {
    expect(await verifyCarSignature(SPKI, SIG2, enc(BODY))).toBe(false)
  })

  it('rejects a body signed without the domain prefix', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    const spki = b64(await crypto.subtle.exportKey('spki', pair.publicKey))
    const noPrefix = b64(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, enc(BODY))
    )
    expect(await verifyCarSignature(spki, noPrefix, enc(BODY))).toBe(false)
  })

  it('rejects the wrong key', async () => {
    expect(await verifyCarSignature(fresh.spki, SIG, enc(BODY))).toBe(false)
  })

  it('rejects DER signatures, wrong lengths and garbage without throwing', async () => {
    expect(await verifyCarSignature(SPKI, SIG_DER, enc(BODY))).toBe(false)
    expect(await verifyCarSignature(SPKI, b64(decodeBase64(SIG)!.slice(0, 63)), enc(BODY))).toBe(false)
    expect(await verifyCarSignature(SPKI, '!!!not base64!!!', enc(BODY))).toBe(false)
    expect(await verifyCarSignature(SPKI, '', enc(BODY))).toBe(false)
    expect(await verifyCarSignature('MFkw', SIG, enc(BODY))).toBe(false)
  })

  it('rejects a well-formed key whose point is not on the curve', async () => {
    const offCurve = SPKI.slice(0, 36) + 'A'.repeat(85) + 'Q=='
    expect(isP256Spki(offCurve)).toBe(true)
    expect(await verifyCarSignature(offCurve, SIG, enc(BODY))).toBe(false)
  })

  it('verifies a fresh WebCrypto key end to end', async () => {
    expect(await verifyCarSignature(fresh.spki, await fresh.sign(BODY), enc(BODY))).toBe(true)
  })
})

describe('isP256Spki / decodeBase64', () => {
  it('accepts the canonical P-256 SPKI only', () => {
    expect(isP256Spki(SPKI)).toBe(true)
    expect(isP256Spki(SPKI.slice(0, -4))).toBe(false)
    expect(isP256Spki(SPKI.slice(0, -3) + 'R==')).toBe(false) // non-canonical padding bits
    expect(isP256Spki('MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE' + 'A'.repeat(128))).toBe(false) // P-384
    expect(isP256Spki(null)).toBe(false)
  })

  it('decodes strict base64 only', () => {
    expect(decodeBase64('AAEC')).toEqual(new Uint8Array([0, 1, 2]))
    expect(decodeBase64('AAE')).toBeNull()
    expect(decodeBase64('AA E=')).toBeNull()
    expect(decodeBase64(SIG)!.length).toBe(64)
  })
})

describe('parseCarRequest', () => {
  it('parses the three actions', () => {
    expect(parseCarRequest(BODY2)).toEqual({ action: 'poll', ts: VECTOR_NOW, code: 'K7Q2M9' })
    expect(parseCarRequest(BODY)).toEqual({
      action: 'heartbeat',
      ts: VECTOR_NOW,
      deviceId: DEVICE,
      appVersion: '2.0',
    })
    expect(parseCarRequest(`{"v":1,"action":"unpair","device_id":"${DEVICE.toUpperCase()}","ts":5}`)).toEqual(
      {
        action: 'unpair',
        ts: 5,
        deviceId: DEVICE,
      }
    )
  })

  it('rejects malformed requests', () => {
    for (const bad of [
      'not json',
      '[]',
      'null',
      '{"v":2,"action":"poll","code":"K7Q2M9","ts":1}',
      '{"v":1,"action":"delete","ts":1}',
      '{"v":1,"action":"poll","code":"K7Q2M0","ts":1}', // 0 is not in the alphabet
      '{"v":1,"action":"poll","code":"k7q2m9","ts":1}',
      '{"v":1,"action":"poll","code":"K7Q2M9","ts":"1"}',
      '{"v":1,"action":"poll","code":"K7Q2M9","ts":1.5}',
      '{"v":1,"action":"poll","code":"K7Q2M9"}',
      '{"v":1,"action":"heartbeat","device_id":"nope","ts":1}',
      `{"v":1,"action":"heartbeat","device_id":"${DEVICE}","ts":1,"app_version":"<script>"}`,
      `{"v":1,"action":"heartbeat","device_id":"${DEVICE}","ts":1,"app_version":7}`,
    ]) {
      expect(parseCarRequest(bad), bad).toBeNull()
    }
  })
})

// ---------------------------------------------------------------- handler

interface Call {
  fn: string
  args: Record<string, unknown>
}

function fakeRpc(answers: Record<string, RpcResult | (() => RpcResult)>): { rpc: Rpc; calls: Call[] } {
  const calls: Call[] = []
  const rpc: Rpc = (fn, args) => {
    calls.push({ fn, args })
    const a = answers[fn]
    if (!a) return Promise.resolve({ data: null, error: `unexpected rpc ${fn}` })
    return Promise.resolve(typeof a === 'function' ? a() : a)
  }
  return { rpc, calls }
}

function post(body: string, signature: string | null, extraHeaders: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders }
  if (signature !== null) headers[SIGNATURE_HEADER] = signature
  return new Request('https://example.test/functions/v1/car-device', { method: 'POST', headers, body })
}

async function call(req: Request, rpc: Rpc, now = VECTOR_NOW) {
  const logs: string[] = []
  const res = await handleCarDevice(req, { rpc, now: () => now, log: (m) => logs.push(m) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, logs, res }
}

const ok = (data: unknown): RpcResult => ({ data, error: null })

describe('handleCarDevice: transport checks', () => {
  it('405 for anything but POST', async () => {
    const { rpc } = fakeRpc({})
    const r = await call(new Request('https://example.test/x', { method: 'GET' }), rpc)
    expect(r.status).toBe(405)
    expect(r.body).toEqual({ ok: false, error: 'method', server_time: VECTOR_NOW })
  })

  it('413 over 8 KB', async () => {
    const { rpc, calls } = fakeRpc({})
    const r = await call(post('x'.repeat(MAX_BODY_BYTES + 1), SIG), rpc)
    expect(r.status).toBe(413)
    expect(calls).toHaveLength(0)
  })

  it('400 for bad bodies, before any database work', async () => {
    const { rpc, calls } = fakeRpc({})
    for (const body of ['nope', '{"v":9}', '{"v":1,"action":"poll","ts":1}']) {
      expect((await call(post(body, SIG2), rpc)).status).toBe(400)
    }
    expect(calls).toHaveLength(0)
  })

  it('401 bad_signature when the header is missing', async () => {
    const { rpc, calls } = fakeRpc({})
    const r = await call(post(BODY2, null), rpc)
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('bad_signature')
    expect(calls).toHaveLength(0)
  })

  it('401 clock with server_time when ts is off by more than 5 minutes', async () => {
    const { rpc, calls } = fakeRpc({})
    const later = VECTOR_NOW + 5 * 60 * 1000 + 1
    const r = await call(post(BODY2, SIG2), rpc, later)
    expect(r.status).toBe(401)
    expect(r.body).toEqual({ ok: false, error: 'clock', server_time: later })
    expect(calls).toHaveLength(0)
  })

  it('responses are JSON and never cached', async () => {
    const { rpc } = fakeRpc({ poll_car_pairing: ok(null) })
    const r = await call(post(BODY2, SIG2), rpc)
    expect(r.res.headers.get('content-type')).toContain('application/json')
    expect(r.res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('handleCarDevice: poll', () => {
  it('unknown code looks exactly like a bad signature', async () => {
    const unknown = await call(post(BODY2, SIG2), fakeRpc({ poll_car_pairing: ok(null) }).rpc)
    const badSig = await call(
      post(BODY2, SIG),
      fakeRpc({ poll_car_pairing: ok({ public_key: SPKI, status: 'pending', expires_in: 300 }) }).rpc
    )
    expect(unknown.status).toBe(401)
    expect(badSig.status).toBe(401)
    expect(unknown.body).toEqual(badSig.body)
  })

  it('pending', async () => {
    const { rpc, calls } = fakeRpc({
      poll_car_pairing: ok({ public_key: SPKI, status: 'pending', expires_in: 412 }),
    })
    const r = await call(post(BODY2, SIG2), rpc)
    expect(calls).toEqual([{ fn: 'poll_car_pairing', args: { p_code: 'K7Q2M9' } }])
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, status: 'pending', expires_in: 412, server_time: VECTOR_NOW })
  })

  it('claimed returns the device id and member names only after the signature verified', async () => {
    const row = {
      public_key: SPKI,
      status: 'claimed',
      device_id: DEVICE,
      device_name: 'Vigo',
      members: ['Ana', 'Juan', 42],
    }
    const r = await call(post(BODY2, SIG2), fakeRpc({ poll_car_pairing: ok(row) }).rpc)
    expect(r.body).toEqual({
      ok: true,
      status: 'claimed',
      device_id: DEVICE,
      device_name: 'Vigo',
      members: ['Ana', 'Juan'],
      server_time: VECTOR_NOW,
    })
    const forged = await call(post(BODY2, SIG), fakeRpc({ poll_car_pairing: ok(row) }).rpc)
    expect(forged.status).toBe(401)
    expect(JSON.stringify(forged.body)).not.toContain(DEVICE)
  })

  it('expired', async () => {
    const r = await call(
      post(BODY2, SIG2),
      fakeRpc({ poll_car_pairing: ok({ public_key: SPKI, status: 'expired' }) }).rpc
    )
    expect(r.body).toEqual({ ok: true, status: 'expired', server_time: VECTOR_NOW })
  })

  it('a malformed stored key is a bad signature, not a crash', async () => {
    const r = await call(
      post(BODY2, SIG2),
      fakeRpc({ poll_car_pairing: ok({ public_key: 'x', status: 'pending' }) }).rpc
    )
    expect(r.status).toBe(401)
  })

  it('database failure is a 500 without details', async () => {
    const r = await call(
      post(BODY2, SIG2),
      fakeRpc({ poll_car_pairing: { data: null, error: '500 secret detail' } }).rpc
    )
    expect(r.status).toBe(500)
    expect(r.body).toEqual({ ok: false, error: 'server', server_time: VECTOR_NOW })
    expect(r.logs.join()).toContain('secret detail')
  })
})

describe('handleCarDevice: heartbeat and unpair', () => {
  const hbOk = ok({ device_id: DEVICE, device_name: 'Vigo', members: ['Ana'] })

  it('verifies with the stored key, then runs the SQL guard with the signed ts', async () => {
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(SPKI), car_heartbeat: hbOk })
    const r = await call(post(BODY, SIG), rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      ok: true,
      device_id: DEVICE,
      device_name: 'Vigo',
      members: ['Ana'],
      server_time: VECTOR_NOW,
    })
    expect(calls).toEqual([
      { fn: 'car_device_public_key', args: { p_device_id: DEVICE } },
      { fn: 'car_heartbeat', args: { p_device_id: DEVICE, p_ts: VECTOR_NOW, p_app_version: '2.0' } },
    ])
  })

  it('unknown device = bad signature, and the guard is never reached', async () => {
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(null) })
    const r = await call(post(BODY, SIG), rpc)
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('bad_signature')
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key'])
  })

  it('a revoked device with a BAD signature gets 401, not 410 (revocation is told only to the key holder)', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(SPKI),
      car_heartbeat: ok({ error: 'revoked' }),
    })
    const r = await call(post(BODY, SIG2), rpc)
    expect(r.status).toBe(401)
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key'])
  })

  it.each([
    ['revoked', 410],
    ['replay', 409],
    ['rate_limited', 429],
    ['clock', 401],
    ['unknown', 401],
    ['something_new', 500],
  ])('guard answer %s -> HTTP %i', async (guard, status) => {
    const { rpc } = fakeRpc({ car_device_public_key: ok(SPKI), car_heartbeat: ok({ error: guard }) })
    const r = await call(post(BODY, SIG), rpc)
    expect(r.status).toBe(status)
    expect(r.body.ok).toBe(false)
  })

  it('unpair with a fresh key', async () => {
    const body = `{"v":1,"action":"unpair","device_id":"${DEVICE}","ts":${VECTOR_NOW + 1}}`
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(fresh.spki), car_unpair: ok({ ok: true }) })
    const r = await call(post(body, await fresh.sign(body)), rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, server_time: VECTOR_NOW })
    expect(calls[1]).toEqual({ fn: 'car_unpair', args: { p_device_id: DEVICE, p_ts: VECTOR_NOW + 1 } })
  })

  it('a heartbeat without app_version sends null', async () => {
    const body = `{"v":1,"action":"heartbeat","device_id":"${DEVICE}","ts":${VECTOR_NOW}}`
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(fresh.spki), car_heartbeat: hbOk })
    expect((await call(post(body, await fresh.sign(body)), rpc)).status).toBe(200)
    expect(calls[1].args.p_app_version).toBeNull()
  })

  it('an empty guard result or a thrown rpc is a 500', async () => {
    expect(
      (await call(post(BODY, SIG), fakeRpc({ car_device_public_key: ok(SPKI), car_heartbeat: ok(null) }).rpc))
        .status
    ).toBe(500)
    const throwing: Rpc = () => Promise.reject(new Error('network down'))
    const r = await call(post(BODY, SIG), throwing)
    expect(r.status).toBe(500)
    expect(r.logs.join()).toContain('network down')
  })

  it('the signature covers the exact bytes: re-serialised JSON fails', async () => {
    const reformatted = JSON.stringify(JSON.parse(BODY), null, 1)
    const { rpc } = fakeRpc({ car_device_public_key: ok(SPKI), car_heartbeat: hbOk })
    expect((await call(post(reformatted, SIG), rpc)).status).toBe(401)
  })
})

// ---------------------------------------------------------------- status (specs/car-status-e1.md)

// The exact body the car builds (vigo-hack accounts_proxy core Wire.statusBody pins the same string).
const STATUS_BODY =
  '{"v":1,"action":"status","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,' +
  '"status":{"event":"charge_end","observed_at":1763639990000,"soc":80,"range_km":266,"charging":false,' +
  '"plugged":true,"charge_end_reason":"limite"}}'

describe('parseCarRequest: status', () => {
  const base = (status: unknown) =>
    JSON.stringify({ v: 1, action: 'status', device_id: DEVICE, ts: VECTOR_NOW, status })
  const good = { event: 'trip_end', observed_at: VECTOR_NOW - 1000, soc: 64, range_km: 266, charging: false, plugged: false }

  it('parses the car-built body exactly', () => {
    expect(parseCarRequest(STATUS_BODY)).toEqual({
      action: 'status',
      ts: VECTOR_NOW,
      deviceId: DEVICE,
      status: {
        event: 'charge_end',
        observed_at: 1763639990000,
        soc: 80,
        range_km: 266,
        charging: false,
        plugged: true,
        charge_end_reason: 'limite',
      },
    })
  })

  it('nulls and missing optional fields are allowed', () => {
    const r = parseCarRequest(base({ event: 'trip_end', observed_at: VECTOR_NOW }))
    expect(r && r.action === 'status' && r.status).toEqual({
      event: 'trip_end',
      observed_at: VECTOR_NOW,
      soc: null,
      range_km: null,
      charging: null,
      plugged: null,
      charge_end_reason: null,
    })
  })

  it.each([
    ['unknown event', { ...good, event: 'parked' }],
    ['soc over 100', { ...good, soc: 101 }],
    ['fractional soc', { ...good, soc: 50.5 }],
    ['negative range', { ...good, range_km: -1 }],
    ['range as text', { ...good, range_km: '266' }],
    ['charging as number', { ...good, charging: 1 }],
    ['missing observed_at', { ...good, observed_at: undefined }],
    ['reason on a trip', { ...good, charge_end_reason: 'completa' }],
    ['unknown reason', { ...good, event: 'charge_end', charge_end_reason: 'boom' }],
    ['an extra key (no location may slip in)', { ...good, lat: -34.9 }],
    ['not an object', 'trip_end'],
  ])('refuses %s', (_name, status) => {
    expect(parseCarRequest(base(status))).toBeNull()
  })
})

describe('handleCarDevice: status', () => {
  it('verifies, then stores through car_submit_status and returns stored', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_status: ok({ ok: true, stored: true }),
    })
    const r = await call(post(STATUS_BODY, await fresh.sign(STATUS_BODY)), rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, stored: true, server_time: VECTOR_NOW })
    expect(calls[1].fn).toBe('car_submit_status')
    expect(calls[1].args.p_device_id).toBe(DEVICE)
    expect(calls[1].args.p_ts).toBe(VECTOR_NOW)
    expect((calls[1].args.p_status as Record<string, unknown>).soc).toBe(80)
  })

  it('an older snapshot is accepted but not stored', async () => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_status: ok({ ok: true, stored: false }),
    })
    const r = await call(post(STATUS_BODY, await fresh.sign(STATUS_BODY)), rpc)
    expect(r.body).toEqual({ ok: true, stored: false, server_time: VECTOR_NOW })
  })

  it('a value the database refuses is a 400, a guard refusal maps as for heartbeat', async () => {
    for (const [answer, status] of [
      ['bad_request', 400],
      ['revoked', 410],
      ['replay', 409],
    ] as const) {
      const { rpc } = fakeRpc({ car_device_public_key: ok(fresh.spki), car_submit_status: ok({ error: answer }) })
      expect((await call(post(STATUS_BODY, await fresh.sign(STATUS_BODY)), rpc)).status).toBe(status)
    }
  })

  it('a bad signature never reaches the database write', async () => {
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(fresh.spki) })
    expect((await call(post(STATUS_BODY, SIG), rpc)).status).toBe(401)
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key'])
  })
})

// Bóveda inbox (specs/vault-onboarding.md Phase C).
describe('handleCarDevice: inbox', () => {
  const KEY_ID = '0b9d6a7e-1c2f-4e3d-8a5b-9c0d1e2f3a4b'
  const USER = '11111111-2222-4333-8444-555555555555'
  const IV = 'AQIDBAUGBwgJCgsM'
  const CT = 'A'.repeat(96)
  const putBody = (o: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      action: 'inbox_put',
      device_id: DEVICE,
      ts: VECTOR_NOW,
      kind: 'dashcam_recovery',
      key_id: KEY_ID,
      epk: SPKI,
      iv: IV,
      ciphertext: CT,
      ...o,
    })

  it('parses inbox_key and inbox_put and rejects bad fields', () => {
    expect(parseCarRequest(`{"v":1,"action":"inbox_key","device_id":"${DEVICE}","ts":1}`)).toEqual({
      action: 'inbox_key',
      ts: 1,
      deviceId: DEVICE,
    })
    expect(parseCarRequest(putBody())).toMatchObject({ action: 'inbox_put', keyId: KEY_ID, epk: SPKI })
    for (const bad of [
      { kind: 'settings_backup_passphrase' },
      { key_id: 'x' },
      { epk: 'MFkw' },
      { iv: 'short' },
      { ciphertext: 'A'.repeat(1404) },
      { ciphertext: 'A'.repeat(10) },
      { ciphertext: 'A!'.repeat(20) },
    ]) {
      expect(parseCarRequest(putBody(bad))).toBeNull()
    }
  })

  it('inbox_key returns the owner key only after the device signature verified', async () => {
    const body = `{"v":1,"action":"inbox_key","device_id":"${DEVICE}","ts":${VECTOR_NOW}}`
    const answer = ok({ user_id: USER, key_id: KEY_ID, public_key: SPKI })
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(fresh.spki), car_vault_inbox_key: answer })
    const r = await call(post(body, await fresh.sign(body)), rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, user_id: USER, key_id: KEY_ID, public_key: SPKI, server_time: VECTOR_NOW })
    expect(calls[1]).toEqual({ fn: 'car_vault_inbox_key', args: { p_device_id: DEVICE, p_ts: VECTOR_NOW } })

    const forged = fakeRpc({ car_device_public_key: ok(fresh.spki), car_vault_inbox_key: answer })
    expect((await call(post(body, SIG), forged.rpc)).status).toBe(401)
    expect(forged.calls).toHaveLength(1) // never reached the inbox function
  })

  it('inbox_put forwards the ciphertext fields and maps no_inbox / stale_key', async () => {
    const body = putBody()
    const sig = await fresh.sign(body)
    const okRun = fakeRpc({ car_device_public_key: ok(fresh.spki), car_vault_inbox_put: ok({ ok: true }) })
    const r = await call(post(body, sig), okRun.rpc)
    expect(r.status).toBe(200)
    expect(okRun.calls[1]).toEqual({
      fn: 'car_vault_inbox_put',
      args: { p_device_id: DEVICE, p_ts: VECTOR_NOW, p_kind: 'dashcam_recovery', p_key_id: KEY_ID, p_epk: SPKI, p_iv: IV, p_ciphertext: CT },
    })
    for (const [guard, status] of [['no_inbox', 404], ['stale_key', 409], ['replay', 409]] as const) {
      const run = fakeRpc({ car_device_public_key: ok(fresh.spki), car_vault_inbox_put: ok({ error: guard }) })
      const res = await call(post(body, sig), run.rpc)
      expect(res.status).toBe(status)
      expect(res.body.error).toBe(guard)
    }
  })

  it('a malformed inbox_key row is a 500, not a leaked partial answer', async () => {
    const body = `{"v":1,"action":"inbox_key","device_id":"${DEVICE}","ts":${VECTOR_NOW}}`
    const run = fakeRpc({ car_device_public_key: ok(fresh.spki), car_vault_inbox_key: ok({ user_id: USER, key_id: KEY_ID, public_key: 'x' }) })
    expect((await call(post(body, await fresh.sign(body)), run.rpc)).status).toBe(500)
  })
})
