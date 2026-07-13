import { describe, it, expect, vi, afterEach } from 'vitest'
import { toFriendlyError } from './errors'

describe('toFriendlyError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes our own P0001 (raise exception) messages through untouched', () => {
    expect(toFriendlyError({ code: 'P0001', message: 'Límite diario alcanzado.' })).toBe(
      'Límite diario alcanzado.'
    )
  })

  it('passes known Spanish trigger messages through even without a code', () => {
    expect(toFriendlyError({ message: 'Tu cuenta está suspendida.' })).toBe(
      'Tu cuenta está suspendida.'
    )
    expect(toFriendlyError({ message: 'Código no válido.' })).toBe('Código no válido.')
  })

  it('maps network failures to the Spanish offline message', () => {
    expect(toFriendlyError(new TypeError('Failed to fetch'))).toBe(
      'Sin conexión. Revisá tu internet e intentá de nuevo.'
    )
    expect(toFriendlyError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(
      'Sin conexión. Revisá tu internet e intentá de nuevo.'
    )
    expect(toFriendlyError({ message: 'Load failed' })).toBe(
      'Sin conexión. Revisá tu internet e intentá de nuevo.'
    )
  })

  it('maps rate limiting by code, status and message', () => {
    const expected = 'Demasiados intentos. Esperá un momento e intentá de nuevo.'
    expect(toFriendlyError({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(expected)
    expect(toFriendlyError({ status: 429, message: 'Too Many Requests' })).toBe(expected)
    expect(toFriendlyError({ message: 'email rate limit exceeded' })).toBe(expected)
  })

  it('maps expired/invalid OTP codes', () => {
    const expected = 'El código no es válido o venció. Pedí uno nuevo.'
    expect(toFriendlyError({ code: 'otp_expired', message: 'x' })).toBe(expected)
    expect(toFriendlyError({ message: 'Token has expired or is invalid' })).toBe(expected)
  })

  it('maps CAPTCHA failures', () => {
    expect(toFriendlyError({ message: 'captcha verification process failed' })).toBe(
      'Falló la verificación de seguridad. Recargá la página e intentá de nuevo.'
    )
  })

  it('maps RLS violations', () => {
    const expected = 'No tenés permiso para hacer eso.'
    expect(toFriendlyError({ code: '42501', message: 'x' })).toBe(expected)
    expect(
      toFriendlyError({ message: 'new row violates row-level security policy for table "trip_logs"' })
    ).toBe(expected)
  })

  it('maps CHECK violations', () => {
    expect(toFriendlyError({ code: '23514', message: 'x' })).toBe(
      'Alguno de los datos ingresados no es válido.'
    )
  })

  it('falls back to a generic Spanish message and logs the original', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(toFriendlyError({ message: 'some unmapped backend detail' })).toBe(
      'Ocurrió un error inesperado. Intentá de nuevo.'
    )
    expect(spy).toHaveBeenCalled()
  })

  it('tolerates non-object inputs', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(toFriendlyError(null)).toBe('Ocurrió un error inesperado. Intentá de nuevo.')
    expect(toFriendlyError(undefined)).toBe('Ocurrió un error inesperado. Intentá de nuevo.')
    expect(toFriendlyError('Failed to fetch')).toBe(
      'Sin conexión. Revisá tu internet e intentá de nuevo.'
    )
  })
})
