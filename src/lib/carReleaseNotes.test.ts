import { describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]): unknown => rpc(...a) as unknown } }))

import { appName, fetchGithubNotes, fetchReleaseNotes, releaseTag } from './carReleaseNotes'

describe('carReleaseNotes', () => {
  it('names our apps, keeps unknown packages', () => {
    expect(appName('com.vigo.carga')).toBe('Carga')
    expect(appName('org.x')).toBe('org.x')
  })

  it('reads the GitHub notes by tag; empty when GitHub refuses or fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { tag_name: 'r5', body: '## Qué cambia', draft: false },
          { tag_name: 'r6', body: 'borrador', draft: true },
          { tag_name: 'r4', body: '  ' },
          { tag_name: 7 },
        ]),
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchGithubNotes()).toEqual({ [releaseTag(5)]: '## Qué cambia' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/repos/fedeazzato/vigo-releases/releases')
    fetchMock.mockResolvedValueOnce({ ok: false })
    expect(await fetchGithubNotes()).toEqual({})
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchGithubNotes()).toEqual({})
    vi.unstubAllGlobals()
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
