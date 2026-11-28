// specs/car-updates.md "Pedir beta": Moderación › Versiones del auto lists pending beta requests with Aprobar / Rechazar.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  fetchReleases: vi.fn(),
  fetchCarUpdates: vi.fn(),
  fetchBetaRequests: vi.fn(),
  decideBetaRequest: vi.fn(),
  publishRelease: vi.fn(),
  verifyManifestSignature: vi.fn(),
}))

vi.mock('../lib/carReleases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carReleases')>()),
  fetchReleases: mocks.fetchReleases,
  fetchCarUpdates: mocks.fetchCarUpdates,
  publishRelease: mocks.publishRelease,
  verifyManifestSignature: mocks.verifyManifestSignature,
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

describe('CarReleasesAdmin publishing with a limit', () => {
  const BASE = 'https://github.com/fedeazzato/vigo-releases/releases/download/r9/'
  const MANIFEST = [
    'vigo-update 1',
    'serial 9',
    'issued 1795000000',
    'expires 1797600000',
    'kill 0',
    'rollout 100 r9',
    'app com.vigo.carga 27 0.27 app/Carga',
    `file Carga.apk 1234567 ${'a'.repeat(64)} Carga-0.27.apk`,
    `source ${BASE}`,
    'end',
    '',
  ].join(String.fromCharCode(10))

  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset()
    mocks.fetchReleases.mockResolvedValue({ rows: [], error: null })
    mocks.fetchCarUpdates.mockResolvedValue({ rows: [], error: null })
    mocks.fetchBetaRequests.mockResolvedValue({ rows: [], error: null })
    mocks.verifyManifestSignature.mockResolvedValue(true)
    mocks.publishRelease.mockResolvedValue(null)
  })

  async function fill(limit: string) {
    render(<CarReleasesAdmin />)
    await screen.findByText('Ningún auto conectado todavía.')
    fireEvent.change(screen.getByLabelText(/Carpeta de descarga/), { target: { value: BASE } })
    fireEvent.change(screen.getByLabelText(/Manifiesto firmado/), { target: { value: MANIFEST } })
    fireEvent.change(screen.getByLabelText(/^Firma/), { target: { value: 'c2ln' } })
    fireEvent.change(screen.getByLabelText(/Limitar a/), { target: { value: limit } })
    fireEvent.click(screen.getByRole('button', { name: 'Verificar firma y publicar' }))
  }

  it('publishes with the limit in the same call', async () => {
    await fill('10')
    await waitFor(() => expect(mocks.publishRelease).toHaveBeenCalledTimes(1))
    expect(mocks.publishRelease.mock.calls[0][0]).toMatchObject({ cap: 10, downloadBase: BASE })
  })

  it('no limit when left empty; 0 publishes it paused', async () => {
    await fill('')
    await waitFor(() => expect(mocks.publishRelease).toHaveBeenCalledTimes(1))
    expect(mocks.publishRelease.mock.calls[0][0]).toMatchObject({ cap: null })
    cleanup()
    mocks.publishRelease.mockClear()
    await fill('0')
    await waitFor(() => expect(mocks.publishRelease).toHaveBeenCalledTimes(1))
    expect(mocks.publishRelease.mock.calls[0][0]).toMatchObject({ cap: 0 })
  })

  it('refuses a limit out of range and publishes nothing', async () => {
    await fill('150')
    expect(await screen.findByText(/número entero de 0 a 100/)).toBeTruthy()
    expect(mocks.publishRelease).not.toHaveBeenCalled()
  })
})
