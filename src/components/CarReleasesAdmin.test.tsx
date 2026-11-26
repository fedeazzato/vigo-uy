// specs/car-updates.md "Pedir beta": Moderación › Versiones del auto lists pending beta requests with Aprobar / Rechazar.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  fetchReleases: vi.fn(),
  fetchCarUpdates: vi.fn(),
  fetchBetaRequests: vi.fn(),
  decideBetaRequest: vi.fn(),
}))

vi.mock('../lib/carReleases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carReleases')>()),
  fetchReleases: mocks.fetchReleases,
  fetchCarUpdates: mocks.fetchCarUpdates,
}))
vi.mock('../lib/carBeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carBeta')>()),
  fetchBetaRequests: mocks.fetchBetaRequests,
  decideBetaRequest: mocks.decideBetaRequest,
}))

import CarReleasesAdmin from './CarReleasesAdmin'

const REQ = {
  id: 'r1',
  vehicle_id: 'v1',
  members: 'Ana, Beto',
  requested_by_name: 'Ana',
  created_at: '2026-11-25T12:00:00Z',
  linked: true,
  beta: false,
}

describe('CarReleasesAdmin beta requests', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset()
    mocks.fetchReleases.mockResolvedValue({ rows: [], error: null })
    mocks.fetchCarUpdates.mockResolvedValue({ rows: [], error: null })
  })

  it('no pending requests: no requests card', async () => {
    mocks.fetchBetaRequests.mockResolvedValue({ rows: [], error: null })
    render(<CarReleasesAdmin />)
    await waitFor(() => expect(mocks.fetchBetaRequests).toHaveBeenCalled())
    expect(await screen.findByText('Ningún auto conectado todavía.')).toBeTruthy()
    expect(screen.queryByText(/Pedidos para probar beta/)).toBeNull()
  })

  it('lists a request; Aprobar approves it and the list reloads', async () => {
    mocks.fetchBetaRequests.mockResolvedValueOnce({ rows: [REQ], error: null })
    mocks.fetchBetaRequests.mockResolvedValue({ rows: [], error: null })
    mocks.decideBetaRequest.mockResolvedValue(null)
    render(<CarReleasesAdmin />)
    expect(await screen.findByText(/Pedidos para probar beta/)).toBeTruthy()
    expect(screen.getByText('Ana, Beto')).toBeTruthy()
    expect(screen.getByText(/Pedido por Ana/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(mocks.decideBetaRequest).toHaveBeenCalledWith('r1', true))
    await waitFor(() => expect(screen.queryByText(/Pedidos para probar beta/)).toBeNull())
  })

  it('Rechazar rejects; a refusal (not the release maintainer) is shown', async () => {
    mocks.fetchBetaRequests.mockResolvedValue({ rows: [{ ...REQ, linked: false }], error: null })
    mocks.decideBetaRequest.mockResolvedValue(
      'solo el responsable de las versiones puede aprobar pedidos de beta'
    )
    render(<CarReleasesAdmin />)
    expect(await screen.findByText(/sin pantalla conectada/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(mocks.decideBetaRequest).toHaveBeenCalledWith('r1', false))
    expect(await screen.findByText(/solo el responsable de las versiones/)).toBeTruthy()
  })
})
