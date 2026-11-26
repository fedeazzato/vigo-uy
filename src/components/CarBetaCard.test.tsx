// specs/car-updates.md "Pedir beta": the Mi Vigo card shows only for creator / control members with a connected screen;
// ask -> "Pedido enviado"; beta -> "Salir de beta"; a rejected request can be asked again.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CarBetaState } from '../lib/carBeta'

const mocks = vi.hoisted(() => ({
  fetchCarBeta: vi.fn(),
  requestCarBeta: vi.fn(),
  leaveCarBeta: vi.fn(),
  fetchCarLastSeen: vi.fn(),
}))

vi.mock('../lib/carBeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carBeta')>()),
  fetchCarBeta: mocks.fetchCarBeta,
  requestCarBeta: mocks.requestCarBeta,
  leaveCarBeta: mocks.leaveCarBeta,
}))
vi.mock('../lib/carRemote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRemote')>()),
  fetchCarLastSeen: mocks.fetchCarLastSeen,
}))

import CarBetaCard from './CarBetaCard'

const AT = '2026-11-25T12:00:00Z'
const LINKED = { lastSeenAt: AT }

function given(state: CarBetaState | null, linked: unknown = LINKED) {
  mocks.fetchCarBeta.mockResolvedValue(state)
  mocks.fetchCarLastSeen.mockResolvedValue(linked)
}

describe('CarBetaCard', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset()
  })

  it('renders nothing for a view-only member, without a connected screen, or before the migration', async () => {
    given({ allowed: false })
    const a = render(<CarBetaCard />)
    await waitFor(() => expect(mocks.fetchCarBeta).toHaveBeenCalledTimes(1))
    expect(a.container.innerHTML).toBe('')
    a.unmount()

    given({ allowed: true, beta: false, request: null }, null)
    const b = render(<CarBetaCard />)
    await waitFor(() => expect(mocks.fetchCarLastSeen).toHaveBeenCalledTimes(2))
    expect(b.container.innerHTML).toBe('')
    b.unmount()

    given(null)
    const c = render(<CarBetaCard />)
    await waitFor(() => expect(mocks.fetchCarBeta).toHaveBeenCalledTimes(3))
    expect(c.container.innerHTML).toBe('')
  })

  it('offer: explains beta; asking turns into "Pedido enviado" with a cancel', async () => {
    given({ allowed: true, beta: false, request: null })
    render(<CarBetaCard />)
    expect(await screen.findByText('Probar versiones beta')).toBeTruthy()
    expect(screen.getByText(/antes que el resto.*algún error chico.*salir cuando quieras/)).toBeTruthy()
    mocks.requestCarBeta.mockResolvedValue(null)
    mocks.fetchCarBeta.mockResolvedValue({
      allowed: true,
      beta: false,
      request: { status: 'pending', createdAt: AT, decidedAt: null },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Quiero probar las versiones beta' }))
    expect(await screen.findByText(/Pedido enviado/)).toBeTruthy()
    expect(mocks.requestCarBeta).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Quiero probar las versiones beta' })).toBeNull()
  })

  it('beta: "Salir de beta" leaves and the offer comes back', async () => {
    given({ allowed: true, beta: true, request: { status: 'approved', createdAt: AT, decidedAt: AT } })
    render(<CarBetaCard />)
    expect(await screen.findByText('Tu auto está en beta.')).toBeTruthy()
    mocks.leaveCarBeta.mockResolvedValue(null)
    mocks.fetchCarBeta.mockResolvedValue({
      allowed: true,
      beta: false,
      request: { status: 'approved', createdAt: AT, decidedAt: AT },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salir de beta' }))
    expect(await screen.findByRole('button', { name: 'Quiero probar las versiones beta' })).toBeTruthy()
    expect(mocks.leaveCarBeta).toHaveBeenCalledTimes(1)
  })

  it('rejected: says so and lets the owner ask again; a server refusal is shown', async () => {
    given({ allowed: true, beta: false, request: { status: 'rejected', createdAt: AT, decidedAt: AT } })
    render(<CarBetaCard />)
    expect(await screen.findByText(/no fue aprobado esta vez/)).toBeTruthy()
    mocks.requestCarBeta.mockResolvedValue('Ya pediste varias veces hoy. Probá de nuevo mañana.')
    fireEvent.click(screen.getByRole('button', { name: 'Quiero probar las versiones beta' }))
    expect(await screen.findByText(/Ya pediste varias veces hoy/)).toBeTruthy()
  })
})
