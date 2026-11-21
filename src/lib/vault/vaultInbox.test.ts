// specs/vault-onboarding.md Phase C: enableInbox / importInbox end to end with the fake passkey.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeAuthenticator, uninstallFakeAuthenticator } from '../../test/fakeAuthenticator'
import type { VaultInboxRow, VaultItemRow, VaultKeyRow } from '../../types'

const db = vi.hoisted(() => ({
  keys: [] as VaultKeyRow[],
  items: [] as VaultItemRow[],
  inboxKey: null as { key_id: string; public_key: string } | null,
  inbox: [] as VaultInboxRow[],
  keySeq: 0,
  failSave: null as string | null,
}))

vi.mock('./vaultApi', () => ({
  insertVaultKey: vi.fn((row: Omit<VaultKeyRow, 'created_at'>) => {
    db.keys.push({ ...row, created_at: '2026-11-21T15:00:00Z' })
    return Promise.resolve({ error: null })
  }),
  deleteVaultKey: vi.fn(() => Promise.resolve({ error: null })),
  saveVaultItem: vi.fn((item: Omit<VaultItemRow, 'updated_at'>) => {
    if (db.failSave) return Promise.resolve({ error: db.failSave })
    db.items = [...db.items.filter((i) => i.kind !== item.kind), { ...item, updated_at: '2026-11-21T15:00:00Z' }]
    return Promise.resolve({ error: null })
  }),
  deleteVaultItem: vi.fn(() => Promise.resolve({ error: null })),
  publishInboxKey: vi.fn((publicKey: string) => {
    db.keySeq++
    const keyId = `0b9d6a7e-1c2f-4e3d-8a5b-${String(db.keySeq).padStart(12, '0')}`
    db.inboxKey = { key_id: keyId, public_key: publicKey }
    return Promise.resolve({ keyId, error: null })
  }),
  deleteInboxKey: vi.fn(() => {
    db.inboxKey = null
    return Promise.resolve({ error: null })
  }),
  deleteInboxRow: vi.fn((id: string) => {
    db.inbox = db.inbox.filter((r) => r.id !== id)
    return Promise.resolve({ error: null })
  }),
}))

import { enableInbox, enrolPasskey, importInbox, revealSecret, type VaultUser } from './vault'
import { encryptForInbox } from './inbox'
import { RECOVERY_VECTORS } from './testVectors'

const ana: VaultUser = { id: '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f', name: 'ana@x.uy' }
const WORDS = RECOVERY_VECTORS[3].words


/** What the car does: encrypt to the published key and insert a row. */
async function carSends(words: string): Promise<VaultInboxRow> {
  const key = db.inboxKey
  if (!key) throw new Error('no inbox key')
  const ct = await encryptForInbox(key.public_key, ana.id, 'dashcam_recovery', key.key_id, words)
  const row: VaultInboxRow = { id: `row-${db.inbox.length + 1}`, kind: 'dashcam_recovery', key_id: key.key_id, created_at: '2026-11-21T16:00:00Z', ...ct }
  db.inbox.push(row)
  return row
}

const privateItem = () => db.items.find((i) => i.kind === 'vault_inbox_private_key')

beforeEach(async () => {
  db.keys = []
  db.items = []
  db.inboxKey = null
  db.inbox = []
  db.keySeq = 0
  db.failSave = null
  new FakeAuthenticator('on-get').install()
  expect((await enrolPasskey(ana, 'Pixel', [])).error).toBeNull()
})

afterEach(() => uninstallFakeAuthenticator())

describe('vault inbox', () => {
  it('enable -> the car sends -> import stores the canonical words as a car-sourced item and clears the inbox', async () => {
    expect((await enableInbox(ana, db.keys)).error).toBeNull()
    expect(db.inboxKey?.public_key).toMatch(/^MFkw/)
    const stored = privateItem()
    expect(stored).toBeTruthy()
    // the private key is only stored encrypted
    expect(JSON.stringify(stored)).not.toContain('MIGH')

    const row = await carSends(WORDS)
    expect((await importInbox(ana, db.keys, stored!, row)).error).toBeNull()
    expect(db.inbox).toHaveLength(0)
    const item = db.items.find((i) => i.kind === 'dashcam_recovery')!
    const revealed = await revealSecret(ana, db.keys, item)
    expect(revealed.plaintext?.value).toBe(WORDS)
    expect(revealed.plaintext?.source).toBe('car')
  })

  it('refuses a row encrypted to a rotated key and keeps it', async () => {
    await enableInbox(ana, db.keys)
    const row = await carSends(WORDS)
    await enableInbox(ana, db.keys) // rotation: new key_id
    const result = await importInbox(ana, db.keys, privateItem()!, row)
    expect(result.error).toMatch(/llave anterior/)
    expect(db.inbox).toHaveLength(1)
    expect(db.items.some((i) => i.kind === 'dashcam_recovery')).toBe(false)
  })

  it('refuses words that fail the recovery-code check', async () => {
    await enableInbox(ana, db.keys)
    const row = await carSends('estas no son las palabras')
    const result = await importInbox(ana, db.keys, privateItem()!, row)
    expect(result.error).toBeTruthy()
    expect(db.items.some((i) => i.kind === 'dashcam_recovery')).toBe(false)
  })

  it('withdraws the published key when the private half cannot be saved', async () => {
    db.failSave = 'Límite diario'
    const result = await enableInbox(ana, db.keys)
    expect(result.error).toBe('Límite diario')
    expect(db.inboxKey).toBeNull()
  })

  it('needs a passkey first', async () => {
    expect((await enableInbox(ana, [])).error).toMatch(/Primero activá/)
  })
})
