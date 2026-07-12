# C4 — Shared community-data cache

**Status:** TODO · **Phase:** C · **Depends on:** nothing

## Context

Inicio/Mi Vigo, Comunidad, and Costos each independently refetch the same
trips/entries/stats/leaderboard on every mount. On mobile that means repeated
spinners when tabbing between pages, plus avoidable Supabase egress. All
fetching already flows through `src/lib/communityData.ts`, so a cache can be
added in one place without touching pages.

Deliberate constraint: **no new dependency** (no TanStack Query/SWR). The
app's needs are a TTL memo, not a full client-cache framework.

## Requirements

1. In `communityData.ts`, add a module-level cache:
   `Map<string, { promise: Promise<unknown>, at: number }>` keyed by
   fetcher name + serialized args (e.g. `publicTrips:30`). Wrap each exported
   fetch helper (`fetchPublicTrips`, `fetchPublicServiceEntries`,
   `fetchPublicPartPurchases`, `fetchCommunityStats`, `fetchLeaderboard`,
   `fetchCommunityTotals`, `fetchAuthorNames`) so that:
   - a call within `TTL_MS = 60_000` of a previous identical call returns the
     cached promise (dedupes concurrent mounts too);
   - errors are **not** cached (evict on rejection).
2. Export `invalidateCommunityCache(): void` that clears the Map. Call it
   after every successful community-content mutation: inserts/updates in the
   three form pages, deletes in DashboardPage, hide/delete in ModerationPage.
   (Own-data dashboard queries are per-user and stay uncached — they live in
   DashboardPage directly.)
3. Do **not** cache anything when `supabase` is null (helpers already
   early-return).
4. `useCommunityContent` needs no signature change — it benefits
   automatically. Verify the `limit` arg participates in the cache key.

## Files

- `src/lib/communityData.ts`
- `src/pages/NewTripLogPage.tsx`, `NewServiceEntryPage.tsx`,
  `NewPartPurchasePage.tsx`, `DashboardPage.tsx`, `ModerationPage.tsx`
  (invalidate after mutations)

## Acceptance criteria

- Navigating Inicio → Comunidad → Inicio within 60 s performs the trips
  fetch once (verify in the network tab).
- Submitting a new public trip then visiting Comunidad shows it (cache was
  invalidated).
- Two components mounting simultaneously (Mi Vigo totals + leaderboard)
  don't duplicate identical in-flight requests.
- A failed fetch retries on next mount (errors uncached).
- `npm run type-check` passes.
