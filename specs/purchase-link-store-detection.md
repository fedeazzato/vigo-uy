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

## Update: Alibaba's mobile "share" link carries a real image URL

A second real Alibaba URL (also reported directly) turned out to be a
completely different shape from the plain product page:
`/share/product-detail.html?...&name=...&imageUrl=...&productId=...`. No
slug to parse — the product name and a direct CDN image URL are already
sitting in the query string as structured data (`URLSearchParams` decodes
both correctly, `+` as space included). This is not a fetch: the data is
already inside the URL the user pastes, same "zero network calls" premise
as everything else here — it just turns out one store's URL shape hands us
more than a title.

This is the first store link able to suggest a **product image**, which is
the original ask this whole thread traces back to (`specs/purchase-image-url.md`
ruled out fetching it — this doesn't contradict that, it's not a fetch).
Added `suggestImageFromStoreUrl`, wired into `NewPartPurchasePage.tsx`'s
image field the same way title/store already are (fills only when empty).

`StoreSlugRule.slug: RegExp` generalized to `extractTitle: (pathname,
params) => string | null` (+ optional `extractImage`) to accommodate a rule
needing two different extraction strategies for the same host (path-slug
regex vs. query-param lookup) — the four simpler stores share a `fromSlug()`
regex-to-extractTitle adapter so their rules are unchanged in shape.

- [x] Alibaba share-link shape recognized for title (query `name`) and
      image (query `imageUrl`); the plain product-detail path still works
      via the existing slug regex.
- [x] `suggestImageFromStoreUrl` added, returns `null` for every URL shape
      that doesn't carry a direct image (all four other stores, Alibaba's
      plain product page, non-matching/malformed input).
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.

## Update: a second MercadoLibre URL shape, and cleaning the link on blur

Six real listing URLs (reported directly) surfaced two things:

1. **A MercadoLibre URL shape the original rule didn't handle at all**:
   the modern canonical form `mercadolibre.../<slug>/up/MLU<code><id>`
   (e.g. `.../mini-compresor-xiaomi-electric-air-compressor-2-pro/up/MLUU3541562279`),
   distinct from the legacy `articulo.mercadolibre.../MLU-<id>-<slug>` form
   the original implementation was built against. `extractTitle` now tries
   both.
2. **Most of these URLs carry a lot of tracking noise** — search-result
   position/session ids, share-copy tokens, referral tags — in the query
   string and/or hash fragment, on top of the actual listing path. Pasting
   one as-is would save and publicly display that noise via "Ver
   publicación ↗".

Added `canonicalizeStoreUrl(url)`, wired to the link field's `onBlur` (plus
re-applied at submit time, idempotently, in case blur never fired) to clean
a recognized store's URL to its simplest working form before it's saved:

- Always strips the hash fragment and any query param that isn't
  load-bearing — the default and correct behavior for every store *except*
  Alibaba's share link, where the query string is the actual payload
  (`productId`/`name`/`imageUrl` are kept, everything else dropped).
- **Never rewrites the path** by default — guessing whether a shorter path
  still resolves risks producing a dead link, the exact mistake the
  Alibaba separator fix above exists to warn against. The one deliberate
  exception is Amazon's `/dp/<ASIN>`, which is Amazon's own well-documented
  minimal product URL (literally what its own share button generates) —
  confident enough to drop the slug and any `/ref=...` suffix entirely.

`StoreSlugRule` gained `simplifyPath` (path rewrite, Amazon only) and
`keepParams` (query allowlist, Alibaba share-link only) — both optional,
defaulting to "don't touch the path" / "keep no query params", so the
other three stores are unaffected in shape.

**Test plan**: `storeLinks.test.ts` — a `real-world URLs` block running all
six reported URLs through title/store extraction and cleanup together, plus
a `canonicalizeStoreUrl` block covering: already-clean URL unchanged,
generic query+hash stripping, Amazon's `/dp/<ASIN>` reduction, the Alibaba
share-link allowlist, and non-recognized/malformed input returned
unchanged.

- [x] MercadoLibre's modern `/<slug>/up/MLU<id>` form recognized, alongside
      the legacy form (not a replacement).
- [x] `canonicalizeStoreUrl` added and wired to the link field's `onBlur` +
      submit-time payload construction.
- [x] All six reported URLs covered by a test exercising the behavior that
      matters for each.
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.

## Correction #2: the hyphen fix above was itself wrong

A seventh real URL (reported directly,
`.../product-detail/Front-Trunk-Storage-Solution-ABS-Plastic_1601722567961.html`)
proved the "Correction: Alibaba's slug separator is a hyphen, not an
underscore" section above was wrong. The regex went back to `_\d+\.html$`
(underscore).

What actually went wrong: the *only* evidence for switching to hyphen was
a single **empty-slug** example
(`/product-detail/-1601902641033.html`). But an empty slug can't
distinguish the two hypotheses at all — whether the separator is `-` or
`_`, an empty slug produces the same string either way (no separator
character actually appears when there's nothing on one side of it). That
example was consistent with underscore all along; switching to hyphen was
an unjustified generalization from a data point that didn't support it,
and it silently broke the common case (a real, non-empty slug) that the
original underscore guess had gotten right.

Restated lesson, more precisely this time: a real example proves a
pattern only if the pattern's distinguishing feature actually appears in
that example. An edge case that happens to elide the very thing being
verified isn't evidence for either hypothesis — it takes a second real
example, with a non-empty slug, to actually settle this one.

- [x] Alibaba's `/product-detail/<slug>_<id>.html` reverted to underscore;
      both the empty-slug case and the new non-empty-slug real URL pass.
- [x] Also verified `canonicalizeStoreUrl` on this URL shape end-to-end:
      its `spm`/`priceId` tracking params aren't in the `keepParams`
      allowlist, so (unlike the share-link shape) it cleans down to just
      the path, matching the clean URL reported alongside it.
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.

## Correction #3: there was never one right separator — Alibaba accepts both

Reported directly: `.../Front-Trunk-Storage-Solution-ABS-Plastic_1601722567961.html`
and `.../Front-Trunk-Storage-Solution-ABS-Plastic-1601722567961.html` are
**both valid URLs for the same listing**. Corrections #1 and #2 each
guessed a single separator (hyphen, then underscore) from one real URL and
got it "wrong" both times — not because either guess was unreasonable
given the evidence at the time, but because the premise was wrong: there
was never one correct separator to find. Alibaba's routing evidently just
looks for the trailing numeric id and treats everything before it as a
cosmetic SEO slug, indifferent to which non-alphanumeric character joins
them.

Fixed properly this time: `alibabaProductDetail()` matches either `-` or
`_` before the numeric id, and splits the captured slug on either when
turning it into words. No longer a "pick the right one" problem.

Broader lesson, layered on top of corrections #1 and #2: once a *second*
real example contradicts a hard-coded assumption, stop trying to find the
"real" answer as a single fixed value — check whether the site just
doesn't care, and if so, accept the class of valid inputs rather than one
member of it. Two contradicting real examples are a stronger signal that
the pattern is looser than assumed than that the second example is simply
the more authoritative one.

- [x] `alibabaProductDetail()` accepts either separator; both real URLs
      (hyphen and underscore forms of the same listing) extract the same
      title. The empty-slug case still correctly returns null (no
      separator character present to match against either way).
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.

## Update: a sixth store, TiendaMia

TiendaMia (`tiendamia.com.uy`) is a Uruguayan cross-border proxy for
buying from Amazon and other US stores — plausible enough for this app's
audience to warrant its own rule, distinct from Amazon itself since the
purchase actually happens on TiendaMia's own domain.

Its URL shape is the one structural outlier among the six stores: the
slug comes *after* the id, not before —
`/p/<source store code>/<id>/<slug>`, e.g.
`.../p/amz/b0h3kwccqr/adaptador-carplay-inalambrico-4-en-1-...` (`amz`
here is the source store TiendaMia is proxying; the id is that source
store's own id -- a lowercased Amazon ASIN in this example, though that's
incidental to how the rule matches, which doesn't care what the id looks
like). `fromSlug()` handles it unchanged since it already just captures
whichever group is marked, regardless of position in the pattern.

No `simplifyPath` or `keepParams` needed -- the query string
(`utm_medium`/`utm_source`) is pure referral tracking, so it's fully
stripped by the existing default behavior.

- [x] `tiendamia.com.uy` recognized for title suggestion and store-name
      prefill; the referral-tracking query string is stripped by
      `canonicalizeStoreUrl`'s existing default (no store-specific
      handling needed).
- [x] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [x] Commit + push to `origin/main` per the standing methodology.
