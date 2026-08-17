import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadDraft, saveDraft, clearDraft } from './tripDraftStore'

interface Sample {
  origin: string
  count: number
}

describe('tripDraftStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips state through saveDraft/loadDraft', () => {
    saveDraft<Sample>({ origin: 'Montevideo', count: 2 })
    const loaded = loadDraft<Sample>()
    expect(loaded?.state).toEqual({ origin: 'Montevideo', count: 2 })
  })

  it('returns null when nothing is stored', () => {
    expect(loadDraft<Sample>()).toBeNull()
  })

  it('returns null instead of throwing on malformed JSON', () => {
    localStorage.setItem('vigo-trip-draft', '{not valid json')
    expect(loadDraft<Sample>()).toBeNull()
  })

  it('returns null on a version mismatch (old/incompatible shape)', () => {
    localStorage.setItem(
      'vigo-trip-draft',
      JSON.stringify({ version: 999, savedAt: new Date().toISOString(), state: { origin: 'x', count: 1 } })
    )
    expect(loadDraft<Sample>()).toBeNull()
  })

  it('clearDraft removes the key so a later loadDraft returns null', () => {
    saveDraft<Sample>({ origin: 'Rocha', count: 1 })
    clearDraft()
    expect(loadDraft<Sample>()).toBeNull()
  })

  it('saveDraft swallows a localStorage.setItem failure instead of throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveDraft<Sample>({ origin: 'Colonia', count: 3 })).not.toThrow()
    spy.mockRestore()
  })
})
