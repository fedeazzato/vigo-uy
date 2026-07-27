import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AccessoriesPage from './AccessoriesPage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ status: 'signedIn' }),
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
