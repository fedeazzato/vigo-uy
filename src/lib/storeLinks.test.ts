import { describe, it, expect } from 'vitest'
import { suggestTitleFromStoreUrl } from './storeLinks'

describe('suggestTitleFromStoreUrl', () => {
  describe('MercadoLibre', () => {
    it('extracts and cleans the slug from a real listing URL', () => {
      expect(
        suggestTitleFromStoreUrl(
          'https://articulo.mercadolibre.com.uy/MLU-637941467-carlinkit-carplayadaptador-inalambrico-30-apple-carplay-_JM'
        )
      ).toBe('Carlinkit carplayadaptador inalambrico 30 apple carplay')
    })

    it('works without the trailing -_XX suffix', () => {
      expect(
        suggestTitleFromStoreUrl('https://articulo.mercadolibre.com.uy/MLU-123456-cubiertas-215-60-r17')
      ).toBe('Cubiertas 215 60 r17')
    })

    it('handles other MercadoLibre site codes', () => {
      expect(
        suggestTitleFromStoreUrl('https://articulo.mercadolibre.com.ar/MLA-987654-alfombras-de-goma')
      ).toBe('Alfombras de goma')
    })
  })

  describe('Amazon', () => {
    it('extracts the slug before /dp/<ASIN>', () => {
      expect(
        suggestTitleFromStoreUrl(
          'https://www.amazon.com/Anker-PowerCore-Portable-Charger-Battery/dp/B0B8N4TPRW/ref=sr_1_3'
        )
      ).toBe('Anker PowerCore Portable Charger Battery')
    })

    it('extracts the slug before /gp/product/<ASIN>', () => {
      expect(
        suggestTitleFromStoreUrl('https://www.amazon.co.uk/rubber-floor-mats-set/gp/product/B01N5IB20Q')
      ).toBe('Rubber floor mats set')
    })

    it('returns null for a bare /dp/<ASIN> share link with no slug', () => {
      expect(suggestTitleFromStoreUrl('https://www.amazon.com/dp/B08N5WRWNW')).toBeNull()
    })
  })

  describe('Temu', () => {
    it('extracts the slug before -g-<id>.html', () => {
      expect(suggestTitleFromStoreUrl('https://www.temu.com/usb-c-fast-charger-30w-g-601234567890.html')).toBe(
        'Usb c fast charger 30w'
      )
    })
  })

  describe('AliExpress', () => {
    it('returns null for the common slugless /item/<id>.html form', () => {
      expect(suggestTitleFromStoreUrl('https://www.aliexpress.com/item/1005006104729202.html')).toBeNull()
    })

    it('extracts the slug from the slugged /item/<slug>/<id>.html form', () => {
      expect(
        suggestTitleFromStoreUrl('https://www.aliexpress.com/item/wireless-charging-pad-15w/1005006104729202.html')
      ).toBe('Wireless charging pad 15w')
    })
  })

  it('returns null for non-recognized store URLs', () => {
    expect(suggestTitleFromStoreUrl('https://www.somerandomstore.com/dp/12345')).toBeNull()
  })

  it('returns null for malformed input instead of throwing', () => {
    expect(suggestTitleFromStoreUrl('')).toBeNull()
    expect(suggestTitleFromStoreUrl('not a url')).toBeNull()
  })

  it('rejects lookalike domains that merely contain a store name', () => {
    expect(suggestTitleFromStoreUrl('https://amazon.evil.com/some-item/dp/B08N5WRWNW')).toBeNull()
    expect(suggestTitleFromStoreUrl('https://mercadolibre.evil.com/MLU-123456-cubiertas')).toBeNull()
  })
})
