import { describe, it, expect } from 'vitest'
import { matchCities, normalizeCityCasing } from './cities'

describe('matchCities', () => {
  it('matches case-insensitively', () => {
    expect(matchCities('monte')).toEqual(['Montevideo'])
  })

  it('matches accent-insensitively', () => {
    expect(matchCities('ombues')).toEqual(['Ombúes de Lavalle'])
  })

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(matchCities('')).toEqual([])
    expect(matchCities('   ')).toEqual([])
  })

  it('caps results at the given limit', () => {
    // "a" matches dozens of entries; default limit is 6.
    expect(matchCities('a').length).toBe(6)
    expect(matchCities('a', 3).length).toBe(3)
  })
})

describe('normalizeCityCasing', () => {
  it('snaps a lowercase match to the canonical casing', () => {
    expect(normalizeCityCasing('montevideo')).toBe('Montevideo')
    expect(normalizeCityCasing('MONTEVIDEO')).toBe('Montevideo')
  })

  it('snaps an accent-insensitive match to the canonical casing', () => {
    expect(normalizeCityCasing('ombues de lavalle')).toBe('Ombúes de Lavalle')
  })

  it('leaves an already-canonical value unchanged', () => {
    expect(normalizeCityCasing('Punta del Este')).toBe('Punta del Este')
  })

  it('title-cases free text with no match in the list, lowercasing Spanish connectors', () => {
    expect(normalizeCityCasing('buenos aires')).toBe('Buenos Aires')
    expect(normalizeCityCasing('villa de las flores')).toBe('Villa de las Flores')
  })

  it('returns an empty string unchanged', () => {
    expect(normalizeCityCasing('')).toBe('')
    expect(normalizeCityCasing('   ')).toBe('')
  })
})
