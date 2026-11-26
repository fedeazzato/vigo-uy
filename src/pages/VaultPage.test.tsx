import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FakeAuthenticator, uninstallFakeAuthenticator } from '../test/fakeAuthenticator'
import { RECOVERY_VECTORS, SAMPLE_PAYLOAD } from '../lib/vault/testVectors'
import { PRF_UNSUPPORTED_MESSAGE } from '../lib/vault/webauthn'
import type { VaultItemRow, VaultKeyRow } from '../types'

const WORDS = RECOVERY_VECTORS[3].words

const auth = vi.hoisted(() => ({ current: {} }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.current }))

// In-memory Supabase stand-in; `sent` records every payload a flow sends.
const db = vi.hoisted(() => ({
  keys: [] as VaultKeyRow[],
  items: [] as VaultItemRow[],
  sent: [] as unknown[],
}))
vi.mock('../lib/vault/vaultApi', () => ({
  fetchVault: vi.fn(() => Promise.resolve({ keys: [...db.keys], items: [...db.items], error: null })),
  insertVaultKey: vi.fn((row: Omit<VaultKeyRow, 'created_at'>) => {
    db.sent.push(row)
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

// The camera is covered by QrScanner.test.tsx; here a button stands in for a successful scan.
const scan = vi.hoisted(() => ({ payload: '' }))
vi.mock('../components/QrScanner', () => ({
  default: ({ onResult, onCancel }: { onResult: (p: string) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onResult(scan.payload)}>Simular lectura del QR</button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  ),
}))

import VaultPage from './VaultPage'

// The site's confirm dialog (lib/confirmDialog) is answered through the window.confirm spy below.
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (m: string) => Promise.resolve(window.confirm(m)) }))

let fake: FakeAuthenticator
let confirmSpy: MockInstance<(message?: string) => boolean>
let writeText: ReturnType<typeof vi.fn>

function renderPage() {
  return render(
    <MemoryRouter>
      <VaultPage />
    </MemoryRouter>
  )
}

async function enrol(label = 'Pixel de Ana') {
  fireEvent.change(await screen.findByLabelText('Nombre de este dispositivo'), { target: { value: label } })
  fireEvent.click(screen.getByRole('button', { name: 'Activar con huella o rostro' }))
  await screen.findByText('¡Listo! La bóveda quedó activada con esta llave.')
}

async function pasteAndSave(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Pegar las palabras' }))
  fireEvent.change(screen.getByLabelText('Las 24 palabras'), { target: { value: text } })
  await screen.findByText('Las 24 palabras pasan el control.')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar en la bóveda' }))
  await screen.findByText('Frase guardada cifrada en la bóveda.')
}

beforeEach(() => {
  db.keys = []
  db.items = []
  db.sent = []
  auth.current = {
    user: { id: '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f', email: 'ana@x.uy' },
    status: 'signedIn',
  }
  fake = new FakeAuthenticator('on-get').install()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  uninstallFakeAuthenticator()
  vi.restoreAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

describe('VaultPage', () => {
  it('on a browser without PRF shows the Spanish message and offers no enrolment (no password fallback)', async () => {
    uninstallFakeAuthenticator()
    fake = new FakeAuthenticator('none')
    fake.capabilities = { 'extension:prf': false }
    fake.install()
    renderPage()
    await screen.findByText(PRF_UNSUPPORTED_MESSAGE)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Activar con huella o rostro' })).toBeNull()
    )
    expect(screen.getByRole('button', { name: 'Escanear el QR del auto' }).hasAttribute('disabled')).toBe(
      true
    )
    expect(screen.queryByLabelText(/contraseña/i)).toBeNull()
  })

  it('an authenticator without PRF found at enrolment switches the page to the unsupported message', async () => {
    fake.prf = 'none'
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Activar con huella o rostro' }))
    await waitFor(() => expect(screen.getAllByText(PRF_UNSUPPORTED_MESSAGE).length).toBeGreaterThan(0))
    expect(db.keys).toHaveLength(0)
  })

  it('enrols the first passkey, then nudges for a second one', async () => {
    renderPage()
    expect(await screen.findByText(/No hay contraseña que recordar/)).toBeTruthy()
    await enrol()
    expect(await screen.findByText('Pixel de Ana')).toBeTruthy()
    expect(screen.getByText(/Tenés una sola llave/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agregar otro dispositivo' })).toBeTruthy()
    expect(db.keys[0].label).toBe('Pixel de Ana')
  })

  it('tells where the dashcam words are when none is saved (specs/vault-onboarding.md R-A1/R-A2)', async () => {
    renderPage()
    await enrol()
    const hint = await screen.findByText(/Todavía no guardaste la frase\./)
    expect(hint.textContent).toContain('Dashcam › Ajustes › Frase de recuperación')
    expect(hint.textContent).toContain('escaneá el QR que aparece')
    expect(screen.getByText(/todavía no está instalada en el auto/)).toBeTruthy()
  })

  it('validates pasted words live and saves only ciphertext', async () => {
    renderPage()
    await enrol()
    fireEvent.click(screen.getByRole('button', { name: 'Pegar las palabras' }))
    const box = screen.getByLabelText('Las 24 palabras')
    expect(box.getAttribute('spellcheck')).toBe('false')
    expect(box.getAttribute('autocomplete')).toBe('off')
    const list = WORDS.split(' ')
    fireEvent.change(box, { target: { value: list.slice(0, 5).join(' ') } })
    await screen.findByText('5 de 24 palabras.')
    const swapped = [...list]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    fireEvent.change(box, { target: { value: swapped.join(' ') } })
    await screen.findByText(/no pasan el control/)
    expect(screen.getByRole('button', { name: 'Guardar en la bóveda' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await pasteAndSave(list.map((w, i) => `${i + 1}. ${w.toUpperCase()}`).join('\n'))
    expect(db.items.map((i) => i.kind)).toEqual(['dashcam_recovery'])
    for (const w of list) expect(JSON.stringify(db.sent)).not.toContain(w)
    // the draft is gone after saving
    expect(screen.queryByLabelText('Las 24 palabras')).toBeNull()
    expect(screen.getByText(/Guardada · última actualización/)).toBeTruthy()
  })

  it('saves from the car QR and refuses a payload of another version', async () => {
    renderPage()
    await enrol()
    scan.payload = SAMPLE_PAYLOAD.replace(':1:', ':2:')
    fireEvent.click(screen.getByRole('button', { name: 'Escanear el QR del auto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simular lectura del QR' }))
    await screen.findByText(/es de una versión más nueva/)
    expect(db.items).toHaveLength(0)

    scan.payload = SAMPLE_PAYLOAD
    fireEvent.click(screen.getByRole('button', { name: 'Escanear el QR del auto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simular lectura del QR' }))
    await screen.findByText('Frase guardada cifrada en la bóveda.')
    expect(db.items).toHaveLength(1)
  })

  it('reveals the words after a passkey confirmation and hides them when the page is hidden', async () => {
    renderPage()
    await enrol()
    await pasteAndSave(WORDS)
    const assertions = fake.getCalls.length
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    const grid = await screen.findByRole('list', { name: 'Frase de recuperación' })
    expect(fake.getCalls.length).toBe(assertions + 1)
    expect(within(grid).getAllByRole('listitem')).toHaveLength(24)
    expect(grid.textContent).toContain('rivup')

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await screen.findByText(/otras apps pueden leerlo/)
    expect(writeText).toHaveBeenCalledWith(WORDS)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.queryByRole('list', { name: 'Frase de recuperación' })).toBeNull()
    expect(document.body.textContent).not.toContain('rivup')
  })

  it('a cancelled confirmation shows nothing', async () => {
    renderPage()
    await enrol()
    await pasteAndSave(WORDS)
    fake.nextError = 'NotAllowedError'
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    await screen.findByText(/Se canceló la confirmación/)
    expect(screen.queryByRole('list', { name: 'Frase de recuperación' })).toBeNull()
  })

  it('generates a strong settings-backup passphrase, stores it encrypted and shows it once', async () => {
    renderPage()
    await enrol()
    fireEvent.click(screen.getByRole('button', { name: 'Generar una clave fuerte' }))
    await screen.findByText(/Clave generada y guardada cifrada/)
    const shown = screen.getByLabelText('Clave de respaldo').textContent ?? ''
    expect(shown).toMatch(/^[a-z]{4,5}(-[a-z]{4,5}){9}$/)
    expect(db.items.map((i) => i.kind)).toEqual(['settings_backup_passphrase'])
    expect(JSON.stringify(db.sent)).not.toContain(shown)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    expect(screen.queryByLabelText('Clave de respaldo')).toBeNull()
  })

  it('keeps an existing passphrase only when it meets backup_car.ps1 rules', async () => {
    renderPage()
    await enrol()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar una que ya tengo' }))
    const input = screen.getByLabelText('Tu clave actual')
    fireEvent.change(input, { target: { value: 'corta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en la bóveda' }))
    await screen.findByText(/tiene que tener al menos 8 caracteres/)
    expect(db.items).toHaveLength(0)
    fireEvent.change(input, { target: { value: 'una clave larga de prueba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en la bóveda' }))
    await screen.findByText('Clave guardada cifrada en la bóveda.')
    expect(JSON.stringify(db.sent)).not.toContain('clave larga')
  })

  it('removing the last passkey warns plainly and deletes what was stored', async () => {
    renderPage()
    await enrol()
    await pasteAndSave(WORDS)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pixel de Ana' }))
    await screen.findByText('«Pixel de Ana» se quitó de la bóveda.')
    expect(String(confirmSpy.mock.calls[confirmSpy.mock.calls.length - 1]?.[0])).toMatch(
      /también se borra lo guardado/
    )
    expect(db.keys).toHaveLength(0)
    expect(db.items).toHaveLength(0)
  })

  it('items left without any passkey can only be deleted', async () => {
    db.items = [
      {
        kind: 'dashcam_recovery',
        version: 1,
        iv: 'AAAAAAAAAAAAAAAA',
        ciphertext: 'AAAA',
        updated_at: '2026-11-20T15:00:00Z',
      },
    ]
    renderPage()
    await screen.findByText(/ninguna llave que los abra/)
    expect(screen.queryByRole('button', { name: 'Activar con huella o rostro' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Borrar lo guardado' }))
    await screen.findByText(/Ya podés activar la bóveda de nuevo/)
    expect(db.items).toHaveLength(0)
  })
})
