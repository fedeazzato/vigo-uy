import { describe, it, expect } from 'vitest'
import { suggestImageFromStoreUrl, suggestStoreFromUrl, suggestTitleFromStoreUrl } from './storeLinks'

// A real Alibaba mobile "share" link (reported directly) -- a different URL
// shape from the plain /product-detail/<slug>-<id>.html page: no slug in
// the path, but the product name and a direct CDN image URL are already
// there as query params.
const ALIBABA_SHARE_URL =
  'https://www.alibaba.com/share/product-detail.html?from=share&ckvia=share_a82509bd14c84e149bca422f0337a367&productId=1601902641033&name=Conjunto+de+Espejo+Retrovisor+Lateral+para+Dongfeng+Nammi+06+Vigo+EV%2C+Espejo+Retrovisor+Exterior+Completo%2C+Encaje+Preciso+Plug%26Play&alibabaGuaranteed=false&price=%24%C2%A04.021%2C02-%C2%A05.428%2C38&imageUrl=https%3A%2F%2Fs.alicdn.com%2F%40sc04%2Fkf%2FH3e5b8c23d34e4d43bd81d4909cb818c5k.jpg_720x720Q50.jpg&moq=Orden+min%3A+2+unidades&companyInfo=2+a%C3%B1os+%C2%B7+CN+%C2%B7+Chongqing+Nio+Auto+Parts+Co.%2C+Ltd.&verified=false&shortKey=B2HgNQ&language=es'

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

  describe('Alibaba', () => {
    it('extracts the slug from /product-detail/<slug>-<id>.html (hyphen-separated)', () => {
      expect(
        suggestTitleFromStoreUrl(
          'https://www.alibaba.com/product-detail/2023-New-Arrival-Fashion-Car-Charger-1600123456789.html'
        )
      ).toBe('2023 New Arrival Fashion Car Charger')
    })

    it('returns null for a real listing URL with an empty slug', () => {
      // Real URL, reported not matching before the underscore->hyphen fix.
      expect(
        suggestTitleFromStoreUrl('https://spanish.alibaba.com/product-detail/-1601902641033.html')
      ).toBeNull()
    })

    it('is not confused with aliexpress.com (different domain, different rule)', () => {
      expect(
        suggestTitleFromStoreUrl('https://www.alibaba.com/item/wireless-charging-pad-15w/1005006104729202.html')
      ).toBeNull()
    })

    it('extracts the name query param from a real share link', () => {
      expect(suggestTitleFromStoreUrl(ALIBABA_SHARE_URL)).toBe(
        'Conjunto de Espejo Retrovisor Lateral para Dongfeng Nammi 06 Vigo EV, Espejo Retrovisor Exterior Completo, Encaje Preciso Plug&Play'
      )
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
    expect(suggestTitleFromStoreUrl('https://alibaba.evil.com/product-detail/thing-12345.html')).toBeNull()
  })
})

describe('suggestStoreFromUrl', () => {
  it.each([
    ['https://articulo.mercadolibre.com.uy/MLU-123456-cubiertas', 'MercadoLibre'],
    ['https://www.amazon.com/dp/B08N5WRWNW', 'Amazon'],
    ['https://www.temu.com/usb-c-fast-charger-30w-g-601234567890.html', 'Temu'],
    ['https://www.aliexpress.com/item/1005006104729202.html', 'AliExpress'],
    ['https://www.alibaba.com/product-detail/thing-1600123456789.html', 'Alibaba'],
  ])('recognizes %s as %s', (url, expected) => {
    expect(suggestStoreFromUrl(url)).toBe(expected)
  })

  it('returns null for a non-recognized store or malformed input', () => {
    expect(suggestStoreFromUrl('https://www.somerandomstore.com/dp/12345')).toBeNull()
    expect(suggestStoreFromUrl('')).toBeNull()
    expect(suggestStoreFromUrl('not a url')).toBeNull()
  })

  it('rejects lookalike domains that merely contain a store name', () => {
    expect(suggestStoreFromUrl('https://amazon.evil.com/dp/B08N5WRWNW')).toBeNull()
    expect(suggestStoreFromUrl('https://alibaba.evil.com/product-detail/thing-12345.html')).toBeNull()
  })

  it('recognizes the Alibaba share-link shape too (host-only match, no slug needed)', () => {
    expect(suggestStoreFromUrl(ALIBABA_SHARE_URL)).toBe('Alibaba')
  })
})

describe('suggestImageFromStoreUrl', () => {
  it('extracts the imageUrl query param from a real Alibaba share link', () => {
    expect(suggestImageFromStoreUrl(ALIBABA_SHARE_URL)).toBe(
      'https://s.alicdn.com/@sc04/kf/H3e5b8c23d34e4d43bd81d4909cb818c5k.jpg_720x720Q50.jpg'
    )
  })

  it('returns null for the plain Alibaba product-detail page (no image in the URL)', () => {
    expect(
      suggestImageFromStoreUrl('https://www.alibaba.com/product-detail/thing-1600123456789.html')
    ).toBeNull()
  })

  it('returns null for stores with no image-carrying URL shape', () => {
    expect(
      suggestImageFromStoreUrl(
        'https://www.amazon.com/Anker-PowerCore-Portable-Charger-Battery/dp/B0B8N4TPRW'
      )
    ).toBeNull()
    expect(
      suggestImageFromStoreUrl('https://articulo.mercadolibre.com.uy/MLU-123456-cubiertas')
    ).toBeNull()
  })

  it('returns null for a non-recognized store or malformed input', () => {
    expect(suggestImageFromStoreUrl('https://www.somerandomstore.com/dp/12345')).toBeNull()
    expect(suggestImageFromStoreUrl('')).toBeNull()
    expect(suggestImageFromStoreUrl('not a url')).toBeNull()
  })
})
