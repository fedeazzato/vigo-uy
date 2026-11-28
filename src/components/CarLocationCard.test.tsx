// specs/car-location.md R5: "Dónde está tu auto" shows only for creator / control members with a linked screen; empty state
// tells how to turn it on in the car; the map itself is its own lazy component (stubbed here: Leaflet needs real layout).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CarLocationState } from '../lib/carLocation'

const mocks = vi.hoisted(() => ({ fetchCarLocation: vi.fn(), fetchCarLastSeen: vi.fn() }))

vi.mock('../lib/carLocation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carLocation')>()),
  fetchCarLocation: mocks.fetchCarLocation,
}))
vi.mock('../lib/carRemote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/carRemote')>()),
  fetchCarLastSeen: mocks.fetchCarLastSeen,
}))
vi.mock('./CarLocationMap', () => ({
  default: ({ spots, selected }: { spots: unknown[]; selected: string | null }) => (
    <div data-testid="map" data-spots={spots.length} data-selected={selected ?? ''} />
  ),
}))

import CarLocationCard from './CarLocationCard'

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const LINKED = { lastSeenAt: iso(60_000) }

function given(state: CarLocationState | null, linked: unknown = LINKED) {
  mocks.fetchCarLocation.mockResolvedValue(state)
  mocks.fetchCarLastSeen.mockResolvedValue(linked)
}

describe('CarLocationCard', () => {
  beforeEach(() => {
    mocks.fetchCarLocation.mockReset()
    mocks.fetchCarLastSeen.mockReset()
  })

  it('renders nothing for a view-only member (allowed:false)', async () => {
    given({ allowed: false })
    const { container } = render(<CarLocationCard />)
    await waitFor(() => expect(mocks.fetchCarLocation).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing without a linked screen, or when the function is missing (null)', async () => {
    given({ allowed: true, mode: null, last: null, spots: [] }, null)
    const { container, unmount } = render(<CarLocationCard />)
    await waitFor(() => expect(mocks.fetchCarLastSeen).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
    unmount()
    given(null)
    const second = render(<CarLocationCard />)
    await waitFor(() => expect(mocks.fetchCarLocation).toHaveBeenCalledTimes(2))
    expect(second.container.innerHTML).toBe('')
  })

  it('off: explains how to turn it on in the car', async () => {
    given({ allowed: true, mode: null, last: null, spots: [] })
    render(<CarLocationCard />)
    expect(await screen.findByText('Dónde está tu auto')).toBeTruthy()
    expect(screen.getByText(/Mi Vigo › Ajustes › Ubicación del auto/)).toBeTruthy()
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('on without a point yet: waiting text', async () => {
    given({ allowed: true, mode: 'last', last: null, spots: [] })
    render(<CarLocationCard />)
    expect(await screen.findByText(/La primera ubicación llega/)).toBeTruthy()
    expect(screen.queryByText(/Estacionamientos de los últimos 7 días/)).toBeNull()
  })

  it('a parked point: state, accuracy, map, directions; no spots list in mode last', async () => {
    given({
      allowed: true,
      mode: 'last',
      last: { kind: 'parked', lat: -34.9058, lon: -56.1913, accM: 12, observedAt: iso(2 * 3600_000) },
      spots: [],
    })
    render(<CarLocationCard />)
    expect(await screen.findByText(/Estacionado · hace 2 h/)).toBeTruthy()
    expect(screen.getByText(/precisión ~12 m/)).toBeTruthy()
    expect(await screen.findByTestId('map')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-34.9058,-56.1913'
    )
    expect(screen.queryByText(/Estacionamientos de los últimos 7 días/)).toBeNull()
    expect(screen.getByText(/Se guarda solo la última ubicación\./)).toBeTruthy()
  })

  it('mode spots: the list of parking spots and the map gets them', async () => {
    given({
      allowed: true,
      mode: 'spots',
      last: { kind: 'driving', lat: -34.9, lon: -56.19, accM: null, observedAt: iso(4 * 60_000) },
      spots: [
        { lat: -34.91, lon: -56.18, accM: 10, observedAt: iso(26 * 3600_000) },
        { lat: -34.92, lon: -56.17, accM: 10, observedAt: iso(50 * 3600_000) },
      ],
    })
    render(<CarLocationCard />)
    expect(await screen.findByText(/En viaje · hace 4 min/)).toBeTruthy()
    // collapsed by default, with the count
    const summary = screen.getByText(/Estacionamientos de los últimos 7 días \(2\)/)
    expect(summary.closest('details')?.open).toBe(false)
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(2)
    // a row picks that parking on the map
    fireEvent.click(summary)
    const rows = screen.getAllByRole('button', { hidden: true, pressed: false })
    fireEvent.click(rows[0])
    await waitFor(() => expect(screen.getByTestId('map').dataset.selected).toBeTruthy())
    expect(rows[0].getAttribute('aria-pressed')).toBe('true')
    expect((await screen.findByTestId('map')).dataset.spots).toBe('2')
    expect(screen.getByText(/y los estacionamientos de 7 días/)).toBeTruthy()
  })
})
