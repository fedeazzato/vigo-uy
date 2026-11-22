// specs/car-remote-e3.md R6: fetch, order RPCs and wording of "Control remoto".
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, rpcMock, answers } = vi.hoisted(() => {
  const answers: Record<string, { data: unknown; error: unknown }> = {}
  const selects: Record<string, string> = {}
  // A chainable query builder that resolves to the canned answer of its table.
  const builder = (table: string) => {
    const result = () => Promise.resolve(answers[table] ?? { data: null, error: { message: 'no answer' } })
    const b: Record<string, unknown> = {}
    b.select = (cols: string) => {
      selects[table] = cols
      return b
    }
    b.order = () => b
    b.limit = () => result()
    b.maybeSingle = () => result()
    b.in = () => result()
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => result().then(ok, ko)
    return b
  }
  const fromMock = vi.fn((table: string) => builder(table))
  const rpcMock = vi.fn()
  return { fromMock, rpcMock, answers, selects }
})

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}))

import {
  cancelCarOrder,
  clampLimit,
  connectionLabel,
  createCarOrder,
  fetchCarRemote,
  formatRemain,
  isLiveFresh,
  orderKindLabel,
  orderMeta,
  orderPhase,
  orderStateView,
} from './carRemote'
import { invalidateCommunityCache } from './communityData'
import type { CarOrder, CarRemoteStatus } from '../types'

const NOW = new Date('2026-11-22T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

function order(over: Partial<CarOrder>): CarOrder {
  return {
    id: 'o1',
    kind: 'windows_close_all',
    args: {},
    state: 'queued',
    created_by: 'u1',
    created_at: ago(30_000),
    expires_at: new Date(NOW.getTime() + 90_000).toISOString(),
    taken_at: null,
    finished_at: null,
    result_code: null,
    result_text: null,
    ...over,
  }
}

function status(over: Partial<CarRemoteStatus>): CarRemoteStatus {
  return {
    vehicle_id: 'v',
    event: 'live',
    soc: 64,
    range_km: 212,
    charging: true,
    plugged: true,
    remain_charge_min: 95,
    limit_pct: 90,
    observed_at: ago(10_000),
    received_at: ago(8_000),
    ...over,
  }
}

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k]
  fromMock.mockClear()
  rpcMock.mockReset()
  invalidateCommunityCache()
})

describe('fetchCarRemote', () => {
  it('combines devices, status and orders; names who sent each order', async () => {
    answers.car_devices = {
      data: [
        { id: 'd1', last_seen_at: ago(60_000), revoked_at: null },
        { id: 'd2', last_seen_at: ago(5_000), revoked_at: null },
        { id: 'd3', last_seen_at: ago(1_000), revoked_at: ago(500) },
      ],
      error: null,
    }
    answers.car_status = { data: status({}), error: null }
    answers.car_orders = { data: [order({})], error: null }
    answers.public_profiles = { data: [{ id: 'u1', display_name: 'Ana' }], error: null }
    const r = await fetchCarRemote()
    expect(r?.hasCar).toBe(true)
    expect(r?.lastSeenAt).toBe(ago(5_000)) // the revoked device does not count
    expect(r?.orders).toHaveLength(1)
    expect(r?.names).toEqual({ u1: 'Ana' })
    expect(fromMock.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['car_devices', 'car_status', 'car_orders'])
    )
  })

  it('no active device = no car', async () => {
    answers.car_devices = { data: [{ id: 'd1', last_seen_at: null, revoked_at: ago(1) }], error: null }
    answers.car_status = { data: null, error: null }
    answers.car_orders = { data: [], error: null }
    const r = await fetchCarRemote()
    expect(r).toMatchObject({ hasCar: false, lastSeenAt: null, status: null, orders: [], names: {} })
  })

  it('any error (e.g. migration 0052 not applied) yields null', async () => {
    answers.car_devices = { data: [], error: null }
    answers.car_status = { data: null, error: { message: 'column car_status.limit_pct does not exist' } }
    answers.car_orders = { data: null, error: { message: 'relation "car_orders" does not exist' } }
    expect(await fetchCarRemote()).toBeNull()
  })
})

describe('createCarOrder / cancelCarOrder', () => {
  it('sends the kind and exact args', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, id: 'x' }, error: null })
    expect(await createCarOrder('charge_limit', 85)).toEqual({ error: null })
    expect(rpcMock).toHaveBeenCalledWith('create_car_order', { p_kind: 'charge_limit', p_args: { pct: 85 } })
    await createCarOrder('ventilate')
    expect(rpcMock).toHaveBeenLastCalledWith('create_car_order', { p_kind: 'ventilate', p_args: {} })
  })

  it.each([
    ['no_car', /No hay un auto vinculado/],
    ['rate_limited', /muchas órdenes seguidas/],
    ['bad_request', /no es válida/],
    ['something_new', /no está disponible/],
  ])('maps %s', async (code, text) => {
    rpcMock.mockResolvedValue({ data: { error: code }, error: null })
    expect((await createCarOrder('windows_close_all')).error).toMatch(text)
  })

  it('cancel maps not_queued and passes the id', async () => {
    rpcMock.mockResolvedValue({ data: { error: 'not_queued' }, error: null })
    expect((await cancelCarOrder('o1')).error).toMatch(/Ya no se puede cancelar/)
    expect(rpcMock).toHaveBeenCalledWith('cancel_car_order', { p_id: 'o1' })
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await cancelCarOrder('o1')).toEqual({ error: null })
  })
})

describe('wording', () => {
  it('connection: online under 35 s (10 s polls, one late poll tolerated), otherwise when it was seen', () => {
    expect(connectionLabel(ago(10_000), NOW)).toBe('En línea')
    expect(connectionLabel(ago(34_000), NOW)).toBe('En línea')
    expect(connectionLabel(ago(35_000), NOW)).toBe('Sin conexión — visto hace un momento')
    expect(connectionLabel(ago(2 * 3600_000), NOW)).toBe('Sin conexión — visto hace 2 h')
    expect(connectionLabel(null, NOW)).toBe('Sin conexión — todavía no se conectó')
  })

  it('live only when the event is live and the server received it recently', () => {
    expect(isLiveFresh(status({}), NOW)).toBe(true)
    expect(isLiveFresh(status({ received_at: ago(3 * 60_000) }), NOW)).toBe(false)
    expect(isLiveFresh(status({ event: 'charge_end' }), NOW)).toBe(false)
    expect(isLiveFresh(null, NOW)).toBe(false)
  })

  it('time to full', () => {
    expect(formatRemain(95)).toBe('~1 h 35 min')
    expect(formatRemain(120)).toBe('~2 h')
    expect(formatRemain(40)).toBe('~40 min')
    expect(formatRemain(0)).toBe('menos de 1 min')
  })

  it('limit stepper clamps to 60-100 on 5 % steps', () => {
    expect(clampLimit(55)).toBe(60)
    expect(clampLimit(83)).toBe(85)
    expect(clampLimit(105)).toBe(100)
  })

  it('kinds in words', () => {
    expect(orderKindLabel({ kind: 'ventilate', args: {} })).toBe('Ventilar')
    expect(orderKindLabel({ kind: 'windows_open_all', args: {} })).toBe('Abrir todas las ventanas')
    expect(orderKindLabel({ kind: 'charge_stop', args: {} })).toBe('Detener la carga')
    expect(orderKindLabel({ kind: 'charge_limit', args: { pct: 80 } })).toBe('Límite de carga: 80 %')
  })

  it('a queued order past expires_at shows as expired', () => {
    expect(orderPhase(order({}), NOW)).toBe('queued')
    expect(orderPhase(order({ expires_at: ago(1) }), NOW)).toBe('expired')
    expect(orderStateView(order({ expires_at: ago(1) }), NOW)).toEqual({
      icon: '⌛',
      label: 'Vencida',
      detail: 'el auto no la recibió en 2 minutos',
    })
  })

  it('a taken order without a result for more than 60 s shows "Sin respuesta del auto"', () => {
    expect(orderPhase(order({ state: 'taken', taken_at: ago(60_000) }), NOW)).toBe('taken')
    expect(orderPhase(order({ state: 'taken', taken_at: ago(60_001) }), NOW)).toBe('no_response')
    expect(orderPhase(order({ state: 'taken', taken_at: null }), NOW)).toBe('taken')
    expect(orderStateView(order({ state: 'taken', taken_at: ago(5 * 60_000) }), NOW)).toEqual({
      icon: '❔',
      label: 'Sin respuesta del auto',
      detail: 'La recibió pero no avisó si la hizo',
    })
    // A late result still shows as such (the row is updated server side).
    expect(orderPhase(order({ state: 'done', taken_at: ago(5 * 60_000) }), NOW)).toBe('done')
  })

  it('states with their reason in words', () => {
    expect(orderStateView(order({ state: 'taken', taken_at: ago(5_000) }), NOW).label).toBe('Recibida')
    expect(orderStateView(order({ state: 'done', result_code: 'ok' }), NOW)).toMatchObject({
      icon: '✅',
      detail: null,
    })
    expect(orderStateView(order({ state: 'failed', result_code: 'not_parked' }), NOW)).toEqual({
      icon: '⚠️',
      label: 'Falló',
      detail: 'el auto no estaba en P y detenido',
    })
    expect(orderStateView(order({ state: 'expired', result_code: 'superseded' }), NOW).detail).toBe(
      'la reemplazó una orden más nueva'
    )
    expect(orderStateView(order({ state: 'cancelled' }), NOW).label).toBe('Cancelada')
  })

  it('who sent it and when', () => {
    expect(orderMeta(order({}), { u1: 'Ana' }, NOW)).toBe('Ana · hace un momento')
    expect(orderMeta(order({ created_by: null }), {}, NOW)).toBe('una cuenta borrada · hace un momento')
  })
})
