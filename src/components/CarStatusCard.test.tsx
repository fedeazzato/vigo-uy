// specs/car-status-e1.md R4: the card shows only when a status row exists (also inert before migration 0048).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CarStatus } from '../types'

const mocks = vi.hoisted(() => ({ fetchCarStatus: vi.fn() }))

vi.mock('../lib/carStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carStatus')>()),
  fetchCarStatus: mocks.fetchCarStatus,
}))

import CarStatusCard from './CarStatusCard'

const ROW: CarStatus = {
  vehicle_id: 'v',
  event: 'charge_end',
  soc: 80,
  range_km: 266,
  charging: false,
  plugged: true,
  charge_end_reason: 'limite',
  observed_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  received_at: new Date().toISOString(),
}

describe('CarStatusCard', () => {
  beforeEach(() => mocks.fetchCarStatus.mockReset())

  it('renders nothing when there is no row (or the table is missing)', async () => {
    mocks.fetchCarStatus.mockResolvedValue(null)
    const { container } = render(<CarStatusCard />)
    await Promise.resolve()
    expect(container.innerHTML).toBe('')
  })

  it('shows battery, range, cable state, when, and the not-live note', async () => {
    mocks.fetchCarStatus.mockResolvedValue(ROW)
    render(<CarStatusCard />)
    expect(await screen.findByText('Estado del auto')).toBeTruthy()
    expect(screen.getByText('80 %')).toBeTruthy()
    expect(screen.getByText('266 km')).toBeTruthy()
    expect(screen.getByText('Enchufado')).toBeTruthy()
    expect(screen.getByText(/al terminar una carga: llegó al límite · hace 2 h/)).toBeTruthy()
    expect(screen.getByText(/no es en vivo/)).toBeTruthy()
  })
})
