// @vitest-environment node
// car-device: action "location" (specs/car-location.md R2), opt-in car position + 7-day parking spots.
import { describe, it, expect, beforeAll } from 'vitest'
import {
  handleCarDevice,
  parseCarRequest,
  parseLocationPoint,
  roundCoord,
  SIGNATURE_HEADER,
  SIGNING_PREFIX,
  type Rpc,
  type RpcResult,
} from './carDevice'

// Cross-language pins: vigo-hack accounts_proxy core Wire.locationBody produces exactly these bytes (LocationTests).
const LOCATION_BODY =
  '{"v":1,"action":"location","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"mode":"spots","point":{"kind":"parked","observed_at":1763639990000,"lat":-34.9058,"lon":-56.1913,"acc_m":12}}'
const LOCATION_FORGET_BODY =
  '{"v":1,"action":"location","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640001000,"mode":"off","point":null}'

const NOW = 1763640000000
const DEVICE = '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f'
const enc = (s: string) => new TextEncoder().encode(s)
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const ok = (data: unknown): RpcResult => ({ data, error: null })

let fresh: { spki: string; sign: (body: string) => Promise<string> }
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])
  fresh = {
    spki: b64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    sign: async (body) =>
      b64(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          pair.privateKey,
          enc(SIGNING_PREFIX + body)
        )
      ),
  }
})

interface Call {
  fn: string
  args: Record<string, unknown>
}
function fakeRpc(answers: Record<string, RpcResult>): { rpc: Rpc; calls: Call[] } {
  const calls: Call[] = []
  const rpc: Rpc = (fn, args) => {
    calls.push({ fn, args })
    return Promise.resolve(answers[fn] ?? { data: null, error: `unexpected rpc ${fn}` })
  }
  return { rpc, calls }
}
async function call(body: string, rpc: Rpc, signature?: string) {
  const req = new Request('https://example.test/functions/v1/car-device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: signature ?? (await fresh.sign(body)),
    },
    body,
  })
  const res = await handleCarDevice(req, { rpc, now: () => NOW })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const POINT = { kind: 'driving', observed_at: NOW - 60_000, lat: -34.90581, lon: -56.19129, acc_m: 8 }
const body = (extra: Record<string, unknown>) =>
  JSON.stringify({
    v: 1,
    action: 'location',
    device_id: DEVICE,
    ts: NOW,
    mode: 'last',
    point: POINT,
    ...extra,
  })

describe('parseCarRequest: location', () => {
  it('parses the pinned car body exactly', () => {
    expect(parseCarRequest(LOCATION_BODY)).toEqual({
      action: 'location',
      ts: 1763640000000,
      deviceId: DEVICE,
      mode: 'spots',
      point: { kind: 'parked', observed_at: 1763639990000, lat: -34.9058, lon: -56.1913, acc_m: 12 },
    })
  })

  it('parses the pinned forget body (off, no point)', () => {
    expect(parseCarRequest(LOCATION_FORGET_BODY)).toEqual({
      action: 'location',
      ts: 1763640001000,
      deviceId: DEVICE,
      mode: 'off',
      point: null,
    })
  })

  it('accepts a missing point, a missing or null acc_m, and rounds to 4 decimals', () => {
    expect(parseCarRequest(body({ point: undefined }))).toMatchObject({ mode: 'last', point: null })
    const { acc_m: _omit, ...noAcc } = POINT
    void _omit
    expect(parseCarRequest(body({ point: noAcc }))).toMatchObject({ point: { acc_m: null } })
    expect(parseCarRequest(body({ point: { ...POINT, acc_m: null } }))).toMatchObject({
      point: { acc_m: null },
    })
    expect(parseCarRequest(body({}))).toMatchObject({ point: { lat: -34.9058, lon: -56.1913 } })
  })

  it.each([
    ['an unknown top-level key', { extra: 1 }],
    ['an unknown mode', { mode: 'all' }],
    ['a missing mode', { mode: undefined }],
    ['off with a point', { mode: 'off' }],
    ['an unknown point key', { point: { ...POINT, speed: 3 } }],
    ['a heading key', { point: { ...POINT, heading: 90 } }],
    ['an unknown kind', { point: { ...POINT, kind: 'charging' } }],
    ['latitude out of range', { point: { ...POINT, lat: -91 } }],
    ['longitude out of range', { point: { ...POINT, lon: 181 } }],
    ['a string coordinate', { point: { ...POINT, lat: '-34.9' } }],
    ['null island', { point: { ...POINT, lat: 0.00001, lon: -0.00002 } }],
    ['fractional accuracy', { point: { ...POINT, acc_m: 3.5 } }],
    ['negative accuracy', { point: { ...POINT, acc_m: -1 } }],
    ['huge accuracy', { point: { ...POINT, acc_m: 10001 } }],
    ['a fractional observed_at', { point: { ...POINT, observed_at: 1.5 } }],
    ['a missing observed_at', { point: { ...POINT, observed_at: undefined } }],
    ['a point that is an array', { point: [-34.9, -56.1] }],
    ['a bad device id', { device_id: 'nope' }],
  ])('refuses %s', (_name, extra) => {
    expect(parseCarRequest(body(extra))).toBeNull()
  })

  it('NaN-like input never parses (JSON has no NaN; a null coordinate is refused)', () => {
    expect(parseLocationPoint({ ...POINT, lat: null })).toBeNull()
    expect(parseLocationPoint({ ...POINT, lon: Number.NaN })).toBeNull()
  })

  it('roundCoord keeps 4 decimals and never returns -0', () => {
    expect(roundCoord(-34.905849)).toBe(-34.9058)
    expect(roundCoord(-56.19135)).toBe(-56.1913)
    expect(Object.is(roundCoord(-0.00001), 0)).toBe(true)
  })
})

describe('handleCarDevice: location', () => {
  it('verifies, then calls car_submit_location with the rounded point', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_location: ok({ ok: true, stored: true }),
    })
    const r = await call(body({}), rpc)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, stored: true })
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key', 'car_submit_location'])
    expect(calls[1].args).toEqual({
      p_device_id: DEVICE,
      p_ts: NOW,
      p_mode: 'last',
      p_point: { kind: 'driving', observed_at: NOW - 60_000, lat: -34.9058, lon: -56.1913, acc_m: 8 },
    })
  })

  it('the pinned forget body reaches the database with a null point', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_location: ok({ ok: true, stored: false }),
    })
    // The pin's ts is 1 s after NOW: inside the 5-minute window.
    const r = await call(LOCATION_FORGET_BODY, rpc)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, stored: false })
    expect(calls[1].args).toEqual({ p_device_id: DEVICE, p_ts: 1763640001000, p_mode: 'off', p_point: null })
  })

  it.each([
    ['bad_request', 400],
    ['revoked', 410],
    ['replay', 409],
    ['rate_limited', 429],
    ['clock', 401],
    ['unknown', 401],
  ])('maps the database answer %s to %i', async (error, status) => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_location: ok({ error }),
    })
    expect((await call(body({}), rpc)).status).toBe(status)
  })

  it('a database failure is a 500', async () => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_location: { data: null, error: 'boom' },
    })
    expect((await call(body({}), rpc)).status).toBe(500)
  })

  it('a bad signature never reaches the write', async () => {
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(fresh.spki) })
    const other = await fresh.sign('something else')
    const r = await call(body({}), rpc, other)
    expect(r.status).toBe(401)
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key'])
  })

  it('a malformed body is refused before any database call', async () => {
    const { rpc, calls } = fakeRpc({})
    expect((await call(body({ mode: 'off' }), rpc)).status).toBe(400)
    expect(calls).toEqual([])
  })
})
