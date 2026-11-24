// specs/car-status-e1.md R4: the card shows only when a status row exists (also inert before migration 0048). It is the only
// place for the car's status: a fresh live row adds time to full and the charge limit (moved from "Control remoto").
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { CarStatus } from '../types'

const mocks = vi.hoisted(() => ({ fetchCarStatus: vi.fn(), fetchCarLastSeen: vi.fn() }))

vi.mock('../lib/carRemote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRemote')>()),
  fetchCarLastSeen: mocks.fetchCarLastSeen,
}))

vi.mock('../lib/carStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carStatus')>()),
  fetchCarStatus: mocks.fetchCarStatus,
}))

// The Control remoto buttons are their own component (CarRemoteCard.test.tsx); here only where they mount.
const flag = vi.hoisted(() => ({ on: false }))
vi.mock('../lib/carRemoteFlag', () => ({
  get CAR_REMOTE_ENABLED() {
    return flag.on
  },
}))
vi.mock('./CarRemoteCard', () => ({ default: () => <div data-testid="remote-buttons" /> }))

import CarStatusCard from './CarStatusCard'

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

const ROW: CarStatus = {
  vehicle_id: 'v',
  event: 'charge_end',
  soc: 80,
  range_km: 266,
  charging: false,
  plugged: true,
  charge_end_reason: 'limite',
  remain_charge_min: null,
  limit_pct: null,
  observed_at: iso(2 * 3600 * 1000),
  received_at: iso(0),
}

const LIVE: CarStatus = {
  ...ROW,
  event: 'live',
  soc: 64,
  range_km: 212,
  charging: true,
  charge_end_reason: null,
  remain_charge_min: 95,
  limit_pct: 90,
  observed_at: iso(6_000),
  received_at: iso(5_000),
}

describe('CarStatusCard', () => {
  beforeEach(() => {
    mocks.fetchCarStatus.mockReset()
    mocks.fetchCarLastSeen.mockReset()
    mocks.fetchCarLastSeen.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders nothing when there is no row (or the table is missing)', async () => {
    mocks.fetchCarStatus.mockResolvedValue(null)
    const { container } = render(<CarStatusCard />)
    await Promise.resolve()
    expect(container.innerHTML).toBe('')
  })

  it('shows battery, range, cable state, when, and the not-live note', async () => {
    mocks.fetchCarStatus.mockResolvedValue({ ...ROW, limit_pct: 90 })
    render(<CarStatusCard />)
    expect(await screen.findByText('Tu auto ahora')).toBeTruthy()
    expect(screen.getByText('80 %')).toBeTruthy()
    expect(screen.getByText('266 km')).toBeTruthy()
    expect(screen.getByText('Enchufado')).toBeTruthy()
    expect(screen.getByText(/al terminar una carga: llegó al límite · hace 2 h/)).toBeTruthy()
    expect(screen.getByText(/no es en vivo/)).toBeTruthy()
    // not a fresh live row: no time to full, no limit
    expect(screen.queryByText(/Carga completa en/)).toBeNull()
    expect(screen.queryByText(/Límite de carga/)).toBeNull()
  })

  it('a fresh live row while charging also shows time to full and the charge limit', async () => {
    mocks.fetchCarStatus.mockResolvedValue(LIVE)
    render(<CarStatusCard />)
    expect(await screen.findByText('64 %')).toBeTruthy()
    expect(screen.getByText('212 km')).toBeTruthy()
    expect(screen.getByText('Cargando')).toBeTruthy()
    expect(screen.getByText('Carga completa en ~1 h 35 min')).toBeTruthy()
    expect(screen.getByText('Límite de carga 90 %')).toBeTruthy()
    expect(screen.getByText(/Último dato con el auto encendido/)).toBeTruthy()
    expect(screen.queryByText(/no es en vivo/)).toBeNull()
  })

  it('a live row older than 2 min shows neither time to full nor the limit', async () => {
    mocks.fetchCarStatus.mockResolvedValue({ ...LIVE, observed_at: iso(3 * 60_000), received_at: iso(3 * 60_000) })
    render(<CarStatusCard />)
    expect(await screen.findByText('64 %')).toBeTruthy()
    expect(screen.queryByText(/Carga completa en/)).toBeNull()
    expect(screen.queryByText(/Límite de carga/)).toBeNull()
    expect(screen.getByText(/no es en vivo/)).toBeTruthy()
  })

  it('re-reads every 10 s while visible and stops when the page is hidden', async () => {
    vi.useFakeTimers()
    mocks.fetchCarStatus.mockResolvedValue(LIVE)
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    const { unmount } = render(<CarStatusCard />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.fetchCarStatus).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(mocks.fetchCarStatus).toHaveBeenCalledTimes(3)
    visibility = 'hidden'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mocks.fetchCarStatus).toHaveBeenCalledTimes(3)
    unmount()
  })

  // owner decision 2026-11-24 #2: one card with status + online/offline (moved from Control remoto)
  it('shows "En línea" with a car seen 34 s ago and "Sin conexión" after that', async () => {
    mocks.fetchCarStatus.mockResolvedValue(LIVE)
    mocks.fetchCarLastSeen.mockResolvedValue({ lastSeenAt: iso(34_000) })
    const first = render(<CarStatusCard />)
    expect(await screen.findByText('En línea')).toBeTruthy()
    first.unmount()
    mocks.fetchCarLastSeen.mockResolvedValue({ lastSeenAt: iso(2 * 3600_000) })
    render(<CarStatusCard />)
    expect(await screen.findByText('Sin conexión — visto hace 2 h')).toBeTruthy()
  })

  it('a linked car with no status yet still shows the card with its connection', async () => {
    mocks.fetchCarStatus.mockResolvedValue(null)
    mocks.fetchCarLastSeen.mockResolvedValue({ lastSeenAt: null })
    render(<CarStatusCard />)
    expect(await screen.findByText('Tu auto ahora')).toBeTruthy()
    expect(screen.getByText('Sin conexión — todavía no se conectó')).toBeTruthy()
  })

  // owner decision 2026-11-24 #2: Control remoto is only buttons inside this card, still behind VITE_CAR_REMOTE.
  it('renders the Control remoto buttons inside the card only when VITE_CAR_REMOTE is on', async () => {
    mocks.fetchCarStatus.mockResolvedValue(LIVE)
    mocks.fetchCarLastSeen.mockResolvedValue({ lastSeenAt: iso(5_000) })
    flag.on = false
    const off = render(<CarStatusCard />)
    expect(await screen.findByText('Tu auto ahora')).toBeTruthy()
    expect(screen.queryByTestId('remote-buttons')).toBeNull()
    off.unmount()
    flag.on = true
    try {
      const { container } = render(<CarStatusCard />)
      await screen.findByText('Tu auto ahora')
      // one card (the component's single root element) holds the status and the buttons
      expect(container.children).toHaveLength(1)
      expect(container.firstElementChild!.contains(screen.getByTestId('remote-buttons'))).toBe(true)
    } finally {
      flag.on = false
    }
  })
})
