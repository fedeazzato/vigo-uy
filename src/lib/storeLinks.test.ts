import { describe, it, expect } from 'vitest'
import {
  canonicalizeStoreUrl,
  suggestImageFromStoreUrl,
  suggestStoreFromUrl,
  suggestTitleFromStoreUrl,
} from './storeLinks'

// A real Alibaba mobile "share" link (reported directly) -- a different URL
// shape from the plain /product-detail/<slug>_<id>.html page: no slug in
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

    it('extracts the slug from the modern /<slug>/up/MLU<id> form (real listing URLs)', () => {
      expect(
        suggestTitleFromStoreUrl(
          'https://www.mercadolibre.com.uy/mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279'
        )
      ).toBe('Mini compresor xiaomi electric air compressor 2 pro')

      expect(
        suggestTitleFromStoreUrl('https://www.mercadolibre.com.uy/cubre-llaves-dongfeng-vigo/up/MLUU4454795392')
      ).toBe('Cubre llaves dongfeng vigo')
    })

    it('extracts the slug from the modern form even with search/share tracking noise attached', () => {
      // Same real URL as above, with a search-result click-tracking query
      // string and share-tracking hash appended -- both are outside
      // pathname, so extraction is unaffected either way.
      expect(
        suggestTitleFromStoreUrl(
          'https://www.mercadolibre.com.uy/mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279' +
            '?pdp_filters=item_id%3AMLU947962110&matt_tool=97158715&ua=7yZSRjHY39v3evZl-yo3BAkN0Bn3EMerTDF_mq-YbUnH3g' +
            '#origin=share&sid=share&wid=MLU947962110&action=copy'
        )
      ).toBe('Mini compresor xiaomi electric air compressor 2 pro')
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
    it('extracts the slug from /product-detail/<slug>_<id>.html (underscore, real listing URL)', () => {
      expect(
        suggestTitleFromStoreUrl(
          'https://www.alibaba.com/product-detail/Front-Trunk-Storage-Solution-ABS-Plastic_1601722567961.html'
        )
      ).toBe('Front Trunk Storage Solution ABS Plastic')
    })

    it('extracts the same slug from the hyphen-separated equivalent of the same listing', () => {
      // Reported directly: both this and the underscore version above are
      // valid URLs for the exact same product. Alibaba doesn't care which
      // separator is used, so neither did two earlier (wrong) attempts to
      // pick just one.
      expect(
        suggestTitleFromStoreUrl(
          'https://www.alibaba.com/product-detail/Front-Trunk-Storage-Solution-ABS-Plastic-1601722567961.html'
        )
      ).toBe('Front Trunk Storage Solution ABS Plastic')
    })

    it('returns null for a real listing URL with an empty slug', () => {
      // Real URL. A single empty-slug example like this can't actually
      // distinguish hyphen from underscore separators (neither character
      // appears when there's no slug) -- don't repeat the mistake of
      // generalizing the separator from this case alone.
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
    expect(suggestTitleFromStoreUrl('https://alibaba.evil.com/product-detail/thing_12345.html')).toBeNull()
  })
})

describe('suggestStoreFromUrl', () => {
  it.each([
    ['https://articulo.mercadolibre.com.uy/MLU-123456-cubiertas', 'MercadoLibre'],
    ['https://www.amazon.com/dp/B08N5WRWNW', 'Amazon'],
    ['https://www.temu.com/usb-c-fast-charger-30w-g-601234567890.html', 'Temu'],
    ['https://www.aliexpress.com/item/1005006104729202.html', 'AliExpress'],
    ['https://www.alibaba.com/product-detail/thing_1600123456789.html', 'Alibaba'],
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
    expect(suggestStoreFromUrl('https://alibaba.evil.com/product-detail/thing_12345.html')).toBeNull()
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
      suggestImageFromStoreUrl('https://www.alibaba.com/product-detail/thing_1600123456789.html')
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

// Real listing URLs (reported directly), most carrying a lot of
// search-result/share tracking noise that shouldn't survive into a saved
// purchase's link. One assertion per URL for the behavior that actually
// matters for it, plus the full set exercised through canonicalizeStoreUrl
// below.
describe('real-world URLs', () => {
  it('AliExpress, no slug, no tracking noise', () => {
    const url = 'https://es.aliexpress.com/item/1005007587878624.html'
    expect(suggestTitleFromStoreUrl(url)).toBeNull()
    expect(suggestStoreFromUrl(url)).toBe('AliExpress')
    expect(canonicalizeStoreUrl(url)).toBe(url)
  })

  it('AliExpress, no slug, heavy search-result tracking query string', () => {
    const url =
      'https://es.aliexpress.com/item/1005012646710776.html?spm=a2g0o.productlist.main.1.2e60vde5vde5Tj' +
      '&algo_pvid=0312089f-078c-4b93-b0df-1e90a142ae50&algo_exp_id=0312089f-078c-4b93-b0df-1e90a142ae50-0' +
      '&pdp_ext_f=%7B%22order%22%3A%22-1%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D' +
      '&pdp_npi=6%40dis%21UYU%214312.82%212889.58%21%21%21718.36%21481.30%21%400b14ce1917861978269216556e10cc' +
      '%2112000058909241973%21sea%21UY%210%21ABX%211%210%21n_tag%3A-29910%3Bd%3A30156e97%3Bm03_new_user%3A-29895' +
      '&curPageLogUid=auFa6G99RcwS&utparam-url=scene%3Asearch%7Cquery_from%3A%7Cx_object_id%3A1005012646710776%7C_p_origin_prod%3A'
    expect(suggestTitleFromStoreUrl(url)).toBeNull()
    expect(suggestStoreFromUrl(url)).toBe('AliExpress')
    expect(canonicalizeStoreUrl(url)).toBe('https://es.aliexpress.com/item/1005012646710776.html')
  })

  it('MercadoLibre, modern /up/ form, no tracking noise', () => {
    const url =
      'https://www.mercadolibre.com.uy/mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279'
    expect(suggestTitleFromStoreUrl(url)).toBe('Mini compresor xiaomi electric air compressor 2 pro')
    expect(canonicalizeStoreUrl(url)).toBe(url)
  })

  it('MercadoLibre, modern /up/ form, share-copy query string + hash', () => {
    const url =
      'https://www.mercadolibre.com.uy/mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279' +
      '?pdp_filters=item_id%3AMLU947962110&matt_tool=97158715&ua=7yZSRjHY39v3evZl-yo3BAkN0Bn3EMerTDF_mq-YbUnH3g' +
      '#origin=share&sid=share&wid=MLU947962110&action=copy'
    expect(canonicalizeStoreUrl(url)).toBe(
      'https://www.mercadolibre.com.uy/mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279'
    )
  })

  it('MercadoLibre, modern /up/ form, search-result click-tracking hash', () => {
    const url =
      'https://www.mercadolibre.com.uy/cubre-llaves-dongfeng-vigo/up/MLUU4454795392' +
      '#polycard_client=search-desktop&be_origin=backend&overlay_label=not_apply&search_layout=grid' +
      '&position=9&type=product&tracking_id=d0f951bd-75d3-4781-a7a7-ff3e60d6492e&wid=MLU1469261774&sid=search'
    expect(suggestTitleFromStoreUrl(url)).toBe('Cubre llaves dongfeng vigo')
    expect(canonicalizeStoreUrl(url)).toBe('https://www.mercadolibre.com.uy/cubre-llaves-dongfeng-vigo/up/MLUU4454795392')
  })

  it('Amazon, slug + /ref=.../ + heavy search-result tracking query string', () => {
    const url =
      'https://www.amazon.com/Roof-Rack-Cross-Dongfeng-2025-2026/dp/B0H8DJ6JBV/ref=sr_1_5' +
      '?crid=PUNRUNA8Z0S9&dib=eyJ2IjoiMSJ9.mQeJylogF-vig9glz1gJ2XuIfcKI4HlijbEC8jppUTHgbu043fOAbwrOgFiZl6FjqANN0AlS0VGpATFFbtSKzSfIQ_mMG1sJB9nPlAVJ7zdbutWHZJj61MQxfStQP4WQnwNPtMriORuSFBEmi3COp5p2KVl9YvSbab-ELvgI-lV-Urkp46XXoI1EqYgot-gSiAvW7-8vGksPMANhHuNWaTlgB51d-QIcrNsOcoSOfBANZWZs9vDcYNSE_BNQ33t4ye9aMKu2elfnwDY1fRKk5XZZiSj-ao9y-6Jc9xeepLc.Z_jF31CRD_wjhYq8La6Xvt7fX8E_HiYhPU-WyUi6AIk' +
      '&dib_tag=se&keywords=dongfeng%2Bvigo&qid=1786197983&sprefix=dongfeng%2Bvigo%2Caps%2C316&sr=8-5&th=1'
    expect(suggestTitleFromStoreUrl(url)).toBe('Roof Rack Cross Dongfeng 2025 2026')
    expect(suggestStoreFromUrl(url)).toBe('Amazon')
    expect(canonicalizeStoreUrl(url)).toBe('https://www.amazon.com/dp/B0H8DJ6JBV')
  })

  it('Alibaba, plain product-detail page with search-result tracking query string', () => {
    // Reported directly, alongside the exact clean URL expected -- the
    // search-tracking params (spm, priceId) aren't in Alibaba's keepParams
    // allowlist, so unlike the share-link shape this reduces to just the
    // path, no verbosity left over.
    const url =
      'https://www.alibaba.com/product-detail/Front-Trunk-Storage-Solution-ABS-Plastic_1601722567961.html' +
      '?spm=a2700.prosearch.normal_offer.d_image.50d467afmy2A69&priceId=782c764aca5e4975abe5124517b5f07e'
    expect(suggestTitleFromStoreUrl(url)).toBe('Front Trunk Storage Solution ABS Plastic')
    expect(suggestStoreFromUrl(url)).toBe('Alibaba')
    expect(canonicalizeStoreUrl(url)).toBe(
      'https://www.alibaba.com/product-detail/Front-Trunk-Storage-Solution-ABS-Plastic_1601722567961.html'
    )
  })
})

describe('canonicalizeStoreUrl', () => {
  it('leaves an already-clean recognized URL unchanged', () => {
    const url = 'https://es.aliexpress.com/item/1005007587878624.html'
    expect(canonicalizeStoreUrl(url)).toBe(url)
  })

  it('strips query string and hash for stores where no query param is load-bearing', () => {
    expect(
      canonicalizeStoreUrl('https://www.temu.com/usb-c-fast-charger-30w-g-601234567890.html?utm_source=share')
    ).toBe('https://www.temu.com/usb-c-fast-charger-30w-g-601234567890.html')
  })

  it('reduces Amazon to its own minimal /dp/<ASIN> form, dropping slug and query', () => {
    expect(
      canonicalizeStoreUrl('https://www.amazon.co.uk/rubber-floor-mats-set/gp/product/B01N5IB20Q?ref=abc&th=1')
    ).toBe('https://www.amazon.co.uk/dp/B01N5IB20Q')
  })

  it('keeps only the load-bearing params for Alibaba share links, dropping the rest', () => {
    const cleaned = canonicalizeStoreUrl(
      'https://www.alibaba.com/share/product-detail.html?from=share&ckvia=abc123&productId=1601902641033' +
        '&name=Test+Product&alibabaGuaranteed=false&imageUrl=https%3A%2F%2Fs.alicdn.com%2Fimg.jpg' +
        '&moq=Orden+min&companyInfo=Some+Co&verified=false&shortKey=xyz&language=es'
    )
    const result = new URL(cleaned)
    expect(result.pathname).toBe('/share/product-detail.html')
    expect([...result.searchParams.keys()].sort()).toEqual(['imageUrl', 'name', 'productId'])
    expect(result.searchParams.get('productId')).toBe('1601902641033')
    expect(result.searchParams.get('name')).toBe('Test Product')
    expect(result.searchParams.get('imageUrl')).toBe('https://s.alicdn.com/img.jpg')
  })

  it('returns non-recognized or malformed URLs unchanged', () => {
    expect(canonicalizeStoreUrl('https://www.somerandomstore.com/dp/12345?utm_source=x')).toBe(
      'https://www.somerandomstore.com/dp/12345?utm_source=x'
    )
    expect(canonicalizeStoreUrl('')).toBe('')
    expect(canonicalizeStoreUrl('not a url')).toBe('not a url')
  })
})
