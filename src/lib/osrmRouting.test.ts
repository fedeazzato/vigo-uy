import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRoute } from './osrmRouting'

describe('fetchRoute', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null without calling fetch when fewer than 2 points are given', async () => {
    const result = await fetchRoute([[-34.9, -56.1]])
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests OSRM with lng,lat order and returns the route as lat,lng pairs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [-56.1645, -34.9011],
                [-56.0, -34.95],
                [-54.3333, -34.4833],
              ],
            },
          },
        ],
      }),
    })

    const result = await fetchRoute([
      [-34.9011, -56.1645],
      [-34.4833, -54.3333],
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/route/v1/driving/-56.1645,-34.9011;-54.3333,-34.4833')
    )
    expect(result).toEqual([
      [-34.9011, -56.1645],
      [-34.95, -56.0],
      [-34.4833, -54.3333],
    ])
  })

  it('returns null when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const result = await fetchRoute([
      [-34.9, -56.1],
      [-34.4, -54.3],
    ])
    expect(result).toBeNull()
  })

  it('returns null when OSRM reports no route (e.g. code: NoRoute)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) })
    const result = await fetchRoute([
      [-34.9, -56.1],
      [-34.4, -54.3],
    ])
    expect(result).toBeNull()
  })

  it('returns null on a network error instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await fetchRoute([
      [-34.9, -56.1],
      [-34.4, -54.3],
    ])
    expect(result).toBeNull()
  })
})
