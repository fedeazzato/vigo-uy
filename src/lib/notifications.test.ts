// specs/community-notifications.md test plan.
import { describe, expect, it } from 'vitest'
import { countUnread, followsToKeys, isFollowing, notificationLink } from './notifications'

describe('notifications helpers', () => {
  it('links each kind to the page where its content lives', () => {
    const n = { part_purchase_id: null, service_entry_id: null }
    expect(notificationLink({ ...n, kind: 'station_failure' })).toBe('/carga')
    expect(notificationLink({ ...n, kind: 'vehicle_trip' })).toBe('/mi-vigo/registros')
    expect(notificationLink({ ...n, kind: 'vehicle_service' })).toBe('/mi-vigo/registros')
    expect(notificationLink({ ...n, kind: 'comment' })).toBe('/comunidad')
    expect(notificationLink({ ...n, kind: 'reaction', part_purchase_id: 'p' })).toBe('/cuidar/repuestos')
    expect(notificationLink({ ...n, kind: 'comment', service_entry_id: 's' })).toBe('/costos')
    expect(notificationLink({ ...n, kind: 'car_beta_request' })).toBe('/moderacion?tab=versiones')
    expect(notificationLink({ ...n, kind: 'car_beta' })).toBe('/mi-vigo')
    expect(notificationLink({ ...n, kind: 'car_guest_mode' })).toBe('/mi-vigo')
  })

  it('counts unread rows', () => {
    expect(countUnread([{ read_at: null }, { read_at: '2026-11-22T00:00:00Z' }, { read_at: null }])).toBe(2)
  })

  it('maps follow rows to keys per kind', () => {
    const keys = followsToKeys([
      { station_id: 's1', trip_log_id: null, service_entry_id: null, part_purchase_id: null },
      { station_id: null, trip_log_id: 't1', service_entry_id: null, part_purchase_id: null },
    ])
    expect(isFollowing(keys, { kind: 'station', id: 's1' })).toBe(true)
    expect(isFollowing(keys, { kind: 'trip_log', id: 't1' })).toBe(true)
    expect(isFollowing(keys, { kind: 'trip_log', id: 's1' })).toBe(false)
  })
})
