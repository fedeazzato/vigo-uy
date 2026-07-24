import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SiteSearch from './SiteSearch'
import type { CommunitySearchResult, CuratedSearchResult } from '../types'

const { searchCuratedContentMock, searchCommunityContentMock } = vi.hoisted(() => ({
  searchCuratedContentMock: vi.fn(),
  searchCommunityContentMock: vi.fn(),
}))

vi.mock('../lib/siteSearch', () => ({
  searchCuratedContent: searchCuratedContentMock,
}))
vi.mock('../lib/communityData', () => ({
  searchCommunityContent: searchCommunityContentMock,
}))

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSearch(open = true) {
  const onClose = vi.fn()
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<SiteSearch open={open} onClose={onClose} />} />
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  )
  return { onClose }
}

async function typeAndDebounce(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/Buscar páginas/), { target: { value: text } })
  await act(async () => {
    vi.advanceTimersByTime(300)
    // Flush the microtask queue so the resolved searchCommunityContent
    // promise's .then() runs before assertions.
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('SiteSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchCuratedContentMock.mockReset().mockReturnValue([])
    searchCommunityContentMock.mockReset().mockResolvedValue({ results: [], error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when closed', () => {
    renderSearch(false)
    expect(screen.queryByPlaceholderText(/Buscar páginas/)).toBeNull()
  })

  it('prompts to type before any query has been entered', () => {
    renderSearch(true)
    expect(screen.getByText('Escribí para buscar en toda la wiki.')).toBeTruthy()
  })

  it('debounces input before searching', async () => {
    renderSearch(true)
    fireEvent.change(screen.getByPlaceholderText(/Buscar páginas/), { target: { value: 'carga' } })
    expect(searchCommunityContentMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(searchCommunityContentMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(searchCommunityContentMock).toHaveBeenCalledWith('carga')
  })

  it('shows grouped Guía and Comunidad results', async () => {
    const curated: CuratedSearchResult[] = [{ path: '/carga', title: 'Carga en casa' }]
    const community: CommunitySearchResult[] = [
      {
        kind: 'trip_log',
        id: 't-1',
        title: 'Montevideo — Rocha',
        subtitle: 'Montevideo → Rocha',
        category: null,
        created_at: '2026-07-01T00:00:00Z',
        rank: 0.8,
      },
    ]
    searchCuratedContentMock.mockReturnValue(curated)
    searchCommunityContentMock.mockResolvedValue({ results: community, error: null })

    renderSearch(true)
    await typeAndDebounce('rocha')

    expect(screen.getByText('Guía')).toBeTruthy()
    expect(screen.getByText('Carga en casa')).toBeTruthy()
    // "Comunidad" appears twice: the group label and the result's badge.
    expect(screen.getAllByText('Comunidad').length).toBe(2)
    expect(screen.getByText('Montevideo — Rocha')).toBeTruthy()
  })

  it('shows the Spanish empty state when nothing matches', async () => {
    renderSearch(true)
    await typeAndDebounce('xyz-no-match')
    expect(screen.getByText('No encontramos nada para "xyz-no-match".')).toBeTruthy()
  })

  it('routes a service_entry result to /costos and closes', async () => {
    searchCommunityContentMock.mockResolvedValue({
      results: [
        {
          kind: 'service_entry',
          id: 's-1',
          title: 'Service general',
          subtitle: 'Taller X',
          category: null,
          created_at: '2026-07-01T00:00:00Z',
          rank: 0.5,
        },
      ] satisfies CommunitySearchResult[],
      error: null,
    })
    const { onClose } = renderSearch(true)
    await typeAndDebounce('service')

    fireEvent.click(screen.getByText('Service general'))
    expect(screen.getByTestId('location').textContent).toBe('/costos')
    expect(onClose).toHaveBeenCalled()
  })

  it('routes a part_purchase result to /repuestos or /accesorios by its real category', async () => {
    searchCommunityContentMock.mockResolvedValue({
      results: [
        {
          kind: 'part_purchase',
          id: 'p-1',
          title: 'Rueda auxiliar',
          subtitle: 'Panam',
          category: 'spare-wheel',
          created_at: '2026-07-01T00:00:00Z',
          rank: 0.5,
        },
      ] satisfies CommunitySearchResult[],
      error: null,
    })
    renderSearch(true)
    await typeAndDebounce('rueda')

    fireEvent.click(screen.getByText('Rueda auxiliar'))
    expect(screen.getByTestId('location').textContent).toBe('/accesorios')
  })

  it('closes on Escape', () => {
    const { onClose } = renderSearch(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
