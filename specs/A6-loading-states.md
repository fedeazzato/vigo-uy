# A6 — Loading skeletons (kill blank screens)

**Status:** Done (2026-07-12) · **Phase:** A · **Depends on:** nothing

## Context

Several pages render `null` while fetching, which on mobile connections means
seconds of blank screen below the header:

- `src/pages/CommunityFeedPage.tsx` — `if (loading) return null` (waits on a
  100-row fetch + names resolution before showing anything, including the
  static CTA and filters).
- `src/pages/ModerationPage.tsx` — `if (loading) return null`.
- `src/pages/NewTripLogPage.tsx`, `NewServiceEntryPage.tsx`,
  `NewPartPurchasePage.tsx` — `if (loading) return null` in edit mode.

DashboardPage already shows per-section "Cargando…" text — acceptable, leave
it (or upgrade it for consistency if trivial).

## Requirements

1. Add a `Skeleton` primitive to `src/components/UI.tsx` (per CLAUDE.md, new
   display patterns go there first): a few gray shimmer bars inside a `Card`.
   Props: `lines?: number`. Style in `UI.module.css` with existing tokens;
   must look right in dark mode (`[data-theme="dark"]` tokens are in
   `src/index.css`). Respect `prefers-reduced-motion` (no shimmer, static
   bars).
2. CommunityFeedPage: render `PageHeader`, the CTA card, and the
   filter toolbar immediately; show `Skeleton` cards in place of the three
   content sections while `loading`. Stats/leaderboard cards may simply
   appear when ready (they already do).
3. ModerationPage: `PageHeader` + tabs immediately, `Skeleton` for the lists.
4. Edit forms: `PageHeader` immediately, `Skeleton` in place of the form.
5. Keep `aria-busy="true"` on the skeleton container for screen readers.

## Files

- `src/components/UI.tsx`, `src/components/UI.module.css`
- `src/pages/CommunityFeedPage.tsx`, `src/pages/ModerationPage.tsx`
- `src/pages/NewTripLogPage.tsx`, `src/pages/NewServiceEntryPage.tsx`,
  `src/pages/NewPartPurchasePage.tsx`

## Acceptance criteria

- Throttle to Slow 4G in devtools: /comunidad shows header + CTA + skeletons
  instantly, never a blank content area.
- Opening an edit form shows header + skeleton, then the populated form.
- Dark mode skeletons don't flash white. `npm run type-check` passes.
