import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TripMap from './TripMap'
import type { ChargingStation, TripLog } from '../types'

const { fetchChargingStationsMock, useUserPrefsMock } = vi.hoisted(() => ({
  fetchChargingStationsMock: vi.fn(),
  useUserPrefsMock: vi.fn(),
}))

vi.mock('../lib/communityData', () => ({
  fetchChargingStations: fetchChargingStationsMock,
}))
vi.mock('../context/UserPrefsContext', () => ({
  useUserPrefs: useUserPrefsMock,
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
  Polyline: () => <div data-testid="polyline" />,
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
})
