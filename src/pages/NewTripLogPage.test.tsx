import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import NewTripLogPage, { parseStopDrafts, StopDraft } from './NewTripLogPage'

// All data access goes through the mocked communityData layer below, so the
// tests run identically with or without VITE_SUPABASE_* env (CI has none).
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: null, status: 'signedIn' }),
}))

// One known network + station so the stop's charger selector renders.
vi.mock('../lib/communityData', () => ({
  invalidateCommunityCache: vi.fn(),
  fetchChargingNetworks: () =>
    Promise.resolve({
      networks: [
        {
          slug: 'eone',
          name: 'EONE',
          country: 'UY',
          instructions: null,
          sort_order: 11,
          created_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    }),
  fetchChargingStations: () =>
    Promise.resolve({
      stations: [
        {
          id: 'st-1',
          user_id: 'user-2',
          name: 'EONE Punta Shopping',
          network: 'eone',
          city: 'Maldonado',
          address: null,
          lat: null,
          lng: null,
          connector: 'Tipo 2',
          current_type: 'DC',
          max_power_kw: 120,
          access_notes: null,
          hidden: false,
          verified: true,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    }),
}))

function renderNewTrip() {
  return render(
    <MemoryRouter initialEntries={['/viajes/nuevo']}>
      <UserPrefsProvider>
        <Routes>
          <Route path="/viajes/nuevo" element={<NewTripLogPage />} />
        </Routes>
      </UserPrefsProvider>
    </MemoryRouter>
  )
}

// The form is a wizard only on phone widths (useMediaQuery). jsdom has no
// real viewport, so stub matchMedia per describe block.
function mockViewport(mobile: boolean) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: mobile && query.includes('max-width: 700px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// Wizard helpers: fill the required basics and advance with the single
// primary button ("Siguiente" until the last step).
function fillBasics() {
  fireEvent.change(screen.getByLabelText('📍 Origen'), { target: { value: 'Montevideo' } })
  fireEvent.change(screen.getByLabelText('🏁 Destino'), { target: { value: 'Rocha' } })
  fireEvent.change(screen.getByLabelText('📏 Distancia (km)'), { target: { value: '210' } })
}

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
}

function goToShareStep() {
  fillBasics()
  clickNext() // -> paso 2 (¿Cómo estuvo?)
  clickNext() // -> paso 3 (Compartir)
}

describe('NewTripLogPage wizard (mobile)', () => {
  beforeEach(() => {
    localStorage.clear()
    mockViewport(true)
  })

  it('starts on "Lo básico" with only the basics on screen', () => {
    renderNewTrip()
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
    expect(screen.getByLabelText('📍 Origen')).toBeTruthy()
    expect(screen.getByLabelText('📏 Distancia (km)')).toBeTruthy()
    // No title field: it's derived from origin/destination on save.
    expect(screen.queryByLabelText(/Título/)).toBeNull()
    // Later-step fields are not mounted yet.
    expect(screen.queryByText('⭐ ¿Cómo estuvo el viaje?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'E2' })).toBeNull()
    expect(screen.queryByLabelText('🔋 Batería al salir (%)')).toBeNull()
  })

  it('validates the basics before advancing', () => {
    renderNewTrip()
    // Whitespace passes native required but not the trim check.
    fireEvent.change(screen.getByLabelText('📍 Origen'), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('🏁 Destino'), { target: { value: 'Rocha' } })
    fireEvent.change(screen.getByLabelText('📏 Distancia (km)'), { target: { value: '210' } })
    clickNext()
    expect(screen.getByText('Completá origen, destino y distancia.')).toBeTruthy()
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
  })

  it('rejects a non-numeric distance on step 1', () => {
    renderNewTrip()
    fillBasics()
    fireEvent.change(screen.getByLabelText('📏 Distancia (km)'), { target: { value: 'abc' } })
    clickNext()
    expect(screen.getByText('La distancia debe ser un número válido.')).toBeTruthy()
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
  })

  it('walks the three steps and keeps earlier answers when going back', () => {
    renderNewTrip()
    fillBasics()
    clickNext()
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy()
    expect(screen.getByText('⭐ ¿Cómo estuvo el viaje?')).toBeTruthy()
    clickNext()
    expect(screen.getByText('Paso 3 de 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar viaje' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }))
    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }))
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('📍 Origen').value).toBe('Montevideo')
  })

  it('hides the battery/charge details behind the disclosure on the share step', () => {
    renderNewTrip()
    goToShareStep()
    expect(screen.queryByLabelText('🔋 Batería al salir (%)')).toBeNull()
    expect(screen.queryByText('+ Agregar parada')).toBeNull()

    const toggle = screen.getByRole('button', { name: /Agregar detalles de batería y carga/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(screen.getByLabelText('🔋 Batería al salir (%)')).toBeTruthy()
    expect(screen.getByText('+ Agregar parada')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Ocultar detalles de batería y carga/ }))
    expect(screen.queryByLabelText('🔋 Batería al salir (%)')).toBeNull()
  })

  it('lets stops be added and removed inside the expanded section', () => {
    renderNewTrip()
    goToShareStep()
    fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
    fireEvent.click(screen.getByText('+ Agregar parada'))
    expect(screen.getByText('Parada 1')).toBeTruthy()
    fireEvent.click(screen.getByText('Quitar'))
    expect(screen.queryByText('Parada 1')).toBeNull()
  })

  it('puts the charger selector first and only shows the free-text name when unlisted', async () => {
    renderNewTrip()
    goToShareStep()
    fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
    fireEvent.click(screen.getByText('+ Agregar parada'))

    // Selector present (stations mocked), name visible while nothing picked.
    // Note: inputs with list= also have role combobox, hence the name filter.
    const selector = await screen.findByRole('combobox', { name: 'Cargador' })
    expect(screen.getByPlaceholderText('Nombre del cargador')).toBeTruthy()

    // Picking a listed charger hides the free-text name.
    fireEvent.change(selector, { target: { value: 'st-1' } })
    expect(screen.queryByPlaceholderText('Nombre del cargador')).toBeNull()

    // Back to "not listed": the name input returns, empty.
    fireEvent.change(selector, { target: { value: '' } })
    const nameInput = screen.getByPlaceholderText<HTMLInputElement>('Nombre del cargador')
    expect(nameInput.value).toBe('')
  })

  it('shows the model hint on the share step while public and no model is picked', () => {
    renderNewTrip()
    goToShareStep()
    // No preferred model in prefs, sharing on by default -> hint visible.
    expect(screen.getByText(/Elegí E2 o E2\+ para poder compartir/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'E2' }))
    expect(screen.queryByText(/Elegí E2 o E2\+ para poder compartir/)).toBeNull()
  })

  it('hides the model hint when sharing is off', () => {
    renderNewTrip()
    goToShareStep()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByText(/Elegí E2 o E2\+ para poder compartir/)).toBeNull()
  })
})

describe('NewTripLogPage single page (desktop)', () => {
  beforeEach(() => {
    localStorage.clear()
    mockViewport(false)
  })

  it('renders all sections at once with no wizard chrome', () => {
    renderNewTrip()
    // No step counter, one save button, back is "Volver".
    expect(screen.queryByText(/Paso 1 de 3/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Guardar viaje' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Volver/ })).toBeTruthy()
    // Fields from every wizard step are on screen together.
    expect(screen.getByLabelText('📍 Origen')).toBeTruthy()
    expect(screen.getByText('⭐ ¿Cómo estuvo el viaje?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'E2' })).toBeTruthy()
    // Battery details stay behind the inline disclosure.
    expect(screen.queryByLabelText('🔋 Batería al salir (%)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
    expect(screen.getByLabelText('🔋 Batería al salir (%)')).toBeTruthy()
  })

  it('validates the basics on direct submit', () => {
    renderNewTrip()
    fireEvent.change(screen.getByLabelText('📍 Origen'), { target: { value: '  ' } })
    fireEvent.change(screen.getByLabelText('🏁 Destino'), { target: { value: 'Rocha' } })
    fireEvent.change(screen.getByLabelText('📏 Distancia (km)'), { target: { value: '210' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar viaje' }))
    expect(screen.getByText('Completá origen, destino y distancia.')).toBeTruthy()
  })
})

describe('parseStopDrafts (charging_stops payload)', () => {
  function draft(overrides: Partial<StopDraft>): StopDraft {
    return {
      name: 'UTE Rocha',
      note: '',
      distanceFromPrevious: '',
      arrivalPercentage: '',
      departurePercentage: '',
      durationMinutes: '',
      averageSpeed: '',
      cost: '',
      energyKwh: '',
      stationId: '',
      ...overrides,
    }
  }

  it('skips stops without a name and keeps only entered fields', () => {
    const result = parseStopDrafts([draft({ name: '  ' }), draft({ durationMinutes: '35' })])
    expect(result).toEqual({ stops: [{ name: 'UTE Rocha', duration_minutes: 35 }] })
  })

  it('carries cost, energy and station link when provided (D4)', () => {
    const result = parseStopDrafts([draft({ cost: '450', energyKwh: '28.5', stationId: 'st-1' })])
    expect(result).toEqual({
      stops: [{ name: 'UTE Rocha', cost_uyu: 450, energy_kwh: 28.5, station_id: 'st-1' }],
    })
  })

  it('accepts comma decimals and dot thousands, the way people type here', () => {
    const result = parseStopDrafts([draft({ energyKwh: '28,5', cost: '1.450' })])
    expect(result).toEqual({
      stops: [{ name: 'UTE Rocha', cost_uyu: 1450, energy_kwh: 28.5 }],
    })
  })

  it('rejects garbage instead of silently dropping it', () => {
    expect(parseStopDrafts([draft({ durationMinutes: 'abc' })])).toEqual({
      error: 'Los minutos de carga deben ser un número válido.',
    })
  })

  it('omits cost/energy keys entirely when blank, so the stats view never sees them', () => {
    const result = parseStopDrafts([draft({})])
    if ('error' in result) throw new Error('unexpected error')
    expect('cost_uyu' in result.stops[0]).toBe(false)
    expect('energy_kwh' in result.stops[0]).toBe(false)
    expect('station_id' in result.stops[0]).toBe(false)
  })

  it('rejects invalid values in Spanish', () => {
    expect(parseStopDrafts([draft({ arrivalPercentage: '140' })])).toEqual({
      error: 'Los porcentajes de batería en las paradas deben estar entre 0 y 100.',
    })
    expect(parseStopDrafts([draft({ cost: '-5' })])).toEqual({
      error: 'El costo de la carga debe ser un número válido.',
    })
    expect(parseStopDrafts([draft({ energyKwh: '0' })])).toEqual({
      error: 'La energía cargada (kWh) debe ser mayor a cero.',
    })
  })
})
