import { describe, it, expect } from 'vitest'
import { describeChargeDraft, type CarChargeDraftRow } from './carChargeDrafts'

const BASE: CarChargeDraftRow = {
  id: 'd1',
  vehicle_id: 'v',
  device_id: null,
  client_id: 'c',
  station_id: 's',
  distance_m: 30,
  result: 'funciono',
  started_at: '2026-11-20T15:00:00Z',
  ended_at: '2026-11-20T15:47:00Z',
  energy_kwh: 28.4,
  max_kw: 42.5,
  avg_kw: 36.1,
  charging_min: 47,
  start_soc: 22,
  end_soc: 80,
  end_reason: 'limite',
  status: 'pending',
  report_id: null,
  received_at: '2026-11-20T16:00:00Z',
  charging_stations: { name: 'UTE Florida' },
}

describe('describeChargeDraft', () => {
  it('a real charge reads like the plan: station and achieved kW', () => {
    const d = describeChargeDraft(BASE)
    expect(d.title).toBe('¿Cargaste en UTE Florida? Funcionó a 42,5 kW')
    expect(d.detail).toContain('28,4 kWh')
    expect(d.detail).toContain('47 min')
    expect(d.detail).toContain('22 → 80 %')
  })

  it('a failed attempt says how long it was plugged without current', () => {
    const d = describeChargeDraft({
      ...BASE,
      result: 'fallo',
      max_kw: null,
      energy_kwh: null,
      started_at: '2026-11-20T15:00:00Z',
      ended_at: '2026-11-20T15:06:00Z',
    })
    expect(d.title).toBe('¿Falló la carga en UTE Florida?')
    expect(d.detail).toContain('enchufado 6 min sin recibir corriente')
  })

  it('without a station name or kW it still reads', () => {
    expect(describeChargeDraft({ ...BASE, max_kw: null, charging_stations: null }).title).toBe(
      '¿Cargaste en una estación?'
    )
  })
})
