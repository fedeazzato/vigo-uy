// specs/car-location.md R5: parsing get_car_location's answer and the card's wording.
import { describe, it, expect } from 'vitest'
import {
  describeCarLocation,
  directionsUrl,
  formatSpotTime,
  parseCarLocation,
  privacyNote,
} from './carLocation'

const NOW = new Date('2026-11-24T15:00:00Z')
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()

describe('parseCarLocation', () => {
  it('allowed:false hides everything', () => {
    expect(parseCarLocation({ allowed: false })).toEqual({ allowed: false })
  })

  it('no row: mode null, no point', () => {
    expect(parseCarLocation({ allowed: true, mode: null, last: null, spots: [] })).toEqual({
      allowed: true,
      mode: null,
      last: null,
      spots: [],
    })
  })

  it('reads the point (numeric columns may come as strings) and the spots in mode spots', () => {
    const r = parseCarLocation({
      allowed: true,
      mode: 'spots',
      last: {
        kind: 'parked',
        lat: '-34.9058',
        lon: -56.1913,
        acc_m: 12,
        observed_at: iso(60_000),
        received_at: iso(0),
      },
      spots: [
        { lat: -34.9, lon: -56.19, acc_m: null, observed_at: iso(3600_000) },
        { lat: 'x', lon: -56.19, observed_at: iso(7200_000) },
      ],
    })
    expect(r).toEqual({
      allowed: true,
      mode: 'spots',
      last: { kind: 'parked', lat: -34.9058, lon: -56.1913, accM: 12, observedAt: iso(60_000) },
      spots: [{ lat: -34.9, lon: -56.19, accM: null, observedAt: iso(3600_000) }],
    })
  })

  it('mode last never shows spots', () => {
    const r = parseCarLocation({
      allowed: true,
      mode: 'last',
      last: null,
      spots: [{ lat: -34.9, lon: -56.19, observed_at: iso(1) }],
    })
    expect(r).toMatchObject({ mode: 'last', spots: [] })
  })

  it('drops a malformed point and refuses a malformed answer', () => {
    expect(
      parseCarLocation({
        allowed: true,
        mode: 'last',
        last: { kind: 'flying', lat: 1, lon: 1, observed_at: iso(0) },
      })
    ).toMatchObject({ last: null })
    expect(
      parseCarLocation({
        allowed: true,
        mode: 'last',
        last: { kind: 'parked', lat: 95, lon: 1, observed_at: iso(0) },
      })
    ).toMatchObject({
      last: null,
    })
    expect(parseCarLocation(null)).toBeNull()
    expect(parseCarLocation({ mode: 'last' })).toBeNull()
    expect(parseCarLocation([])).toBeNull()
  })
})

describe('wording', () => {
  it('parked / driving, relative time and accuracy', () => {
    expect(
      describeCarLocation({ kind: 'parked', lat: 1, lon: 1, accM: 12, observedAt: iso(2 * 3600_000) }, NOW)
    ).toEqual({ state: 'Estacionado', when: 'hace 2 h', accuracy: 'precisión ~12 m' })
    expect(
      describeCarLocation({ kind: 'driving', lat: 1, lon: 1, accM: null, observedAt: iso(4 * 60_000) }, NOW)
    ).toEqual({
      state: 'En viaje',
      when: 'hace 4 min',
      accuracy: null,
    })
  })

  it('spot time in local time', () => {
    const d = new Date(2026, 10, 23, 18, 40) // Monday 23 November 2026, local
    expect(formatSpotTime(d.toISOString())).toBe('lun 23/11 18:40')
  })

  it('directions link and privacy note', () => {
    expect(directionsUrl({ lat: -34.9058, lon: -56.1913 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-34.9058,-56.1913'
    )
    expect(privacyNote('last')).not.toContain('estacionamientos')
    expect(privacyNote('spots')).toContain('estacionamientos de 7 días')
  })
})
