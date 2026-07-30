# Trip titles use an arrow separator

## Context

Trip titles are derived, not typed by the user (`src/pages/NewTripLogPage.tsx`
comment: "nobody knows what to 'title' a trip, and origin/destination already
say it all"). They're currently generated as `"{origin} - {destination}"`
(plain hyphen). The site-search RPC already independently formats trip
subtitles as `origin || ' → ' || destination` (see
`supabase/migrations/0028_site_search.sql`), so the stored title is
inconsistent with how the search UI already presents the same route. This
standardizes on the arrow everywhere: `"{origin} → {destination}"`.

## Requirements

1. `src/pages/NewTripLogPage.tsx`'s derived `title` uses `' → '` instead of
   `' - '` as the separator (both create and edit paths — it's the same
   line for both, `isEdit` doesn't branch it).
2. Existing rows: `trip_logs.title` is fully derived (no UI ever lets a user
   type a custom title), so it's safe to unconditionally recompute every
   row's title from its own `origin`/`destination` columns rather than
   string-replacing the old separator (avoids any edge case where a city
   name itself contains a hyphen).

## Files to touch

- `src/pages/NewTripLogPage.tsx`
- `supabase/migrations/0033_trip_title_arrow_separator.sql` (new — backfill)

## Test plan

- `src/pages/NewTripLogPage.test.tsx`: submitting the form builds a payload
  whose `title` is `"{origin} → {destination}"` (add an assertion where
  none existed before — no existing test currently checks `title`).

## Acceptance criteria

- [x] New trips get `"{origin} → {destination}"` titles (via new exported
      `tripTitle` helper, unit-tested).
- [ ] Existing `trip_logs.title` rows backfilled to match (migration
      written, not yet pushed).
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [ ] Migration pushed to the linked project (`npx supabase db push`), with
      explicit go-ahead first since it writes to the live project.
