// @vitest-environment node
// car-device: update_check / update_report (specs/car-updates.md) and charge check-in drafts (specs/car-charge-checkins.md).
import { describe, it, expect, beforeAll } from 'vitest'
import {
  handleCarDevice,
  parseCarRequest,
  parseChargeDraft,
  pickRelease,
  rolloutBucket,
  SIGNATURE_HEADER,
  SIGNING_PREFIX,
  type ReleaseCandidate,
  type Rpc,
  type RpcResult,
} from './carDevice'

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
async function call(body: string, rpc: Rpc) {
  const req = new Request('https://example.test/functions/v1/car-device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: await fresh.sign(body) },
    body,
  })
  const res = await handleCarDevice(req, { rpc, now: () => NOW })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// ---- rollout ----

const rel = (serial: number, o: Partial<ReleaseCandidate> = {}): ReleaseCandidate => ({
  serial,
  channel: 'stable',
  manifest: `vigo-update 1\nserial ${serial}\nend\n`,
  signature: 'MEUCIQ==',
  download_base: 'https://github.com/o/r/releases/download/r1/',
  is_kill: false,
  percent: 100,
  salt: 'r42',
  ...o,
})

describe('rollout bucket', () => {
  it('matches the Java Policy.bucket vectors', async () => {
    // computed with the JDK: sha256(salt + ":" + device), first two bytes mod 100
    expect(await rolloutBucket('r42', DEVICE)).toBe(67)
    expect(await rolloutBucket('salt-7', DEVICE)).toBe(28)
  })

  it('picks the newest release whose rollout includes the car', async () => {
    // bucket 67 for r42: out at 50 %, in at 70 %
    expect((await pickRelease([rel(9, { percent: 50 }), rel(8)], DEVICE, false))?.serial).toBe(8)
    expect((await pickRelease([rel(9, { percent: 70 }), rel(8)], DEVICE, false))?.serial).toBe(9)
    expect(await pickRelease([rel(9, { percent: 0 })], DEVICE, false)).toBeNull()
  })

  it('a kill manifest always applies; a beta car takes any percent', async () => {
    expect((await pickRelease([rel(10, { is_kill: true, percent: 0 }), rel(8)], DEVICE, false))?.serial).toBe(
      10
    )
    expect((await pickRelease([rel(9, { percent: 1, channel: 'beta' }), rel(8)], DEVICE, true))?.serial).toBe(
      9
    )
  })
})

// ---- update_check / update_report ----

const checkBody = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    action: 'update_check',
    device_id: DEVICE,
    ts: NOW,
    channel: 'stable',
    firmware: 'DFRD_S32O_MPU_V01811',
    installed: { 'com.vigo.carga': 6, 'com.waze': 1061000 },
    phase: 'IDLE',
    last: 'ok',
    ...o,
  })

describe('update_check', () => {
  it('parses the spec body and refuses unknown keys or bad values', () => {
    expect(parseCarRequest(checkBody())?.action).toBe('update_check')
    expect(parseCarRequest(checkBody({ vin: 'X' }))).toBeNull()
    expect(parseCarRequest(checkBody({ phase: 'BOOM' }))).toBeNull()
    expect(parseCarRequest(checkBody({ installed: { 'Not A Package': 1 } }))).toBeNull()
    expect(parseCarRequest(checkBody({ last: 'x'.repeat(301) }))).toBeNull()
  })

  it('returns the picked manifest with the GitHub download folder and records the offer', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_update_check: ok({ ok: true, beta: false, releases: [rel(9, { percent: 50 }), rel(8)] }),
      car_update_offered: ok(null),
    })
    const r = await call(checkBody(), rpc)
    expect(r.status).toBe(200)
    expect(r.body.serial).toBe(8)
    expect(r.body.manifest).toContain('serial 8')
    expect(r.body.download_base).toBe('https://github.com/o/r/releases/download/r1/')
    expect(calls[1].args.p_report).toMatchObject({ phase: 'IDLE', installed: { 'com.vigo.carga': 6 } })
    expect(calls[2]).toEqual({ fn: 'car_update_offered', args: { p_device_id: DEVICE, p_serial: 8 } })
  })

  it('answers same / none without the manifest', async () => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_update_check: ok({ ok: true, beta: false, releases: [rel(8)] }),
      car_update_offered: ok(null),
    })
    expect((await call(checkBody({ have_serial: 8 }), rpc)).body).toEqual({
      ok: true,
      same: true,
      serial: 8,
      server_time: NOW,
    })
    const none = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_update_check: ok({ ok: true, beta: false, releases: [] }),
    })
    expect((await call(checkBody(), none.rpc)).body).toEqual({ ok: true, none: true, server_time: NOW })
  })

  it('maps guard refusals and malformed rows', async () => {
    const g = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_update_check: ok({ error: 'rate_limited' }),
    })
    expect((await call(checkBody(), g.rpc)).status).toBe(429)
    const m = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_update_check: ok({ ok: true, releases: [{}] }),
    })
    expect((await call(checkBody(), m.rpc)).status).toBe(500)
  })
})

describe('update_report', () => {
  const body = (o: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      action: 'update_report',
      device_id: DEVICE,
      ts: NOW,
      serial: 9,
      phase: 'ROLLING_BACK',
      last: 'ROLLBACK crash loop',
      ...o,
    })

  it('stores through car_update_report', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_update_report: ok({ ok: true }),
    })
    const r = await call(body(), rpc)
    expect(r.body).toEqual({ ok: true, server_time: NOW })
    expect(calls[1].args).toEqual({
      p_device_id: DEVICE,
      p_ts: NOW,
      p_serial: 9,
      p_phase: 'ROLLING_BACK',
      p_last: 'ROLLBACK crash loop',
    })
  })

  it('needs a known phase', () => {
    expect(parseCarRequest(body({ phase: undefined }))).toBeNull()
    expect(parseCarRequest(body({ phase: 'DONE' }))).toBeNull()
  })
})

// ---- charge check-in drafts ----

const CHARGE = {
  kind: 'charge',
  client_id: '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9',
  started_at: NOW - 3600_000,
  ended_at: NOW - 600_000,
  status: 'funciono',
  lat: -34.0943,
  lon: -56.2138,
  energy_kwh: 28.4,
  max_kw: 42.5,
  avg_kw: 36.1,
  charging_min: 47,
  start_soc: 22,
  end_soc: 80,
  end_reason: 'limite',
}
const chargeBody = (draft: unknown) =>
  JSON.stringify({ v: 1, action: 'trip_draft', device_id: DEVICE, ts: NOW, draft })

describe('charge drafts (trip_draft, kind "charge")', () => {
  it('parses a full and a minimal "falló" draft', () => {
    expect(parseChargeDraft(CHARGE)?.max_kw).toBe(42.5)
    expect(
      parseChargeDraft({
        kind: 'charge',
        client_id: CHARGE.client_id,
        started_at: 1,
        ended_at: 2,
        status: 'fallo',
        lat: 0,
        lon: 0,
      })
    ).not.toBeNull()
  })

  it.each([
    ['an extra key', { ...CHARGE, vin: 'x' }],
    ['no location', { ...CHARGE, lat: undefined }],
    ['an unknown status', { ...CHARGE, status: 'ocupado' }],
    ['a fractional charging_min', { ...CHARGE, charging_min: 4.5 }],
    ['kW over 400', { ...CHARGE, max_kw: 401 }],
    ['an unknown end reason', { ...CHARGE, end_reason: 'boom' }],
    ['another kind', { ...CHARGE, kind: 'service' }],
  ])('refuses %s', (_n, d) => {
    expect(parseChargeDraft(JSON.parse(JSON.stringify(d)))).toBeNull()
    expect(parseCarRequest(chargeBody(d))).toBeNull()
  })

  it('routes to car_submit_charge_draft and returns stored', async () => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_charge_draft: ok({ ok: true, stored: false }),
    })
    const r = await call(chargeBody(CHARGE), rpc)
    expect(r.body).toEqual({ ok: true, stored: false, server_time: NOW })
    expect(calls[1].fn).toBe('car_submit_charge_draft')
    expect((calls[1].args.p_draft as Record<string, unknown>).lat).toBe(-34.0943)
  })
})
