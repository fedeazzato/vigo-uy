# B2 — Inicio home page (replace the redirect to Mi Vigo)

**Status:** Done (2026-07-12) · **Phase:** B · **Depends on:** nothing (B1 depends on this)

## Context

`src/App.tsx` redirects `/` to `/mi-vigo`, so a first-time visitor lands on a
model/color picker — a settings screen — instead of anything that shows what
the site is. Mi Vigo should stay the personalization + account page; the app
needs a real home.

## Requirements

### New page `src/pages/HomePage.tsx`, route `/` (index)

Content, top to bottom (reuse existing primitives and fetch helpers —
`fetchCommunityTotals`, `fetchLeaderboard`, `useCommunityContent` from
`src/lib/communityData.ts`; all of them already handle `supabase === null`):

1. `PageHeader` — welcome title + one-line description of the wiki
   ("Guía colaborativa de la comunidad Amantes de la Vigo Uruguay").
2. **Community pulse** card: `StatGrid` with `community_totals` (viajes, km,
   miembros) — same rendering as the MyVigoPage community block.
3. **Últimos viajes** card: latest 3 public trips with author names, linking
   to `/comunidad` ("Ver toda la comunidad →").
4. **CTA**: signed-in → "Registrá tu viaje" (`/viajes/nuevo`); signed-out →
   "Iniciá sesión para compartir" (`/login`).
5. **Guía rápida**: grid of links into the static pages (Carga, Rutas,
   Costos, Mantenimiento, Ficha técnica, FAQ…) with their existing nav icons.
   This block is the future "Guía" landing content (B1 will link here or to a
   dedicated `/guia` — coordinate: build this grid as a small exported
   component `GuideLinks` so B1 can reuse it).
6. If Supabase is unconfigured (`!supabase`), the page still works: skip the
   community blocks, show header + Guía rápida.

### Route changes in `src/App.tsx`

- `index` route renders `HomePage` (remove the `Navigate to="/mi-vigo"`).
- Keep `/mi-vigo` exactly as is.
- Add `{ to: '/', label: 'Inicio', icon: '🏠' }` as the first sidebar/mobile
  nav item in `src/components/Layout.tsx`. Note `NavLink` to `/` needs `end`
  (or `end` prop on that item) so it isn't active on every route.

### Move the community block off Mi Vigo (recommended)

Mi Vigo currently shows totals + latest trips + leaderboard at the bottom.
With Inicio duplicating that, trim Mi Vigo to: personalization (model/color),
account section, and keep only the compact leaderboard card. Avoid rendering
the same three-stat block on two adjacent pages.

## Files

- `src/pages/HomePage.tsx` (+ module CSS if needed; prefer reusing
  `Pages.module.css`/UI primitives) (new)
- `src/App.tsx`, `src/components/Layout.tsx`
- `src/pages/MyVigoPage.tsx` (trim duplicated community block)

## Acceptance criteria

- Visiting the site cold (signed out, empty localStorage) lands on Inicio
  with visible content immediately (curated part renders before fetches).
- All community data still loads; no duplicate stat block on Mi Vigo.
- Sidebar "Inicio" is active only on `/`. Works with Supabase env unset.
- Spanish UI text; `npm run type-check` passes.
