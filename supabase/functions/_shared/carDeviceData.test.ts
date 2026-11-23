// @vitest-environment node
// car-device: car data samples battery / drive / fault (specs/car-data-a3-a9.md).
import { describe, it, expect, beforeAll } from 'vitest'
import {
  handleCarDevice,
  parseCarRequest,
  parseCarData,
  SIGNATURE_HEADER,
  SIGNING_PREFIX,
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

const CID = '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9'
const BATTERY = {
  kind: 'battery',
  client_id: CID,
  started_at: NOW - 3600_000,
  ended_at: NOW - 600_000,
  energy_kwh: 18.4,
  start_soc: 20,
  end_soc: 80,
  temp_c: 18,
  odometer_km: 12034,
}
const DRIVE = {
  kind: 'drive',
  client_id: CID,
  started_at: NOW - 3600_000,
  ended_at: NOW - 600_000,
  distance_km: 42.3,
  energy_kwh: 6.1,
  avg_speed_kmh: 51.2,
  temp_c: 12,
  regen_kwh: 1.2,
  brake_events: 37,
  regen_pct: 61.5,
}
const FAULT = {
  kind: 'fault',
  client_id: CID,
  observed_at: NOW - 60_000,
  source: 'cluster',
  code: 'tire_pressure_alarm',
  value: 1,
  odometer_km: 12034,
}
const body = (draft: unknown) =>
  JSON.stringify({ v: 1, action: 'trip_draft', device_id: DEVICE, ts: NOW, draft })

describe('car data samples (trip_draft, kinds battery / drive / fault)', () => {
  it('parses full and minimal samples', () => {
    expect(parseCarData(BATTERY)?.energy_kwh).toBe(18.4)
    expect(parseCarData(DRIVE)?.regen_pct).toBe(61.5)
    expect(parseCarData(FAULT)?.code).toBe('tire_pressure_alarm')
    expect(parseCarData({ ...FAULT, client_id: CID.toUpperCase() })?.client_id).toBe(CID)
    const minDrive = { kind: 'drive', client_id: CID, started_at: 1, ended_at: 2, distance_km: 1, regen_kwh: 0.1 }
    expect(parseCarData(minDrive)).not.toBeNull()
    expect(parseCarData({ ...FAULT, value: -3, odometer_km: undefined })).not.toBeNull()
  })

  it.each([
    ['an extra key', { ...BATTERY, lat: -34.9 }],
    ['a location on a drive', { ...DRIVE, lat: -34.9, lon: -56.1 }],
    ['battery SOC not rising', { ...BATTERY, end_soc: 20 }],
    ['battery under 0.5 kWh', { ...BATTERY, energy_kwh: 0.4 }],
    ['battery without energy', { ...BATTERY, energy_kwh: undefined }],
    ['a fractional SOC', { ...BATTERY, start_soc: 20.5 }],
    ['temperature out of range', { ...BATTERY, temp_c: 71 }],
    ['a drive without energy or regen', { ...DRIVE, energy_kwh: undefined, regen_kwh: undefined }],
    ['a drive under 0.5 km', { ...DRIVE, distance_km: 0.2 }],
    ['regen over 100 %', { ...DRIVE, regen_pct: 101 }],
    ['a drive ending before it starts', { ...DRIVE, ended_at: DRIVE.started_at - 1 }],
    ['an unknown fault source', { ...FAULT, source: 'obd' }],
    ['a fault code with capitals', { ...FAULT, code: 'Airbag' }],
    ['a fractional fault value', { ...FAULT, value: 1.5 }],
    ['a fault with started_at', { ...FAULT, started_at: NOW }],
    ['a bad client id', { ...FAULT, client_id: 'x' }],
  ])('refuses %s', (_n, d) => {
    const clean = JSON.parse(JSON.stringify(d)) as unknown
    expect(parseCarData(clean)).toBeNull()
    expect(parseCarRequest(body(clean))).toBeNull()
  })

  it.each([
    ['battery', BATTERY],
    ['drive', DRIVE],
    ['fault', FAULT],
  ])('routes %s to car_submit_data and returns stored', async (_k, d) => {
    const { rpc, calls } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_data: ok({ ok: true, stored: true }),
    })
    const r = await call(body(d), rpc)
    expect(r.body).toEqual({ ok: true, stored: true, server_time: NOW })
    expect(calls[1].fn).toBe('car_submit_data')
    expect(calls[1].args.p_draft).toEqual(d)
  })

  it('maps the per-kind daily cap to rate_limited', async () => {
    const { rpc } = fakeRpc({
      car_device_public_key: ok(fresh.spki),
      car_submit_data: ok({ error: 'rate_limited' }),
    })
    const r = await call(body(DRIVE), rpc)
    expect(r.status).toBe(429)
  })

  it('still routes kind "charge" to the check-in parser', () => {
    expect(parseCarRequest(body({ ...BATTERY, kind: 'charge' }))).toBeNull()
  })
})
