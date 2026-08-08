// Suggests a purchase title (and occasionally an image) from a recognized
// store's listing URL by parsing data the URL already carries -- zero
// network calls, since none of these stores are reliably scrapable
// anonymously (MercadoLibre's public API 403s anonymous requests; the
// others either 403/redirect to a bot-check page or, for AliExpress
// especially, usually carry no slug at all). Also cleans a pasted URL down
// to its simplest working form, stripping search-result/share tracking
// noise before it gets saved and shown to the rest of the community.
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
  // Rewrites the path to its shortest known-working form for "clean on
  // blur", e.g. Amazon's /dp/<ASIN> resolves with no slug at all (this is
  // literally what Amazon's own share button generates). Absent means
  // "don't touch the path" -- the safe default: guessing whether a
  // shorter path still resolves risks producing a dead link for a store
  // without an equally well-established minimal form (see the Alibaba
  // slug-separator lesson in specs/purchase-link-store-detection.md).
  simplifyPath?: (pathname: string) => string
  // Query params that are load-bearing and must survive cleanup -- every
  // other param and the hash fragment are always stripped. Absent means
  // "no query params are load-bearing", true for every store except
  // Alibaba's share-link shape, where the query IS the payload.
  keepParams?: string[]
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

const ALIBABA_PRODUCT_DETAIL = fromSlug(/^\/product-detail\/([a-z0-9-]+)_\d+\.html$/i)

// MercadoLibre has two URL shapes: the legacy item page
// (articulo.mercadolibre.../MLU-<id>-<slug>[-_XX]) and the modern
// canonical one (mercadolibre.../<slug>/up/MLU<code><id>, e.g.
// ".../mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279").
const MERCADOLIBRE_LEGACY = fromSlug(/^\/ML[A-Z]-?\d+-([a-z0-9-]+?)(?:-_[A-Z]{2})?$/i)
const MERCADOLIBRE_UP = fromSlug(/^\/([a-z0-9-]+)\/up\/ML[A-Z0-9]+$/i)

const AMAZON_ASIN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i

const STORE_RULES: StoreSlugRule[] = [
  {
    name: 'MercadoLibre',
    host: /(^|\.)mercadolibre\.[a-z]{2,3}(\.[a-z]{2,3})?$/i,
    extractTitle: (pathname) => MERCADOLIBRE_LEGACY(pathname) ?? MERCADOLIBRE_UP(pathname),
  },
  {
    name: 'Amazon',
    // Amazon puts the slug right before /dp/<ASIN> or /gp/product/<ASIN>,
    // e.g. ".../Anker-PowerCore-Portable-Charger-Battery/dp/B0B8N4TPRW".
    // Short share links with a bare /dp/<ASIN> have no slug to extract.
    host: /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2,3})?$/i,
    extractTitle: fromSlug(/^\/([a-z0-9-]+)\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i),
    // /dp/<ASIN> alone is Amazon's own minimal product URL -- drop the
    // slug and any /ref=... attribution suffix entirely.
    simplifyPath: (pathname) => {
      const match = AMAZON_ASIN.exec(pathname)
      return match ? `/dp/${match[1]}` : pathname
    },
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
    //  1. /product-detail/<slug>_<numeric id>.html -- underscore-separated
    //     (verified against a real listing URL,
    //     ".../Front-Trunk-Storage-Solution-ABS-Plastic_1601722567961.html").
    //     A previous fix wrongly changed this to a hyphen based on a
    //     slugless example (/product-detail/-1601902641033.html) where the
    //     separator character doesn't actually appear either way, so it
    //     couldn't distinguish the two -- don't repeat that: a single
    //     empty-slug example proves nothing about the separator, only a
    //     real non-empty slug does. That empty-slug case still correctly
    //     returns null with the underscore regex (no underscore present
    //     at all, so no match -- same net "no title" result).
    //  2. /share/product-detail.html?...&name=...&imageUrl=...&productId=...
    //     -- the mobile "share" link. No slug to parse: the product name
    //     and a direct CDN image URL are already there as query params
    //     (verified against a real share link), so no fetch is needed --
    //     the only store link that can suggest an image today. Unlike
    //     every other store, the query string here IS the payload, so
    //     cleanup keeps these three params instead of stripping all of them.
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
    keepParams: ['productId', 'name', 'imageUrl'],
  },
]

function matchStore(url: string): { rule: StoreSlugRule; url: URL } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const rule = STORE_RULES.find((r) => r.host.test(parsed.hostname))
  return rule ? { rule, url: parsed } : null
}

/**
 * Suggests a purchase title from a recognized store's listing URL, or
 * `null` if the URL doesn't match any known store or has no extractable
 * title. Never throws.
 */
export function suggestTitleFromStoreUrl(url: string): string | null {
  const found = matchStore(url)
  if (!found) return null

  const title = found.rule.extractTitle(found.url.pathname, found.url.searchParams)
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
  return found?.rule.extractImage?.(found.url.pathname, found.url.searchParams) ?? null
}

/**
 * Cleans a recognized store's URL down to its simplest working form --
 * strips the hash fragment and any query params that aren't load-bearing
 * (search-result position, referral/session ids, share-tracking, ...), and
 * simplifies the path where a shorter form is well-established to still
 * resolve (currently just Amazon's /dp/<ASIN>). Never rewrites the path
 * otherwise -- see `simplifyPath` above for why that's the safe default.
 * Returns the URL unchanged if it doesn't match a known store, or isn't a
 * valid URL at all. Never throws.
 */
export function canonicalizeStoreUrl(url: string): string {
  const found = matchStore(url)
  if (!found) return url

  const pathname = found.rule.simplifyPath?.(found.url.pathname) ?? found.url.pathname

  const kept = new URLSearchParams()
  for (const key of found.rule.keepParams ?? []) {
    const value = found.url.searchParams.get(key)
    if (value != null) kept.set(key, value)
  }
  const search = [...kept].length > 0 ? `?${kept.toString()}` : ''

  return `${found.url.origin}${pathname}${search}`
}
