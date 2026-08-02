import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CommunityStations from './CommunityStations'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import { createChargingStation } from '../lib/communityData'
import type { ChargingStation } from '../types'

vi.mock('../lib/supabaseClient', () => ({
  supabase: {},
}))

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }))
vi.mock('../context/AuthContext', () => ({
  useAuth: useAuthMock,
}))

// LocationPicker's own click/drag/geolocation behavior is covered by its own
// test file; here it's stubbed to a button so tests can set a location
// without mounting a real Leaflet map.
vi.mock('./LocationPicker', () => ({
  default: ({ onChange }: { value: unknown; onChange: (next: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: -34.0489, lng: -53.5406 })}>
      Marcar ubicación (test)
    </button>
  ),
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
    verified: true,
    ocm_id: null,
    ocm_last_synced_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

const STATIONS = [
  station({ id: 'st-1', name: 'Axion Carrasco', network: 'eone', city: 'Rocha', connector: 'CCS2', max_power_kw: 180 }),
  station({
    id: 'st-2',
    name: 'Axion Prado',
    network: 'eone',
    city: 'Montevideo',
    connector: 'Tipo 2',
    current_type: 'AC',
    max_power_kw: 22,
  }),
  station({ id: 'st-3', name: 'Estación Mercedes', network: 'dmc', city: 'Rocha', connector: 'CCS2', max_power_kw: 60 }),
]

vi.mock('../lib/communityData', () => ({
  invalidateCommunityCache: vi.fn(),
  createChargingStation: vi.fn(),
  fetchChargingNetworks: () =>
    Promise.resolve({
      networks: [
        { slug: 'eone', name: 'EONE', country: 'UY', instructions: null, sort_order: 11, created_at: '2026-07-01T00:00:00Z' },
        { slug: 'dmc', name: 'DMC', country: 'UY', instructions: null, sort_order: 12, created_at: '2026-07-01T00:00:00Z' },
      ],
      error: null,
    }),
  fetchChargingStations: () => Promise.resolve({ stations: STATIONS, error: null }),
  fetchChargingCostStats: () => Promise.resolve({ stats: [], error: null }),
  fetchStationReliability: () => Promise.resolve({ rows: [], error: null }),
  pickCostStat: () => undefined,
  reliabilityLevel: () => 'unknown',
}))

function renderStations() {
  return render(
    <UserPrefsProvider>
      <MemoryRouter>
        <CommunityStations />
      </MemoryRouter>
    </UserPrefsProvider>
  )
}

describe('CommunityStations filters', () => {
  beforeEach(() => {
    useAuthMock.mockReset().mockReturnValue({ user: null, profile: null, status: 'signedOut' })
  })

  it('renders all stations grouped under their network by default', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')
    expect(screen.getByText('Axion Prado')).toBeTruthy()
    expect(screen.getByText('Estación Mercedes')).toBeTruthy()
    // "EONE"/"DMC" also appear as <option>s in the filter select, so assert
    // at least one match (the Card heading) rather than a single element.
    expect(screen.getAllByText('EONE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DMC').length).toBeGreaterThan(0)
  })

  it('filtering by provider hides other networks', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByLabelText('🌐 Red'), {
      target: { value: 'dmc' },
    })

    expect(screen.getByText('Estación Mercedes')).toBeTruthy()
    expect(screen.queryByText('Axion Carrasco')).toBeNull()
    expect(screen.queryByText('Axion Prado')).toBeNull()
  })

  it('filtering by city is case- and accent-insensitive and narrows across networks', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByPlaceholderText('Rocha'), {
      target: { value: 'rocha' },
    })

    expect(screen.getByText('Axion Carrasco')).toBeTruthy()
    expect(screen.getByText('Estación Mercedes')).toBeTruthy()
    expect(screen.queryByText('Axion Prado')).toBeNull()
  })

  it('combines provider and city filters', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByLabelText('🌐 Red'), {
      target: { value: 'eone' },
    })
    fireEvent.change(screen.getByPlaceholderText('Rocha'), {
      target: { value: 'Rocha' },
    })

    expect(screen.getByText('Axion Carrasco')).toBeTruthy()
    expect(screen.queryByText('Axion Prado')).toBeNull()
    expect(screen.queryByText('Estación Mercedes')).toBeNull()
  })

  it('filtering by connector narrows to matching stations only', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByLabelText('🔌 Conector'), {
      target: { value: 'Tipo 2' },
    })

    expect(screen.getByText('Axion Prado')).toBeTruthy()
    expect(screen.queryByText('Axion Carrasco')).toBeNull()
    expect(screen.queryByText('Estación Mercedes')).toBeNull()
  })

  it('filtering by minimum power excludes stations below the threshold', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByLabelText('⚡ Potencia mínima'), {
      target: { value: '60' },
    })

    expect(screen.getByText('Axion Carrasco')).toBeTruthy() // 180 kW
    expect(screen.getByText('Estación Mercedes')).toBeTruthy() // 60 kW
    expect(screen.queryByText('Axion Prado')).toBeNull() // 22 kW, below threshold
  })

  it('shows an empty-state alert when filters match nothing, and "Limpiar filtros" resets all four filters', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByLabelText('🌐 Red'), { target: { value: 'eone' } })
    fireEvent.change(screen.getByPlaceholderText('Rocha'), { target: { value: 'Salto' } })

    await screen.findByText('No hay estaciones que coincidan con el filtro.')
    expect(screen.queryByText('Axion Carrasco')).toBeNull()

    const clearBtn = screen.getByText('Limpiar filtros')
    fireEvent.click(clearBtn)

    await waitFor(() => expect(screen.getByText('Axion Carrasco')).toBeTruthy())
    expect(screen.queryByText('Limpiar filtros')).toBeNull()
    // The provider filter ('eone') was active too — clearing it should bring
    // the dmc station back, confirming all filters reset, not just the city.
    expect(screen.getByText('Estación Mercedes')).toBeTruthy()
  })
})

// StationsMap itself (which stations get a pin, popups, tiles) is covered
// by its own test file; here it's stubbed so these tests only assert which
// stations CommunityStations hands it.
vi.mock('./StationsMap', () => ({
  default: ({ stations, open }: { stations: ChargingStation[]; open: boolean }) =>
    open ? <div data-testid="stations-map">{stations.map((s) => s.name).join(', ')}</div> : null,
}))

describe('CommunityStations map + add-station form', () => {
  beforeEach(() => {
    useAuthMock.mockReset().mockReturnValue({ user: { id: 'user-1' }, profile: null, status: 'signedIn' })
    vi.mocked(createChargingStation).mockReset()
  })

  it('"Ver en mapa" opens the stations map with only the currently filtered stations', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.change(screen.getByLabelText('🌐 Red'), { target: { value: 'dmc' } })
    fireEvent.click(screen.getByText('🗺️ Ver en mapa'))

    expect(screen.getByTestId('stations-map').textContent).toBe('Estación Mercedes')
  })

  it('blocks submitting the add-station form until a location is set', async () => {
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.click(screen.getByText('+ Agregar estación'))
    fireEvent.change(screen.getByLabelText('📝 Nombre / ubicación'), {
      target: { value: 'Nueva estación' },
    })
    fireEvent.click(screen.getByText('Guardar estación'))

    expect(await screen.findByText('Marcá la ubicación de la estación en el mapa.')).toBeTruthy()
    expect(createChargingStation).not.toHaveBeenCalled()
  })

  it('submits the chosen lat/lng when adding a station', async () => {
    vi.mocked(createChargingStation).mockResolvedValue({
      station: station({ id: 'st-new', name: 'Nueva estación' }),
      error: null,
    })
    renderStations()
    await screen.findByText('Axion Carrasco')

    fireEvent.click(screen.getByText('+ Agregar estación'))
    fireEvent.change(screen.getByLabelText('📝 Nombre / ubicación'), {
      target: { value: 'Nueva estación' },
    })
    fireEvent.click(screen.getByText('Marcar ubicación (test)'))
    fireEvent.click(screen.getByText('Guardar estación'))

    await waitFor(() =>
      expect(createChargingStation).toHaveBeenCalledWith(
        expect.objectContaining({ lat: -34.0489, lng: -53.5406 })
      )
    )
  })
})
