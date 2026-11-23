// specs/car-charge-checkins.md R4: a check-in draft is shown only to members and becomes public only on "Publicar".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  fetchPendingChargeDrafts: vi.fn(),
  confirmChargeDraft: vi.fn(),
  discardChargeDraft: vi.fn(),
}))

vi.mock('../lib/carChargeDrafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carChargeDrafts')>()),
  ...mocks,
}))

import CarChargeDrafts from './CarChargeDrafts'

const ROW = {
  id: 'd1',
  vehicle_id: 'v',
  device_id: null,
  client_id: 'c',
  station_id: 's',
  distance_m: 30,
  result: 'fallo',
  started_at: '2026-11-20T15:00:00Z',
  ended_at: '2026-11-20T15:06:00Z',
  energy_kwh: null,
  max_kw: null,
  avg_kw: null,
  charging_min: null,
  start_soc: null,
  end_soc: null,
  end_reason: null,
  status: 'pending',
  report_id: null,
  received_at: '2026-11-20T16:00:00Z',
  charging_stations: { name: 'UTE Florida' },
}

describe('CarChargeDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing without drafts (also before migration 0060)', async () => {
    mocks.fetchPendingChargeDrafts.mockResolvedValue(null)
    const { container } = render(<CarChargeDrafts />)
    await waitFor(() => expect(mocks.fetchPendingChargeDrafts).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('publishes with the chosen result and removes the card', async () => {
    mocks.fetchPendingChargeDrafts.mockResolvedValue([ROW])
    mocks.confirmChargeDraft.mockResolvedValue(null)
    render(<CarChargeDrafts />)
    expect(await screen.findByText('¿Falló la carga en UTE Florida?')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'ocupado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar check-in' }))
    await waitFor(() => expect(mocks.confirmChargeDraft).toHaveBeenCalledWith('d1', 'ocupado', ''))
    expect(await screen.findByText(/Check-in publicado en UTE Florida/)).toBeTruthy()
    expect(screen.queryByText('¿Falló la carga en UTE Florida?')).toBeNull()
  })

  it('discard publishes nothing', async () => {
    mocks.fetchPendingChargeDrafts.mockResolvedValue([ROW])
    mocks.discardChargeDraft.mockResolvedValue(true)
    render(<CarChargeDrafts />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(mocks.discardChargeDraft).toHaveBeenCalledWith('d1'))
    expect(mocks.confirmChargeDraft).not.toHaveBeenCalled()
  })
})
