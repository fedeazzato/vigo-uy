import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CarDevice } from '../types'

const mocks = vi.hoisted(() => ({
  fetchCarDevices: vi.fn(),
  revokeCarDevice: vi.fn(),
}))

vi.mock('../lib/carLink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carLink')>()),
  fetchCarDevices: mocks.fetchCarDevices,
  revokeCarDevice: mocks.revokeCarDevice,
}))

import CarDevicesCard from './CarDevicesCard'

// The site's confirm dialog (lib/confirmDialog) is answered through the window.confirm spy below.
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (m: string) => Promise.resolve(window.confirm(m)) }))

function device(over: Partial<CarDevice>): CarDevice {
  return {
    id: 'd1',
    vehicle_id: 'v',
    name: 'Vigo',
    app_version: null,
    created_by: 'u',
    created_at: '2026-11-13T15:00:00Z',
    last_seen_at: null,
    revoked_at: null,
    revoked_by: null,
    ...over,
  }
}

function renderCard() {
  return render(
    <MemoryRouter>
      <CarDevicesCard />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CarDevicesCard', () => {
  it('lists active and revoked devices with their labels', async () => {
    mocks.fetchCarDevices.mockResolvedValue({
      devices: [
        device({ id: 'a', name: 'Vigo de Ana', app_version: '2.0', last_seen_at: '2026-11-20T14:55:00Z' }),
        device({ id: 'b', name: 'Vigo nuevo' }),
        device({ id: 'c', name: 'Vigo viejo', revoked_at: '2026-11-15T12:00:00Z' }),
      ],
      error: null,
    })
    renderCard()
    await screen.findByText('Vigo de Ana')
    expect(screen.getByText('Última conexión: hace 5 min')).toBeTruthy()
    expect(screen.getByText(/Mi Vigo 2\.0/)).toBeTruthy()
    expect(screen.getByText('Todavía no se conectó')).toBeTruthy()
    expect(screen.getByText('Desconectado el 15 nov')).toBeTruthy()
    // revoked rows have no action
    expect(screen.getAllByRole('button', { name: 'Desconectar' })).toHaveLength(2)
  })

  it('shows the empty state with a link to the pairing page', async () => {
    mocks.fetchCarDevices.mockResolvedValue({ devices: [], error: null })
    renderCard()
    const link = await screen.findByRole('link', { name: 'Conectar la pantalla' })
    expect(link.getAttribute('href')).toBe('/mi-vigo/vincular')
  })

  it('asks for confirmation before revoking', async () => {
    mocks.fetchCarDevices.mockResolvedValue({ devices: [device({ name: 'Vigo de Ana' })], error: null })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(mocks.revokeCarDevice).not.toHaveBeenCalled()
  })

  it('revokes and reloads the list', async () => {
    mocks.fetchCarDevices
      .mockResolvedValueOnce({ devices: [device({ name: 'Vigo de Ana' })], error: null })
      .mockResolvedValueOnce({
        devices: [device({ name: 'Vigo de Ana', revoked_at: '2026-11-20T15:00:00Z' })],
        error: null,
      })
    mocks.revokeCarDevice.mockResolvedValue({ error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }))
    await screen.findByText('«Vigo de Ana» quedó desconectado.')
    expect(mocks.revokeCarDevice).toHaveBeenCalledWith('d1')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull())
  })

  it('shows a revoke error', async () => {
    mocks.fetchCarDevices.mockResolvedValue({ devices: [device({})], error: null })
    mocks.revokeCarDevice.mockResolvedValue({ error: 'Esa pantalla no está conectada a tu vehículo.' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }))
    await screen.findByText('Esa pantalla no está conectada a tu vehículo.')
  })
})
