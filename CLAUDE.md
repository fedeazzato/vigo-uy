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
