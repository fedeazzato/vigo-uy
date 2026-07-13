import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import NewTripLogPage, { parseStopDrafts, StopDraft } from './NewTripLogPage'

// supabase is null in tests (no VITE_SUPABASE_* env), so the page never
// fetches; we only exercise the form's client-side behavior.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: null, status: 'signedIn' }),
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

describe('NewTripLogPage progressive disclosure', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hides the battery/charge details behind the disclosure by default', () => {
    renderNewTrip()
    // Basics visible…
    expect(screen.getByLabelText('Título')).toBeTruthy()
    expect(screen.getByLabelText('Distancia (km, opcional)')).toBeTruthy()
    // …power-user fields collapsed.
    expect(screen.queryByLabelText('Batería al salir (%, opcional)')).toBeNull()
    expect(screen.queryByText('+ Agregar parada')).toBeNull()
  })

  it('expands and collapses via the toggle', () => {
    renderNewTrip()
    const toggle = screen.getByRole('button', { name: /Agregar detalles de batería y carga/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(screen.getByLabelText('Batería al salir (%, opcional)')).toBeTruthy()
    expect(screen.getByText('+ Agregar parada')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Ocultar detalles de batería y carga/ }))
    expect(screen.queryByLabelText('Batería al salir (%, opcional)')).toBeNull()
  })

  it('lets stops be added and removed inside the expanded section', () => {
    renderNewTrip()
    fireEvent.click(screen.getByRole('button', { name: /Agregar detalles de batería y carga/ }))
    fireEvent.click(screen.getByText('+ Agregar parada'))
    expect(screen.getByText('Parada 1')).toBeTruthy()
    fireEvent.click(screen.getByText('Quitar'))
    expect(screen.queryByText('Parada 1')).toBeNull()
  })

  it('shows the model hint before submit while public and no model is picked', () => {
    renderNewTrip()
    // No preferred model in prefs, sharing on by default -> hint visible.
    expect(screen.getByText(/Elegí E2 o E2\+ para poder compartir/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'E2' }))
    expect(screen.queryByText(/Elegí E2 o E2\+ para poder compartir/)).toBeNull()
  })

  it('hides the model hint when sharing is off', () => {
    renderNewTrip()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByText(/Elegí E2 o E2\+ para poder compartir/)).toBeNull()
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
    const result = parseStopDrafts([
      draft({ cost: '450', energyKwh: '28.5', stationId: 'st-1' }),
    ])
    expect(result).toEqual({
      stops: [{ name: 'UTE Rocha', cost_uyu: 450, energy_kwh: 28.5, station_id: 'st-1' }],
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
