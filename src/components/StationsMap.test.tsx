import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StationsMap from './StationsMap'
import type { ChargingStation } from '../types'

const { useUserPrefsMock } = vi.hoisted(() => ({
  useUserPrefsMock: vi.fn(),
}))

vi.mock('../context/UserPrefsContext', () => ({
  useUserPrefs: useUserPrefsMock,
}))

// Same rationale as TripMap.test.tsx: react-leaflet needs real DOM layout
// jsdom doesn't provide, so the map primitives are replaced with simple,
// inspectable stand-ins and this file only asserts StationsMap's own logic
// (which stations get a marker, the empty state, popup content).
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
}))

function makeStation(overrides: Partial<ChargingStation> = {}): ChargingStation {
  return {
    id: 's-1',
    user_id: 'u-1',
    name: 'Estación',
    network: 'ute',
    city: 'Rocha',
    address: null,
    lat: -34.48,
    lng: -54.33,
    connector: 'CCS2',
    current_type: 'DC',
    max_power_kw: 60,
    access_notes: null,
    ocm_id: null,
    ocm_last_synced_at: null,
    verified: false,
    hidden: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('StationsMap', () => {
  beforeEach(() => {
    useUserPrefsMock.mockReset().mockReturnValue({ effectiveTheme: 'light' })
  })

  it('renders nothing when closed', () => {
    render(<StationsMap stations={[makeStation()]} open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders one marker per station', () => {
    const stations = [
      makeStation({ id: 's-1', name: 'UTE Rocha' }),
      makeStation({ id: 's-2', name: 'ANCAP Chuy', lat: -33.7, lng: -53.46 }),
    ]
    render(<StationsMap stations={stations} open onClose={vi.fn()} />)
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
    expect(screen.getByText('UTE Rocha')).toBeTruthy()
    expect(screen.getByText('ANCAP Chuy')).toBeTruthy()
  })

  it('shows the empty state when there are no stations to place', () => {
    render(<StationsMap stations={[]} open onClose={vi.fn()} />)
    expect(screen.getByText('No hay estaciones para mostrar con los filtros actuales.')).toBeTruthy()
    expect(screen.queryByTestId('map-container')).toBeNull()
  })

  it('uses the station name as the modal title when showing a single station', () => {
    render(<StationsMap stations={[makeStation({ name: 'UTE Rocha centro' })]} open onClose={vi.fn()} />)
    // Header title and popup content both show the name -- confirms the
    // title is the station's own name, not the generic "(1)" count.
    expect(screen.getAllByText('UTE Rocha centro')).toHaveLength(2)
    expect(screen.queryByText(/Estaciones de carga/)).toBeNull()
  })

  it('shows a verified badge in the popup for verified stations only', () => {
    const stations = [
      makeStation({ id: 's-1', name: 'UTE Rocha', verified: true }),
      makeStation({ id: 's-2', name: 'ANCAP Chuy', verified: false, lat: -33.7, lng: -53.46 }),
    ]
    render(<StationsMap stations={stations} open onClose={vi.fn()} />)
    expect(screen.getByText('Oficial')).toBeTruthy()
  })
})
