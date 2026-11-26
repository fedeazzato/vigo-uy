// specs/guest-mode.md R4: parsing get_car_guest_mode and the card's wording (state, pending request phases, last result).
import { describe, it, expect } from 'vitest'
import { guestView, parseCarGuest, type GuestCar, type GuestRequest } from './carGuest'

const NOW = new Date('2026-11-26T12:00:00Z')
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()
const ONLINE = iso(5_000)
const OFFLINE = iso(2 * 3600_000)

const carOn: GuestCar = { state: 'on', since: iso(2 * 3600_000), reportedAt: iso(10_000) }
const carOff: GuestCar = { state: 'off', since: null, reportedAt: iso(10_000) }
const req = (over: Partial<GuestRequest>): GuestRequest => ({
  id: 'r1',
  want: 'on',
  state: 'pending',
  code: null,
  by: 'Ana',
  createdAt: iso(20_000),
  sentAt: null,
  finishedAt: null,
  expiresAt: iso(-12 * 3600_000),
  ...over,
})

describe('parseCarGuest', () => {
  it('allowed false, and garbage is null', () => {
    expect(parseCarGuest({ allowed: false })).toEqual({ allowed: false })
    expect(parseCarGuest(null)).toBeNull()
    expect(parseCarGuest({ allowed: true })).toBeNull()
    expect(
      parseCarGuest({ allowed: true, linked: true, car: { state: 'maybe', reported_at: 'x' } })
    ).toBeNull()
    expect(
      parseCarGuest({
        allowed: true,
        linked: true,
        car: null,
        request: { id: 'a', want: 'on', state: 'nope', created_at: 'x' },
      })
    ).toBeNull()
  })

  it('maps the full answer', () => {
    expect(
      parseCarGuest({
        allowed: true,
        linked: true,
        last_seen_at: ONLINE,
        car: { state: 'on', since: carOn.since, reported_at: carOn.reportedAt },
        request: {
          id: 'r1',
          want: 'off',
          state: 'done',
          code: 'ok',
          by: 'Fede',
          created_at: iso(60_000),
          sent_at: iso(50_000),
          finished_at: iso(40_000),
          expires_at: null,
        },
      })
    ).toEqual({
      allowed: true,
      linked: true,
      lastSeenAt: ONLINE,
      car: carOn,
      request: {
        id: 'r1',
        want: 'off',
        state: 'done',
        code: 'ok',
        by: 'Fede',
        createdAt: iso(60_000),
        sentAt: iso(50_000),
        finishedAt: iso(40_000),
        expiresAt: null,
      },
    })
  })

  it('a car that never reported and no request', () => {
    expect(
      parseCarGuest({ allowed: true, linked: false, last_seen_at: null, car: null, request: null })
    ).toEqual({
      allowed: true,
      linked: false,
      lastSeenAt: null,
      car: null,
      request: null,
    })
  })
})

describe('guestView', () => {
  it('off: offers to activate; on: offers to deactivate, says since when', () => {
    const off = guestView({ lastSeenAt: ONLINE, car: carOff, request: null }, NOW)
    expect(off.title).toBe('Modo invitado desactivado')
    expect(off.action).toEqual({ on: true, label: 'Activar modo invitado' })
    expect(off.note).toBeNull()
    expect(off.pending).toBe(false)

    const on = guestView({ lastSeenAt: ONLINE, car: carOn, request: null }, NOW)
    expect(on.title).toBe('Modo invitado activado')
    expect(on.detail).toContain('Desde hace 2 h')
    expect(on.detail).toContain('Dato del auto de hace un momento')
    expect(on.action).toEqual({ on: false, label: 'Desactivar modo invitado' })
  })

  it('says when the car is offline', () => {
    expect(guestView({ lastSeenAt: OFFLINE, car: carOff, request: null }, NOW).detail).toContain(
      'el auto ahora está sin conexión'
    )
  })

  it('pending, not yet sent: online = sending; offline = applied when it connects (+12 h note for on only)', () => {
    const online = guestView({ lastSeenAt: ONLINE, car: carOff, request: req({}) }, NOW)
    expect(online.pending).toBe(true)
    expect(online.action).toBeNull()
    expect(online.canCancel).toBe(true)
    expect(online.note).toBe('Ana pidió activar el modo invitado hace un momento. Enviando al auto…')

    const offlineOn = guestView({ lastSeenAt: OFFLINE, car: carOff, request: req({}) }, NOW)
    expect(offlineOn.note).toContain('lo aplica cuando se encienda con internet')
    expect(offlineOn.note).toContain('12 horas')

    const offlineOff = guestView(
      { lastSeenAt: OFFLINE, car: carOn, request: req({ want: 'off', expiresAt: null }) },
      NOW
    )
    expect(offlineOff.note).toContain('Ana pidió desactivar el modo invitado')
    expect(offlineOff.note).not.toContain('12 horas')
  })

  it('pending and received: waiting, then "Sin respuesta del auto" after 60 s', () => {
    const fresh = guestView({ lastSeenAt: ONLINE, car: carOff, request: req({ sentAt: iso(10_000) }) }, NOW)
    expect(fresh.note).toContain('El auto lo recibió; esperando que confirme…')
    const late = guestView({ lastSeenAt: ONLINE, car: carOff, request: req({ sentAt: iso(61_000) }) }, NOW)
    expect(late.note).toContain('Sin respuesta del auto')
    expect(late.pending).toBe(true)
  })

  it('who asked: a deleted account and an empty name', () => {
    expect(guestView({ lastSeenAt: ONLINE, car: carOff, request: req({ by: null }) }, NOW).note).toMatch(
      /^Una cuenta borrada pidió/
    )
    expect(guestView({ lastSeenAt: ONLINE, car: carOff, request: req({ by: '' }) }, NOW).note).toMatch(
      /^Un integrante pidió/
    )
  })

  it('last results of the day: done, failed with the reason, expired, cancelled; older ones are not shown', () => {
    const done = req({ state: 'done', code: 'ok', sentAt: iso(15_000), finishedAt: iso(10_000) })
    expect(guestView({ lastSeenAt: ONLINE, car: carOn, request: done }, NOW).note).toBe(
      'Hecho: Ana lo pidió hace un momento.'
    )
    const noPin = req({ want: 'off', state: 'failed', code: 'no_pin', finishedAt: iso(10_000) })
    expect(guestView({ lastSeenAt: ONLINE, car: carOn, request: noPin }, NOW).note).toBe(
      'No se pudo desactivar: en el auto todavía no hay un PIN del dueño.'
    )
    const unknown = req({ state: 'failed', code: 'weird', finishedAt: iso(10_000) })
    expect(guestView({ lastSeenAt: ONLINE, car: carOff, request: unknown }, NOW).note).toBe(
      'No se pudo activar: el auto no pudo cambiarlo.'
    )
    const expired = req({ state: 'expired', finishedAt: iso(10_000) })
    expect(guestView({ lastSeenAt: ONLINE, car: carOff, request: expired }, NOW).note).toContain('12 horas')
    const cancelled = req({ state: 'cancelled', finishedAt: iso(10_000) })
    expect(guestView({ lastSeenAt: ONLINE, car: carOff, request: cancelled }, NOW).note).toBe(
      'Pedido cancelado.'
    )
    const old = req({ state: 'done', code: 'ok', finishedAt: iso(25 * 3600_000) })
    expect(guestView({ lastSeenAt: ONLINE, car: carOn, request: old }, NOW).note).toBeNull()
  })
})
