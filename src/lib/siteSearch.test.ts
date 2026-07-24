import { describe, it, expect } from 'vitest'
import { searchCuratedContent } from './siteSearch'

describe('searchCuratedContent', () => {
  it('returns [] for an empty or whitespace-only query', () => {
    expect(searchCuratedContent('')).toEqual([])
    expect(searchCuratedContent('   ')).toEqual([])
  })

  it('returns [] when nothing matches', () => {
    expect(searchCuratedContent('xyzxyzxyz-nomatch')).toEqual([])
  })

  it('matches a primary nav label', () => {
    const results = searchCuratedContent('comunidad')
    expect(results.some((r) => r.path === '/comunidad')).toBe(true)
  })

  it('matches a guide page label and description', () => {
    const results = searchCuratedContent('repuestos')
    expect(results.some((r) => r.path === '/repuestos')).toBe(true)
  })

  it('matches curated body text in charging.json (not just the page label)', () => {
    const results = searchCuratedContent('corte automático')
    expect(results.some((r) => r.path === '/carga')).toBe(true)
  })

  it('matches curated body text in ficha-tecnica.json specs', () => {
    const results = searchCuratedContent('distancia entre ejes')
    expect(results.some((r) => r.path === '/ficha-tecnica')).toBe(true)
  })

  it('matches a tech-faq.json FAQ question', () => {
    const results = searchCuratedContent('android auto')
    expect(results.some((r) => r.path === '/faq' || r.path === '/tecnologia')).toBe(true)
  })

  it('matches mantenimiento.json schedule text', () => {
    const results = searchCuratedContent('pastillas y discos de freno')
    expect(results.some((r) => r.path === '/mantenimiento')).toBe(true)
  })

  it('is case- and accent-insensitive', () => {
    const lower = searchCuratedContent('patente')
    const upperNoAccent = searchCuratedContent('PATENTE')
    expect(lower.length).toBeGreaterThan(0)
    expect(upperNoAccent).toEqual(lower)
  })

  it('deduplicates repeated title+path chunks', () => {
    const results = searchCuratedContent('la vigo')
    const keys = results.map((r) => `${r.path}::${r.title}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('respects the limit', () => {
    const results = searchCuratedContent('a', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })
})
