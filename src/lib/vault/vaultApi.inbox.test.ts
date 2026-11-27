// «Permitir que el auto envíe la frase» (owner car session 2026-11-26): the
// server's refusal must not read like a session problem.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = vi.hoisted(() => ({
  deleteError: null as unknown,
  insertResult: { data: null as { key_id: string } | null, error: null as unknown },
  inserted: [] as unknown[],
}))

const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    delete: () => ({ not: () => Promise.resolve({ error: calls.deleteError }) }),
    insert: (row: unknown) => {
      calls.inserted.push(row)
      return { select: () => ({ single: () => Promise.resolve(calls.insertResult) }) }
    },
  }))
)
vi.mock('../supabaseClient', () => ({ supabase: { from: fromMock } }))

import {
  INBOX_KEY_REFUSED_MESSAGE,
  INBOX_NOT_AVAILABLE_MESSAGE,
  inboxKeyErrorMessage,
  publishInboxKey,
} from './vaultApi'

beforeEach(() => {
  calls.deleteError = null
  calls.insertResult = { data: { key_id: 'k1' }, error: null }
  calls.inserted = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('inboxKeyErrorMessage', () => {
  it('42501 (the CHECK calling is_p256_spki before 0086) names the server, not the session', () => {
    const msg = inboxKeyErrorMessage({ code: '42501', message: 'permission denied for function is_p256_spki' })
    expect(msg).toBe(INBOX_KEY_REFUSED_MESSAGE)
    expect(msg).toMatch(/cerrar sesión no lo arregla/)
    expect(msg).toMatch(/escaneá el QR del auto o escribí las 24 palabras/)
    expect(msg).not.toMatch(/No tenés permiso/)
  })

  it('missing inbox tables say the feature is not enabled yet', () => {
    expect(inboxKeyErrorMessage({ code: 'PGRST205', message: 'Could not find the table' })).toBe(INBOX_NOT_AVAILABLE_MESSAGE)
    expect(inboxKeyErrorMessage({ code: '42P01', message: 'relation does not exist' })).toBe(INBOX_NOT_AVAILABLE_MESSAGE)
  })

  it('other errors keep the shared mapping (daily limit passes through)', () => {
    expect(inboxKeyErrorMessage({ code: 'P0001', message: 'Límite diario de 20 cambios en la bóveda alcanzado.' })).toBe(
      'Límite diario de 20 cambios en la bóveda alcanzado.'
    )
    expect(inboxKeyErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/)
  })
})

describe('publishInboxKey', () => {
  it('sends only the public key and returns the new key_id', async () => {
    await expect(publishInboxKey('PUB')).resolves.toEqual({ keyId: 'k1', error: null })
    expect(calls.inserted).toEqual([{ public_key: 'PUB' }])
  })

  it('a refused insert returns the specific message', async () => {
    calls.insertResult = { data: null, error: { code: '42501', message: 'permission denied for function is_p256_spki' } }
    await expect(publishInboxKey('PUB')).resolves.toEqual({ keyId: null, error: INBOX_KEY_REFUSED_MESSAGE })
  })

  it('a refused delete of the old key returns the specific message', async () => {
    calls.deleteError = { code: '42501', message: 'new row violates row-level security policy' }
    await expect(publishInboxKey('PUB')).resolves.toEqual({ keyId: null, error: INBOX_KEY_REFUSED_MESSAGE })
    expect(calls.inserted).toEqual([])
  })
})
