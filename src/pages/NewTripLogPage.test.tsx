import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import NewTripLogPage, { parseStopDrafts, tripTitle, StopDraft } from './NewTripLogPage'
import { createChargingStation } from '../lib/communityData'
import type { ChargingStation } from '../types'

// All data access goes through the mocked communityData layer below, so the
// tests run identically with or without VITE_SUPABASE_* env (CI has none).
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: null, status: 'signedIn' }),
}))

// One known network + station so the stop's charger selector renders.
vi.mock('../lib/communityData', () => ({
  invalidateCommunityCache: vi.fn(),
  createChargingStation: vi.fn(),
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
          lat: -34.8895,
          lng: -54.9337,
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

// LocationPicker's own click/drag/geolocation behavior is covered by its
// own test file; here it's stubbed to a single button so tests can set a
// location without mounting a real Leaflet map.
vi.mock('../components/LocationPicker', () => ({
  default: ({ onChange }: { value: unknown; onChange: (next: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: -34.0489, lng: -53.5406 })}>
      Marcar ubicación (test)
    </button>
  ),
}))

// StationPickerModal's own filtering/map/"cerca mío" behavior is covered by
// its own test file; here it's stubbed to a plain list of buttons so these
// tests only assert which station NewTripLogPage links when one is picked.
vi.mock('../components/StationPickerModal', () => ({
  default: ({
    open,
    stations,
    onSelect,
    onClose,
  }: {
    open: boolean
    stations: ChargingStation[]
    onSelect: (station: ChargingStation) => void
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="station-picker">
        {stations.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onSelect(s)
              onClose()
            }}
          >
            {s.name}
          </button>
        ))}
        <button type="button" onClick={onClose}>
          Cerrar buscador (test)
        </button>
      </div>
    ) : null,
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

  it('opens the charger picker, links a station, and only shows the free-text name when unlinked', async () => {
    renderNewTrip()
    goToShareStep()
    fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
    fireEvent.click(screen.getByText('+ Agregar parada'))

    // Picker trigger present (stations mocked), name visible while nothing picked.
    const openPicker = await screen.findByText('🔎 Buscar cargador…')
    expect(screen.getByPlaceholderText('Nombre del cargador')).toBeTruthy()

    // Picking a listed charger hides the free-text name and shows a chip.
    fireEvent.click(openPicker)
    fireEvent.click(screen.getByText('EONE Punta Shopping'))
    expect(screen.queryByPlaceholderText('Nombre del cargador')).toBeNull()
    expect(screen.getByText(/EONE Punta Shopping/)).toBeTruthy()

    // "Quitar cargador" unlinks it: the name input returns, empty.
    fireEvent.click(screen.getByText('Quitar cargador'))
    const nameInput = screen.getByPlaceholderText<HTMLInputElement>('Nombre del cargador')
    expect(nameInput.value).toBe('')
  })

  it('reopens the picker via "Cambiar" once a station is already linked', async () => {
    renderNewTrip()
    goToShareStep()
    fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
    fireEvent.click(screen.getByText('+ Agregar parada'))

    fireEvent.click(await screen.findByText('🔎 Buscar cargador…'))
    fireEvent.click(screen.getByText('EONE Punta Shopping'))

    fireEvent.click(screen.getByText('Cambiar'))
    expect(screen.getByTestId('station-picker')).toBeTruthy()
  })

  describe('linking a free-text charger to a real station', () => {
    beforeEach(() => {
      vi.mocked(createChargingStation).mockReset()
    })

    it('only offers to add a station once a free-text name is typed, and hides once one is picked', async () => {
      renderNewTrip()
      goToShareStep()
      fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
      fireEvent.click(screen.getByText('+ Agregar parada'))
      await screen.findByText('🔎 Buscar cargador…')

      // No name yet: no invitation to formalize a station.
      expect(screen.queryByText(/Agregar esta parada como estación/)).toBeNull()

      fireEvent.change(screen.getByPlaceholderText('Nombre del cargador'), {
        target: { value: 'Terminal Punta del Diablo' },
      })
      expect(screen.getByText(/Agregar esta parada como estación/)).toBeTruthy()

      // Picking a listed station instead removes the free-text name and the offer.
      fireEvent.click(screen.getByText('🔎 Buscar cargador…'))
      fireEvent.click(screen.getByText('EONE Punta Shopping'))
      expect(screen.queryByText(/Agregar esta parada como estación/)).toBeNull()
    })

    it('creates and links the station from the inline form', async () => {
      vi.mocked(createChargingStation).mockResolvedValue({
        station: {
          id: 'st-new',
          user_id: 'user-1',
          name: 'Terminal Punta del Diablo',
          network: 'eone',
          city: 'Rocha',
          address: null,
          lat: -34.0489,
          lng: -53.5406,
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
        },
        error: null,
      })

      renderNewTrip()
      goToShareStep()
      fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
      fireEvent.click(screen.getByText('+ Agregar parada'))
      await screen.findByText('🔎 Buscar cargador…')

      fireEvent.change(screen.getByPlaceholderText('Nombre del cargador'), {
        target: { value: 'Terminal Punta del Diablo' },
      })
      fireEvent.click(screen.getByText(/Agregar esta parada como estación/))
      fireEvent.click(screen.getByText('Marcar ubicación (test)'))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar estación' }))

      await waitFor(() =>
        expect(createChargingStation).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            name: 'Terminal Punta del Diablo',
            network: 'eone',
            connector: 'CCS2',
            currentType: 'DC',
            lat: -34.0489,
            lng: -53.5406,
          })
        )
      )

      // Linked: the free-text name input is gone, same as picking from the dropdown.
      await waitFor(() => expect(screen.queryByPlaceholderText('Nombre del cargador')).toBeNull())
    })

    it('blocks submission until a location is set on the map', async () => {
      renderNewTrip()
      goToShareStep()
      fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
      fireEvent.click(screen.getByText('+ Agregar parada'))
      await screen.findByText('🔎 Buscar cargador…')

      fireEvent.change(screen.getByPlaceholderText('Nombre del cargador'), {
        target: { value: 'Terminal Punta del Diablo' },
      })
      fireEvent.click(screen.getByText(/Agregar esta parada como estación/))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar estación' }))

      expect(await screen.findByText('Marcá la ubicación de la estación en el mapa.')).toBeTruthy()
      expect(createChargingStation).not.toHaveBeenCalled()
    })

    it('shows an error and keeps the stop unlinked when creation fails', async () => {
      vi.mocked(createChargingStation).mockResolvedValue({ station: null, error: 'No se pudo agregar.' })

      renderNewTrip()
      goToShareStep()
      fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
      fireEvent.click(screen.getByText('+ Agregar parada'))
      await screen.findByText('🔎 Buscar cargador…')

      fireEvent.change(screen.getByPlaceholderText('Nombre del cargador'), {
        target: { value: 'Terminal Punta del Diablo' },
      })
      fireEvent.click(screen.getByText(/Agregar esta parada como estación/))
      fireEvent.click(screen.getByText('Marcar ubicación (test)'))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar estación' }))

      expect(await screen.findByText('No se pudo agregar.')).toBeTruthy()
      expect(screen.getByPlaceholderText('Nombre del cargador')).toBeTruthy()
    })
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

describe('tripTitle', () => {
  it('joins origin and destination with an arrow', () => {
    expect(tripTitle('Montevideo', 'Punta del Este')).toBe('Montevideo → Punta del Este')
  })

  it('trims whitespace from both ends', () => {
    expect(tripTitle('  Montevideo  ', '  Rocha ')).toBe('Montevideo → Rocha')
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

  it('silently skips a genuinely blank stop (never touched)', () => {
    const result = parseStopDrafts([draft({ name: '' })])
    expect(result).toEqual({ stops: [] })
  })

  it('errors instead of silently dropping a stop that has data but no name/station', () => {
    // This is the exact bug report: filling in duration/cost without
    // naming the stop or picking a charger used to lose the data with no
    // warning at all.
    const result = parseStopDrafts([draft({ name: '', durationMinutes: '35', cost: '450' })])
    expect(result).toEqual({ error: 'Ponele un nombre a la parada 1 o elegí un cargador de la lista.' })
  })

  it('uses the 1-based stop index in the missing-name error', () => {
    const result = parseStopDrafts([draft({}), draft({ name: '', note: 'sin nombre' })])
    expect(result).toEqual({ error: 'Ponele un nombre a la parada 2 o elegí un cargador de la lista.' })
  })

  it('keeps a stop with only a linked station and no free-text name', () => {
    const result = parseStopDrafts([draft({ name: '', stationId: 'st-1' })])
    expect(result).toEqual({ stops: [{ name: '', station_id: 'st-1' }] })
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
