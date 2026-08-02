import { describe, it, expect } from 'vitest'
import { resolveTripMapPoints } from './tripMap'
import type { ChargingStation, TripChargingStop, TripLog } from '../types'

function makeTrip(overrides: Partial<TripLog> = {}): TripLog {
  return {
    id: 't-1',
    user_id: 'u-1',
    vehicle_id: null,
    title: 'Viaje de prueba',
    origin: 'Montevideo',
    destination: 'Rocha',
    trip_date: '2026-07-01',
    distance_km: 200,
    average_speed_kmh: null,
    starting_charge_percentage: null,
    ending_charge_percentage: null,
    charging_stops: [],
    rating: null,
    notes: null,
    model: null,
    is_public: true,
    hidden: false,
    verified: false,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function makeStation(overrides: Partial<ChargingStation> = {}): ChargingStation {
  return {
    id: 's-1',
    user_id: 'u-1',
    name: 'Estación de prueba',
    network: 'ANCAP',
    city: null,
    address: null,
    connector: 'CCS2',
    current_type: 'DC',
    max_power_kw: null,
    access_notes: null,
    lat: -34.5,
    lng: -55.5,
    ocm_id: null,
    ocm_last_synced_at: null,
    verified: false,
    hidden: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function makeStop(overrides: Partial<TripChargingStop> = {}): TripChargingStop {
  return { name: 'Parada', ...overrides }
}

describe('resolveTripMapPoints', () => {
  it('resolves origin and destination from an exact city match', () => {
    const { points } = resolveTripMapPoints(makeTrip({ origin: 'Montevideo', destination: 'Rocha' }), [])
    expect(points.map((p) => p.type)).toEqual(['origin', 'destination'])
    expect(points[0].label).toBe('Montevideo')
    expect(points[1].label).toBe('Rocha')
  })

  it('matches city names ignoring accents and case', () => {
    const { points } = resolveTripMapPoints(makeTrip({ origin: 'montevideo', destination: 'ROCHA' }), [])
    expect(points).toHaveLength(2)
  })

  it('omits a city with no lookup entry instead of throwing', () => {
    const { points } = resolveTripMapPoints(
      makeTrip({ origin: 'Buenos Aires', destination: 'Rocha' }),
      []
    )
    expect(points.map((p) => p.type)).toEqual(['destination'])
  })

  it('resolves a charging stop linked to a station with coordinates', () => {
    const station = makeStation({ id: 's-1', lat: -34.5, lng: -55.5 })
    const trip = makeTrip({
      charging_stops: [makeStop({ name: 'ANCAP Ruta 8', station_id: 's-1' })],
    })
    const { points, unresolvedStopCount } = resolveTripMapPoints(trip, [station])
    const chargePoint = points.find((p) => p.type === 'charge')
    expect(chargePoint).toEqual({ type: 'charge', lat: -34.5, lng: -55.5, label: 'ANCAP Ruta 8' })
    expect(unresolvedStopCount).toBe(0)
  })

  it('carries the charge duration through when the stop recorded it', () => {
    const station = makeStation({ id: 's-1', lat: -34.5, lng: -55.5 })
    const trip = makeTrip({
      charging_stops: [makeStop({ name: 'ANCAP Ruta 8', station_id: 's-1', duration_minutes: 28 })],
    })
    const { points } = resolveTripMapPoints(trip, [station])
    expect(points.find((p) => p.type === 'charge')?.durationMinutes).toBe(28)
  })

  it('leaves the charge duration undefined when the stop did not record it', () => {
    const station = makeStation({ id: 's-1', lat: -34.5, lng: -55.5 })
    const trip = makeTrip({
      charging_stops: [makeStop({ name: 'ANCAP Ruta 8', station_id: 's-1' })],
    })
    const { points } = resolveTripMapPoints(trip, [station])
    expect(points.find((p) => p.type === 'charge')?.durationMinutes).toBeUndefined()
  })

  it('counts a stop whose linked station is not in the fetched list as unresolved', () => {
    // e.g. the station is hidden (RLS excludes it from fetchChargingStations)
    // or has since been removed -- the stop's station_id no longer resolves.
    const trip = makeTrip({ charging_stops: [makeStop({ station_id: 'missing-station' })] })
    const { points, unresolvedStopCount } = resolveTripMapPoints(trip, [])
    expect(points.some((p) => p.type === 'charge')).toBe(false)
    expect(unresolvedStopCount).toBe(1)
  })

  it('counts a stop with no station_id as unresolved', () => {
    const trip = makeTrip({ charging_stops: [makeStop({ name: 'Casa de un amigo' })] })
    const { points, unresolvedStopCount } = resolveTripMapPoints(trip, [])
    expect(points.some((p) => p.type === 'charge')).toBe(false)
    expect(unresolvedStopCount).toBe(1)
  })

  it('orders points as origin, then stops in trip order, then destination', () => {
    const stationA = makeStation({ id: 's-a', lat: -33.0, lng: -56.0 })
    const stationB = makeStation({ id: 's-b', lat: -33.5, lng: -56.5 })
    const trip = makeTrip({
      origin: 'Montevideo',
      destination: 'Salto',
      charging_stops: [
        makeStop({ name: 'Primera parada', station_id: 's-a' }),
        makeStop({ name: 'Segunda parada', station_id: 's-b' }),
      ],
    })
    const { points } = resolveTripMapPoints(trip, [stationA, stationB])
    expect(points.map((p) => p.label)).toEqual(['Montevideo', 'Primera parada', 'Segunda parada', 'Salto'])
  })

  it('returns no points when nothing on the trip resolves', () => {
    const trip = makeTrip({
      origin: 'Buenos Aires',
      destination: 'São Paulo',
      charging_stops: [makeStop({ name: 'Sin ubicación' })],
    })
    const { points, unresolvedStopCount } = resolveTripMapPoints(trip, [])
    expect(points).toEqual([])
    expect(unresolvedStopCount).toBe(1)
  })
})
