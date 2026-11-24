import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, selectMock, rpcMock, inMock } = vi.hoisted(() => {
  const inMock = vi.fn()
  const selectMock = vi.fn()
  const fromMock = vi.fn<(table?: string) => unknown>(() => ({ select: selectMock }))
  const rpcMock = vi.fn()
  return { fromMock, selectMock, rpcMock, inMock }
})

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}))

import {
  CAR_DEVICE_COLUMNS,
  INVALID_PAIRING_CODE_MESSAGE,
  claimCarPairing,
  fetchCarDevices,
  fetchMyVehicleMemberNames,
  formatTimestampDate,
  hasLookalikeCharacters,
  isValidPairingCode,
  lastSeenLabel,
  normalizePairingCode,
  revokeCarDevice,
  sortCarDevices,
} from './carLink'
import { invalidateCommunityCache } from './communityData'
import type { CarDevice } from '../types'

function device(over: Partial<CarDevice>): CarDevice {
  return {
    id: 'd',
    vehicle_id: 'v',
    name: 'Vigo',
    app_version: null,
    created_by: 'u',
    created_at: '2026-11-01T12:00:00Z',
    last_seen_at: null,
    revoked_at: null,
    revoked_by: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  invalidateCommunityCache()
})

describe('normalizePairingCode', () => {
  it('uppercases and drops spaces and dashes', () => {
    expect(normalizePairingCode('k7q2m9')).toBe('K7Q2M9')
    expect(normalizePairingCode(' K7Q-2M9 ')).toBe('K7Q2M9')
    expect(normalizePairingCode('k7q 2m9')).toBe('K7Q2M9')
  })

  it('extracts the code from the full QR link', () => {
    expect(normalizePairingCode('https://fedeazzato.github.io/vigo-uy/#/mi-vigo/vincular?c=K7Q2M9')).toBe(
      'K7Q2M9'
    )
    expect(normalizePairingCode('#/mi-vigo/vincular?x=1&c=k7q2m9&y=2')).toBe('K7Q2M9')
  })

  it('returns an empty string for nothing', () => {
    expect(normalizePairingCode('')).toBe('')
    expect(normalizePairingCode('?c=')).toBe('')
  })
})

describe('isValidPairingCode / hasLookalikeCharacters', () => {
  it('accepts 6 characters from the alphabet', () => {
    expect(isValidPairingCode('K7Q2M9')).toBe(true)
    expect(isValidPairingCode('ABCDEF')).toBe(true)
  })

  it('rejects wrong lengths and lookalikes', () => {
    expect(isValidPairingCode('K7Q2M')).toBe(false)
    expect(isValidPairingCode('K7Q2M9A')).toBe(false)
    for (const bad of ['K7Q2MI', 'K7Q2ML', 'K7Q2MO', 'K7Q2M0', 'K7Q2M1']) {
      expect(isValidPairingCode(bad), bad).toBe(false)
      expect(hasLookalikeCharacters(bad), bad).toBe(true)
    }
    expect(hasLookalikeCharacters('K7Q2M9')).toBe(false)
  })
})

describe('claimCarPairing', () => {
  it('sends the code and the trimmed name', async () => {
    rpcMock.mockResolvedValue({ data: { device_id: 'dev-1', name: 'Mi Vigo' }, error: null })
    const r = await claimCarPairing('K7Q2M9', '  Mi Vigo  ')
    expect(rpcMock).toHaveBeenCalledWith('claim_car_pairing', { p_code: 'K7Q2M9', p_name: 'Mi Vigo' })
    expect(r).toEqual({ device: { deviceId: 'dev-1', name: 'Mi Vigo' }, error: null })
  })

  it('omits an empty name so the car-provided one is kept', async () => {
    rpcMock.mockResolvedValue({ data: { device_id: 'dev-1', name: 'Vigo' }, error: null })
    await claimCarPairing('K7Q2M9', '   ')
    expect(rpcMock).toHaveBeenCalledWith('claim_car_pairing', { p_code: 'K7Q2M9' })
  })

  it('caps the name at 40 characters', async () => {
    rpcMock.mockResolvedValue({ data: { device_id: 'dev-1', name: 'x' }, error: null })
    await claimCarPairing('K7Q2M9', 'x'.repeat(60))
    expect(rpcMock).toHaveBeenCalledWith('claim_car_pairing', { p_code: 'K7Q2M9', p_name: 'x'.repeat(40) })
  })

  it('maps the null answer (unknown, expired or used code) to the Spanish message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    expect(await claimCarPairing('K7Q2M9', '')).toEqual({ device: null, error: INVALID_PAIRING_CODE_MESSAGE })
  })

  it('passes raised server messages through', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Demasiados intentos. Esperá una hora e intentá de nuevo.' },
    })
    expect((await claimCarPairing('K7Q2M9', '')).error).toBe(
      'Demasiados intentos. Esperá una hora e intentá de nuevo.'
    )
  })
})

describe('fetchCarDevices / revokeCarDevice', () => {
  it('selects explicit columns (never *) and sorts active first', async () => {
    selectMock.mockResolvedValue({
      data: [
        device({ id: 'old-revoked', created_at: '2026-10-01T00:00:00Z', revoked_at: '2026-10-02T00:00:00Z' }),
        device({ id: 'old', created_at: '2026-10-01T00:00:00Z' }),
        device({ id: 'new', created_at: '2026-11-01T00:00:00Z' }),
        device({ id: 'new-revoked', created_at: '2026-11-02T00:00:00Z', revoked_at: '2026-11-03T00:00:00Z' }),
      ],
      error: null,
    })
    const r = await fetchCarDevices()
    expect(fromMock).toHaveBeenCalledWith('car_devices')
    expect(selectMock).toHaveBeenCalledWith(CAR_DEVICE_COLUMNS)
    expect(CAR_DEVICE_COLUMNS).not.toContain('*')
    expect(CAR_DEVICE_COLUMNS).not.toContain('public_key')
    expect(r.devices.map((d) => d.id)).toEqual(['new', 'old', 'new-revoked', 'old-revoked'])
  })

  it('reports a friendly error', async () => {
    selectMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    expect(await fetchCarDevices()).toEqual({
      devices: [],
      error: 'No tenés permiso para hacer eso. Si te parece un error, cerrá sesión y volvé a entrar.',
    })
  })

  it('revokes through the RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    expect(await revokeCarDevice('dev-1')).toEqual({ error: null })
    expect(rpcMock).toHaveBeenCalledWith('revoke_car_device', { p_device_id: 'dev-1' })
  })

  it('sortCarDevices does not mutate its input', () => {
    const list = [device({ id: 'a', revoked_at: 'x' }), device({ id: 'b' })]
    sortCarDevices(list)
    expect(list.map((d) => d.id)).toEqual(['a', 'b'])
  })
})

describe('fetchMyVehicleMemberNames', () => {
  it('resolves names through public_profiles and sorts them', async () => {
    fromMock.mockImplementation((table?: string) =>
      table === 'vehicle_members'
        ? {
            select: () =>
              Promise.resolve({ data: [{ user_id: 'u2' }, { user_id: 'u1' }, { user_id: 'u3' }] }),
          }
        : { select: () => ({ in: inMock }) }
    )
    inMock.mockResolvedValue({
      data: [
        { id: 'u1', display_name: 'Juan' },
        { id: 'u2', display_name: 'Ana' },
      ],
    })
    expect(await fetchMyVehicleMemberNames()).toEqual(['Ana', 'Juan', 'un usuario'])
  })
})

describe('labels', () => {
  const now = new Date('2026-11-20T15:00:00Z')

  it('last seen', () => {
    expect(lastSeenLabel(null, now)).toBe('Todavía no se conectó')
    expect(lastSeenLabel('2026-11-20T14:55:00Z', now)).toBe('Última conexión: hace 5 min')
    expect(lastSeenLabel('2026-11-18T15:00:00Z', now)).toBe('Última conexión: hace 2 días')
  })

  it('timestamp dates use the local calendar day', () => {
    expect(formatTimestampDate('2026-11-13T15:00:00Z', now)).toBe('13 nov')
    expect(formatTimestampDate('2025-11-13T15:00:00Z', now)).toBe('13 nov 2025')
  })
})
