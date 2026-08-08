// Suggests a purchase title (and occasionally an image) from a recognized
// store's listing URL by parsing data the URL already carries -- zero
// network calls, since none of these stores are reliably scrapable
// anonymously (MercadoLibre's public API 403s anonymous requests; the
// others either 403/redirect to a bot-check page or, for AliExpress
// especially, usually carry no slug at all).
//
// Host patterns anchor on `(^|\.)store\.tld$` rather than a bare substring
// match, so a lookalike domain (`amazon.evil.com`) can't be mistaken for
// the real store.
interface StoreSlugRule {
  // Display name used to prefill the "store" field -- also the single
  // source of truth for which stores suggestStoreFromUrl recognizes, so
  // adding a store here is the only place it needs adding.
  name: string
  host: RegExp
  // Raw (not yet capitalized) title extracted from the URL, or null if
  // this particular URL doesn't carry one this rule recognizes.
  extractTitle: (pathname: string, params: URLSearchParams) => string | null
  // A direct product image URL, when the URL shape happens to carry one.
  // Only Alibaba's share links do today (structured data in the URL
  // itself, not a fetch) -- optional because most stores don't.
  extractImage?: (pathname: string, params: URLSearchParams) => string | null
}

// Shared by the plain path-slug stores: hyphen-joined slug -> space-joined
// words, or null if the pattern doesn't match or the captured slug is
// empty (e.g. a slugless share link).
function fromSlug(pattern: RegExp): (pathname: string) => string | null {
  return (pathname) => {
    const match = pattern.exec(pathname)
    if (!match) return null
    const words = match[1].split('-').filter(Boolean)
    return words.length > 0 ? words.join(' ') : null
  }
}

const ALIBABA_PRODUCT_DETAIL = fromSlug(/^\/product-detail\/([a-z0-9-]+)-\d+\.html$/i)

const STORE_RULES: StoreSlugRule[] = [
  {
    name: 'MercadoLibre',
    // MercadoLibre embeds the title in the slug, e.g.
    // ".../MLU-637941467-carlinkit-carplayadaptador-inalambrico-30-apple-carplay-_JM"
    // MLU (Uruguay), MLA (Argentina), MLB (Brasil), etc. -- any site code.
    host: /(^|\.)mercadolibre\.[a-z]{2,3}(\.[a-z]{2,3})?$/i,
    extractTitle: fromSlug(/^\/ML[A-Z]-?\d+-([a-z0-9-]+?)(?:-_[A-Z]{2})?$/i),
  },
  {
    name: 'Amazon',
    // Amazon puts the slug right before /dp/<ASIN> or /gp/product/<ASIN>,
    // e.g. ".../Anker-PowerCore-Portable-Charger-Battery/dp/B0B8N4TPRW".
    // Short share links with a bare /dp/<ASIN> have no slug to extract.
    host: /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2,3})?$/i,
    extractTitle: fromSlug(/^\/([a-z0-9-]+)\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i),
  },
  {
    name: 'Temu',
    // Temu puts the slug right before -g-<numeric id>.html, e.g.
    // ".../usb-c-fast-charger-30w-g-601234567890.html".
    host: /(^|\.)temu\.com$/i,
    extractTitle: fromSlug(/^\/([a-z0-9-]+)-g-\d+\.html$/i),
  },
  {
    name: 'AliExpress',
    // AliExpress item pages are usually just /item/<numeric id>.html with
    // no words at all; the (rarer) slugged form is /item/<slug>/<id>.html.
    host: /(^|\.)aliexpress\.(com|us)$/i,
    extractTitle: fromSlug(/^\/item\/([a-z0-9-]+)\/\d+\.html$/i),
  },
  {
    name: 'Alibaba',
    // Alibaba.com (B2B wholesale) is a different site from AliExpress
    // (B2C retail) despite the shared parent company -- separate domain,
    // two different URL shapes:
    //  1. /product-detail/<slug>-<numeric id>.html -- hyphen-separated,
    //     not underscore (verified against a real listing URL). An empty
    //     slug still leaves the leading hyphen, e.g.
    //     /product-detail/-1601902641033.html -- fromSlug's `+` (at least
    //     one slug char) makes that fail to match, same net "no title"
    //     result as the other stores' slugless cases.
    //  2. /share/product-detail.html?...&name=...&imageUrl=...&productId=...
    //     -- the mobile "share" link. No slug to parse: the product name
    //     and a direct CDN image URL are already there as query params
    //     (verified against a real share link), so no fetch is needed --
    //     the only store link that can suggest an image today.
    host: /(^|\.)alibaba\.com$/i,
    extractTitle: (pathname, params) => {
      if (pathname === '/share/product-detail.html') {
        const name = params.get('name')?.trim()
        return name || null
      }
      return ALIBABA_PRODUCT_DETAIL(pathname)
    },
    extractImage: (pathname, params) => {
      if (pathname !== '/share/product-detail.html') return null
      const imageUrl = params.get('imageUrl')?.trim()
      return imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null
    },
  },
]

function matchStore(url: string): { rule: StoreSlugRule; pathname: string; params: URLSearchParams } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const rule = STORE_RULES.find((r) => r.host.test(parsed.hostname))
  return rule ? { rule, pathname: parsed.pathname, params: parsed.searchParams } : null
}

/**
 * Suggests a purchase title from a recognized store's listing URL, or
 * `null` if the URL doesn't match any known store or has no extractable
 * title. Never throws.
 */
export function suggestTitleFromStoreUrl(url: string): string | null {
  const found = matchStore(url)
  if (!found) return null

  const title = found.rule.extractTitle(found.pathname, found.params)
  if (!title) return null

  return title.charAt(0).toUpperCase() + title.slice(1)
}

/**
 * Suggests the store's display name from a recognized listing URL, or
 * `null` if the URL doesn't match any known store. Host matching is
 * anchored (see STORE_RULES), so a lookalike domain (`amazon.evil.com`)
 * can't be mistaken for the real store. Never throws.
 */
export function suggestStoreFromUrl(url: string): string | null {
  return matchStore(url)?.rule.name ?? null
}

/**
 * Suggests a direct product image URL from a recognized store's listing
 * URL, or `null` if the URL doesn't match any known store or that store's
 * URL shape doesn't carry one. Never throws.
 */
export function suggestImageFromStoreUrl(url: string): string | null {
  const found = matchStore(url)
  return found?.rule.extractImage?.(found.pathname, found.params) ?? null
}
