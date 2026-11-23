import { describe, it, expect } from 'vitest'
import {
  atlasRows,
  capacityEstimate,
  capacityPoints,
  faultLabel,
  monthlyDrives,
  verifiedSummary,
  type AtlasRow,
  type BatterySample,
  type DriveSample,
  type OdometerDay,
} from './carData'

const bat = (ended: string, cap: number | null, temp: number | null = 20): BatterySample => ({
  id: ended,
  vehicle_id: 'v',
  device_id: null,
  client_id: ended,
  started_at: ended,
  ended_at: ended,
  energy_kwh: 20,
  start_soc: 20,
  end_soc: 80,
  temp_c: temp,
  odometer_km: null,
  capacity_kwh: cap,
  received_at: ended,
})

const drive = (start: string, km: number, kwh: number | null, regen: number | null): DriveSample => ({
  id: start,
  vehicle_id: 'v',
  device_id: null,
  client_id: start,
  started_at: start,
  ended_at: start,
  distance_km: km,
  energy_kwh: kwh,
  avg_speed_kmh: null,
  temp_c: null,
  regen_kwh: regen == null ? null : 0.5,
  brake_events: null,
  regen_pct: regen,
  received_at: start,
})

describe('verifiedSummary (A3)', () => {
  it('summarises the odometer log and flags anomalies', () => {
    const log: OdometerDay[] = [
      { vehicle_id: 'v', day: '2026-11-01', odometer_km: 10000, anomaly: false },
      { vehicle_id: 'v', day: '2026-11-20', odometer_km: 10850, anomaly: false },
    ]
    expect(verifiedSummary(log)).toEqual({
      odometer: 10850,
      since: '2026-11-01',
      kmVerified: 850,
      anomaly: false,
    })
    expect(verifiedSummary([...log, { ...log[0], day: '2026-11-21', anomaly: true }])?.anomaly).toBe(true)
    expect(verifiedSummary([])).toBeNull()
  })
})

describe('battery capacity (A5)', () => {
  it('keeps only estimated charges, sorted, and marks cold ones', () => {
    const p = capacityPoints([
      bat('2026-11-03T10:00:00Z', 31.2, 5),
      bat('2026-11-01T10:00:00Z', 31.8),
      bat('2026-11-02', null),
    ])
    expect(p.map((x) => x.kwh)).toEqual([31.8, 31.2])
    expect(p[1].cold).toBe(true)
  })
  it('uses the median of warm charges when there are enough', () => {
    const p = capacityPoints([
      bat('2026-11-01', 31.0),
      bat('2026-11-02', 31.4),
      bat('2026-11-03', 31.2),
      bat('2026-11-04', 28.0, 2),
    ])
    expect(capacityEstimate(p)).toBe(31.2)
    expect(capacityEstimate([])).toBeNull()
  })
})

describe('monthlyDrives (A6/A7)', () => {
  it('weights consumption and regen by distance, newest month first', () => {
    const m = monthlyDrives([
      drive('2026-10-05T10:00:00Z', 100, 14, 50),
      drive('2026-11-01T10:00:00Z', 30, 6, 60),
      drive('2026-11-02T10:00:00Z', 10, null, 40),
    ])
    expect(m[0]).toMatchObject({
      month: '2026-11',
      trips: 2,
      km: 40,
      kwhPer100: 20,
      regenPct: 55,
      regenKwh: 1,
    })
    expect(m[1]).toMatchObject({ month: '2026-10', kwhPer100: 14, regenPct: 50 })
  })
})

describe('labels', () => {
  it('names known warning codes and keeps unknown ones readable', () => {
    expect(faultLabel('tire_pressure_alarm')).toBe('Presión de neumáticos')
    expect(faultLabel('new_code')).toBe('new code')
  })
  it('orders atlas buckets for display', () => {
    const r = (bucket: string): AtlasRow => ({
      dimension: 'temp',
      bucket,
      vehicles: 5,
      trips: 9,
      km: 100,
      kwh_per_100km: 15,
    })
    expect(atlasRows([r('ge25'), r('lt5'), r('15_25')], 'temp').map((x) => x.bucket)).toEqual([
      'lt5',
      '15_25',
      'ge25',
    ])
  })
})
