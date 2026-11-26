// specs/car-updates.md "Pedir beta": my_car_beta parsing, card mode, RPC calls and the pre-migration fallbacks.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]): unknown => rpc(...a) as unknown } }))

import {
  betaCardMode,
  decideBetaRequest,
  fetchBetaRequests,
  fetchCarBeta,
  leaveCarBeta,
  parseCarBeta,
  requestCarBeta,
} from './carBeta'

const AT = '2026-11-25T12:00:00Z'

describe('parseCarBeta', () => {
  it('allowed:false passes through; garbage is null', () => {
    expect(parseCarBeta({ allowed: false })).toEqual({ allowed: false })
    expect(parseCarBeta(null)).toBeNull()
    expect(parseCarBeta([])).toBeNull()
    expect(parseCarBeta({ allowed: 'yes' })).toBeNull()
    expect(parseCarBeta({ allowed: true })).toBeNull()
  })

  it('reads beta and the latest request; drops an unknown status', () => {
    expect(parseCarBeta({ allowed: true, beta: false, request: null })).toEqual({
      allowed: true,
      beta: false,
      request: null,
    })
    expect(
      parseCarBeta({
        allowed: true,
        beta: false,
        request: { status: 'pending', created_at: AT, decided_at: null },
      })
    ).toEqual({ allowed: true, beta: false, request: { status: 'pending', createdAt: AT, decidedAt: null } })
    expect(
      parseCarBeta({
        allowed: true,
        beta: true,
        request: { status: 'approved', created_at: AT, decided_at: AT },
      })
    ).toEqual({ allowed: true, beta: true, request: { status: 'approved', createdAt: AT, decidedAt: AT } })
    expect(
      parseCarBeta({ allowed: true, beta: false, request: { status: 'weird', created_at: AT } })
    ).toEqual({
      allowed: true,
      beta: false,
      request: null,
    })
  })
})

describe('betaCardMode', () => {
  const req = (status: 'pending' | 'approved' | 'rejected') => ({ status, createdAt: AT, decidedAt: null })
  it('beta wins over any request', () => {
    expect(betaCardMode({ beta: true, request: req('pending') })).toBe('beta')
  })
  it('pending, rejected, or the plain offer (no request, or approved and left later)', () => {
    expect(betaCardMode({ beta: false, request: req('pending') })).toBe('pending')
    expect(betaCardMode({ beta: false, request: req('rejected') })).toBe('rejected')
    expect(betaCardMode({ beta: false, request: null })).toBe('none')
    expect(betaCardMode({ beta: false, request: req('approved') })).toBe('none')
  })
})

describe('RPCs', () => {
  beforeEach(() => rpc.mockReset())

  it('fetchCarBeta: null on error (before 0084) or a throw', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'missing', code: 'PGRST202' } })
    expect(await fetchCarBeta()).toBeNull()
    rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchCarBeta()).toBeNull()
    rpc.mockResolvedValueOnce({ data: { allowed: true, beta: true, request: null }, error: null })
    expect(await fetchCarBeta()).toEqual({ allowed: true, beta: true, request: null })
    expect(rpc).toHaveBeenLastCalledWith('my_car_beta')
  })

  it('request / leave call their functions and pass server messages through', async () => {
    rpc.mockResolvedValueOnce({ data: 'pending', error: null })
    expect(await requestCarBeta()).toBeNull()
    expect(rpc).toHaveBeenLastCalledWith('request_car_beta')
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Ya pediste varias veces hoy. Probá de nuevo mañana.', code: 'P0001' },
    })
    expect(await requestCarBeta()).toBe('Ya pediste varias veces hoy. Probá de nuevo mañana.')
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await leaveCarBeta()).toBeNull()
    expect(rpc).toHaveBeenLastCalledWith('leave_car_beta')
  })

  it('admin list: empty and no error before 0084; decide passes approve/reject', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Could not find the function', code: 'PGRST202' },
    })
    expect(await fetchBetaRequests()).toEqual({ rows: [], error: null })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not a moderator', code: 'P0001' } })
    expect((await fetchBetaRequests()).error).toBe('not a moderator')
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await decideBetaRequest('r1', true)).toBeNull()
    expect(rpc).toHaveBeenLastCalledWith('admin_decide_car_beta_request', {
      p_request: 'r1',
      p_approve: true,
    })
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await decideBetaRequest('r2', false)
    expect(rpc).toHaveBeenLastCalledWith('admin_decide_car_beta_request', {
      p_request: 'r2',
      p_approve: false,
    })
  })
})
