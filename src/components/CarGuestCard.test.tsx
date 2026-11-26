// specs/guest-mode.md R4: the Mi Vigo card shows only for creator / control members with a linked screen that reported guest
// mode support; activate / deactivate ask once, then the card waits for the car; a pending request can be cancelled.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CarGuestState } from '../lib/carGuest'

const mocks = vi.hoisted(() => ({
  fetchCarGuest: vi.fn(),
  setCarGuest: vi.fn(),
  cancelCarGuest: vi.fn(),
}))

vi.mock('../lib/carGuest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carGuest')>()),
  fetchCarGuest: mocks.fetchCarGuest,
  setCarGuest: mocks.setCarGuest,
  cancelCarGuest: mocks.cancelCarGuest,
}))
// The site's confirm dialog (lib/confirmDialog) is answered through the window.confirm spy below.
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (m: string) => Promise.resolve(window.confirm(m)) }))

import CarGuestCard from './CarGuestCard'

const recent = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

function base(over: Partial<Extract<CarGuestState, { allowed: true }>> = {}): CarGuestState {
  return {
    allowed: true,
    linked: true,
    lastSeenAt: recent(3_000),
    car: { state: 'off', since: null, reportedAt: recent(3_000) },
    request: null,
    ...over,
  }
}

describe('CarGuestCard', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset()
    vi.restoreAllMocks()
  })

  it('renders nothing for a view-only member, without a linked screen, before the car reported support, or on error', async () => {
    for (const s of [
      { allowed: false } as CarGuestState,
      base({ linked: false }),
      base({ car: null }),
      null,
    ]) {
      mocks.fetchCarGuest.mockResolvedValue(s)
      const r = render(<CarGuestCard />)
      await waitFor(() => expect(mocks.fetchCarGuest).toHaveBeenCalled())
      expect(r.container.innerHTML).toBe('')
      r.unmount()
      mocks.fetchCarGuest.mockReset()
    }
  })

  it('an old helper on the car: explains how to update, no buttons', async () => {
    mocks.fetchCarGuest.mockResolvedValue(
      base({ car: { state: 'unsupported', since: null, reportedAt: recent(1000) } })
    )
    render(<CarGuestCard />)
    expect(await screen.findByText(/todavía no puede usar el modo invitado/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('off: "Activar modo invitado" asks once, sends, and shows the pending request with a cancel', async () => {
    mocks.fetchCarGuest.mockResolvedValueOnce(base())
    mocks.fetchCarGuest.mockResolvedValue(
      base({
        request: {
          id: 'r1',
          want: 'on',
          state: 'pending',
          code: null,
          by: 'Fede',
          createdAt: recent(1000),
          sentAt: null,
          finishedAt: null,
          expiresAt: recent(-12 * 3600_000),
        },
      })
    )
    mocks.setCarGuest.mockResolvedValue(null)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CarGuestCard />)
    expect(await screen.findByText('Modo invitado desactivado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Activar modo invitado' }))
    await waitFor(() => expect(mocks.setCarGuest).toHaveBeenCalledWith(true))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^¿Activar el modo invitado\?/))
    expect(await screen.findByText(/Fede pidió activar el modo invitado .* Enviando al auto…/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Activar/ })).toBeNull()

    mocks.cancelCarGuest.mockResolvedValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    await waitFor(() => expect(mocks.cancelCarGuest).toHaveBeenCalledTimes(1))
  })

  it('declining the confirmation sends nothing', async () => {
    mocks.fetchCarGuest.mockResolvedValue(base())
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CarGuestCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Activar modo invitado' }))
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(mocks.setCarGuest).not.toHaveBeenCalled()
  })

  it('on: "Desactivar modo invitado" (the forgotten-PIN way) sends off; a server error is shown', async () => {
    mocks.fetchCarGuest.mockResolvedValue(
      base({ car: { state: 'on', since: recent(3600_000), reportedAt: recent(2000) } })
    )
    mocks.setCarGuest.mockResolvedValue(
      'Lo cambiaste muchas veces seguidas. Esperá un rato y probá de nuevo.'
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CarGuestCard />)
    expect(await screen.findByText('Modo invitado activado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar modo invitado' }))
    await waitFor(() => expect(mocks.setCarGuest).toHaveBeenCalledWith(false))
    expect(await screen.findByText(/muchas veces seguidas/)).toBeTruthy()
  })
})
