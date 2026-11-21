// specs/car-status-e1.md R4: wording of the last known status.
import { describe, it, expect } from 'vitest'
import { describeCarStatus } from './carStatus'
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

  it('sin_datos and unknown reasons add no words; a bad timestamp drops the age', () => {
    expect(describeCarStatus(row({ charge_end_reason: 'sin_datos' }), NOW).when).toBe('al terminar una carga · hace 2 h')
    expect(describeCarStatus(row({ observed_at: 'not a date' }), NOW).when).toBe('al terminar una carga: llegó al límite')
  })
})
