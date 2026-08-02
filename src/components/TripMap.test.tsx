import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TripMap from './TripMap'
import type { ChargingStation, TripLog } from '../types'

const { fetchChargingStationsMock, useUserPrefsMock, fetchRouteMock } = vi.hoisted(() => ({
  fetchChargingStationsMock: vi.fn(),
  useUserPrefsMock: vi.fn(),
  fetchRouteMock: vi.fn(),
}))

vi.mock('../lib/communityData', () => ({
  fetchChargingStations: fetchChargingStationsMock,
}))
vi.mock('../context/UserPrefsContext', () => ({
  useUserPrefs: useUserPrefsMock,
}))
vi.mock('../lib/osrmRouting', () => ({
  fetchRoute: fetchRouteMock,
}))

// react-leaflet needs a real DOM layout (container size, tile loading) that
// jsdom doesn't provide; TripMap's own logic (which points render, the
// unresolved-stop note, the empty state) is what these tests cover, so the
// map primitives are replaced with simple, inspectable stand-ins.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="polyline" data-positions={JSON.stringify(positions)} />
  ),
}))

function makeTrip(overrides: Partial<TripLog> = {}): TripLog {
  return {
    id: 't-1',
    user_id: 'u-1',
    vehicle_id: null,
    title: 'Montevideo a Rocha',
    origin: 'Montevideo',
    destination: 'Rocha',
    trip_date: '2026-07-01',
    distance_km: 200,
    average_speed_kmh: null,
    starting_charge_percentage: null,
    ending_charge_percentage: null,
    charging_stops: [],
    rating: null,
    notes: null,
    model: null,
    is_public: true,
    hidden: false,
    verified: false,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function polylinePositions(): [number, number][] {
  return JSON.parse(screen.getByTestId('polyline').getAttribute('data-positions')!) as [number, number][]
}

function makeStation(overrides: Partial<ChargingStation> = {}): ChargingStation {
  return {
    id: 's-1',
    user_id: 'u-1',
    name: 'Estación',
    network: 'ANCAP',
    city: null,
    address: null,
    connector: 'CCS2',
    current_type: 'DC',
    max_power_kw: null,
    access_notes: null,
    lat: -34.5,
    lng: -55.5,
    ocm_id: null,
    ocm_last_synced_at: null,
    verified: false,
    hidden: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('TripMap', () => {
  beforeEach(() => {
    useUserPrefsMock.mockReset().mockReturnValue({ effectiveTheme: 'light' })
    fetchChargingStationsMock.mockReset().mockResolvedValue({ stations: [], error: null })
    // Defaults to "no road route available" so existing assertions see the
    // straight-line fallback unless a test opts into a resolved route.
    fetchRouteMock.mockReset().mockResolvedValue(null)
  })

  it('renders nothing when closed', () => {
    render(<TripMap trip={makeTrip()} open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows one marker per resolvable point (origin + destination)', async () => {
    render(<TripMap trip={makeTrip()} open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByTestId('marker')).toHaveLength(2))
  })

  it('adds a marker for a charging stop linked to a located station', async () => {
    fetchChargingStationsMock.mockResolvedValue({
      stations: [makeStation({ id: 's-1', lat: -34.6, lng: -55.6 })],
      error: null,
    })
    const trip = makeTrip({ charging_stops: [{ name: 'ANCAP Ruta 8', station_id: 's-1' }] })
    render(<TripMap trip={trip} open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByTestId('marker')).toHaveLength(3))
    expect(screen.queryByText(/sin ubicación registrada/)).toBeNull()
  })

  it('labels points with emoji instead of formal "Origen:"/"Destino:" text', async () => {
    render(<TripMap trip={makeTrip()} open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByTestId('marker')).toHaveLength(2))
    expect(screen.getByText(/🟢 Montevideo/)).toBeTruthy()
    expect(screen.getByText(/🔵 Rocha/)).toBeTruthy()
    expect(screen.queryByText(/Origen/)).toBeNull()
    expect(screen.queryByText(/Destino/)).toBeNull()
  })

  it("shows the charging duration in a charge stop's popup when the stop recorded it", async () => {
    fetchChargingStationsMock.mockResolvedValue({
      stations: [makeStation({ id: 's-1', lat: -34.6, lng: -55.6 })],
      error: null,
    })
    const trip = makeTrip({
      charging_stops: [{ name: 'ANCAP Ruta 8', station_id: 's-1', duration_minutes: 28 }],
    })
    render(<TripMap trip={trip} open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/🟠 ANCAP Ruta 8/)).toBeTruthy())
    expect(screen.getByText('⏱️ 28 min de carga')).toBeTruthy()
  })

  it('omits the duration line when the stop did not record a charging time', async () => {
    fetchChargingStationsMock.mockResolvedValue({
      stations: [makeStation({ id: 's-1', lat: -34.6, lng: -55.6 })],
      error: null,
    })
    const trip = makeTrip({ charging_stops: [{ name: 'ANCAP Ruta 8', station_id: 's-1' }] })
    render(<TripMap trip={trip} open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/🟠 ANCAP Ruta 8/)).toBeTruthy())
    expect(screen.queryByText(/min de carga/)).toBeNull()
  })

  it('discloses charging stops that could not be placed on the map', async () => {
    const trip = makeTrip({
      charging_stops: [{ name: 'Sin estación vinculada' }, { name: 'Otra sin ubicación' }],
    })
    render(<TripMap trip={trip} open onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByTestId('marker')).toHaveLength(2))
    expect(screen.getByText('2 paradas sin ubicación registrada')).toBeTruthy()
  })

  it('shows the empty state when nothing on the trip resolves', async () => {
    const trip = makeTrip({ origin: 'Buenos Aires', destination: 'São Paulo' })
    render(<TripMap trip={trip} open onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText('No pudimos ubicar este viaje en el mapa todavía.')).toBeTruthy()
    )
    expect(screen.queryByTestId('map-container')).toBeNull()
  })

  it('draws no line while the road route is loading, then the road route once it resolves', async () => {
    let resolveRoute!: (route: [number, number][] | null) => void
    fetchRouteMock.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveRoute = resolve
      })
    )

    render(<TripMap trip={makeTrip()} open onClose={vi.fn()} />)
    await waitFor(() => expect(fetchRouteMock).toHaveBeenCalled())
    expect(screen.queryByTestId('polyline')).toBeNull()

    const roadRoute: [number, number][] = [
      [-34.9011, -56.1645],
      [-34.7, -55.9],
      [-34.4833, -54.3333],
    ]
    resolveRoute(roadRoute)

    await waitFor(() => expect(polylinePositions()).toEqual(roadRoute))
  })

  it('draws no line until the road route request fails, then falls back to the straight line', async () => {
    let resolveRoute!: (route: [number, number][] | null) => void
    fetchRouteMock.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveRoute = resolve
      })
    )

    render(<TripMap trip={makeTrip()} open onClose={vi.fn()} />)
    await waitFor(() => expect(fetchRouteMock).toHaveBeenCalled())
    expect(screen.queryByTestId('polyline')).toBeNull()

    resolveRoute(null)

    await waitFor(() => expect(polylinePositions()).toHaveLength(2)) // straight-line fallback: origin + destination
  })
})
