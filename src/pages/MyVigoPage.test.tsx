import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import type { Profile } from '../types'
import MyVigoPage from './MyVigoPage'

// Mutable holder so each test can vary the signed-in profile. supabase is
// null in tests, so the page's vehicle/top-trips fetches are skipped.
const auth = vi.hoisted(() => ({
  current: {},
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth.current,
}))

function makeProfile(displayName: string): Profile {
  return {
    id: 'user-1',
    display_name: displayName,
    city: null,
    model: null,
    color: null,
    is_moderator: false,
    banned_at: null,
    created_at: '2026-07-01T00:00:00Z',
  }
}

function renderSignedIn(displayName: string) {
  auth.current = {
    user: { id: 'user-1', email: 'ana@example.com' },
    profile: makeProfile(displayName),
    status: 'signedIn',
    refreshProfile: vi.fn(),
  }
  // MemoryRouter because the page links to other routes.
  return render(
    <MemoryRouter>
      <UserPrefsProvider>
        <MyVigoPage />
      </UserPrefsProvider>
    </MemoryRouter>
  )
}

describe('MyVigoPage placeholder-name prompt (A2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('prompts users still carrying the assigned "Miembro NNNN" name', () => {
    renderSignedIn('Miembro 0421')
    expect(screen.getByText(/Elegí cómo querés aparecer en la comunidad/)).toBeTruthy()
    expect(screen.getByText('Miembro 0421')).toBeTruthy()
  })

  it('does not prompt users with a custom name', () => {
    renderSignedIn('Ana')
    expect(screen.queryByText(/Elegí cómo querés aparecer en la comunidad/)).toBeNull()
  })

  it('does not treat similar but non-placeholder names as placeholders', () => {
    renderSignedIn('Miembro 42')
    expect(screen.queryByText(/Elegí cómo querés aparecer en la comunidad/)).toBeNull()
  })

  it('can be dismissed', () => {
    renderSignedIn('Miembro 0421')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    expect(screen.queryByText(/Elegí cómo querés aparecer en la comunidad/)).toBeNull()
  })
})

describe('MyVigoPage Bóveda card (specs/secret-vault.md)', () => {
  it('links signed-in members to the vault', () => {
    renderSignedIn('Ana')
    const link = screen.getByRole('link', { name: 'Abrir la bóveda' })
    expect(link.getAttribute('href')).toBe('/mi-vigo/boveda')
  })
})

describe('MyVigoPage "Preparar mi Vigo" card (specs/prepare-my-vigo.md R5)', () => {
  it('links signed-in owners to the preparation page', () => {
    renderSignedIn('Ana')
    expect(screen.getByRole('link', { name: 'Preparar mi Vigo' }).getAttribute('href')).toBe(
      '/mi-vigo/preparar'
    )
  })
})

describe('MyVigoPage grouping (specs/site-audit-2026-11.md)', () => {
  it('shows the car sections in order, and no empty "Más detalles" when there is nothing to show', () => {
    const { container } = renderSignedIn('Ana')
    const text = container.textContent ?? ''
    const order = ['Tu auto', 'Datos y estadísticas', 'Configuración y service', 'Tu cuenta']
    const positions = order.map((label) => text.indexOf(label))
    positions.forEach((p) => expect(p).toBeGreaterThan(-1))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    // no diagnostics for this user: the collapsible "Más detalles" section must not appear at all (owner 2026-11-24)
    expect(text).not.toMatch(/Más detalles/)
  })
})

describe('MyVigoPage «Qué agrega el instalador» button (beta testers and moderators only)', () => {
  it('is shown to a moderator', () => {
    renderSignedIn('Ana')
    expect(screen.queryByRole('link', { name: 'Qué agrega el instalador' })).toBeNull()
    auth.current = { ...auth.current, profile: { ...makeProfile('Ana'), is_moderator: true } }
    render(
      <MemoryRouter>
        <UserPrefsProvider>
          <MyVigoPage />
        </UserPrefsProvider>
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'Qué agrega el instalador' }).getAttribute('href')).toBe(
      '/mi-vigo/preparar/que-agrega'
    )
  })
})
