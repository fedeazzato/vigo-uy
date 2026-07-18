import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UserPrefsProvider } from '../context/UserPrefsContext'
import type { Profile } from '../types'
import MyVigoPage from './MyVigoPage'

// Mutable holder so each test can vary the signed-in profile. supabase is
// null in tests, so the page's vehicle/top-trips fetches are skipped.
const auth = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
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
  // MemoryRouter because the page header links to /mi-actividad.
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
