# Product picture on purchases (pasted image URL)

## Context

Users want to see the product picture alongside a purchase's store link.
Auto-fetching it from the store listing was investigated and ruled out: a
live test against a real MercadoLibre listing (from `storeLinks.test.ts`)
with a realistic browser User-Agent got redirected to MercadoLibre's
`account-verification` bot-check page, and Amazon returned an identical-size
404 for both a fake and a real, currently-listed ASIN — a blanket anti-bot
block, not a real "not found." A server-side fetch (e.g. a Supabase Edge
Function) doesn't fix this: it removes the CORS problem but not the
anti-bot detection, and cloud/datacenter IPs are typically flagged *more*
aggressively than the network this was tested from. Scraping these pages is
also against MercadoLibre's and Amazon's terms of service. So: no auto-fetch.

Instead, same pattern as `part_purchases.link` (migration 0026): the user
pastes a direct image URL themselves (most listing pages support
right-click → "copy image address" on the product photo), and the app just
renders it.

## Requirements

- New nullable `part_purchases.image_url` column, `https?://`-validated at
  the DB level (defense in depth) and the form level (same style as `link`).
- Form field on `NewPartPurchasePage.tsx` to paste the URL, alongside the
  existing link field.
- Render as a thumbnail wherever a purchase already shows its store link:
  `PartsPage`, `AccessoriesPage`, `CommunityFeedPage`, `DashboardPage` (own
  purchases), `ModerationPage`.
- Broken/non-image URLs must degrade gracefully — `onError` hides the
  `<img>` instead of showing a broken-image icon. No image is a normal,
  common state (most existing purchases won't have one).
- CSV export (`DashboardPage.exportPurchasesCsv`) gets an `Image` column,
  same treatment as `Link`.

## Files to touch

- `supabase/migrations/0029_part_purchase_image.sql`
- `src/lib/database.types.ts` (regenerated via `npm run gen:types`)
- `src/pages/NewPartPurchasePage.tsx` — field + validation + payload
- `src/pages/PartsPage.tsx`, `src/pages/AccessoriesPage.tsx`,
  `src/pages/CommunityFeedPage.tsx`, `src/pages/DashboardPage.tsx`,
  `src/pages/ModerationPage.tsx` — render thumbnail
- A small shared thumbnail component if the same markup/CSS repeats across
  those five pages (avoid copy-pasting the `onError` handling five times).

## Test plan

This is mostly rendering + a DB constraint; no new pure-function logic
like `storeLinks.ts` to unit-test. Coverage:

- Any existing component test that snapshots a purchase card (if one
  exists) gets a case with and without `image_url`.
- If a shared thumbnail component is added, a small colocated test
  confirming it renders nothing (not a broken-image icon) when `src` is
  omitted, and that `onError` clears the image.

## Acceptance criteria

- [ ] Migration applied, types regenerated.
- [ ] Purchase form has a working image URL field, validated like `link`.
- [ ] Thumbnail renders on all five listed surfaces when `image_url` is
      set, and renders nothing when it isn't or fails to load.
- [ ] CSV export includes the image URL.
- [ ] `npm run type-check`, `npm run lint`, `npm test` all pass.
- [ ] Commit + push to `origin/main` per the standing methodology.
