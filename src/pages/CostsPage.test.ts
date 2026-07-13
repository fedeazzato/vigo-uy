import { describe, it, expect } from 'vitest'
import { estimateConsumption } from './CostsPage'
import type { TripLog } from '../types'

let seq = 0

function makeTrip(overrides: Partial<TripLog>): TripLog {
  seq += 1
  return {
    id: `trip-${seq}`,
    user_id: 'user-1',
    title: 'Viaje',
    origin: 'Montevideo',
    destination: 'Punta del Este',
    distance_km: 100,
    trip_date: '2026-07-01',
    model: 'E2+',
    starting_charge_percentage: 90,
    ending_charge_percentage: 60,
    average_speed_kmh: null,
    charging_stops: [],
    rating: null,
    notes: null,
    is_public: true,
    hidden: false,
    verified: false,
    vehicle_id: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

const BATTERY = 50 // kWh, round numbers for readable expectations

describe('estimateConsumption', () => {
  it('returns null below the minimum sample size', () => {
    const trips = [makeTrip({}), makeTrip({})]
    expect(estimateConsumption(trips, 'E2+', BATTERY)).toBeNull()
  })

  it('ignores trips that are not computable', () => {
    const trips = [
      makeTrip({}),
      makeTrip({}),
      // All of these must be excluded from the sample:
      makeTrip({ model: 'E2' }),
      makeTrip({ charging_stops: [{ name: 'UTE' }] }),
      makeTrip({ distance_km: null }),
      makeTrip({ starting_charge_percentage: null }),
      makeTrip({ starting_charge_percentage: 50, ending_charge_percentage: 80 }),
    ]
    // Only 2 qualifying trips -> below MIN_CONSUMPTION_SAMPLES.
    expect(estimateConsumption(trips, 'E2+', BATTERY)).toBeNull()
  })

  it('uses the median so one absurd trip cannot drag the estimate', () => {
    // Three trips at exactly 15 kWh/100km (30% of 50 kWh over 100 km)...
    const trips = [makeTrip({}), makeTrip({}), makeTrip({})]
    const clean = estimateConsumption(trips, 'E2+', BATTERY)
    expect(clean?.value).toBe('15 kWh/100km')

    // ...plus one absurd outlier (98% over 1 km = 4900 kWh/100km).
    const withOutlier = [
      ...trips,
      makeTrip({ distance_km: 1, starting_charge_percentage: 99, ending_charge_percentage: 1 }),
    ]
    const robust = estimateConsumption(withOutlier, 'E2+', BATTERY)
    // Median of [15, 15, 15, 4900] is still 15.
    expect(robust?.value).toBe('15 kWh/100km')
    expect(robust?.label).toContain('4 viajes')
  })

  it('averages the two middle samples for even-sized sets', () => {
    const trips = [
      makeTrip({ ending_charge_percentage: 70 }), // 10 kWh/100km
      makeTrip({ ending_charge_percentage: 60 }), // 15
      makeTrip({ ending_charge_percentage: 50 }), // 20
      makeTrip({ ending_charge_percentage: 40 }), // 25
    ]
    const result = estimateConsumption(trips, 'E2+', BATTERY)
    // Median of [10, 15, 20, 25] = 17.5, es-UY formats with a comma.
    expect(result?.value).toBe('17,5 kWh/100km')
  })
})
