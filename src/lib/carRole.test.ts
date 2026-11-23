import { describe, expect, it, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]): unknown => rpc(...a) as unknown } }))

import { canControl, fetchMyCarRole, isCarRole, setMemberCarRole } from './carRole'

describe('carRole', () => {
  beforeEach(() => rpc.mockReset())

  it('recognises the three roles only', () => {
    expect(isCarRole('owner')).toBe(true)
    expect(isCarRole('control')).toBe(true)
    expect(isCarRole('view')).toBe(true)
    expect(isCarRole('admin')).toBe(false)
    expect(isCarRole(null)).toBe(false)
  })

  it("only view blocks control; unknown keeps today's behaviour", () => {
    expect(canControl('view')).toBe(false)
    expect(canControl('control')).toBe(true)
    expect(canControl('owner')).toBe(true)
    expect(canControl(null)).toBe(true)
  })

  it('fetchMyCarRole returns null when the function is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } })
    expect(await fetchMyCarRole()).toBeNull()
  })

  it('fetchMyCarRole returns the role', async () => {
    rpc.mockResolvedValue({ data: 'view', error: null })
    expect(await fetchMyCarRole()).toBe('view')
    expect(rpc).toHaveBeenCalledWith('my_car_role')
  })

  it('setMemberCarRole passes the creator-only error through', async () => {
    rpc.mockResolvedValue({
      error: { message: 'Solo quien creó el vehículo puede cambiar los permisos.', code: 'P0001' },
    })
    const r = await setMemberCarRole('u1', 'control')
    expect(rpc).toHaveBeenCalledWith('set_vehicle_member_role', { p_user: 'u1', p_role: 'control' })
    expect(r.error).toBe('Solo quien creó el vehículo puede cambiar los permisos.')
  })
})
