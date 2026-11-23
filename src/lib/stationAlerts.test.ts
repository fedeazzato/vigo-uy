// specs/station-alerts.md test plan.
import { describe, expect, it } from 'vitest'
import { recentFailures } from './stationAlerts'

const now = new Date('2026-11-22T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString()

describe('recentFailures', () => {
  it('flags a station whose latest relevant report is a failure', () => {
    const alerts = recentFailures(
      [
        { station_id: 'a', status: 'fallo', created_at: hoursAgo(2) },
        { station_id: 'a', status: 'fallo', created_at: hoursAgo(5) },
        { station_id: 'a', status: 'ocupado', created_at: hoursAgo(1) },
      ],
      now
    )
    expect(alerts.get('a')).toEqual({ failures: 2, lastFailureAt: hoursAgo(2) })
  })

  it('a newer "funcionó" clears it', () => {
    const alerts = recentFailures(
      [
        { station_id: 'a', status: 'fallo', created_at: hoursAgo(5) },
        { station_id: 'a', status: 'funciono', created_at: hoursAgo(1) },
      ],
      now
    )
    expect(alerts.has('a')).toBe(false)
  })

  it('ignores failures older than 48 h and stations without failures', () => {
    const alerts = recentFailures(
      [
        { station_id: 'old', status: 'fallo', created_at: hoursAgo(49) },
        { station_id: 'ok', status: 'funciono', created_at: hoursAgo(1) },
      ],
      now
    )
    expect(alerts.size).toBe(0)
  })
})
