// specs/car-navigate-b2.md R5: the "Enviar al auto" button.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const mocks = vi.hoisted(() => ({
  fetchCarLink: vi.fn(),
  sendDestination: vi.fn(),
  auth: { status: 'signedIn' },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../lib/carNavigate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carNavigate')>()),
  fetchCarLink: mocks.fetchCarLink,
  sendDestination: mocks.sendDestination,
}))

import SendToCarButton from './SendToCarButton'

const DEST = { lat: -34.9, lon: -56.16, label: 'Tata Punta Carretas' }
const renderIt = (enabled = true) =>
  render(
    <MemoryRouter>
      <SendToCarButton destination={DEST} enabled={enabled} />
    </MemoryRouter>
  )

beforeEach(() => {
  mocks.fetchCarLink.mockReset()
  mocks.sendDestination.mockReset()
  mocks.auth.status = 'signedIn'
})

describe('SendToCarButton', () => {
  it('hidden when the flag is off, signed out, or without a car', async () => {
    mocks.fetchCarLink.mockResolvedValue({ hasCar: true, remoteOn: true })
    const { container, unmount } = renderIt(false)
    expect(container.innerHTML).toBe('')
    unmount()
    mocks.auth.status = 'signedOut'
    const r2 = renderIt()
    expect(r2.container.innerHTML).toBe('')
    r2.unmount()
    mocks.auth.status = 'signedIn'
    mocks.fetchCarLink.mockResolvedValue({ hasCar: false, remoteOn: null })
    const r3 = renderIt()
    await waitFor(() => expect(mocks.fetchCarLink).toHaveBeenCalled())
    expect(r3.container.innerHTML).toBe('')
  })

  it('confirms with the delivery and driving notices, then sends', async () => {
    mocks.fetchCarLink.mockResolvedValue({ hasCar: true, remoteOn: true })
    mocks.sendDestination.mockResolvedValue({ error: null })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: /Enviar al auto/ }))
    expect(screen.getByText('Navegar a Tata Punta Carretas')).toBeTruthy()
    expect(screen.getByText(/2 minutos/)).toBeTruthy()
    expect(screen.getByText(/en marcha/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText(/Destino enviado/)
    expect(mocks.sendDestination).toHaveBeenCalledWith(DEST)
  })

  it('warns when the car reported its remote switch off', async () => {
    mocks.fetchCarLink.mockResolvedValue({ hasCar: true, remoteOn: false })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: /Enviar al auto/ }))
    expect(screen.getByRole('alert').textContent).toMatch(/Comandos remotos/)
    expect(screen.getByRole('button', { name: 'Enviar igual' })).toBeTruthy()
  })

  it('shows the server error and stays open', async () => {
    mocks.fetchCarLink.mockResolvedValue({ hasCar: true, remoteOn: null })
    mocks.sendDestination.mockResolvedValue({ error: 'Mandaste muchas órdenes seguidas.' })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: /Enviar al auto/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/muchas órdenes/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeTruthy()
  })
})
