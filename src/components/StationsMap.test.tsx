import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import StationsMap from './StationsMap'
import type { ChargingStation } from '../types'

const { useUserPrefsMock, mapStub, view } = vi.hoisted(() => {
  const view = { south: -32.4, west: -58.4, north: -32.1, east: -58.1 }
  return {
    useUserPrefsMock: vi.fn(),
    view,
    mapStub: {
      fitBounds: vi.fn(),
      setView: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getBounds: () => ({
        getSouth: () => view.south,
        getWest: () => view.west,
        getNorth: () => view.north,
        getEast: () => view.east,
      }),
      attributionControl: { addAttribution: vi.fn(), removeAttribution: vi.fn() },
    },
  }
})

vi.mock('../context/UserPrefsContext', () => ({
  useUserPrefs: useUserPrefsMock,
}))

// Same rationale as TripMap.test.tsx: react-leaflet needs real DOM layout
// jsdom doesn't provide, so the map primitives are replaced with simple,
// inspectable stand-ins and this file only asserts StationsMap's own logic
// (which stations get a marker, the empty state, popup content).
// The OpenFreeMap base layer needs WebGL (MapLibre), which jsdom lacks: stand it in with a marker element.
vi.mock('./BaseMap', () => ({
  BaseMap: ({ theme }: { theme: string }) => <div data-testid="base-map" data-theme={theme} />,
}))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => mapStub,
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

// ---------------------------------------------------------------- Open Charge Map layer

const OCM_ANSWER = {
  ok: true,
  complete: true,
  retry_after: null,
  attribution: 'Datos de Open Charge Map (CC BY 4.0)',
  stations: [
    {
      id: 700001,
      name: 'YPF Colón',
      operator: 'YPF',
      lat: -32.22,
      lng: -58.14,
      address: null,
      town: 'Colón',
      country: 'AR',
      status: 'out_of_service',
      restricted: true,
      usage_cost: 'ARS 450/kWh',
      verified_at: '2026-10-01T10:00:00Z',
      connectors: [{ type: 'ccs2', type_id: 33, kw: 120, qty: 2, current: 'DC' }],
      max_kw: 120,
      url: 'javascript:alert(1)',
    },
    // ~40 m from the WikiVigo station below: the same place, not drawn twice.
    {
      id: 700002,
      name: 'Duplicado',
      operator: null,
      lat: -32.2603,
      lng: -58.1003,
      address: null,
      town: null,
      country: 'AR',
      status: 'operational',
      restricted: false,
      usage_cost: null,
      verified_at: null,
      connectors: [],
      max_kw: null,
    },
    {
      id: 700003,
      name: 'Retirada',
      operator: null,
      lat: -32.3,
      lng: -58.2,
      address: null,
      town: null,
      country: 'AR',
      status: 'removed',
      restricted: false,
      usage_cost: null,
      verified_at: null,
      connectors: [],
      max_kw: null,
    },
  ],
}

describe('StationsMap with the Open Charge Map layer', () => {
  const wiki = makeStation({ id: 'w-1', name: 'Estación WikiVigo', lat: -32.26, lng: -58.1 })
  let fetchMock: Mock<(url: string) => Promise<Response>>

  beforeEach(() => {
    useUserPrefsMock.mockReset().mockReturnValue({ effectiveTheme: 'light' })
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
    Object.assign(view, { south: -32.4, west: -58.4, north: -32.1, east: -58.1 })
    mapStub.attributionControl.addAttribution.mockClear()
    fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(OCM_ANSWER), { status: 200 }))
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('asks nothing of Open Charge Map without the ocm prop', () => {
    render(<StationsMap stations={[wiki]} open onClose={vi.fn()} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/Open Charge Map/)).toBeNull()
  })

  it('draws the OCM stations of the view with their badge, details, link and credit', async () => {
    render(<StationsMap stations={[wiki]} open onClose={vi.fn()} ocm={{ connectiontypeid: [33] }} />)
    expect(await screen.findByText('YPF Colón')).toBeTruthy()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe('/functions/v1/ocm-stations')
    expect(url.searchParams.get('bbox')).toBe('-32.5,-58.5,-32,-58')
    expect(url.searchParams.get('connectiontypeid')).toBe('33')

    // WikiVigo marker + one OCM marker (the duplicate and the removed one are hidden).
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
    expect(screen.queryByText('Duplicado')).toBeNull()
    expect(screen.queryByText('Retirada')).toBeNull()
    expect(screen.getAllByText('Open Charge Map').length).toBeGreaterThan(0)
    expect(screen.getByText('YPF · Colón · AR')).toBeTruthy()
    expect(screen.getByText('CCS2 ×2 (120 kW)')).toBeTruthy()
    expect(screen.getByText('Fuera de servicio')).toBeTruthy()
    expect(screen.getByText('Acceso restringido')).toBeTruthy()
    expect(screen.getByText('Costo: ARS 450/kWh')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Ver en Open Charge Map' })
    expect(link.getAttribute('href')).toBe('https://openchargemap.org/site/poi/details/700001')
    expect(link.getAttribute('rel')).toContain('noopener')

    expect(await screen.findByText('1 estación de Open Charge Map en esta zona.')).toBeTruthy()
    expect(screen.getByText('Datos de Open Charge Map (CC BY 4.0)')).toBeTruthy()
    await waitFor(() => expect(mapStub.attributionControl.addAttribution).toHaveBeenCalled())
    expect(String(mapStub.attributionControl.addAttribution.mock.calls[0][0])).toContain(
      'Datos de Open Charge Map (CC BY 4.0)'
    )
    expect(mapStub.on).toHaveBeenCalledWith('moveend', expect.any(Function))
  })

  it('asks to zoom in instead of requesting a view wider than 20 tiles', async () => {
    Object.assign(view, { south: -35, west: -58.5, north: -30, east: -53 })
    render(<StationsMap stations={[wiki]} open onClose={vi.fn()} ocm={{}} />)
    expect(
      await screen.findByText(/Acercá el mapa para ver también los cargadores de Open Charge Map/)
    ).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the error of a failed request in Spanish', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), { status: 429 }))
    )
    render(<StationsMap stations={[wiki]} open onClose={vi.fn()} ocm={{}} />)
    expect(
      await screen.findByText('Demasiadas consultas a Open Charge Map. Probá de nuevo en unos minutos.')
    ).toBeTruthy()
    expect(screen.getAllByTestId('marker')).toHaveLength(1)
  })

  it('stays off when Supabase is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    render(<StationsMap stations={[wiki]} open onClose={vi.fn()} ocm={{}} />)
    await waitFor(() => expect(screen.queryByText(/Buscando estaciones/)).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
