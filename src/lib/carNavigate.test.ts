// specs/car-navigate-b2.md: destination validation, the navigate order RPC and the car-link read.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, rpcMock, answers } = vi.hoisted(() => {
  const answers: Record<string, { data: unknown; error: unknown }> = {}
  const builder = (table: string) => {
    const result = () => Promise.resolve(answers[table] ?? { data: null, error: { message: 'no answer' } })
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.maybeSingle = () => result()
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => result().then(ok, ko)
    return b
  }
  return { fromMock: vi.fn((t: string) => builder(t)), rpcMock: vi.fn(), answers }
})

vi.mock('./supabaseClient', () => ({ supabase: { from: fromMock, rpc: rpcMock } }))

import { cleanLabel, fetchCarLink, resetCarLinkCache, sendDestination, validDestination } from './carNavigate'
import { orderKindLabel, orderStateView } from './carRemote'
import type { CarOrder } from '../types'

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockClear()
  for (const k of Object.keys(answers)) delete answers[k]
  resetCarLinkCache()
})

describe('cleanLabel / validDestination', () => {
  it('strips control characters, collapses spaces and cuts at 80', () => {
    expect(cleanLabel('  Tata\u0007  Punta\nCarretas ')).toBe('Tata Punta Carretas')
    expect([...cleanLabel('á'.repeat(100))].length).toBe(80)
  })

  it.each([
    [{ lat: -34.9, lon: -56.16, label: 'x' }, true],
    [{ lat: 0, lon: 0, label: 'x' }, false],
    [{ lat: 91, lon: 0, label: 'x' }, false],
    [{ lat: -34.9, lon: -181, label: 'x' }, false],
    [{ lat: Number.NaN, lon: -56, label: 'x' }, false],
    [{ lat: -34.9, lon: -56.16, label: '  ' }, false],
  ])('%j -> %s', (d, ok) => {
    expect(validDestination(d)).toBe(ok)
  })
})

describe('sendDestination', () => {
  it('queues a navigate order with rounded coordinates and the cleaned label', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, id: 'o1' }, error: null })
    const r = await sendDestination({ lat: -34.90112345678, lon: -56.1645999, label: ' Cargador  UTE ' })
    expect(r.error).toBeNull()
    expect(rpcMock).toHaveBeenCalledWith('create_car_order', {
      p_kind: 'navigate',
      p_args: { lat: -34.901123, lon: -56.1646, label: 'Cargador UTE' },
    })
  })

  it('refuses an invalid destination without calling the server', async () => {
    const r = await sendDestination({ lat: 0, lon: 0, label: 'x' })
    expect(r.error).toMatch(/ubicación/)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('words the server errors', async () => {
    rpcMock.mockResolvedValue({ data: { error: 'no_car' }, error: null })
    expect((await sendDestination({ lat: -34.9, lon: -56.1, label: 'x' })).error).toMatch(/todavía no tiene la pantalla del auto conectada/)
  })
})

describe('fetchCarLink', () => {
  it('no active device -> no car, status not read', async () => {
    answers.car_devices = { data: [{ id: 'd', revoked_at: '2026-01-01' }], error: null }
    expect(await fetchCarLink()).toEqual({ hasCar: false, remoteOn: null })
    expect(fromMock).not.toHaveBeenCalledWith('car_status')
  })

  it('reads remote_on when the car reported it', async () => {
    answers.car_devices = { data: [{ id: 'd', revoked_at: null }], error: null }
    answers.car_status = { data: { remote_on: false }, error: null }
    expect(await fetchCarLink()).toEqual({ hasCar: true, remoteOn: false })
  })

  it('a missing column (0054 not applied) keeps the button: remoteOn unknown', async () => {
    answers.car_devices = { data: [{ id: 'd', revoked_at: null }], error: null }
    answers.car_status = { data: null, error: { message: 'column car_status.remote_on does not exist' } }
    expect(await fetchCarLink()).toEqual({ hasCar: true, remoteOn: null })
  })

  it('is cached for a minute', async () => {
    answers.car_devices = { data: [], error: null }
    await fetchCarLink(1000)
    await fetchCarLink(30_000)
    expect(fromMock).toHaveBeenCalledTimes(1)
    await fetchCarLink(70_000)
    expect(fromMock).toHaveBeenCalledTimes(2)
  })
})

describe('navigate orders in the order list', () => {
  const o = (over: Partial<CarOrder>): CarOrder => ({
    id: 'o',
    kind: 'navigate',
    args: { lat: -34.9, lon: -56.1, label: 'Tata Rivera' },
    state: 'failed',
    created_by: null,
    created_at: '2026-11-22T12:00:00Z',
    expires_at: '2026-11-22T12:02:00Z',
    taken_at: null,
    finished_at: null,
    result_code: 'no_app',
    result_text: null,
    ...over,
  })

  it('labels the order with its destination', () => {
    expect(orderKindLabel(o({}))).toBe('Navegar a Tata Rivera')
    expect(orderKindLabel(o({ args: {} }))).toBe('Navegar a un destino')
  })

  it('words no_app', () => {
    expect(orderStateView(o({}), new Date('2026-11-22T12:01:00Z')).detail).toMatch(/Waze/)
  })
})
