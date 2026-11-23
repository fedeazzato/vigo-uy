// specs/route-plans.md test plan.
import { describe, expect, it } from 'vitest'
import {
  BATTERY_KWH,
  FALLBACK_CONSUMPTION,
  buildRouteGeometry,
  communityConsumption,
  parsePlanQuery,
  planCharging,
  planQueryToSearch,
  projectOntoRoute,
  rangeKm,
  totalKm,
  tripConsumption,
} from './routePlan'
import type { StopCandidate } from './routePlan'
import type { TripLog } from '../types'

function trip(over: Partial<TripLog>): TripLog {
  return {
    id: 't',
    user_id: 'u',
    vehicle_id: null,
    title: 'x',
    origin: 'Montevideo',
    destination: 'Rocha',
    trip_date: '2026-11-01',
    distance_km: 200,
    starting_charge_percentage: 100,
    ending_charge_percentage: 30,
    average_speed_kmh: 90,
    rating: null,
    notes: null,
    model: 'E2',
    is_public: true,
    hidden: false,
    verified: false,
    created_at: '2026-11-01T00:00:00Z',
    charging_stops: [],
    ...over,
  }
}

function cand(id: string, alongKm: number, over: Partial<StopCandidate> = {}): StopCandidate {
  return {
    id,
    name: id,
    network: 'ute',
    lat: 0,
    lng: 0,
    alongKm,
    offKm: 0,
    dc: true,
    maxPowerKw: 60,
    flaky: false,
    failing: false,
    ...over,
  }
}

// 100 -> 15 % of 50 kWh at 15 kWh/100 km = 283 km of reach.
const base = { batteryKwh: 50, kwhPer100: 15, startSoc: 100, minArrivalSoc: 15 }

describe('consumption', () => {
  it('computes kWh/100 km from the SOC drop plus billed stop energy', () => {
    // 70% of 44.94 kWh = 31.46 kWh over 200 km
    expect(tripConsumption(trip({}), BATTERY_KWH.E2)).toBeCloseTo(15.73, 1)
    const withStop = trip({ distance_km: 300, charging_stops: [{ name: 's', energy_kwh: 15 }] })
    expect(tripConsumption(withStop, BATTERY_KWH.E2)).toBeCloseTo(15.49, 1)
  })

  it('ignores short trips, missing SOC and stops without energy', () => {
    expect(tripConsumption(trip({ distance_km: 20 }), 45)).toBeNull()
    expect(tripConsumption(trip({ ending_charge_percentage: null }), 45)).toBeNull()
    expect(tripConsumption(trip({ charging_stops: [{ name: 's' }] }), 45)).toBeNull()
  })

  it('uses the community median from 3 samples, else the curated fallback', () => {
    expect(communityConsumption([trip({})], 'E2')).toMatchObject({
      source: 'manual',
      kwhPer100: FALLBACK_CONSUMPTION,
    })
    const trips = [trip({}), trip({ ending_charge_percentage: 40 }), trip({ ending_charge_percentage: 20 })]
    const est = communityConsumption(trips, 'E2')
    expect(est.source).toBe('comunidad')
    expect(est.samples).toBe(3)
    expect(est.kwhPer100).toBeCloseTo(15.7, 1)
    // The other model's trips are not used.
    const plus = trips.map((t) => ({ ...t, model: 'E2+' as const }))
    expect(communityConsumption(plus, 'E2').source).toBe('manual')
  })

  it('range from SOC', () => {
    expect(rangeKm(100, 15, 50, 15)).toBeCloseTo(283.3, 1)
    expect(rangeKm(10, 15, 50, 15)).toBe(0)
  })
})

describe('route geometry', () => {
  it('measures the route and snaps a point to it', () => {
    const g = buildRouteGeometry([
      [-34.9, -56.2],
      [-34.9, -55.2],
      [-34.9, -54.2],
    ])
    expect(totalKm(g)).toBeGreaterThan(180)
    const p = projectOntoRoute(g, -34.95, -55.2)
    expect(p.alongKm).toBeCloseTo(g.cumKm[1], 5)
    expect(p.offKm).toBeGreaterThan(5)
    expect(p.offKm).toBeLessThan(6)
  })
})

describe('planCharging', () => {
  it('needs no stop when the range covers the trip', () => {
    const plan = planCharging([cand('a', 100)], { ...base, totalKm: 200 })
    expect(plan.feasible).toBe(true)
    expect(plan.stops).toHaveLength(0)
    expect(plan.arrivalSoc).toBeCloseTo(40, 0)
  })

  it('stops at the furthest reachable station, charging to 80%', () => {
    const plan = planCharging([cand('a', 100), cand('b', 250), cand('c', 300)], { ...base, totalKm: 450 })
    expect(plan.feasible).toBe(true)
    expect(plan.stops.map((s) => s.candidate.id)).toEqual(['b'])
    expect(plan.stops[0].arrivalSoc).toBeCloseTo(25, 0)
    expect(plan.stops[0].departureSoc).toBe(80)
    expect(plan.arrivalSoc).toBeCloseTo(20, 0)
  })

  it('prefers a DC, non-flaky station near the end of the reach', () => {
    const plan = planCharging(
      [cand('dc', 230), cand('ac', 270, { dc: false }), cand('flaky', 280, { flaky: true })],
      { ...base, totalKm: 450 }
    )
    expect(plan.stops[0].candidate.id).toBe('dc')
  })

  it('never suggests a station with a recent failure and reports it', () => {
    const plan = planCharging([cand('a', 150), cand('down', 260, { failing: true })], { ...base, totalKm: 400 })
    expect(plan.stops.map((s) => s.candidate.id)).toEqual(['a'])
    expect(plan.skippedFailing.map((s) => s.id)).toEqual(['down'])
  })

  it('counts the detour and skips stations too far off the road', () => {
    const plan = planCharging([cand('far', 250, { offKm: 25 })], { ...base, totalKm: 450 })
    expect(plan.feasible).toBe(false)
    expect(plan.stops).toHaveLength(0)
    const detour = planCharging([cand('near', 250, { offKm: 5 })], { ...base, totalKm: 450 })
    expect(detour.stops[0].arrivalSoc).toBeCloseTo(23.5, 0)
  })

  it('chains several stops on a long trip', () => {
    const stations = [100, 200, 300, 400, 500, 600].map((km) => cand(`s${km}`, km))
    const plan = planCharging(stations, { ...base, totalKm: 700 })
    expect(plan.feasible).toBe(true)
    expect(plan.stops.length).toBeGreaterThanOrEqual(2)
    for (const s of plan.stops) expect(s.arrivalSoc).toBeGreaterThanOrEqual(15)
  })
})

describe('share link', () => {
  it('round-trips the inputs', () => {
    const q = {
      origin: 'Montevideo',
      destination: 'Punta del Este',
      model: 'E2+' as const,
      startSoc: 90,
      minArrivalSoc: 20,
      kwhPer100: 14.5,
    }
    expect(parsePlanQuery(planQueryToSearch(q), 'E2')).toEqual(q)
  })

  it('clamps bad values and requires both places', () => {
    expect(parsePlanQuery('o=Montevideo', 'E2')).toBeNull()
    expect(parsePlanQuery('o=A&d=B&m=X&soc=500&min=-3&c=99', 'E2')).toEqual({
      origin: 'A',
      destination: 'B',
      model: 'E2',
      startSoc: 100,
      minArrivalSoc: 0,
      kwhPer100: undefined,
    })
  })
})
