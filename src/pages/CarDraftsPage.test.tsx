// specs/car-trip-drafts.md test plan: empty when the feature is absent, list renders, "Usar" fills the trip form and navigates.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { CarTripDraftRow } from '../types'

const mocks = vi.hoisted(() => ({ fetchPendingDrafts: vi.fn(), markDraft: vi.fn() }))

vi.mock('../lib/carTripDrafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carTripDrafts')>()),
  fetchPendingDrafts: mocks.fetchPendingDrafts,
  markDraft: mocks.markDraft,
}))
vi.mock('../lib/communityData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/communityData')>()),
  fetchChargingStations: () => Promise.resolve({ stations: [], error: null }),
}))

import CarDraftsPage from './CarDraftsPage'
import { UserPrefsProvider } from '../context/UserPrefsContext'

const T0 = Date.UTC(2026, 10, 21, 15, 0, 0)
const ROW: CarTripDraftRow = {
  id: 'd1',
  vehicle_id: 'v',
  device_id: null,
  client_id: 'c',
  started_at: new Date(T0).toISOString(),
  ended_at: new Date(T0 + 90 * 60000).toISOString(),
  trip_count: 1,
  distance_km: 95,
  energy_kwh: 14.2,
  start_soc: 80,
  end_soc: 52,
  avg_speed_kmh: 70,
  route: [],
  charges: [{ started_at: T0 + 30 * 60000, ended_at: T0 + 50 * 60000, start_soc: 60, end_soc: 75 }],
  status: 'pending',
  used_at: null,
  received_at: new Date(T0).toISOString(),
}

function renderPage() {
  return render(
    <UserPrefsProvider>
      <MemoryRouter initialEntries={['/mi-vigo/borradores']}>
        <Routes>
          <Route path="/mi-vigo/borradores" element={<CarDraftsPage />} />
          <Route path="/viajes/nuevo" element={<p>formulario de viaje</p>} />
        </Routes>
      </MemoryRouter>
    </UserPrefsProvider>
  )
}

describe('CarDraftsPage', () => {
  beforeEach(() => {
    mocks.fetchPendingDrafts.mockReset()
    mocks.markDraft.mockReset().mockResolvedValue(true)
    localStorage.clear()
  })

  it('says there is nothing to review when the feature is absent', async () => {
    mocks.fetchPendingDrafts.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/No hay borradores/)).toBeTruthy()
  })

  it('lists a draft with its numbers and charge', async () => {
    mocks.fetchPendingDrafts.mockResolvedValue([ROW])
    renderPage()
    expect(await screen.findByText('95 km')).toBeTruthy()
    expect(screen.getByText('80 → 52 %')).toBeTruthy()
    expect(screen.getByText('Carga sin cargador identificado')).toBeTruthy()
  })

  it('"Usar" writes the trip form draft, marks it used and opens the form', async () => {
    mocks.fetchPendingDrafts.mockResolvedValue([ROW])
    renderPage()
    fireEvent.click(await screen.findByText('Usar para registrar el viaje'))
    expect(await screen.findByText('formulario de viaje')).toBeTruthy()
    expect(mocks.markDraft).toHaveBeenCalledWith('d1', 'used')
    const stored = JSON.parse(localStorage.getItem('vigo-trip-draft') ?? '{}') as {
      state: { distanceKm: string; stops: unknown[] }
    }
    expect(stored.state.distanceKm).toBe('95')
    expect(stored.state.stops).toHaveLength(1)
  })

  it('asks before replacing an unfinished trip in the form', async () => {
    localStorage.setItem(
      'vigo-trip-draft',
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state: { origin: 'x' } })
    )
    mocks.fetchPendingDrafts.mockResolvedValue([ROW])
    renderPage()
    fireEvent.click(await screen.findByText('Usar para registrar el viaje'))
    expect(await screen.findByText(/se reemplaza por este borrador/)).toBeTruthy()
    expect(mocks.markDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Reemplazar y registrar'))
    expect(await screen.findByText('formulario de viaje')).toBeTruthy()
  })

  it('"Descartar" removes it from the list', async () => {
    mocks.fetchPendingDrafts.mockResolvedValue([ROW])
    renderPage()
    fireEvent.click(await screen.findByText('Descartar'))
    await waitFor(() => expect(screen.queryByText('95 km')).toBeNull())
    expect(mocks.markDraft).toHaveBeenCalledWith('d1', 'discarded')
  })
})
