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

This is a **content-driven static wiki** — no backend, no API calls. All displayed information lives in JSON files under `src/data/`. Adding or editing content never requires touching React code.

### Data flow

```
src/data/*.json  →  page components  →  shared UI primitives (UI.tsx)
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

## Theme (dark mode)

- Implemented via `data-theme="light"|"dark"` on `<html>`, set by `UserPrefsContext`
- System preference is detected on load via `prefers-color-scheme` and kept in sync
- Dark-mode token overrides live in `[data-theme="dark"]` in `src/index.css`
- The toggle cycles: Sistema → Claro → Oscuro → Sistema

## Car color preview (`src/components/CarPreview.tsx`)

- One JPG per color in `public/`: `car-blanco.jpg`, `car-verde.jpg`, `car-gris.jpg`, `car-beige.jpg`, `car-negro.jpg`
- `CarPreview` swaps `src` based on the selected color; defaults to Blanco when no color is selected
- Images sourced from dongfeng.co.nz official configurator

## Static assets (`public/`)

Assets are served at `BASE_URL` (`/vigo-uy/` in both dev and prod). Always use `import.meta.env.BASE_URL` when constructing asset paths in components — never hardcode `/vigo-uy/`.
