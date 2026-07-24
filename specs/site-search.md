# Site search

## Context

New users struggle to find information on the site — they don't know which
page covers what they're looking for. The curated JSON under `src/data/` is
being progressively phased out in favor of community-submitted data
(`specs/CONTENT-MIGRATION.md`), so a search feature must cover both: the
remaining curated pages *and* the growing Supabase-backed community content
(`service_entries`, `trip_logs`, `part_purchases`). This is v1 — plain
keyword/full-text search, no LLM or embeddings. Semantic search is a possible
future phase if keyword matching proves too literal.

## Requirements

- A single search entry point (search input/icon in `Layout`, sidebar on
  desktop, mobile header on mobile) opens a results overlay as the user
  types (debounced, e.g. 300ms).
- Results are grouped into two sections:
  - **Guía** — curated content: page nav labels (`PRIMARY_NAV`,
    `GUIDE_LINKS`) plus searchable text pulled from the curated JSON files
    still in `src/data/` (FAQ questions/answers, tech spec fields, charging
    troubleshooting entries, part/accessory descriptions, route
    descriptions, etc). Matching is done client-side (substring, case- and
    accent-insensitive) against a static index built once from the already-
    imported JSON — no new fetch, no bundle-size-relevant new dependency.
  - **Comunidad** — rows from `service_entries`, `trip_logs`,
    `part_purchases` matching the query via Postgres full-text search,
    fetched through a single Supabase RPC. Only rows visible under existing
    RLS surface (`is_public`, not `hidden`, author not banned) — the RPC
    must run as invoker (no `security definer`) so RLS applies exactly as it
    does for the rest of the anon-reachable surface documented in
    CLAUDE.md's Backend & auth section.
- Each result links to the relevant page:
  - `service_entries` → `/costos`
  - `trip_logs` → `/rutas`
  - `part_purchases` → `/repuestos` or `/accesorios`, chosen via the
    existing `isPartCategory`/`isAccessoryCategory` classifiers in
    `src/lib/purchaseCatalog.ts`
  - Guía results → the page path already defined in `PRIMARY_NAV` /
    `GUIDE_LINKS`
  - **v1 scope limit**: results link to the section page, not a deep link
    to the specific row/entry within it (none of the target pages currently
    support scrolling to or highlighting a single item). Documented here so
    it isn't mistaken for an oversight; deep-linking is future work.
- No results state and loading state are handled gracefully in Spanish
  (per CLAUDE.md's UI language rule); the `supabase` client may be `null`
  (self-hosted build without env vars) — in that case Comunidad results are
  simply empty, matching the existing null-guard pattern in
  `src/lib/communityData.ts`.
- Search must not error or crash when the query matches nothing, contains
  only whitespace, or contains Postgres `tsquery` special characters
  (handled via `websearch_to_tsquery`, which is permissive of raw user
  input, unlike `to_tsquery`).

## Files to touch

- `supabase/migrations/0028_site_search.sql` — new RPC
  `search_community_content(search_query text, result_limit int default 20)`
  returning `(kind text, id uuid, title text, subtitle text, category text,
  created_at timestamptz, rank real)`, built as a `UNION ALL` across the
  three tables using `to_tsvector('spanish', ...)` /
  `websearch_to_tsquery('spanish', ...)` over the searchable text columns
  (`service_type`/`dealer`/`city`/`notes`; `title`/`origin`/`destination`/
  `notes`; `item`/`store`/`category`/`city`/`notes`), ordered by `rank desc,
  created_at desc`, capped at `result_limit`. Plain `security invoker`
  (default) function — relies on the existing anon/authenticated RLS
  policies from migration `0011_anon_public_read.sql`, no new grants beyond
  `grant execute ... to anon, authenticated`.
- `src/lib/communityData.ts` — add `searchCommunityContent(query, limit)`
  fetch helper following the existing null-guard/cache-free pattern (search
  results shouldn't sit in the 60s TTL cache since they're query-keyed and
  low-reuse).
- `src/lib/siteSearch.ts` (new) — builds the static curated-content index
  from `src/data/*.json` + `PRIMARY_NAV`/`GUIDE_LINKS`, and exposes
  `searchCuratedContent(query): CuratedSearchResult[]`.
- `src/components/SiteSearch.tsx` (new) + `.module.css` — the search
  input, results overlay, grouping, and result-to-route mapping described
  above. Wired into `src/components/Layout.tsx` (sidebar for desktop,
  mobile header for mobile).
- `src/types.ts` — add `CuratedSearchResult` and `CommunitySearchResult`
  interfaces (the latter aliasing the RPC's return row).
- `npm run gen:types` after the migration, to pick up the new RPC in
  `src/lib/database.types.ts`.
- `specs/CONTENT-MIGRATION.md` — no table changes needed (search reads
  existing curated/community sources as-is, it doesn't introduce a new
  curated file or change any gate), but add a short note under the tracker
  that curated JSON text remains part of the Guía search index even after a
  section's data view flips to `comunidad`, so search doesn't quietly drop
  coverage of a page's static prose when its stats/lists go community-first.

## Test plan

- `src/lib/siteSearch.test.ts`: `searchCuratedContent` matches on nav
  labels, matches on curated JSON body text (one case per JSON file
  category it indexes), is case- and accent-insensitive, returns `[]` for
  no match and for an empty/whitespace query.
- `src/lib/communityData.test.ts` (extend existing or add): `searchCommunityContent`
  returns `[]` when `supabase` is `null`; maps RPC rows to the expected
  shape; propagates `toFriendlyError` on RPC error.
- `src/components/SiteSearch.test.tsx`: renders grouped Guía/Comunidad
  results, debounces input before searching, shows the Spanish empty state,
  routes to the right path per result kind (including the part/accessory
  category split).

## Acceptance criteria

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes, including the new tests above
- [ ] `npx supabase db push` applied and `npm run gen:types` regenerated
      `database.types.ts`
- [ ] Manual verification (via the `verify` skill / dev server): typing a
      query that matches both a curated page and a community entry shows
      both groups; typing a query with no matches shows the empty state;
      works with `supabase` unset (Guía-only results, no crash)
- [ ] `specs/CONTENT-MIGRATION.md` updated with the Guía-coverage note
