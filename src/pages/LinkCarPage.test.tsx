import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  claimCarPairing: vi.fn(),
  fetchMyVehicleMemberNames: vi.fn(),
}))

// A non-null client so the page is usable; the data calls are mocked below.
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

vi.mock('../lib/carLink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carLink')>()),
  claimCarPairing: mocks.claimCarPairing,
  fetchMyVehicleMemberNames: mocks.fetchMyVehicleMemberNames,
}))

import LinkCarPage from './LinkCarPage'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mi-vigo/vincular" element={<LinkCarPage />} />
      </Routes>
    </MemoryRouter>
  )
}

const codeInput = () => screen.getByLabelText<HTMLInputElement>('Código')
const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Vincular este auto' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchMyVehicleMemberNames.mockResolvedValue(['Ana', 'Juan'])
})

describe('LinkCarPage', () => {
  it('prefills the code from ?c= (normalised)', async () => {
    renderAt('/mi-vigo/vincular?c=k7q-2m9')
    expect(codeInput().value).toBe('K7Q2M9')
    expect(submit().disabled).toBe(false)
    await screen.findByText('Ana, Juan')
  })

  it('reads ?c= through a real HashRouter (the QR link shape)', () => {
    window.location.hash = '#/mi-vigo/vincular?c=k7q2m9'
    render(
      <HashRouter>
        <Routes>
          <Route path="/mi-vigo/vincular" element={<LinkCarPage />} />
        </Routes>
      </HashRouter>
    )
    expect(codeInput().value).toBe('K7Q2M9')
    window.location.hash = ''
  })

  it('keeps the button disabled for an incomplete or lookalike code and explains why', () => {
    renderAt('/mi-vigo/vincular')
    expect(submit().disabled).toBe(true)
    fireEvent.change(codeInput(), { target: { value: 'k7q2m0' } })
    expect(codeInput().value).toBe('K7Q2M0')
    expect(submit().disabled).toBe(true)
    expect(screen.getByText(/no usa las letras I, L ni O/)).toBeTruthy()
  })

  it('accepts a pasted link in the field', () => {
    renderAt('/mi-vigo/vincular')
    fireEvent.change(codeInput(), {
      target: { value: 'https://fedeazzato.github.io/vigo-uy/#/mi-vigo/vincular?c=K7Q2M9' },
    })
    expect(codeInput().value).toBe('K7Q2M9')
  })

  it('claims and shows the confirmation', async () => {
    mocks.claimCarPairing.mockResolvedValue({ device: { deviceId: 'dev-1', name: 'Mi Vigo' }, error: null })
    renderAt('/mi-vigo/vincular?c=K7Q2M9')
    fireEvent.change(screen.getByLabelText('Nombre del auto (opcional)'), { target: { value: 'Mi Vigo' } })
    fireEvent.click(submit())
    await screen.findByText(/quedó vinculado a tu vehículo/)
    expect(mocks.claimCarPairing).toHaveBeenCalledWith('K7Q2M9', 'Mi Vigo')
    expect(screen.getByRole('link', { name: 'Ver dispositivos vinculados' })).toBeTruthy()
  })

  it('shows the server error and keeps the form', async () => {
    mocks.claimCarPairing.mockResolvedValue({
      device: null,
      error: 'Código no válido o vencido. Pedí uno nuevo en la pantalla del auto.',
    })
    renderAt('/mi-vigo/vincular?c=K7Q2M9')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText(/Código no válido o vencido/)).toBeTruthy())
    expect(codeInput()).toBeTruthy()
  })
})
