// specs/car-remote-e3.md R6: the "Control remoto" card.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { CarRemoteData } from '../lib/carRemote'

const mocks = vi.hoisted(() => ({
  fetchCarRemote: vi.fn(),
  createCarOrder: vi.fn(),
  cancelCarOrder: vi.fn(),
}))

vi.mock('../lib/carRemote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRemote')>()),
  fetchCarRemote: mocks.fetchCarRemote,
  createCarOrder: mocks.createCarOrder,
  cancelCarOrder: mocks.cancelCarOrder,
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

  it('shows online, the live block with time to full, the buttons and the orders', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    render(<CarRemoteCard />)
    expect(await screen.findByText('Control remoto')).toBeTruthy()
    expect(screen.getByText('En línea')).toBeTruthy()
    expect(screen.getByText(/si no la recibe en 2 minutos, se cancela/)).toBeTruthy()
    expect(screen.getByText('64 %')).toBeTruthy()
    expect(screen.getByText('212 km')).toBeTruthy()
    expect(screen.getByText('Cargando')).toBeTruthy()
    expect(screen.getByText('Carga completa en ~1 h 35 min')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Detener la carga' })).toBeTruthy()
    expect(screen.getByText('Cerrar todas las ventanas', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText(/En cola/)).toBeTruthy()
    expect(screen.getByText(/Falló: los comandos remotos están apagados en Copiloto/)).toBeTruthy()
    expect(screen.getByText('Comandos remotos apagados.')).toBeTruthy()
    expect(screen.getByText(/Juan · hace 10 min/)).toBeTruthy()
    // only the queued order can be cancelled
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1)
  })

  it('offline: "Sin conexión", no live block, no stop button when not charging', async () => {
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

  it('"Abrir" and "Ventilar" ask for one confirmation; "Cerrar" does not', async () => {
    mocks.fetchCarRemote.mockResolvedValue(data())
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CarRemoteCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir todas las ventanas' }))
    expect(confirmSpy).toHaveBeenCalledWith('¿Abrir las 4 ventanas?')
    expect(mocks.createCarOrder).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ventilar' }))
    expect(mocks.createCarOrder).not.toHaveBeenCalled()
    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ventilar' }))
    await waitFor(() => expect(mocks.createCarOrder).toHaveBeenCalledWith('ventilate', undefined))
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
})
