// specs/car-firmware-a8.md R3: parsing and ordering of head-unit versions.
import { describe, it, expect } from 'vitest'
import { compareFirmware, monthLabel, newerThan, parseFirmware, sortFirmware } from './carFirmware'

const NOW_BUILD = 'DFRD_S32O_MPU_V01811_20250814_128G'
const row = (fw_version: string, cars = 1) => ({ fw_version, cars, last_seen_month: '2026-11-01' })

describe('parseFirmware', () => {
  it('reads version and build date of the known name', () => {
    expect(parseFirmware(NOW_BUILD)).toEqual({ version: 1811, buildDate: '2025-08-14' })
  })
  it('unknown shapes give nulls; impossible dates are refused', () => {
    expect(parseFirmware('707')).toEqual({ version: null, buildDate: null })
    expect(parseFirmware('DFRD_S32O_MPU_V01811_20251399_128G').buildDate).toBeNull()
  })
})

describe('compareFirmware / sortFirmware', () => {
  it('newer version first, then newer build date, unparseable last', () => {
    const sorted = sortFirmware([
      row('weird'),
      row(NOW_BUILD),
      row('DFRD_S32O_MPU_V01902_20260301_128G'),
      row('DFRD_S32O_MPU_V01811_20250901_128G'),
    ]).map((r) => r.fw_version)
    expect(sorted).toEqual([
      'DFRD_S32O_MPU_V01902_20260301_128G',
      'DFRD_S32O_MPU_V01811_20250901_128G',
      NOW_BUILD,
      'weird',
    ])
    expect(compareFirmware(NOW_BUILD, NOW_BUILD)).toBe(0)
  })
})

describe('newerThan', () => {
  const rows = [row(NOW_BUILD, 5), row('DFRD_S32O_MPU_V01902_20260301_128G', 2), row('other')]
  it('finds the newest newer version', () => {
    expect(newerThan(NOW_BUILD, rows)?.fw_version).toBe('DFRD_S32O_MPU_V01902_20260301_128G')
  })
  it('null when mine is the newest or not comparable', () => {
    expect(newerThan('DFRD_S32O_MPU_V01902_20260301_128G', rows)).toBeNull()
    expect(newerThan('other', rows)).toBeNull()
  })
})

describe('monthLabel', () => {
  it('Spanish month and year', () => {
    expect(monthLabel('2025-08-01')).toBe('agosto de 2025')
  })
})
