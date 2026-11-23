// specs/car-service-reminders-a4.md R2: the importer's schedule from the odometer.
import { describe, it, expect } from 'vitest'
import mantenimiento from '../data/mantenimiento.json'
import {
  EARLY_KM,
  FIRST_SERVICE_KM,
  SERVICE_EVERY_KM,
  draftLink,
  milestoneAfter,
  milestoneLabel,
  nextService,
  reminderText,
} from './serviceReminder'

const NOW = new Date('2026-11-22T12:00:00Z')

describe('schedule constants match the curated maintenance page', () => {
  it('5.000 km first, then every 15.000 km or 1 year', () => {
    expect(mantenimiento.officialNote).toContain('15.000 km o 1 año')
    expect(mantenimiento.officialNote).toContain('5.000 km')
    expect(FIRST_SERVICE_KM).toBe(5000)
    expect(SERVICE_EVERY_KM).toBe(15000)
  })
})

describe('milestoneAfter / milestoneLabel', () => {
  it.each([
    [0, 5000],
    [4999, 5000],
    [5000, 15000],
    [14999, 15000],
    [15000, 30000],
    [44000, 45000],
  ])('%d -> %d', (km, m) => expect(milestoneAfter(km)).toBe(m))

  it('names the services', () => {
    expect(milestoneLabel(5000)).toBe('Primer service (5.000 km)')
    expect(milestoneLabel(15000)).toBe('Service de 15.000 km')
    expect(milestoneLabel(30000)).toBe('Service general de 30.000 km')
    expect(milestoneLabel(60000)).toBe('Service general de 60.000 km')
  })
})

describe('nextService', () => {
  const e = (odometer_km: number, service_date = '2026-06-01') => ({ odometer_km, service_date })

  it('no service yet: the first one', () => {
    expect(nextService(3000, [], NOW)).toMatchObject({ milestoneKm: 5000, kmLeft: 2000, state: 'ok' })
    expect(nextService(4200, [], NOW)).toMatchObject({ state: 'soon' })
    expect(nextService(5300, [], NOW)).toMatchObject({ milestoneKm: 5000, kmLeft: -300, state: 'due' })
  })

  it('a service a little early counts for its milestone', () => {
    expect(nextService(14000, [e(13200)], NOW).milestoneKm).toBe(30000)
    expect(nextService(14000, [e(15000 - EARLY_KM - 1)], NOW).milestoneKm).toBe(15000)
  })

  it('uses the highest recorded odometer', () => {
    expect(nextService(20000, [e(4900), e(15100), e(800)], NOW)).toMatchObject({
      milestoneKm: 30000,
      lastService: { odometer_km: 15100 },
    })
  })

  it('12 months since the last service makes it due', () => {
    const r = nextService(8000, [e(5000, '2025-11-01')], NOW)
    expect(r).toMatchObject({ milestoneKm: 15000, byTime: true, state: 'due' })
    expect(reminderText(r)).toMatch(/12 meses/)
  })

  it('words the distance', () => {
    expect(reminderText(nextService(14180, [e(5000)], NOW))).toBe('Faltan 820 km.')
    expect(reminderText(nextService(15300, [e(5000)], NOW))).toBe('Te pasaste 300 km.')
  })

  it('draft link prefills the form', () => {
    const r = nextService(14180, [e(5000)], NOW)
    expect(draftLink(r, 14180)).toBe('/costos/nuevo?km=14180&tipo=Service+de+15.000+km')
  })
})
