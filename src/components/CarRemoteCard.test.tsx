// specs/car-remote-e3.md R6: the "Control remoto" card.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { CarRemoteData } from '../lib/carRemote'

const mocks = vi.hoisted(() => ({
  fetchCarRemote: vi.fn(),
  createCarOrder: vi.fn(),
  cancelCarOrder: vi.fn(),
  fetchMyCarRole: vi.fn(),
}))

vi.mock('../lib/carRemote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRemote')>()),
  fetchCarRemote: mocks.fetchCarRemote,
  createCarOrder: mocks.createCarOrder,
  cancelCarOrder: mocks.cancelCarOrder,
}))

vi.mock('../lib/carRole', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRole')>()),
  fetchMyCarRole: mocks.fetchMyCarRole,
}))

import CarRemoteCard from './CarRemoteCard'

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

function data(over: Partial<CarRemoteData> = {}): CarRemoteData {
  return {
    hasCar: true,
    lastSeenAt: iso(5_000),
    status: {
      vehicle_id: 'v',
      event: 'live',
      soc: 64,
      range_km: 212,
      charging: true,
      plugged: true,
      remain_charge_min: 95,
      limit_pct: 90,
      observed_at: iso(6_000),
      received_at: iso(5_000),
    },
    orders: [
      {
        id: 'o1',
        kind: 'windows_close_all',
        args: {},
        state: 'queued',
        created_by: 'u1',
        created_at: iso(10_000),
        expires_at: new Date(Date.now() + 100_000).toISOString(),
        taken_at: null,
        finished_at: null,
        result_code: null,
        result_text: null,
      },
      {
        id: 'o2',
        kind: 'ventilate',
        args: {},
        state: 'failed',
        created_by: 'u2',
        created_at: iso(600_000),
        expires_at: iso(480_000),
        taken_at: iso(590_000),
        finished_at: iso(589_000),
        result_code: 'remote_off',
        result_text: 'Comandos remotos apagados.',
      },
    ],
    names: { u1: 'Ana', u2: 'Juan' },
    ...over,
  }
}

describe('CarRemoteCard', () => {
  beforeEach(() => {
    mocks.fetchCarRemote.mockReset()
    mocks.createCarOrder.mockReset().mockResolvedValue({ error: null })
    mocks.cancelCarOrder.mockReset().mockResolvedValue({ error: null })
    mocks.fetchMyCarRole.mockReset().mockResolvedValue(null)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders nothing when the fetch fails (migration not applied) or there is no linked car', async () => {
    mocks.fetchCarRemote.mockResolvedValue(null)
    const { container, unmount } = render(<CarRemoteCard />)
    await waitFor(() => expect(mocks.fetchCarRemote).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
    unmount()
    mocks.fetchCarRemote.mockResolvedValue(data({ hasCar: false }))
    const second = render(<CarRemoteCard />)
    await waitFor(() => expect(mocks.fetchCarRemote).toHaveBeenCalledTimes(2))
    expect(second.container.innerHTML).toBe('')
  })

  it('shows online, the buttons and the orders, but not the status ("Estado del auto" shows it)', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    render(<CarRemoteCard />)
    expect(await screen.findByText('Control remoto')).toBeTruthy()
    expect(screen.getByText('En línea')).toBeTruthy()
    expect(screen.getByText(/si no la recibe en 2 minutos, se cancela/)).toBeTruthy()
    // owner at the car 2026-11-22: no repeated battery / range / cable / time to full
    expect(screen.queryByText('64 %')).toBeNull()
    expect(screen.queryByText('212 km')).toBeNull()
    expect(screen.queryByText('Cargando')).toBeNull()
    expect(screen.queryByText(/Carga completa en/)).toBeNull()
    expect(screen.queryByText('Batería')).toBeNull()
    // the status still drives the controls
    expect(screen.getByRole('button', { name: 'Detener la carga' })).toBeTruthy()
    expect(screen.getByText('Cerrar todas las ventanas', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText(/En cola/)).toBeTruthy()
    expect(screen.getByText(/Falló: los comandos remotos están apagados en Copiloto/)).toBeTruthy()
    expect(screen.getByText('Comandos remotos apagados.')).toBeTruthy()
    expect(screen.getByText(/Juan · hace 10 min/)).toBeTruthy()
    // only the queued order can be cancelled
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1)
  })

  it('a taken order shows "Recibida", then "Sin respuesta del auto" after 60 s; never cancellable', async () => {
    const taken = { ...data().orders[0], id: 'o3', state: 'taken', taken_at: iso(10_000) }
    const stale = { ...taken, id: 'o4', kind: 'windows_open_all', taken_at: iso(61_000) }
    mocks.fetchCarRemote.mockResolvedValue(data({ orders: [taken, stale] }))
    render(<CarRemoteCard />)
    expect(await screen.findByText(/^Recibida/)).toBeTruthy()
    expect(screen.getByText(/^Sin respuesta del auto: La recibió pero no avisó si la hizo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  it('"En línea" tolerates one late 10 s poll (seen 34 s ago), not more', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data({ lastSeenAt: iso(34_000) }))
    const first = render(<CarRemoteCard />)
    expect(await screen.findByText('En línea')).toBeTruthy()
    first.unmount()
    mocks.fetchCarRemote.mockResolvedValue(data({ lastSeenAt: iso(40_000) }))
    render(<CarRemoteCard />)
    expect(await screen.findByText(/^Sin conexión — visto/)).toBeTruthy()
  })

  it('offline: "Sin conexión", no stop button when not charging', async () => {
    mocks.fetchCarRemote.mockResolvedValue(
      data({
        lastSeenAt: iso(2 * 3600_000),
        status: { ...data().status!, event: 'charge_end', charging: false, received_at: iso(2 * 3600_000) },
        orders: [],
      })
    )
    render(<CarRemoteCard />)
    expect(await screen.findByText('Sin conexión — visto hace 2 h')).toBeTruthy()
    expect(screen.queryByText(/Carga completa en/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Detener la carga' })).toBeNull()
    expect(screen.queryByText('Últimas órdenes')).toBeNull()
  })

  it('"Ventilar" is hidden while ventilar is off on the car (owner option B)', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    render(<CarRemoteCard />)
    await screen.findByRole('button', { name: 'Abrir todas las ventanas' })
    expect(screen.queryByRole('button', { name: 'Ventilar' })).toBeNull()
  })

  it('"Abrir" asks for one confirmation; "Cerrar" does not', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CarRemoteCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir todas las ventanas' }))
    expect(confirmSpy).toHaveBeenCalledWith('¿Abrir las 4 ventanas?')
    expect(mocks.createCarOrder).not.toHaveBeenCalled()
    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las ventanas' }))
    await waitFor(() => expect(mocks.createCarOrder).toHaveBeenCalledWith('windows_open_all', undefined))
    confirmSpy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar todas las ventanas' }))
    await waitFor(() => expect(mocks.createCarOrder).toHaveBeenCalledWith('windows_close_all', undefined))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('charge limit stepper starts at the car limit, moves by 5 within 60-100, and applies', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    render(<CarRemoteCard />)
    expect(await screen.findByText('90 %', { selector: 'span' })).toBeTruthy()
    const up = screen.getByRole('button', { name: 'Subir el límite' })
    fireEvent.click(up)
    expect(screen.getByText('95 %', { selector: 'span' })).toBeTruthy()
    fireEvent.click(up)
    expect((up as HTMLButtonElement).disabled).toBe(true)
    const down = screen.getByRole('button', { name: 'Bajar el límite' })
    for (let i = 0; i < 10; i++) fireEvent.click(down)
    expect(screen.getByText('60 %', { selector: 'span' })).toBeTruthy()
    expect((down as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(mocks.createCarOrder).toHaveBeenCalledWith('charge_limit', 60))
  })

  it('shows a refusal and cancels a queued order', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    mocks.createCarOrder.mockResolvedValue({ error: 'Mandaste muchas órdenes seguidas.' })
    render(<CarRemoteCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar todas las ventanas' }))
    expect(await screen.findByText('Mandaste muchas órdenes seguidas.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(mocks.cancelCarOrder).toHaveBeenCalledWith('o1'))
  })

  it('polls every 3 s while visible and stops when the page is hidden', async () => {
    vi.useFakeTimers()
    mocks.fetchCarRemote.mockResolvedValue(data())
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    const { unmount } = render(<CarRemoteCard />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.fetchCarRemote).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(mocks.fetchCarRemote).toHaveBeenCalledTimes(3)
    visibility = 'hidden'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(mocks.fetchCarRemote).toHaveBeenCalledTimes(3)
    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.fetchCarRemote).toHaveBeenCalledTimes(4)
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(mocks.fetchCarRemote).toHaveBeenCalledTimes(4)
  })

  it('E2: a view-only member sees the orders but no buttons and no cancel', async () => {
    mocks.fetchMyCarRole.mockResolvedValue('view')
    mocks.fetchCarRemote.mockResolvedValue(data())
    render(<CarRemoteCard />)
    expect(await screen.findByText(/Tu permiso en este vehículo es solo ver/)).toBeTruthy()
    expect(screen.queryByText('Abrir todas las ventanas')).toBeNull()
    expect(screen.queryByText('Aplicar')).toBeNull()
    expect(screen.queryByText('Cancelar')).toBeNull()
    expect(screen.getByText('Últimas órdenes')).toBeTruthy()
  })

  it('E2: control and owner keep the buttons', async () => {
    mocks.fetchMyCarRole.mockResolvedValue('control')
    mocks.fetchCarRemote.mockResolvedValue(data())
    render(<CarRemoteCard />)
    expect(await screen.findByText('Abrir todas las ventanas')).toBeTruthy()
    expect(screen.queryByText(/solo ver/)).toBeNull()
  })
})
