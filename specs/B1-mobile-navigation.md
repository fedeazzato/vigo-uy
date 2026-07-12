# B1 — Mobile bottom tab bar + "Guía" section

**Status:** TODO · **Phase:** B · **Depends on:** B2 (needs Inicio to exist)

## Context

On mobile (`max-width: 700px` in `src/components/Layout.module.css`) the nav
is a horizontally scrolling strip of 12–13 icon chips. The two interactive
destinations — Mi actividad and Comunidad — are last, i.e. off-screen;
non-technical users don't discover horizontal scroll. The eight static
reference pages get equal weight with the app-like pages, which contradicts
the strategy of phasing static content down (see D1).

## Requirements

### 1. New route `/guia` — `src/pages/GuidePage.tsx`

A simple list/grid of links to the static pages, each with icon + label +
one-line description: Ficha técnica, Carga, Rutas, Costos, Mantenimiento,
Repuestos, Accesorios, Tecnología, FAQ. Reuse the `GuideLinks` component from
B2 if it exists. For moderators, append a Moderación link at the bottom.

### 2. Mobile bottom tab bar (replaces the horizontal chip strip)

Five fixed tabs, always visible, in this order:

| Tab | Route | Icon |
|-----|-------|------|
| Inicio | `/` | 🏠 |
| Comunidad | `/comunidad` | 🌐 |
| **Registrar** (center, emphasized) | action sheet | ➕ |
| Mi actividad | `/mi-actividad` | 🗒️ |
| Guía | `/guia` | 📖 |

- **Registrar** opens a small bottom sheet / popover with three links:
  "+ Viaje" → `/viajes/nuevo`, "+ Service" → `/costos/nuevo`, "+ Repuesto" →
  `/repuestos/nuevo`. Signed-out: a single "Iniciá sesión para registrar" →
  `/login`. Implement as a simple absolutely-positioned panel above the bar
  (CSS module, no new dependency); close on backdrop tap and on navigation.
- Tab bar styling: `position: fixed; bottom: 0`, top border, `--surface`
  background, active tab in `--green-600`, labels ~11px under 22px icons,
  each target ≥ 44px tall. **iOS safe area**: `padding-bottom:
  env(safe-area-inset-bottom)` and add `viewport-fit=cover` to the viewport
  meta in `index.html`.
- Give `.content` bottom padding ≥ tab bar height so nothing is hidden.
- Mi Vigo moves off the primary nav on mobile: reachable from Guía **and**
  keep the existing mobile header — replace the current chips strip with
  nothing (header keeps brand + theme + a link to `/mi-vigo` via the car
  emoji/color dot if trivial). Simplest accepted layout: top header = brand +
  theme toggle + Mi Vigo link; bottom = 5 tabs.

### 3. Desktop sidebar

Keep the sidebar, but group it to match: Inicio, Comunidad, Mi actividad,
Mi Vigo, then a "Guía" group header with the static links indented/smaller,
then Moderación for moderators. Purely visual grouping — same `NavLink`s.

### 4. Cleanup

The `NAV` array in `Layout.tsx` becomes two arrays (primary + guide). The
Moderación conditional stays. `/guia` added to `src/App.tsx`.

## Files

- `src/pages/GuidePage.tsx` (new), `src/App.tsx`
- `src/components/Layout.tsx`, `src/components/Layout.module.css`
- `index.html` (viewport-fit)

## Acceptance criteria

- On a 390px viewport: five tabs visible without scrolling; Registrar opens
  the sheet; every static page reachable in ≤ 2 taps via Guía.
- No content hidden behind the bar on any page (check long pages like
  Costos); safe-area respected in standalone PWA on iOS.
- Desktop sidebar unchanged in function; active states correct (`end` on the
  Inicio link).
- Moderators can still reach /moderacion on both layouts.
- Spanish labels; `npm run type-check` passes.
