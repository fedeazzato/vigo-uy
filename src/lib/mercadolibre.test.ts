import { describe, it, expect } from 'vitest'
import { suggestTitleFromMercadoLibreUrl } from './mercadolibre'

describe('suggestTitleFromMercadoLibreUrl', () => {
  it('extracts and cleans the slug from a real listing URL', () => {
    expect(
      suggestTitleFromMercadoLibreUrl(
        'https://articulo.mercadolibre.com.uy/MLU-637941467-carlinkit-carplayadaptador-inalambrico-30-apple-carplay-_JM'
      )
    ).toBe('Carlinkit carplayadaptador inalambrico 30 apple carplay')
  })

  it('works without the trailing -_XX suffix', () => {
    expect(suggestTitleFromMercadoLibreUrl('https://articulo.mercadolibre.com.uy/MLU-123456-cubiertas-215-60-r17')).toBe(
      'Cubiertas 215 60 r17'
    )
  })

  it('handles other MercadoLibre site codes', () => {
    expect(suggestTitleFromMercadoLibreUrl('https://articulo.mercadolibre.com.ar/MLA-987654-alfombras-de-goma')).toBe(
      'Alfombras de goma'
    )
  })

  it('returns null for non-MercadoLibre URLs', () => {
    expect(suggestTitleFromMercadoLibreUrl('https://www.amazon.com/dp/B08X')).toBeNull()
  })

  it('returns null for malformed input instead of throwing', () => {
    expect(suggestTitleFromMercadoLibreUrl('')).toBeNull()
    expect(suggestTitleFromMercadoLibreUrl('not a url')).toBeNull()
  })

  it('returns null for a MercadoLibre URL with no recognizable slug', () => {
    expect(suggestTitleFromMercadoLibreUrl('https://www.mercadolibre.com.uy/')).toBeNull()
  })
})
