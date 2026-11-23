import { describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]): unknown => rpc(...a) as unknown } }))

import { appName, fetchReleaseNotes } from './carReleaseNotes'

describe('carReleaseNotes', () => {
  it('names our apps, keeps unknown packages', () => {
    expect(appName('com.vigo.carga')).toBe('Carga')
    expect(appName('org.x')).toBe('org.x')
  })

  it('null before the migration; drops malformed rows', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'missing' } })
    expect(await fetchReleaseNotes()).toBeNull()
    rpc.mockResolvedValueOnce({
      data: [
        { serial: 3, published_at: '2026-11-23T00:00:00Z', note: 'x', apps: [], notices: [] },
        { serial: 'bad' },
      ],
      error: null,
    })
    const r = await fetchReleaseNotes()
    expect(r).toHaveLength(1)
    expect(rpc).toHaveBeenLastCalledWith('car_release_notes', { p_limit: 30 })
  })
})
