// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import Layout from './Layout'

const auth = vi.hoisted(() => ({ moderator: false }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@example.com' }, profile: { is_moderator: auth.moderator }, status: 'signedIn', signOut: () => {} }),
}))
vi.mock('../context/UserPrefsContext', async (original) => ({
  ...(await original<typeof import('../context/UserPrefsContext')>()),
  useUserPrefs: () => ({ model: null, color: null, effectiveTheme: 'light', setTheme: () => {} }),
}))
vi.mock('../lib/notifications', () => ({ useUnreadNotifications: () => 0 }))
vi.mock('./SiteSearch', () => ({ default: () => null }))
vi.mock('./OfflineBanner', () => ({ default: () => null }))

afterEach(cleanup)

const show = () =>
  render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  )

describe('Layout', () => {
  it('gives a moderator a Moderación button in the phone header (and the sidebar link)', () => {
    auth.moderator = true
    show()
    const links = screen.getAllByRole('link', { name: 'Moderación' })
    expect(links).toHaveLength(2)
    expect(links.every((l) => l.getAttribute('href') === '/moderacion')).toBe(true)
  })

  it('shows nobody else a moderation link', () => {
    auth.moderator = false
    show()
    expect(screen.queryByRole('link', { name: 'Moderación' })).toBeNull()
  })

  it('has no suggestion form any more', () => {
    const { container } = show()
    expect(container.querySelector('a[href*="forms.gle"]')).toBeNull()
    expect(screen.queryByText('Sugerir info')).toBeNull()
  })
})
