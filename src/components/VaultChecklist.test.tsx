// specs/vault-onboarding.md Phase B: the post-pairing Bóveda checklist.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FakeAuthenticator, uninstallFakeAuthenticator } from '../test/fakeAuthenticator'
import { RECOVERY_VECTORS } from '../lib/vault/testVectors'
import { PRF_UNSUPPORTED_MESSAGE } from '../lib/vault/webauthn'
import type { VaultItemRow, VaultKeyRow } from '../types'

const WORDS = RECOVERY_VECTORS[3].words

const auth = vi.hoisted(() => ({ current: {} }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))

const db = vi.hoisted(() => ({ keys: [] as VaultKeyRow[], items: [] as VaultItemRow[] }))
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
}))

const flag = vi.hoisted(() => ({ on: false }))
vi.mock('../lib/vault/inboxFlag', () => ({
  get VAULT_INBOX_ENABLED() {
    return flag.on
  },
}))

import VaultChecklist from './VaultChecklist'

let fake: FakeAuthenticator

async function typeAndSave(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Escribir las 24 palabras' }))
  fireEvent.change(screen.getByLabelText('Las 24 palabras'), { target: { value: text } })
  await screen.findByText('Las 24 palabras pasan el control.')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar en la bóveda' }))
}

function renderIt() {
  return render(
    <MemoryRouter>
      <VaultChecklist />
    </MemoryRouter>
  )
}

beforeEach(() => {
  flag.on = false
  db.keys = []
  db.items = []
  auth.current = { user: { id: '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f', email: 'ana@x.uy' }, status: 'signedIn' }
  fake = new FakeAuthenticator('on-get').install()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

afterEach(() => {
  uninstallFakeAuthenticator()
  vi.restoreAllMocks()
})

describe('VaultChecklist', () => {
  it('walks the three steps in order with the real state, and finishes', async () => {
    renderIt()
    expect(await screen.findByText('1. Llave de acceso')).toBeTruthy()
    expect(screen.getAllByText('Por hacer')).toHaveLength(3)
    // steps 2 and 3 need the passkey first
    expect(screen.getByRole('button', { name: 'Generar una clave fuerte' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Escribir las 24 palabras' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/Dashcam › Ajustes › Frase de recuperación/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Activar con huella o rostro' }))
    await waitFor(() => expect(db.keys).toHaveLength(1))
    await screen.findByText(/agregá una segunda llave/)

    fireEvent.click(screen.getByRole('button', { name: 'Generar una clave fuerte' }))
    const shown = await screen.findByLabelText('Clave de respaldo generada')
    expect(shown.textContent?.length).toBeGreaterThan(20)
    expect(db.items.map((i) => i.kind)).toEqual(['settings_backup_passphrase'])
    // the stored value is ciphertext, never the shown passphrase
    expect(db.items[0].ciphertext).not.toContain(shown.textContent ?? '')

    // the passphrase is still on screen; the words field appears next to it
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Escribir las 24 palabras' }).hasAttribute('disabled')).toBe(false)
    )
    await typeAndSave(WORDS)
    await screen.findByText(/Todo listo/)
    for (const w of WORDS.split(' ')) expect(JSON.stringify(db.items)).not.toContain(w)
    expect(screen.queryByLabelText('Las 24 palabras')).toBeNull()
    expect(db.items.map((i) => i.kind).sort()).toEqual(['dashcam_recovery', 'settings_backup_passphrase'])
    expect(screen.getAllByText('Listo')).toHaveLength(3)
  })

  it('reflects what the vault already holds', async () => {
    db.keys = [{ credential_id: 'a', prf_salt: 's', wrapped_dk: 'w', label: 'Pixel', created_at: '2026-11-20T00:00:00Z' }]
    db.items = [{ kind: 'settings_backup_passphrase', version: 1, iv: 'i', ciphertext: 'c', updated_at: '2026-11-20T00:00:00Z' }]
    renderIt()
    await screen.findByText('3. Frase de recuperación de la dashcam')
    expect(screen.getAllByText('Listo')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Activar con huella o rostro' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generar una clave fuerte' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Escribir las 24 palabras' }).hasAttribute('disabled')).toBe(false)
  })

  it('every step can be skipped and then points to the Bóveda', async () => {
    renderIt()
    await screen.findByText('1. Llave de acceso')
    fireEvent.click(screen.getAllByRole('button', { name: 'Más tarde' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Más tarde' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Todavía no tengo la Dashcam' }))
    expect(screen.getAllByText('Pendiente: lo encontrás en la Bóveda')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Ir a la Bóveda' }).getAttribute('href')).toBe('/mi-vigo/boveda')
  })

  it('words that fail the check cannot be saved', async () => {
    db.keys = [{ credential_id: 'a', prf_salt: 's', wrapped_dk: 'w', label: 'Pixel', created_at: '2026-11-20T00:00:00Z' }]
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Escribir las 24 palabras' }))
    const list = WORDS.split(' ')
    ;[list[0], list[1]] = [list[1], list[0]]
    fireEvent.change(screen.getByLabelText('Las 24 palabras'), { target: { value: list.join(' ') } })
    await screen.findByText(/no pasan el control/)
    expect(screen.getByRole('button', { name: 'Guardar en la bóveda' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Las 24 palabras')).toBeNull()
    expect(db.items).toHaveLength(0)
  })

  it('offers the car-send way only when the inbox is enabled, and never a QR scan', async () => {
    const view = renderIt()
    await screen.findByText('3. Frase de recuperación de la dashcam')
    expect(screen.queryByText('Que la envíe el auto:')).toBeNull()
    expect(screen.getByText('Escribirla vos:')).toBeTruthy()
    view.unmount()

    flag.on = true
    renderIt()
    const car = await screen.findByText('Que la envíe el auto:')
    expect(car.parentElement?.textContent).toContain('«Permitir que el auto envíe la frase»')
    expect(car.parentElement?.textContent).toContain('«Guardar la clave en mi WikiVigo»')
    expect(document.body.textContent).not.toMatch(/escane|QR/i)
  })

  it('without PRF shows the message and offers no step actions', async () => {
    uninstallFakeAuthenticator()
    fake = new FakeAuthenticator('none')
    fake.capabilities = { 'extension:prf': false }
    fake.install()
    renderIt()
    await screen.findByText(PRF_UNSUPPORTED_MESSAGE)
    expect(screen.queryByRole('button', { name: 'Activar con huella o rostro' })).toBeNull()
  })

  it('the generated passphrase disappears when the page is hidden', async () => {
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Activar con huella o rostro' }))
    await waitFor(() => expect(db.keys).toHaveLength(1))
    await screen.findByText(/agregá una segunda llave/)
    fireEvent.click(screen.getByRole('button', { name: 'Generar una clave fuerte' }))
    await screen.findByLabelText('Clave de respaldo generada')
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.queryByLabelText('Clave de respaldo generada')).toBeNull()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })
})
