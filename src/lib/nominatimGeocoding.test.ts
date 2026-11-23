import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodeCity, searchPlaces } from './nominatimGeocoding'

describe('geocodeCity', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null without calling fetch for a blank name', async () => {
    const result = await geocodeCity('   ')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests Nominatim with the trimmed query and a Southern Cone bias, returning the first result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-34.8248489', lon: '-55.9707288' }],
    })

    const result = await geocodeCity('  Solymar  ')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = fetchMock.mock.calls[0][0] as string
    expect(requestedUrl).toContain('nominatim.openstreetmap.org/search')
    expect(requestedUrl).toContain('q=Solymar')
    expect(requestedUrl).toContain('bounded=0')
    expect(result).toEqual({ lat: -34.8248489, lng: -55.9707288 })
  })

  it('returns null when no result comes back', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
    const result = await geocodeCity('Nonexistent Place Xyz')
    expect(result).toBeNull()
  })

  it('returns null on a non-ok HTTP response', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const result = await geocodeCity('Torres')
    expect(result).toBeNull()
  })

  it('returns null on a network error instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await geocodeCity('Torres')
    expect(result).toBeNull()
  })
})

describe('searchPlaces', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('needs at least 3 characters', async () => {
    expect(await searchPlaces('ab')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps results to label + detail and skips bad coordinates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: '-34.906',
          lon: '-56.199',
          display_name: 'Plaza Independencia, Ciudad Vieja, Montevideo',
          name: '',
        },
        { lat: 'x', lon: '1', display_name: 'Bad' },
      ],
    })
    expect(await searchPlaces('plaza independencia')).toEqual([
      {
        lat: -34.906,
        lon: -56.199,
        label: 'Plaza Independencia',
        detail: 'Plaza Independencia, Ciudad Vieja, Montevideo',
      },
    ])
    expect(fetchMock.mock.calls[0][0]).toContain('limit=5')
  })

  it('a failure is an empty list', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await searchPlaces('montevideo')).toEqual([])
  })
})
