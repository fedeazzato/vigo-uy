// specs/car-status-e1.md R4: wording of the last known status.
import { describe, it, expect } from 'vitest'
import { describeCarStatus, formatRemain, isLiveFresh } from './carStatus'
import type { CarStatus } from '../types'

const NOW = new Date('2026-11-21T18:00:00Z')

function row(over: Partial<CarStatus>): CarStatus {
  return {
    vehicle_id: 'v',
    event: 'charge_end',
    soc: 80,
    range_km: 266,
    charging: false,
    plugged: true,
    charge_end_reason: 'limite',
    remain_charge_min: null,
    limit_pct: null,
    observed_at: '2026-11-21T16:00:00Z',
    received_at: '2026-11-21T16:00:05Z',
    ...over,
  }
}

describe('describeCarStatus', () => {
  it('words a charge end like the spec', () => {
    expect(describeCarStatus(row({}), NOW)).toEqual({
      battery: '80 %',
      range: '266 km',
      plug: 'Enchufado',
      when: 'al terminar una carga: llegó al límite · hace 2 h',
      live: false,
      remain: null,
      limit: null,
    })
  })

  it('words a trip end without a reason', () => {
    const v = describeCarStatus(row({ event: 'trip_end', charge_end_reason: null, plugged: false }), NOW)
    expect(v.plug).toBe('Desenchufado')
    expect(v.when).toBe('al terminar un viaje · hace 2 h')
  })

  it('charging wins over plugged; unknown values are left out', () => {
    expect(describeCarStatus(row({ charging: true }), NOW).plug).toBe('Cargando')
    const v = describeCarStatus(row({ soc: null, range_km: null, charging: null, plugged: null }), NOW)
    expect(v).toMatchObject({ battery: null, range: null, plug: null })
  })

  it('words a live snapshot (specs/car-remote-e3.md R2)', () => {
    const v = describeCarStatus(row({ event: 'live', charge_end_reason: null, charging: true }), NOW)
    expect(v.plug).toBe('Cargando')
    expect(v.when).toBe('con el auto encendido · hace 2 h')
  })

  it('sin_datos and unknown reasons add no words; a bad timestamp drops the age', () => {
    expect(describeCarStatus(row({ charge_end_reason: 'sin_datos' }), NOW).when).toBe('al terminar una carga · hace 2 h')
    expect(describeCarStatus(row({ observed_at: 'not a date' }), NOW).when).toBe('al terminar una carga: llegó al límite')
  })

  it('a fresh live row adds time to full (only while charging) and the limit (specs/car-remote-e3.md R2)', () => {
    const fresh = row({
      event: 'live',
      charge_end_reason: null,
      charging: true,
      remain_charge_min: 95,
      limit_pct: 90,
      observed_at: '2026-11-21T17:59:50Z',
      received_at: '2026-11-21T17:59:55Z',
    })
    expect(describeCarStatus(fresh, NOW)).toMatchObject({
      plug: 'Cargando',
      live: true,
      remain: 'Carga completa en ~1 h 35 min',
      limit: 'Límite de carga 90 %',
    })
    expect(describeCarStatus(fresh, NOW).when).toMatch(/^con el auto encendido · /)
    expect(describeCarStatus({ ...fresh, charging: false }, NOW)).toMatchObject({ remain: null, limit: 'Límite de carga 90 %' })
    expect(describeCarStatus({ ...fresh, remain_charge_min: null, limit_pct: null }, NOW)).toMatchObject({ remain: null, limit: null })
  })

  it('a stale live row or a non-live row shows neither time to full nor the limit', () => {
    const stale = row({ event: 'live', charging: true, remain_charge_min: 95, limit_pct: 90, received_at: '2026-11-21T17:57:00Z' })
    expect(describeCarStatus(stale, NOW)).toMatchObject({ live: false, remain: null, limit: null })
    const ended = row({ charging: true, remain_charge_min: 95, limit_pct: 90, received_at: '2026-11-21T17:59:55Z' })
    expect(describeCarStatus(ended, NOW)).toMatchObject({ live: false, remain: null, limit: null })
  })
})

describe('live helpers', () => {
  it('isLiveFresh: live event received under 2 min ago (server clock)', () => {
    expect(isLiveFresh(row({ event: 'live', received_at: '2026-11-21T17:58:01Z' }), NOW)).toBe(true)
    expect(isLiveFresh(row({ event: 'live', received_at: '2026-11-21T17:58:00Z' }), NOW)).toBe(false)
    expect(isLiveFresh(row({ event: 'live', received_at: 'bad' }), NOW)).toBe(false)
    expect(isLiveFresh(null, NOW)).toBe(false)
  })

  it('formatRemain', () => {
    expect(formatRemain(95)).toBe('~1 h 35 min')
    expect(formatRemain(60)).toBe('~1 h')
    expect(formatRemain(5)).toBe('~5 min')
    expect(formatRemain(0)).toBe('menos de 1 min')
  })
})
