import { describe, it, expect } from 'vitest'
import { haversineKm } from './geo'

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm({ lat: -34.9011, lng: -56.1645 }, { lat: -34.9011, lng: -56.1645 })).toBe(0)
  })

  it('matches the known Montevideo-Punta del Este distance (~130 km)', () => {
    const montevideo = { lat: -34.9011, lng: -56.1645 }
    const puntaDelEste = { lat: -34.9678, lng: -54.9506 }
    const km = haversineKm(montevideo, puntaDelEste)
    expect(km).toBeGreaterThan(105)
    expect(km).toBeLessThan(130)
  })

  it('is symmetric', () => {
    const a = { lat: -32.8, lng: -56.0 }
    const b = { lat: -30.0, lng: -57.6 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6)
  })
})
