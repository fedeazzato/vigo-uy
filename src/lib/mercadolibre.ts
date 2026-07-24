// MercadoLibre embeds the listing title in its URL slug (e.g.
// ".../MLU-637941467-carlinkit-carplayadaptador-inalambrico-30-apple-carplay-_JM").
// Parsing it client-side lets the purchase form suggest a title with zero
// network calls -- fetching a real preview from MercadoLibre isn't viable:
// their public API 403s anonymous requests (PA_UNAUTHORIZED_RESULT_FROM_POLICIES)
// and scraping the listing page redirects automated requests to a bot-check
// page, even from a real item id.
// MLU (Uruguay), MLA (Argentina), MLB (Brasil), etc. -- any two-letter site code.
const ML_SLUG_PATTERN = /^\/ML[A-Z]-?\d+-([a-z0-9-]+?)(?:-_[A-Z]{2})?$/i

/**
 * Suggests a purchase title from a MercadoLibre listing URL, or `null` if
 * the URL doesn't look like one (any other store, or malformed input).
 * Never throws.
 */
export function suggestTitleFromMercadoLibreUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!/(^|\.)mercadolibre\./i.test(parsed.hostname)) return null

  const match = ML_SLUG_PATTERN.exec(parsed.pathname)
  if (!match) return null

  const words = match[1].split('-').filter(Boolean)
  if (words.length === 0) return null

  const title = words.join(' ')
  return title.charAt(0).toUpperCase() + title.slice(1)
}
