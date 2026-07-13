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
  pickCostStat,
  preferCommunity,
  reliabilityLevel,
  verifiedFirst,
} from './communityData'
import type { ChargingCostStat, StationReliability } from '../types'

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

describe('pickCostStat', () => {
  const stationStat: ChargingCostStat = {
    network: 'ute',
    station_id: 'st-1',
    avg_cost_per_kwh: 12.5,
    sample_count: 4,
  }
  const networkStat: ChargingCostStat = {
    network: 'ute',
    station_id: null,
    avg_cost_per_kwh: 11.2,
    sample_count: 9,
  }

  it('prefers the station-level average when it has enough samples', () => {
    expect(pickCostStat([networkStat, stationStat], 'ute', 'st-1')).toBe(stationStat)
  })

  it('falls back to the network rollup below the station sample floor', () => {
    const thinStation = { ...stationStat, sample_count: 2 }
    expect(pickCostStat([networkStat, thinStation], 'ute', 'st-1')).toBe(networkStat)
  })

  it('returns null when neither level reaches the floor', () => {
    const thin = [
      { ...stationStat, sample_count: 1 },
      { ...networkStat, sample_count: 2 },
    ]
    expect(pickCostStat(thin, 'ute', 'st-1')).toBeNull()
  })

  it('never borrows another network’s rollup', () => {
    expect(pickCostStat([networkStat], 'eone', 'st-9')).toBeNull()
  })
})

describe('reliabilityLevel', () => {
  function rel(overrides: Partial<StationReliability>): StationReliability {
    return {
      station_id: 'st-1',
      report_count: 5,
      failure_count: 0,
      failure_ratio: 0,
      last_report_at: '2026-07-01T00:00:00Z',
      ...overrides,
    }
  }

  it('is unknown without reports or below three of them', () => {
    expect(reliabilityLevel(undefined)).toBe('unknown')
    expect(reliabilityLevel(rel({ report_count: 2, failure_ratio: 1 }))).toBe('unknown')
  })

  it('is flaky above 30% failures', () => {
    expect(reliabilityLevel(rel({ failure_ratio: 0.4, failure_count: 2 }))).toBe('flaky')
  })

  it('is ok at or below 30% failures', () => {
    expect(reliabilityLevel(rel({ failure_ratio: 0.3, failure_count: 1 }))).toBe('ok')
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
