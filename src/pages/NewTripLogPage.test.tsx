import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import NewTripLogPage from './NewTripLogPage'

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
