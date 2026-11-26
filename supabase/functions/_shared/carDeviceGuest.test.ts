// @vitest-environment node
// car-device: guest mode on the orders poll (specs/guest-mode.md R2). The car reports its actual guest state and the last
// request it handled in "guest"; the reply carries the pending request in "guest" -- only for cars that sent one.
import { describe, it, expect, beforeAll } from 'vitest'
import {
  handleCarDevice,
  parseCarRequest,
  parseGuestReport,
  SIGNATURE_HEADER,
  SIGNING_PREFIX,
  type Rpc,
  type RpcResult,
} from './carDevice'

// Cross-language pins: vigo-hack accounts_proxy core Wire.ordersBody (with a guest report) must produce exactly these bytes.
const GUEST_ORDERS_BODY =
  '{"v":1,"action":"orders","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"live":null,"guest":{"state":"on","since":1763639000000,"last_id":"0b6c7e2a-1f3d-4a5b-8c9d-e0f1a2b3c4d5","last_code":"ok"}}'
const GUEST_FIRST_BODY =
  '{"v":1,"action":"orders","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640001000,"live":null,"guest":{"state":"off","since":null,"last_id":null,"last_code":null}}'
// The reply the car parses (server_time is appended by the function).
const GUEST_REPLY_REQUEST = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  want: 'off',
  at: 1763639990000,
  expires_at: null,
  sender: 'Fede',
}

const NOW = 1763640000000
const DEVICE = '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f'
const LAST = '0b6c7e2a-1f3d-4a5b-8c9d-e0f1a2b3c4d5'
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

const REPORT = { state: 'on', since: NOW - 60_000, last_id: LAST, last_code: 'ok' }
const body = (guest: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, action: 'orders', device_id: DEVICE, ts: NOW, live: null, guest, ...extra })

describe('parseCarRequest: orders with guest', () => {
  it('parses both pins', () => {
    expect(parseCarRequest(GUEST_ORDERS_BODY)).toEqual({
      action: 'orders',
      ts: 1763640000000,
      deviceId: DEVICE,
      live: null,
      guest: { state: 'on', since: 1763639000000, last_id: LAST, last_code: 'ok' },
    })
    expect(parseCarRequest(GUEST_FIRST_BODY)).toEqual({
      action: 'orders',
      ts: 1763640001000,
      deviceId: DEVICE,
      live: null,
      guest: { state: 'off', since: null, last_id: null, last_code: null },
    })
  })

  it('without guest (or guest null) it is the old orders request, with no guest key', () => {
    const old = parseCarRequest(body(undefined))
    expect(old).toEqual({ action: 'orders', ts: NOW, deviceId: DEVICE, live: null })
    expect(old && 'guest' in old).toBe(false)
    expect(parseCarRequest(body(null))).toEqual({ action: 'orders', ts: NOW, deviceId: DEVICE, live: null })
  })

  it('accepts every state and code; optional keys may be omitted; ids are lower-cased', () => {
    expect(parseGuestReport({ state: 'unsupported' })).toEqual({
      state: 'unsupported',
      since: null,
      last_id: null,
      last_code: null,
    })
    expect(parseGuestReport({ state: 'on' })?.since).toBeNull()
    for (const code of ['ok', 'unsupported', 'no_pin', 'failed', 'expired_on_car']) {
      expect(parseGuestReport({ state: 'off', last_id: LAST.toUpperCase(), last_code: code })).toEqual({
        state: 'off',
        since: null,
        last_id: LAST,
        last_code: code,
      })
    }
  })

  it.each([
    ['a string', 'on'],
    ['an array', []],
    ['an unknown key (a PIN can never travel here)', { ...REPORT, pin: '1234' }],
    ['no state', { since: null, last_id: null, last_code: null }],
    ['an unknown state', { ...REPORT, state: 'guest' }],
    ['a boolean state', { ...REPORT, state: true }],
    ['since with state off', { ...REPORT, state: 'off' }],
    ['since with state unsupported', { ...REPORT, state: 'unsupported' }],
    ['a fractional since', { ...REPORT, since: 1.5 }],
    ['a negative since', { ...REPORT, since: -1 }],
    ['a string since', { ...REPORT, since: '1763639000000' }],
    ['an id without a code', { ...REPORT, last_code: null }],
    ['a code without an id', { ...REPORT, last_id: null }],
    ['a bad id', { ...REPORT, last_id: 'not-a-uuid' }],
    ['a numeric id', { ...REPORT, last_id: 12 }],
    ['a server-only state as code', { ...REPORT, last_code: 'superseded' }],
    ['an unknown code', { ...REPORT, last_code: 'done' }],
  ])('refuses a guest object with %s', (_label, guest) => {
    expect(parseCarRequest(body(guest))).toBeNull()
  })

  it('a bad guest object refuses the whole poll, even with a valid live snapshot', () => {
    const live = { event: 'live', observed_at: NOW - 5000, soc: 64, range_km: 212, charging: false, plugged: false }
    expect(parseCarRequest(body({ state: 'maybe' }, { live }))).toBeNull()
    expect(parseCarRequest(body({ state: 'off' }, { live }))).toMatchObject({ guest: { state: 'off' } })
  })
})

describe('handleCarDevice: orders with guest', () => {
  it('passes p_guest to car_poll_orders and the pending request back to the car', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_poll_orders: ok({ ok: true, orders: [], guest: GUEST_REPLY_REQUEST }),
    })
    const r = await call(GUEST_ORDERS_BODY, rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, orders: [], guest: GUEST_REPLY_REQUEST, server_time: NOW })
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key', 'car_poll_orders'])
    expect(calls[1].args).toEqual({
      p_device_id: DEVICE,
      p_ts: NOW,
      p_live: null,
      p_guest: { state: 'on', since: 1763639000000, last_id: LAST, last_code: 'ok' },
    })
  })

  it('nothing pending: guest null in the reply', async () => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_poll_orders: ok({ ok: true, orders: [], guest: null }),
    })
    const r = await call(GUEST_FIRST_BODY, rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, orders: [], guest: null, server_time: NOW })
  })

  it('an on request carries its expiry in ms', async () => {
    const on = { ...GUEST_REPLY_REQUEST, want: 'on', expires_at: NOW + 12 * 3600_000, sender: null }
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_poll_orders: ok({ ok: true, orders: [], guest: on }),
    })
    expect((await call(body(REPORT), rpc)).body.guest).toEqual(on)
  })

  it('an older car (no guest) gets the old call and the old reply, even if the database had a request', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_poll_orders: ok({ ok: true, orders: [], guest: GUEST_REPLY_REQUEST }),
    })
    const r = await call(body(undefined), rpc)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ ok: true, orders: [], server_time: NOW })
    expect(calls[1].args).toEqual({ p_device_id: DEVICE, p_ts: NOW, p_live: null })
  })

  it.each([
    ['a bad id', { ...GUEST_REPLY_REQUEST, id: 'x' }],
    ['a bad want', { ...GUEST_REPLY_REQUEST, want: 'maybe' }],
    ['a string time', { ...GUEST_REPLY_REQUEST, at: '1763639990000' }],
    ['a bad expiry', { ...GUEST_REPLY_REQUEST, expires_at: -5 }],
    ['a numeric sender', { ...GUEST_REPLY_REQUEST, sender: 3 }],
    ['an array', []],
  ])('a malformed guest from the database (%s) is a 500', async (_label, guest) => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_poll_orders: ok({ ok: true, orders: [], guest }),
    })
    expect((await call(GUEST_ORDERS_BODY, rpc)).status).toBe(500)
  })

  it.each([
    ['bad_request', 400],
    ['revoked', 410],
    ['replay', 409],
    ['rate_limited', 429],
    ['unknown', 401],
  ])('maps the database answer %s to %i', async (error, status) => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_poll_orders: ok({ error }),
    })
    expect((await call(GUEST_ORDERS_BODY, rpc)).status).toBe(status)
  })

  it('a bad signature never reaches the poll', async () => {
    const { rpc, calls } = fakeRpc({ car_device_public_key: ok(fresh.spki) })
    const r = await call(GUEST_ORDERS_BODY, rpc, await fresh.sign('something else'))
    expect(r.status).toBe(401)
    expect(calls.map((c) => c.fn)).toEqual(['car_device_public_key'])
  })

  it('a malformed guest object is refused before any database call', async () => {
    const { rpc, calls } = fakeRpc({})
    expect((await call(body({ ...REPORT, extra: 1 }), rpc)).status).toBe(400)
    expect(calls).toEqual([])
  })
})
