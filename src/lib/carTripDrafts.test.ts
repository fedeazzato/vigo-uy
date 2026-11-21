// specs/car-trip-drafts.md R3 / test plan: station match, conversion to the trip form, summary.
import { describe, it, expect } from 'vitest'
import {
  chargeNote,
  describeDraft,
  draftCharges,
  draftRoute,
  draftToTripState,
  nearestStation,
} from './carTripDrafts'
import type { CarTripDraftRow, ChargingStation } from '../types'

function station(
  id: string,
  lat: number,
  lng: number,
  extra: Partial<ChargingStation> = {}
): ChargingStation {
  return {
    id,
    name: `Estación ${id}`,
    lat,
    lng,
    hidden: false,
    access_notes: null,
    address: null,
    city: null,
    connector: 'CCS2',
    current_type: 'DC',
    created_at: '',
    max_power_kw: null,
    network: 'ute',
    ocm_id: null,
    ocm_last_synced_at: null,
    updated_at: '',
    user_id: 'u',
    verified: true,
    ...extra,
  }
}

const T0 = Date.UTC(2026, 10, 21, 15, 0, 0) // 12:00 in Uruguay
const ROW: CarTripDraftRow = {
  id: 'd1',
  vehicle_id: 'v',
  device_id: 'dev',
  client_id: 'c',
  started_at: new Date(T0).toISOString(),
  ended_at: new Date(T0 + (3 * 60 + 20) * 60000).toISOString(),
  trip_count: 2,
  distance_km: 182.4,
  energy_kwh: 27.5,
  start_soc: 90,
  end_soc: 31,
  avg_speed_kmh: 78.6,
  route: [[-34.9, -56.16], [-34.85, -55.95], 'bad', [-34.8, -55.7]],
  charges: [
    {
      started_at: T0 + 120 * 60000,
      ended_at: T0 + 155 * 60000,
      start_soc: 22,
      end_soc: 80,
      energy_kwh: 30.1,
      end_reason: 'limite',
      lat: -34.8501,
      lon: -55.9502,
    },
    { started_at: T0 + 10 * 60000, ended_at: T0 + 20 * 60000, start_soc: 85, end_soc: 90 },
    { nope: true },
  ],
  status: 'pending',
  used_at: null,
  received_at: new Date(T0 + 4 * 3600000).toISOString(),
}

describe('nearestStation', () => {
  const stations = [
    station('a', -34.85, -55.95),
    station('b', -34.852, -55.95),
    station('h', -34.8501, -55.9502, { hidden: true }),
  ]
  it('picks the nearest visible station within 300 m', () => {
    expect(nearestStation(-34.8501, -55.9502, stations)?.id).toBe('a')
  })
  it('returns null beyond 300 m or without a location', () => {
    expect(nearestStation(-34.86, -55.95, stations)).toBeNull()
    expect(nearestStation(undefined, undefined, stations)).toBeNull()
  })
})

describe('draftRoute / draftCharges', () => {
  it('skips malformed elements and sorts charges by start', () => {
    expect(draftRoute(ROW)).toHaveLength(3)
    const c = draftCharges(ROW)
    expect(c).toHaveLength(2)
    expect(c[0].start_soc).toBe(85)
    expect(c[1].lat).toBe(-34.8501)
  })
})

describe('draftToTripState', () => {
  it('fills distance, date, SOC, speed and one stop per charge, without energy_kwh', () => {
    const s = draftToTripState(ROW, [station('a', -34.85, -55.95)], 'E2+')
    expect(s.distanceKm).toBe('182')
    expect(s.tripDate).toMatch(/^2026-11-21$/)
    expect(s.startingCharge).toBe('90')
    expect(s.endingCharge).toBe('31')
    expect(s.averageSpeed).toBe('79')
    expect(s.model).toBe('E2+')
    expect(s.origin).toBe('')
    expect(s.stops).toHaveLength(2)
    expect(s.stops[0]).toMatchObject({
      stationId: '',
      name: '',
      arrivalPercentage: '85',
      departurePercentage: '90',
      durationMinutes: '10',
    })
    expect(s.stops[1]).toMatchObject({
      stationId: 'a',
      name: 'Estación a',
      durationMinutes: '35',
      energyKwh: '',
    })
    expect(s.stops[1].note).toContain('30,1 kWh a la batería')
    expect(s.stops[1].note).toContain('llegó al límite')
    expect(s.showDetails).toBe(true)
    expect(s.step).toBe(0)
  })
})

describe('chargeNote / describeDraft', () => {
  it('words a charge with no data as empty', () => {
    expect(chargeNote({ started_at: 0, ended_at: 1 })).toBe('')
  })
  it('summarises the draft', () => {
    const d = describeDraft(ROW)
    expect(d.title).toMatch(/2 viajes$/)
    const byLabel = Object.fromEntries(d.stats.map((x) => [x.label, x.value]))
    expect(byLabel.Distancia).toBe('182,4 km')
    expect(byLabel['Energía']).toBe('27,5 kWh')
    expect(byLabel['Batería']).toBe('90 → 31 %')
    expect(byLabel['Duración']).toBe('3 h 20 min')
    expect(byLabel.Cargas).toBe('2')
  })
})
