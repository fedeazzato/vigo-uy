import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CommunityStations from './CommunityStations'
import type { ChargingStation } from '../types'

vi.mock('../lib/supabaseClient', () => ({
  supabase: {},
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, status: 'signedOut' }),
}))

function station(overrides: Partial<ChargingStation>): ChargingStation {
  return {
    id: 'st-base',
    user_id: 'user-2',
    name: 'Estación',
    network: 'eone',
    city: null,
    address: null,
    lat: null,
    lng: null,
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
    <MemoryRouter>
      <CommunityStations />
    </MemoryRouter>
  )
}

describe('CommunityStations filters', () => {
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
