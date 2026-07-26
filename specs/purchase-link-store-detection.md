# Multi-store title suggestion for purchase links

## Context

`src/lib/mercadolibre.ts` (added alongside the `part_purchases.link` column)
suggests a purchase title by parsing the slug MercadoLibre embeds in its
listing URLs. Purchases aren't only bought on MercadoLibre — Amazon, Temu and
AliExpress are also common stores for accessories/parts bought by Vigo
owners. The title-suggestion should recognize all of them, not just one.

## Requirements

- Recognize listing URLs from MercadoLibre (existing), Amazon, Temu and
  AliExpress, and suggest a cleaned-up title from whichever URL slug is
  present.
- Stay client-side/zero-network (no fetching a real page preview) — same
  reasoning as the original MercadoLibre-only version: none of these stores'
  public APIs/pages are reliably scrapable anonymously.
- Never throw; return `null` for URLs from unrecognized stores, malformed
  input, or a recognized store whose URL has no extractable slug (e.g. a
  bare Amazon `/dp/<ASIN>` share link, or most AliExpress `/item/<id>.html`
  links, which carry no words at all).
- Host matching must not be fooled by a lookalike domain that merely
  contains a known store's name as a substring (e.g. `amazon.evil.com`,
  `mercadolibre.evil.com`) — anchor the match so only the real domain (and
  its subdomains/country TLDs) qualifies.
- The link field itself (`part_purchases.link`, validated as any `https?://`
  URL) is unaffected — this only changes which URLs get a title suggestion.

## Files to touch

- `src/lib/mercadolibre.ts` → renamed `src/lib/storeLinks.ts`, generalized
  from a single MercadoLibre regex to a small table of `{ host, slug }`
  rules, one per store, tried in order.
- `src/lib/mercadolibre.test.ts` → renamed `src/lib/storeLinks.test.ts`,
  existing MercadoLibre cases kept, new cases added per store.
- `src/pages/NewPartPurchasePage.tsx` — import/call site update
  (`suggestTitleFromMercadoLibreUrl` → `suggestTitleFromStoreUrl`).

## Test plan

In `storeLinks.test.ts`:

- MercadoLibre: existing cases (real listing URL, no `-_XX` suffix, other
  site codes, non-ML URL → null, malformed input → null) carried over.
- Amazon: slug before `/dp/<ASIN>`, slug before `/gp/product/<ASIN>`, bare
  `/dp/<ASIN>` with no slug → null.
- Temu: slug before `-g-<numeric id>.html`.
- AliExpress: `/item/<numeric id>.html` with no slug → null (the common
  case); slug variant if present.
- Host-spoofing regression: `amazon.evil.com` and `mercadolibre.evil.com` →
  null (must not match on substring alone).
- Non-matching store (e.g. an arbitrary retailer URL) → null.

## Acceptance criteria

- [ ] `suggestTitleFromStoreUrl` exported from `src/lib/storeLinks.ts`,
      handling all four stores plus the null-fallback cases above.
- [ ] `NewPartPurchasePage.tsx` uses the new function; prefill behavior on
      the link field is otherwise unchanged (only fills `item` when empty).
- [ ] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [ ] Commit + push to `origin/main` per the standing methodology.
