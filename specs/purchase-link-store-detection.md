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

- [x] `suggestTitleFromStoreUrl` exported from `src/lib/storeLinks.ts`,
      handling all four stores plus the null-fallback cases above.
- [x] `NewPartPurchasePage.tsx` uses the new function; prefill behavior on
      the link field is otherwise unchanged (only fills `item` when empty).
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.

## Update: Alibaba + a `suggestStoreFromUrl` helper

Two additions landed after the initial four-store version, both extending
this same spec rather than getting their own file:

1. A `suggestStoreFromUrl(url)` helper (prefills the "store" field on the
   purchase form, e.g. pasting a MercadoLibre link fills store="MercadoLibre")
   was added for the original four stores.
2. Alibaba.com (B2B wholesale — a different domain and URL shape from
   AliExpress's B2C retail site, despite the shared parent company) was
   added as a fifth store: `/product-detail/<slug>_<numeric id>.html`.

While adding Alibaba to `suggestStoreFromUrl`, found it used unanchored
`hostname.includes('amazon.')`-style substring checks — the same
lookalike-domain gap `STORE_RULES`' anchored host regexes exist to prevent
(`amazon.evil.com` would have matched). Fixed by unifying both functions
around the single `STORE_RULES` table (`name` field added to
`StoreSlugRule`) instead of maintaining two separate per-store lists that
can drift out of sync — adding a store is now one place, not two.

**Test plan**: `storeLinks.test.ts` — Alibaba slug extraction, Alibaba not
matched by the AliExpress rule, `alibaba.evil.com` lookalike rejection;
`suggestStoreFromUrl` gets its own `describe` block (previously untested)
covering all five stores, the non-matching/malformed cases, and the
lookalike-domain regression for both `amazon.evil.com` and
`alibaba.evil.com`.

- [x] `alibaba.com` recognized by both `suggestTitleFromStoreUrl` and
      `suggestStoreFromUrl`, not conflated with `aliexpress.com`.
- [x] `suggestStoreFromUrl` host matching anchored the same way as
      `STORE_RULES`, closing the lookalike-domain gap.
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.

## Correction: Alibaba's slug separator is a hyphen, not an underscore

The initial Alibaba rule guessed `/product-detail/<slug>_<numeric id>.html`
(underscore separator) without a real URL to check against. A real listing
URL (`https://spanish.alibaba.com/product-detail/-1601902641033.html`,
reported directly) doesn't match that pattern — Alibaba actually separates
the slug from the numeric ID with a **hyphen**, and when there's no slug
the hyphen is still there with nothing before it. Fixed the regex
(`_\d+\.html$` → `-\d+\.html$`) and added the real URL as a regression
test (expects `null`, same as any other slugless listing).

Lesson for future store rules: where a live fetch isn't viable to verify a
URL pattern (as established for all five stores here), a real example URL
is worth more than a plausible-looking guess — ask for one, or add it as a
test the moment it's reported not matching, rather than assuming the first
guess was right.
