import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AccessoriesPage from './AccessoriesPage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ status: 'signedIn' }),
}))

// PurchaseCommunitySection's CTA card only renders when `supabase` is
// truthy. Locally `.env.local` (gitignored) makes the real client truthy,
// but CI has no such file, so `supabase` is null there -- mock it
// explicitly so this test doesn't depend on ambient env vars that differ
// between machines (this is what made it pass locally and fail in CI).
vi.mock('../lib/supabaseClient', () => ({
  supabase: {},
}))

vi.mock('../lib/communityData', () => ({
  useCommunityContent: () => ({
    purchases: [],
    names: {},
    error: null,
  }),
  usePurchaseSection: () => ({
    priceStats: [],
    recentPurchases: [],
  }),
}))

describe('AccessoriesPage', () => {
  it('shows a dedicated CTA to register an accessory purchase', () => {
    render(
      <MemoryRouter>
        <AccessoriesPage />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /registrar accesorio/i })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/repuestos/nuevo')
  })
})
