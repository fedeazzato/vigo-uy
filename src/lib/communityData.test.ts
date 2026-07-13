import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { fromMock, selectMock } = vi.hoisted(() => {
  const selectMock = vi.fn()
  const fromMock = vi.fn(() => ({ select: selectMock }))
  return { fromMock, selectMock }
})

vi.mock('./supabaseClient', () => ({
  supabase: { from: fromMock },
}))

import {
  fetchLeaderboard,
  invalidateCommunityCache,
  preferCommunity,
  verifiedFirst,
} from './communityData'

describe('preferCommunity', () => {
  const curated = { anything: true }

  it('returns curated data tagged "grupo" below the threshold', () => {
    const result = preferCommunity({ curated, community: [1, 2, 3, 4], minSamples: 5 })
    expect(result).toEqual({ source: 'grupo', data: curated })
  })

  it('returns community data tagged "comunidad" at the threshold', () => {
    const community = [1, 2, 3, 4, 5]
    const result = preferCommunity({ curated, community, minSamples: 5 })
    expect(result).toEqual({ source: 'comunidad', data: community })
  })
})

describe('verifiedFirst', () => {
  it('moves verified rows first while preserving relative order', () => {
    const rows = [
      { id: 'a', verified: false },
      { id: 'b', verified: true },
      { id: 'c', verified: false },
      { id: 'd', verified: true },
    ]
    expect(verifiedFirst(rows).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('does not mutate its input', () => {
    const rows = [
      { id: 'a', verified: false },
      { id: 'b', verified: true },
    ]
    verifiedFirst(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('fetch cache (TTL memo)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invalidateCommunityCache()
    fromMock.mockClear()
    selectMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('serves a second call within the TTL from cache', async () => {
    selectMock.mockResolvedValue({ data: [], error: null })
    await fetchLeaderboard()
    await fetchLeaderboard()
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent in-flight calls', async () => {
    let resolve!: (v: { data: unknown[]; error: null }) => void
    selectMock.mockReturnValue(new Promise((r) => (resolve = r)))
    const first = fetchLeaderboard()
    const second = fetchLeaderboard()
    resolve({ data: [], error: null })
    await Promise.all([first, second])
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('refetches after the TTL expires', async () => {
    selectMock.mockResolvedValue({ data: [], error: null })
    await fetchLeaderboard()
    vi.advanceTimersByTime(61_000)
    await fetchLeaderboard()
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache failed results', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    selectMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const failed = await fetchLeaderboard()
    expect(failed.error).not.toBeNull()

    selectMock.mockResolvedValue({ data: [], error: null })
    const retried = await fetchLeaderboard()
    expect(retried.error).toBeNull()
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('invalidateCommunityCache forces the next call to refetch', async () => {
    selectMock.mockResolvedValue({ data: [], error: null })
    await fetchLeaderboard()
    invalidateCommunityCache()
    await fetchLeaderboard()
    expect(fromMock).toHaveBeenCalledTimes(2)
  })
})
