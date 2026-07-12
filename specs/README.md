# Specs index

Work items from the July 2026 whole-app audit, written so each can be executed
independently by a fresh agent session. Each spec is self-contained: context,
requirements, files to touch, and acceptance criteria.

## How to work on a spec (read this first)

1. Read `CLAUDE.md` at the repo root before anything else — it documents hard
   constraints (HashRouter, RLS as the only security boundary, email OTP only,
   `supabase` client may be `null`, Spanish UI text / English code).
2. SQL migrations are numbered files in `supabase/migrations/` and are applied
   **by hand-pasting into the Supabase SQL Editor** (until C1 changes that).
   New migrations must be idempotent-friendly and carry the standard header
   comment explaining how to apply them.
3. `npm run type-check` and `npm run build` must pass when you finish.
4. When a spec is done, update its **Status** line and check it off in the
   table below.

## Status board

| ID | Title | Phase | Depends on | Status |
|----|-------|-------|-----------|--------|
| [A1](A1-db-hardening.md) | DB sanity constraints, indexes, robust stats | A | — | TODO |
| [A2](A2-display-name-privacy.md) | Neutral default display names + name prompt | A | — | TODO |
| [A3](A3-otp-resend-captcha.md) | Fix OTP resend CAPTCHA bypass | A | — | TODO |
| [A4](A4-csv-injection.md) | CSV formula-injection guard | A | — | TODO |
| [A5](A5-error-handling.md) | Friendly Spanish errors + error boundary | A | — | TODO |
| [A6](A6-loading-states.md) | Loading skeletons (kill blank screens) | A | — | TODO |
| [B1](B1-mobile-navigation.md) | Bottom tab bar + Guía section | B | B2 | TODO |
| [B2](B2-home-page.md) | Inicio home page (replace redirect to Mi Vigo) | B | — | TODO |
| [B3](B3-mobile-polish.md) | Touch targets, icons, offline notice | B | A5 | TODO |
| [C1](C1-migration-workflow.md) | Supabase CLI migration workflow | C | — | TODO |
| [C2](C2-generated-types.md) | Generated DB types | C | C1 | TODO |
| [C3](C3-native-inputs.md) | Replace ChEdit with native inputs | C | — | TODO |
| [C4](C4-data-cache.md) | Shared community-data cache | C | — | TODO |
| [C5](C5-trip-form-disclosure.md) | Trip form progressive disclosure | C | C3 | TODO |
| [D1](D1-prefer-community.md) | `preferCommunity` gate + retirement tracker | D | — | TODO |
| [D2](D2-verified-content.md) | Moderator-verified content ("Oficial" flag) | D | A1 | TODO |
| [D3](D3-security-followups.md) | Minor security follow-ups | D | — | TODO |

## Recommended execution order

Phase A items are independent of each other — any order, all low-risk.
Within B: B2 before B1 (the tab bar needs a home to point at).
Within C: C1 → C2; C3 before C5. C4 anytime.
Within D: D2 needs A1's migration conventions but not its content; D1 and D3
are independent.

## Background: the audit in one paragraph

The app is a static SPA on GitHub Pages backed by Supabase; RLS is the real
security boundary and is in good shape. The main risks found: community-
submitted numbers are unvalidated server-side and feed trusted UI (A1),
default display names leak email local-parts publicly (A2), and the OTP
resend path skips the CAPTCHA (A3). The main UX problems: mobile navigation
hides the interactive pages behind horizontal scroll (B1), several pages
render nothing while loading (A6), and raw English error strings reach
Spanish-speaking users (A5). Strategic direction: the curated JSON content
sourced from the WhatsApp group is placeholder filler that community data
should progressively replace — D1/D2 build that replacement mechanism.
