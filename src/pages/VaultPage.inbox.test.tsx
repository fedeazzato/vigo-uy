// specs/vault-onboarding.md Phase C: the Bóveda inbox card (flag on), and its absence with the flag off.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FakeAuthenticator, uninstallFakeAuthenticator } from '../test/fakeAuthenticator'
import { RECOVERY_VECTORS } from '../lib/vault/testVectors'
import type { VaultInboxRow, VaultItemRow, VaultKeyRow } from '../types'

const WORDS = RECOVERY_VECTORS[3].words
const USER = '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f'

const flag = vi.hoisted(() => ({ on: true }))
vi.mock('../lib/vault/inboxFlag', () => ({
  get VAULT_INBOX_ENABLED() {
    return flag.on
  },
}))

const auth = vi.hoisted(() => ({ current: {} }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))

const db = vi.hoisted(() => ({
  keys: [] as VaultKeyRow[],
  items: [] as VaultItemRow[],
  inboxKey: null as { key_id: string; public_key: string; created_at: string } | null,
  inbox: [] as VaultInboxRow[],
  inboxFetches: 0,
}))
vi.mock('../lib/vault/vaultApi', () => ({
  fetchVault: vi.fn(() => Promise.resolve({ keys: [...db.keys], items: [...db.items], error: null })),
  insertVaultKey: vi.fn((row: Omit<VaultKeyRow, 'created_at'>) => {
    db.keys.push({ ...row, created_at: '2026-11-21T15:00:00Z' })
    return Promise.resolve({ error: null })
  }),
  deleteVaultKey: vi.fn(() => Promise.resolve({ error: null })),
  saveVaultItem: vi.fn((item: Omit<VaultItemRow, 'updated_at'>) => {
    db.items = [...db.items.filter((i) => i.kind !== item.kind), { ...item, updated_at: '2026-11-21T15:00:00Z' }]
    return Promise.resolve({ error: null })
  }),
  deleteVaultItem: vi.fn(() => Promise.resolve({ error: null })),
  fetchInbox: vi.fn(() => {
    db.inboxFetches++
    return Promise.resolve({ key: db.inboxKey, rows: [...db.inbox], error: null })
  }),
  publishInboxKey: vi.fn((publicKey: string) => {
    db.inboxKey = { key_id: '0b9d6a7e-1c2f-4e3d-8a5b-000000000001', public_key: publicKey, created_at: '2026-11-21T15:00:00Z' }
    return Promise.resolve({ keyId: db.inboxKey.key_id, error: null })
  }),
  deleteInboxKey: vi.fn(() => Promise.resolve({ error: null })),
  deleteInboxRow: vi.fn((id: string) => {
    db.inbox = db.inbox.filter((r) => r.id !== id)
    return Promise.resolve({ error: null })
  }),
}))

import VaultPage from './VaultPage'
import { encryptForInbox } from '../lib/vault/inbox'
import { publishInboxKey } from '../lib/vault/vaultApi'

// The site's confirm dialog (lib/confirmDialog) is answered through the window.confirm spy below.
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (m: string) => Promise.resolve(window.confirm(m)) }))

function renderPage() {
  return render(
    <MemoryRouter>
      <VaultPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  flag.on = true
  db.keys = []
  db.items = []
  db.inboxKey = null
  db.inbox = []
  db.inboxFetches = 0
  auth.current = { user: { id: USER, email: 'ana@x.uy' }, status: 'signedIn' }
  new FakeAuthenticator('on-get').install()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  uninstallFakeAuthenticator()
  vi.restoreAllMocks()
})

describe('VaultPage inbox card', () => {
  it('flag off: no card and the inbox tables are never queried', async () => {
    flag.on = false
    renderPage()
    await screen.findByText('Llaves de acceso')
    expect(screen.queryByText('Recibir la frase desde el auto')).toBeNull()
    expect(db.inboxFetches).toBe(0)
  })

  it('enable, the car sends, save: the words land in the vault and the row is gone', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Activar con huella o rostro' }))
    await screen.findByText('¡Listo! La bóveda quedó activada con esta llave.')
    fireEvent.click(await screen.findByRole('button', { name: 'Permitir que el auto envíe la frase' }))
    await screen.findByText(/el auto ya puede enviar la frase/)
    expect(db.items.some((i) => i.kind === 'vault_inbox_private_key')).toBe(true)

    // the car encrypts to the published key
    const key = db.inboxKey!
    const ct = await encryptForInbox(key.public_key, USER, 'dashcam_recovery', key.key_id, WORDS)
    db.inbox = [{ id: 'r1', kind: 'dashcam_recovery', key_id: key.key_id, created_at: '2026-11-21T16:00:00Z', ...ct }]

    // re-open the page: the card lists the sending
    renderPage()
    const saveButtons = await screen.findAllByRole('button', { name: 'Guardar en la bóveda' })
    fireEvent.click(saveButtons[saveButtons.length - 1])
    await waitFor(() => expect(db.items.some((i) => i.kind === 'dashcam_recovery')).toBe(true))
    expect(db.inbox).toHaveLength(0)
  })

  it('a server refusal shows what is wrong and what to do, and keeps the card off', async () => {
    const refused = 'El servidor de WikiVigo rechazó la llave para recibir la frase del auto. (prueba)'
    vi.mocked(publishInboxKey).mockResolvedValueOnce({ keyId: null, error: refused })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Activar con huella o rostro' }))
    await screen.findByText('¡Listo! La bóveda quedó activada con esta llave.')
    fireEvent.click(await screen.findByRole('button', { name: 'Permitir que el auto envíe la frase' }))
    await screen.findByText(refused)
    expect(db.items.some((i) => i.kind === 'vault_inbox_private_key')).toBe(false)
    expect(screen.getByText('Sin activar.')).toBeTruthy()
  })

  it('explains both ways: the car sends it, or the 24 words are typed', async () => {
    renderPage()
    const hint = await screen.findByText(/Todavía no guardaste la frase\./)
    expect(hint.textContent).toContain('Escribir las 24 palabras')
    expect(hint.textContent).toContain('Recibir la frase desde el auto')
    expect(screen.getByText(/«Guardar la clave en mi WikiVigo»/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/escane/i)
  })

  it('a sending can be discarded', async () => {
    db.keys = [{ credential_id: 'a', prf_salt: 's', wrapped_dk: 'w', label: 'Pixel', created_at: '2026-11-20T00:00:00Z' }]
    db.inboxKey = { key_id: '0b9d6a7e-1c2f-4e3d-8a5b-000000000001', public_key: 'k', created_at: '2026-11-20T00:00:00Z' }
    db.inbox = [{ id: 'r1', kind: 'dashcam_recovery', key_id: db.inboxKey.key_id, epk: 'e', iv: 'i', ciphertext: 'c', created_at: '2026-11-21T16:00:00Z' }]
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(db.inbox).toHaveLength(0))
  })
})
