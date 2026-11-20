import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeAuthenticator, uninstallFakeAuthenticator } from '../../test/fakeAuthenticator'
import type { VaultItemRow, VaultKeyRow } from '../../types'

// In-memory stand-in for Supabase: records every payload the flows send.
const db = vi.hoisted(() => ({
  keys: [] as VaultKeyRow[],
  items: [] as VaultItemRow[],
  sent: [] as unknown[],
  failInsert: null as string | null,
}))

vi.mock('./vaultApi', () => ({
  insertVaultKey: vi.fn((row: Omit<VaultKeyRow, 'created_at'>) => {
    db.sent.push(row)
    if (db.failInsert) return Promise.resolve({ error: db.failInsert })
    db.keys.push({ ...row, created_at: '2026-11-20T15:00:00Z' })
    return Promise.resolve({ error: null })
  }),
  deleteVaultKey: vi.fn((id: string) => {
    db.sent.push({ delete: id })
    db.keys = db.keys.filter((k) => k.credential_id !== id)
    return Promise.resolve({ error: null })
  }),
  saveVaultItem: vi.fn((item: Omit<VaultItemRow, 'updated_at'>) => {
    db.sent.push(item)
    db.items = [
      ...db.items.filter((i) => i.kind !== item.kind),
      { ...item, updated_at: '2026-11-20T15:00:00Z' },
    ]
    return Promise.resolve({ error: null })
  }),
  deleteVaultItem: vi.fn((kind: string) => {
    db.sent.push({ delete: kind })
    db.items = db.items.filter((i) => i.kind !== kind)
    return Promise.resolve({ error: null })
  }),
}))

import {
  cleanLabel,
  enrolPasskey,
  guessDeviceLabel,
  removePasskey,
  revealSecret,
  saveSecret,
  type VaultUser,
} from './vault'
import { PRF_UNSUPPORTED_MESSAGE } from './webauthn'
import { base64ToBytes } from './encoding'
import { RECOVERY_VECTORS } from './testVectors'

const ana: VaultUser = { id: '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f', name: 'ana@x.uy' }
const WORDS = RECOVERY_VECTORS[3].words
const PASSPHRASE = 'rivup-tebap-zidob-batug-lemuk-nomiz-bukeg-kutas-genek-sadif'
let fake: FakeAuthenticator

beforeEach(() => {
  db.keys = []
  db.items = []
  db.sent = []
  db.failInsert = null
  fake = new FakeAuthenticator('on-get').install()
})

afterEach(() => {
  uninstallFakeAuthenticator()
  vi.restoreAllMocks()
})

function sentText(): string {
  return JSON.stringify(db.sent)
}

describe('vault flows end to end (fake authenticator, real WebCrypto)', () => {
  it('enrol, save, reveal; nothing but ciphertext is ever sent', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'info'),
    ]
    expect(await enrolPasskey(ana, '  Pixel\u0007 de Ana ', [])).toEqual({ error: null })
    expect(db.keys).toHaveLength(1)
    const key = db.keys[0]
    expect(key.label).toBe('Pixel de Ana')
    expect(base64ToBytes(key.prf_salt)).toHaveLength(32)
    expect(base64ToBytes(key.wrapped_dk)).toHaveLength(60)

    expect(await saveSecret(ana, db.keys, 'dashcam_recovery', WORDS, 'qr')).toEqual({ error: null })
    expect(await saveSecret(ana, db.keys, 'settings_backup_passphrase', PASSPHRASE, 'generated')).toEqual({
      error: null,
    })
    expect(db.items).toHaveLength(2)

    const words = await revealSecret(
      ana,
      db.keys,
      db.items.find((i) => i.kind === 'dashcam_recovery')!
    )
    expect(words.error).toBeNull()
    expect(words.plaintext).toMatchObject({ value: WORDS, source: 'qr' })
    const pass = await revealSecret(
      ana,
      db.keys,
      db.items.find((i) => i.kind === 'settings_backup_passphrase')!
    )
    expect(pass.plaintext?.value).toBe(PASSPHRASE)

    for (const w of WORDS.split(' ')) expect(sentText()).not.toContain(w)
    expect(sentText()).not.toContain('rivup')
    for (const spy of logs) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/rivup|tebap|nomiz/)
    }
    // every operation that needed the data key ran its own UV assertion
    expect(fake.getCalls.length).toBe(1 /* enrol PRF */ + 2 /* saves */ + 2 /* reveals */)
    expect(fake.getCalls.every((c) => c.publicKey!.userVerification === 'required')).toBe(true)
  })

  it('a second passkey opens the same vault, and keeps working after the first is removed', async () => {
    await enrolPasskey(ana, 'Teléfono', [])
    await saveSecret(ana, db.keys, 'dashcam_recovery', WORDS, 'paste')
    const first = db.keys[0]
    fake.getCalls.length = 0
    // Same device again: the exclude list refuses a second vault passkey.
    expect((await enrolPasskey(ana, 'Tablet', [...db.keys])).error).toMatch(/ya tiene una llave/)
    expect(db.keys).toHaveLength(1)
    // On another device (the tablet), unlocking with the phone's passkey works.
    fake.excludeChecks = false
    fake.getCalls.length = 0
    expect(await enrolPasskey(ana, 'Tablet', [...db.keys])).toEqual({ error: null })
    // unlock with the existing passkey happened before the new one was created
    expect(fake.getCalls[0].publicKey!.allowCredentials!.length).toBe(1)
    expect(db.keys).toHaveLength(2)
    const second = db.keys[1]
    expect(fake.createCalls[fake.createCalls.length - 1].publicKey!.excludeCredentials).toHaveLength(1)

    fake.choose = () => second.credential_id
    expect((await revealSecret(ana, db.keys, db.items[0])).plaintext?.value).toBe(WORDS)

    expect(await removePasskey(first, [...db.keys], [...db.items])).toEqual({ error: null })
    expect(db.keys.map((k) => k.credential_id)).toEqual([second.credential_id])
    expect(db.items).toHaveLength(1) // not the last key: items stay
    expect(fake.signalled).toContain(first.credential_id)
    expect((await revealSecret(ana, db.keys, db.items[0])).plaintext?.value).toBe(WORDS)
  })

  it('removing the last passkey deletes the items too', async () => {
    await enrolPasskey(ana, 'Teléfono', [])
    await saveSecret(ana, db.keys, 'dashcam_recovery', WORDS, 'qr')
    expect(await removePasskey(db.keys[0], [...db.keys], [...db.items])).toEqual({ error: null })
    expect(db.keys).toHaveLength(0)
    expect(db.items).toHaveLength(0)
  })

  it('a cancelled unlock creates no passkey', async () => {
    await enrolPasskey(ana, 'Teléfono', [])
    const creates = fake.createCalls.length
    fake.nextError = 'NotAllowedError'
    const result = await enrolPasskey(ana, 'Tablet', [...db.keys])
    expect(result.error).toMatch(/Se canceló/)
    expect(fake.createCalls.length).toBe(creates)
    expect(db.keys).toHaveLength(1)
  })

  it('an authenticator without PRF is refused and nothing is stored', async () => {
    fake.prf = 'none'
    const result = await enrolPasskey(ana, 'Teléfono', [])
    expect(result.error).toBe(PRF_UNSUPPORTED_MESSAGE)
    expect(db.keys).toHaveLength(0)
    expect(fake.signalled).toHaveLength(1)
  })

  it('a refused insert (e.g. the daily limit) signals the new passkey as unknown', async () => {
    db.failInsert = 'Límite diario de 20 cambios en la bóveda alcanzado. Probá de nuevo mañana.'
    const result = await enrolPasskey(ana, 'Teléfono', [])
    expect(result.error).toBe(db.failInsert)
    expect(fake.signalled).toHaveLength(1)
  })

  it('a swapped or damaged row does not open', async () => {
    await enrolPasskey(ana, 'Teléfono', [])
    await saveSecret(ana, db.keys, 'dashcam_recovery', WORDS, 'qr')
    const otherUser: VaultUser = { id: '11111111-2222-4333-8444-555555555555', name: 'eve@x.uy' }
    expect((await revealSecret(otherUser, db.keys, db.items[0])).error).toMatch(/no pudo abrir/)
    const item = db.items[0]
    const swapped = { ...item, kind: 'settings_backup_passphrase' as const }
    expect((await revealSecret(ana, db.keys, swapped)).error).toMatch(/no se pudo descifrar/)
  })

  it('saving or revealing without a passkey is refused up front', async () => {
    expect((await saveSecret(ana, [], 'dashcam_recovery', WORDS, 'qr')).error).toMatch(/Primero activá/)
    expect(fake.getCalls).toHaveLength(0)
  })
})

describe('labels', () => {
  it('guesses a platform label', () => {
    expect(guessDeviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Teléfono Android')
    expect(guessDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)')).toBe('iPhone')
    expect(guessDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows')
    expect(guessDeviceLabel('')).toBe('Este dispositivo')
  })

  it('cleans labels and falls back to the guess', () => {
    expect(cleanLabel('  a\u0000b  ')).toBe('ab')
    expect(cleanLabel('x'.repeat(60))).toHaveLength(40)
    expect(cleanLabel('   ')).toBe(guessDeviceLabel())
  })
})
