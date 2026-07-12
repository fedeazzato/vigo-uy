# B3 — Touch targets, icon fixes, offline notice

**Status:** Done (2026-07-12) · **Phase:** B · **Depends on:** A5 (error mapper) helps but
is not required

## Context

Assorted small mobile issues found in the audit. Grouped because each is too
small to be its own spec.

## Requirements

### 1. Touch targets ≥ 44px

- Mobile nav links (or the B1 tab bar if it landed) — 44px min height.
- `Layout.module.css` footer links, theme toggle, and the mobile header
  buttons (currently ~30px) — enlarge padding on mobile only.
- Dashboard/Moderation `actionLink` buttons (Editar/Eliminar/Ocultar) —
  ensure comfortable spacing between adjacent destructive/non-destructive
  actions on mobile (min 8px gap, 44px height).

### 2. Input font size ≥ 16px on mobile

iOS Safari zooms the page when a focused input's font-size is < 16px. Audit
`src/styles/formControls.module.css` and any input styling; make the
effective font-size of all text inputs/selects ≥ 16px at mobile widths.

### 3. Icon dedupe

`Layout.tsx` uses 📋 for both Ficha técnica and Mi actividad. Give Mi
actividad 🗒️ (or 📊). Keep PageHeader titles in the affected pages in sync
if they repeat the emoji.

### 4. Offline notice

The PWA serves the shell + curated JSON offline (bundled), but community
sections fail silently or with a fetch error. Add a lightweight offline
banner: a small component that listens to `window` `online`/`offline` events
and renders a slim fixed banner "Sin conexión — mostrando solo la guía" when
offline. Mount once in `Layout`. Community fetch failures while online keep
going through the A5 error mapper.

## Files

- `src/components/Layout.tsx`, `src/components/Layout.module.css`
- `src/styles/formControls.module.css`
- `src/components/OfflineBanner.tsx` (new) or inline in Layout
- Touched pages only if icon text repeats there

## Acceptance criteria

- Lighthouse mobile tap-target audit passes on Inicio, Comunidad, Mi
  actividad.
- Focusing the email input on iOS Safari does not zoom the page.
- Airplane mode: banner appears, static pages fully usable, no raw English
  errors anywhere; banner disappears on reconnect.
- Spanish text; `npm run type-check` passes.
