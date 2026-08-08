// Suggests a purchase title from a recognized store's listing URL by
// parsing the slug it embeds -- zero network calls, since none of these
// stores are reliably scrapable anonymously (MercadoLibre's public API
// 403s anonymous requests; the others either 403/redirect to a bot-check
// page or, for AliExpress especially, usually carry no slug at all).
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
  slug: RegExp
}

const STORE_RULES: StoreSlugRule[] = [
  {
    name: 'MercadoLibre',
    // MercadoLibre embeds the title in the slug, e.g.
    // ".../MLU-637941467-carlinkit-carplayadaptador-inalambrico-30-apple-carplay-_JM"
    // MLU (Uruguay), MLA (Argentina), MLB (Brasil), etc. -- any site code.
    host: /(^|\.)mercadolibre\.[a-z]{2,3}(\.[a-z]{2,3})?$/i,
    slug: /^\/ML[A-Z]-?\d+-([a-z0-9-]+?)(?:-_[A-Z]{2})?$/i,
  },
  {
    name: 'Amazon',
    // Amazon puts the slug right before /dp/<ASIN> or /gp/product/<ASIN>,
    // e.g. ".../Anker-PowerCore-Portable-Charger-Battery/dp/B0B8N4TPRW".
    // Short share links with a bare /dp/<ASIN> have no slug to extract.
    host: /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2,3})?$/i,
    slug: /^\/([a-z0-9-]+)\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i,
  },
  {
    name: 'Temu',
    // Temu puts the slug right before -g-<numeric id>.html, e.g.
    // ".../usb-c-fast-charger-30w-g-601234567890.html".
    host: /(^|\.)temu\.com$/i,
    slug: /^\/([a-z0-9-]+)-g-\d+\.html$/i,
  },
  {
    name: 'AliExpress',
    // AliExpress item pages are usually just /item/<numeric id>.html with
    // no words at all; the (rarer) slugged form is /item/<slug>/<id>.html.
    host: /(^|\.)aliexpress\.(com|us)$/i,
    slug: /^\/item\/([a-z0-9-]+)\/\d+\.html$/i,
  },
  {
    name: 'Alibaba',
    // Alibaba.com (B2B wholesale) is a different site from AliExpress
    // (B2C retail) despite the shared parent company -- separate domain,
    // separate URL shape. Product pages are
    // /product-detail/<slug>_<numeric id>.html.
    host: /(^|\.)alibaba\.com$/i,
    slug: /^\/product-detail\/([a-z0-9-]+)_\d+\.html$/i,
  },
]

function matchStore(url: string): { rule: StoreSlugRule; pathname: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const rule = STORE_RULES.find((r) => r.host.test(parsed.hostname))
  return rule ? { rule, pathname: parsed.pathname } : null
}

/**
 * Suggests a purchase title from a recognized store's listing URL, or
 * `null` if the URL doesn't match any known store or has no extractable
 * slug. Never throws.
 */
export function suggestTitleFromStoreUrl(url: string): string | null {
  const found = matchStore(url)
  if (!found) return null

  const match = found.rule.slug.exec(found.pathname)
  if (!match) return null

  const words = match[1].split('-').filter(Boolean)
  if (words.length === 0) return null

  const title = words.join(' ')
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
