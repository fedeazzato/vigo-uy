import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StationPickerModal from './StationPickerModal'
import type { ChargingStation, ChargingNetwork } from '../types'

const { useUserPrefsMock } = vi.hoisted(() => ({
  useUserPrefsMock: vi.fn(),
}))

vi.mock('../context/UserPrefsContext', () => ({
  useUserPrefs: useUserPrefsMock,
}))

// Same rationale as StationsMap.test.tsx / LocationPicker.test.tsx:
// react-leaflet needs real DOM layout jsdom doesn't provide, so the map
// primitives are replaced with simple, inspectable stand-ins.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
}))

function station(overrides: Partial<ChargingStation>): ChargingStation {
  return {
    id: 'st-base',
    user_id: 'user-2',
    name: 'Estación',
    network: 'eone',
    city: null,
    address: null,
    lat: -34.9011,
    lng: -56.1645,
    connector: 'CCS2',
    current_type: 'DC',
    max_power_kw: null,
    access_notes: null,
    hidden: false,
    verified: false,
    ocm_id: null,
    ocm_last_synced_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

const NETWORKS: ChargingNetwork[] = [
  { slug: 'eone', name: 'EONE', country: 'UY', instructions: null, sort_order: 11, created_at: '2026-07-01T00:00:00Z' },
  { slug: 'dmc', name: 'DMC', country: 'UY', instructions: null, sort_order: 12, created_at: '2026-07-01T00:00:00Z' },
]

const STATIONS = [
  station({ id: 'st-1', name: 'EONE Rocha centro', network: 'eone', city: 'Rocha', lat: -34.483, lng: -54.334 }),
  station({ id: 'st-2', name: 'EONE Montevideo', network: 'eone', city: 'Montevideo', lat: -34.9011, lng: -56.1645 }),
  station({ id: 'st-3', name: 'DMC Rocha ruta 9', network: 'dmc', city: 'Rocha', lat: -34.5, lng: -54.3 }),
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof StationPickerModal>> = {}) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <StationPickerModal
      open
      onClose={onClose}
      stations={STATIONS}
      networks={NETWORKS}
      onSelect={onSelect}
      {...overrides}
    />
  )
  return { onSelect, onClose, ...utils }
}

describe('StationPickerModal', () => {
  beforeEach(() => {
    useUserPrefsMock.mockReset().mockReturnValue({ effectiveTheme: 'light' })
  })

  it('renders nothing when closed', () => {
    renderPicker({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists every station by default', () => {
    renderPicker()
    expect(screen.getByText('EONE Rocha centro')).toBeTruthy()
    expect(screen.getByText('EONE Montevideo')).toBeTruthy()
    expect(screen.getByText('DMC Rocha ruta 9')).toBeTruthy()
  })

  it('narrows the list by network', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('🌐 Red'), { target: { value: 'dmc' } })
    expect(screen.queryByText('EONE Rocha centro')).toBeNull()
    expect(screen.getByText('DMC Rocha ruta 9')).toBeTruthy()
  })

  it('narrows the list by city (accent/case-insensitive)', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('📍 Ciudad'), { target: { value: 'montevideo' } })
    expect(screen.getByText('EONE Montevideo')).toBeTruthy()
    expect(screen.queryByText('EONE Rocha centro')).toBeNull()
    expect(screen.queryByText('DMC Rocha ruta 9')).toBeNull()
  })

  it('shows the empty-filter message when nothing matches', () => {
    renderPicker()
    fireEvent.change(screen.getByLabelText('📍 Ciudad'), { target: { value: 'Nowhereland' } })
    expect(screen.getByText('No hay estaciones que coincidan con el filtro.')).toBeTruthy()
  })

  it('selecting a station from the list calls onSelect and onClose', () => {
    const { onSelect, onClose } = renderPicker()
    fireEvent.click(screen.getByText('DMC Rocha ruta 9'))
    expect(onSelect).toHaveBeenCalledWith(STATIONS[2])
    expect(onClose).toHaveBeenCalled()
  })

  describe('map view', () => {
    it('renders one marker per filtered station', () => {
      renderPicker()
      fireEvent.click(screen.getByRole('button', { name: '🗺️ Mapa' }))
      expect(screen.getAllByTestId('marker')).toHaveLength(3)
    })

    it('picking a marker\'s "Elegir esta estación" button calls onSelect and onClose', () => {
      const { onSelect, onClose } = renderPicker()
      fireEvent.click(screen.getByRole('button', { name: '🗺️ Mapa' }))
      // No geolocation set: entries are alphabetical, so the first pick
      // button belongs to "DMC Rocha ruta 9" (STATIONS[2]).
      const pickButtons = screen.getAllByText('✅ Elegir esta estación')
      fireEvent.click(pickButtons[0])
      expect(onSelect).toHaveBeenCalledWith(STATIONS[2])
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('"Cerca mío"', () => {
    const getCurrentPositionMock = vi.fn()

    beforeEach(() => {
      getCurrentPositionMock.mockReset()
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: getCurrentPositionMock },
        configurable: true,
      })
    })

    it('sorts the list nearest-first and shows a distance chip on success', () => {
      // Right on top of st-2 (Montevideo): it should jump to the top.
      getCurrentPositionMock.mockImplementation((success: (pos: unknown) => void) => {
        success({ coords: { latitude: -34.9011, longitude: -56.1645 } })
      })
      const { container } = renderPicker()

      fireEvent.click(screen.getByText('📍 Cerca mío'))

      const names = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '')
      expect(names[0]).toContain('EONE Montevideo')
      expect(names[0]).toContain('km')
    })

    it('shows an inline message and leaves the list as-is on failure', () => {
      getCurrentPositionMock.mockImplementation(
        (_success: (pos: unknown) => void, error: (err: unknown) => void) => {
          error({ code: 1 })
        }
      )
      renderPicker()

      fireEvent.click(screen.getByText('📍 Cerca mío'))

      expect(screen.getByText('No pudimos acceder a tu ubicación. Probá buscar por red o ciudad.')).toBeTruthy()
      expect(screen.getByText('EONE Rocha centro')).toBeTruthy()
      expect(screen.queryByText(/km/)).toBeNull()
    })
  })
})
