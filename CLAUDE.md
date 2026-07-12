# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:5173/vigo-uy/
npm run build        # Production build
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run deploy       # Build + push to gh-pages branch (GitHub Pages)
```

## Architecture

The frontend is still a **static SPA deployed to GitHub Pages** (no server, `HashRouter`), but the site is no longer purely static content: it has a Supabase (Postgres + Auth) backend for real user accounts and user-submitted data. Two kinds of content coexist, and the distinction matters everywhere in the UI:

- **Curated content** — hand-maintained by the site owner, lives in JSON files under `src/data/`, imported directly into page components. Adding or editing this content never requires touching React code.
- **Community content** — submitted by authenticated users (service costs, trip logs), lives in Supabase tables, fetched at runtime via `src/lib/supabaseClient.ts`. Always visually distinguish community-submitted data from curated data (reuse the `source: 'manual' | 'comunidad'` badge pattern already used in `charging.json`/`types.ts`).

### Data flow

```
src/data/*.json          →  page components  →  shared UI primitives (UI.tsx)
Supabase (Postgres/Auth)  →  AuthContext / data hooks  →  page components
```

Each page imports its JSON file, casts it to the matching TypeScript interface from `src/types.ts`, and composes the UI using the shared components from `src/components/UI.tsx`.

### Key conventions

- **`src/types.ts`** — single source of truth for all data shapes. Every JSON file has a corresponding interface here. When a JSON file changes structure, update the interface too.
- **`src/components/UI.tsx`** — all reusable primitives (`PageHeader`, `Card`, `CardTitle`, `TipList`, `Badge`, `Alert`, `StatGrid`, `SectionDivider`). New display patterns should be added here before being used in pages.
- **JSON imports are cast**, not inferred: `import rawData from '../data/foo.json'` followed by `const data = rawData as FooData`. This is intentional — TypeScript infers string literals from JSON instead of the union types defined in `src/types.ts`.
- **Routing** uses `HashRouter` (required for GitHub Pages). All routes are defined in `src/App.tsx`.
- **CSS Modules** are used throughout. Global design tokens (colors, spacing, typography) are in `src/index.css`.

### Language rule

- **Code, comments, and documentation** → English
- **All user-visible UI text** → Latin American Spanish

## User preferences (`src/context/UserPrefsContext.tsx`)

All user state (model, color, theme) lives in `UserPrefsContext` and is persisted to `localStorage` under the key `vigo-prefs`. This is the single source of truth for:

- **`MODELS`** / **`COLORS`** — ordered lists used to render selectors
- **`COLOR_HEX`** — maps each `Color` to its hex value (used for swatches and sidebar dot)
- **`COLOR_BORDER`** — `Record<Color, string | null>` — the CSS custom property to use as border color for that swatch/dot, or `null` if no border is needed. Always use this record instead of writing per-color conditionals at call sites.
- **`COLOR_DARK_TEXT`** — `Record<Color, boolean>` — whether the swatch label needs dark text for contrast

When adding a new color, update all four records.

**Model/color are picked only in Mi Vigo** and mirrored to the signed-in user's `profiles` row by `src/components/ProfilePrefsSync.tsx` (on first profile load, unset local prefs adopt the account's values; afterwards local prefs win and push silently). Don't add a second model/color editor elsewhere — that duplication was removed on purpose. **Mi Vigo is also the account page**: when signed in it renders `ProfileCard` (display name, city) and `VehicleCard` (members, private plate, share/join codes); there is no separate `/perfil` route (it redirects to `/mi-vigo`).

## Backend & auth (Supabase)

- **`src/lib/supabaseClient.ts`** — the single Supabase client instance. Exports `supabase`, typed `SupabaseClient | null`: it's `null` if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, so the app (and `npm run build` / `npm run type-check` in CI) never hard-fails on missing secrets. Any code that reads/writes Supabase must handle the `null` case.
- **Env vars** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, documented in `.env.example`. Set them in a local `.env.local` (already covered by `.gitignore`'s `*.local`) for local dev.
- **Auth is email OTP (6-digit code), never magic links.** `HashRouter` owns `location.hash` for routing; a magic-link flow that also stashes the session in the URL hash would collide with it, and GitHub Pages has no server to handle an OAuth-style redirect callback anyway. The client is configured with `detectSessionInUrl: false` for this reason — do not change this without re-reading this note. No password auth, no forgot-password flow, ever — that's a deliberate product decision, not an oversight.
- **Row Level Security is the real security boundary, not client-side route guards.** GitHub Pages serves the whole SPA bundle (including the public anon key) statically to everyone — a `RequireAuth`/`RequireModerator` wrapper only improves UX for signed-out/non-moderator users, it enforces nothing. Every access rule (who can read/write/moderate a row) must be expressed as a Postgres RLS policy, never assumed from the frontend alone.
- **Session persistence** is handled entirely by `supabase-js` itself (`localStorage`, key prefixed `sb-<project-ref>-auth-token`) — a separate mechanism from `UserPrefsContext`'s own `vigo-prefs` key; the two don't interact.
- **Community content is publicly readable (anon role), submitting requires auth.** The deliberate anon exposure surface is exactly: public non-hidden content rows from non-banned authors, `public_profiles` (id + display_name only), the two stats views, `vehicle_km_leaderboard`, and `community_totals`. `vehicles.join_code` must never appear in any anon-reachable relation. Shared fetch helpers live in `src/lib/communityData.ts` — use them instead of re-querying from pages, and note author names must come from `public_profiles` (not `profiles`) so they resolve for signed-out visitors.
- **`profiles.is_moderator` / `banned_at` are trigger-protected.** A `before update` trigger reverts changes to both columns on any client session unless the transaction-local GUC `vigo.admin_action = 'on'` is set — and only the SECURITY DEFINER admin RPCs (`admin_set_user_moderator`, `admin_set_user_banned`), which verify the caller is a non-banned moderator, set it. Do not try to update these columns from the frontend; the SQL Editor bootstrap path (promote the first moderator by hand) still works because `auth.uid()` is null there.
- **Shared vehicles**: every user gets a `vehicles` row + `vehicle_members` membership on signup (one vehicle per user, enforced by a unique constraint). Vehicles have **no public name** — the leaderboard labels them by member display names — and an optional `plate` that, like `join_code`, is visible only to the vehicle's own members (never expose either in an anon-reachable relation). Family members link accounts by entering a vehicle's 6-char `join_code` via the `join_vehicle_by_code` RPC (moves the caller; `reset_my_vehicle` is the undo; `remove_vehicle_member` lets the vehicle's creator eject a member, who automatically gets a fresh own vehicle). `trip_logs`/`service_entries.vehicle_id` is forced server-side by a trigger (set from the author's membership on insert, frozen on update) — never send it from the client.

## Theme (dark mode)

- Implemented via `data-theme="light"|"dark"` on `<html>`, set by `UserPrefsContext`
- Only two user-facing states: Claro / Oscuro. The toggle just flips between them via `effectiveTheme`.
- "Sistema" (`theme: null`) is not a selectable state — it's only the initial fallback for visitors who haven't toggled yet, resolved from `prefers-color-scheme` and kept live until the user picks one explicitly
- Dark-mode token overrides live in `[data-theme="dark"]` in `src/index.css`

## Car color preview (`src/components/CarPreview.tsx`)

- One JPG per color in `public/`: `car-blanco.jpg`, `car-verde.jpg`, `car-gris.jpg`, `car-beige.jpg`, `car-negro.jpg`
- `CarPreview` swaps `src` based on the selected color; defaults to Blanco when no color is selected
- Images sourced from dongfeng.co.nz official configurator

## Static assets (`public/`)

Assets are served at `BASE_URL` (`/vigo-uy/` in both dev and prod). Always use `import.meta.env.BASE_URL` when constructing asset paths in components — never hardcode `/vigo-uy/`.
