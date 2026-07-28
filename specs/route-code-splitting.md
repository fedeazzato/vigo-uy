# Route-based code splitting

## Context

`npm run build` warns that the main JS chunk exceeds 500kB after
minification. There's no single heavy dependency causing this (the
dependency tree is just React, react-router-dom, and supabase-js) — it's
simply that `src/App.tsx` statically imports all ~21 page components, so
every visitor downloads every page's code on first load regardless of which
pages they actually visit. Most sessions only touch a handful of pages
(e.g. Costos, Carga), so shipping all of them upfront is pure waste.

Fix: convert page imports in `App.tsx` to `React.lazy()`, so each route
becomes its own chunk fetched on demand, with a `Suspense` boundary around
the routed content.

**Follow-up, same change**: route splitting alone only took the main chunk
from 573kB to 452kB — page components turned out to be a small slice of the
total. Inspecting what's actually in that remaining chunk found
`@supabase/supabase-js` (204kB) and React/react-dom/react-router-dom
(164kB) making up nearly all of it, both needed on every page (auth/profile
sync runs on app mount regardless of route) so lazy-loading them wouldn't
help first-load size. What *does* help: splitting them into their own
`manualChunks` so they're independently cacheable — this repo deploys
often, and without this split, every deploy forces every returning visitor
to redownload React and Supabase again even though those didn't change.
Gzipped, the real numbers were always reasonable (~138kB total for the
app-shell + vendor chunks) — the 500kB warning is about uncompressed
minified size, not what actually crosses the network. No further
optimization (e.g. hand-rolling a slimmer Supabase client to shave the
204kB) is justified without an actual measured slow-load complaint.

## Requirements

- Every page component routed in `App.tsx` becomes a `React.lazy()` import,
  **except `HomePage`** (the `index` route at `/`) — that one stays a
  static import so the most common landing path never shows a loading
  flash on first paint.
- `Layout`, `ProfilePrefsSync`, `RequireAuth`, `RequireModerator` stay
  static imports — they're small, and `RequireAuth`/`RequireModerator`
  need to run their redirect logic immediately, not after a chunk fetch.
- A single `Suspense` boundary wraps `<Outlet />` in `Layout.tsx` (not one
  per route) — since `Layout`'s `Outlet` is the common ancestor of every
  routed page, including the ones nested under `RequireAuth`/
  `RequireModerator`'s own nested `Outlet`, one boundary there covers all
  of them. Its fallback reuses the existing `Skeleton` primitive
  (`src/components/UI.tsx`, from A6) rather than introducing a new loading
  pattern.
- No new error handling needed: `Layout.tsx` already wraps `Outlet` in
  `ErrorBoundary` (mounted outside the new `Suspense`, same as today), and
  a failed `import()` — e.g. a stale client trying to fetch a page chunk
  that no longer exists after a redeploy replaced `dist/` — surfaces as a
  thrown error during render, which `ErrorBoundary` already catches with
  its existing "Algo salió mal / Recargar la página" UI. Reloading fetches
  the current `index.html` and current chunk manifest, which resolves it.
- `npm run build` no longer prints the >500kB chunk-size warning.

## Files to touch

- `src/App.tsx` — convert all page imports except `HomePage` to
  `React.lazy(() => import('./pages/...'))`.
- `src/components/Layout.tsx` — wrap `<Outlet />` in
  `<Suspense fallback={<Skeleton lines={4} />}>`, inside the existing
  `ErrorBoundary`.
- `vite.config.ts` — `build.rollupOptions.output.manualChunks` (function
  form; this project's Vite 8 uses the Rolldown bundler, which requires a
  callback rather than the classic Rollup object-map form) splitting
  `react`/`react-dom`/`react-router-dom` into `vendor-react` and
  `@supabase/supabase-js` into `vendor-supabase`.

## Test plan

No new unit tests — this is a build/loading-mechanics change with no new
business logic to unit test, and the existing page-level tests (which
render each page component directly, not through `App`'s lazy wrapper)
keep working unchanged since `React.lazy()` only affects how the component
is *loaded*, not its exported shape.

Runtime verification instead (via the `verify` skill, throttled to Slow 4G
in devtools):
- Navigating to a page not yet visited this session shows the `Skeleton`
  fallback briefly, then the page.
- The `/` landing route shows no loading flash.
- No console errors/broken navigation across a sampling of routes
  (curated pages, comunidad, an auth-gated route while signed out →
  redirect still works before any chunk-loading concern applies).

## Acceptance criteria

- [x] `npm run build` no longer warns about a >500kB chunk; `dist/assets/`
      shows multiple page-sized JS files instead of one large bundle
      (index 94kB, vendor-react 164kB, vendor-supabase 204kB, ~20 small
      per-page chunks, largest 14.5kB)
- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes (existing suite, unchanged)
- [x] Manual verification per the test plan above (Playwright against
      `vite preview` under throttled network): Suspense `Skeleton` fallback
      visible on a lazy route immediately after navigation, `/` shows no
      flash, all sampled routes load their expected content, signed-out
      auth-gated route still redirects to `/login` correctly
