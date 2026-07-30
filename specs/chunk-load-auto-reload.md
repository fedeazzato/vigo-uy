# Auto-reload on stale chunk load error

## Context

`ErrorBoundary` (added in `specs/A5-error-handling.md`) catches any uncaught
render error and shows a generic "Algo salió mal / Recargar la página" card.
`specs/route-code-splitting.md` made every route (except `HomePage`) a
`React.lazy()` chunk fetched on demand via dynamic `import()`.

Those two combine into a confusing but routine failure: a tab left open
across a deploy has an `index.html`/module graph referencing chunk file
names that no longer exist once a new build overwrites `dist/assets/` (the
filenames are content-hashed, so every deploy renames them). The next time
that tab navigates to a route it hasn't loaded yet, the dynamic `import()`
404s, throws during render, and `ErrorBoundary` shows "Algo salió mal" —
which reads as a real bug to non-technical users, when reloading the page
(fetching the current `index.html` and current chunk manifest) would just
fix it.

Fix: have `ErrorBoundary` recognize this specific failure signature (a
failed dynamic `import()`, not an arbitrary render error) and automatically
reload once, showing a neutral "hay una versión nueva" message instead of
the alarming error card. Guard against a reload loop for the case where
reloading doesn't actually help (e.g. the user is offline, or the failure
recurs for an unrelated reason).

## Requirements

- Detect chunk-load failures by message pattern — browsers report failed
  dynamic `import()`s with consistent wording: `Failed to fetch dynamically
  imported module` (Chromium/V8), `error loading dynamically imported
  module` (Firefox), `Importing a module script failed` (Safari). Anything
  not matching this pattern (e.g. a genuine bug throwing `TypeError`) keeps
  showing today's "Algo salió mal" card unchanged.
- On a recognized chunk-load error, `ErrorBoundary` calls `location.reload()`
  automatically and renders a neutral "Hay una versión nueva / Actualizando
  la página..." message instead of "Algo salió mal" for the brief moment
  before the reload takes effect. No button, no user action required.
- Loop guard: record the reload attempt's timestamp in `sessionStorage`.
  Only auto-reload if the last recorded attempt (if any) was more than 10
  seconds ago. If a chunk-load error recurs within that cooldown (reload
  didn't fix it — e.g. offline, or the deploy itself is broken), fall back
  to the existing manual "Algo salió mal / Recargar la página" card rather
  than looping forever on a blank/reloading screen.
- No changes to the existing generic-error path — same card, same copy,
  same button, for any error that isn't a chunk-load failure.

## Files to touch

- `src/components/ErrorBoundary.tsx` — detect chunk-load errors, add the
  reload-with-cooldown logic and the neutral interim message.
- `src/components/ErrorBoundary.test.tsx` — new test cases (see test plan).

## Test plan

Extend `src/components/ErrorBoundary.test.tsx`:
- A component throwing an error whose message matches the chunk-load
  pattern (e.g. `Failed to fetch dynamically imported module`) renders the
  "Hay una versión nueva" message (not "Algo salió mal") and triggers
  `location.reload()` exactly once. Mock `location.reload` and
  `sessionStorage` (clear before each test).
- The existing generic-error test (`Bomb` throwing `new Error('kaboom')`)
  still renders "Algo salió mal." and does **not** call `location.reload()`.
- A chunk-load error occurring again while a recent reload attempt is
  already recorded in `sessionStorage` (within the 10s cooldown) does **not**
  call `location.reload()` again and falls back to the "Algo salió mal"
  card with its manual reload button, instead of getting stuck on the
  "Actualizando" message.

## Acceptance criteria

- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes, including the new `ErrorBoundary` cases
- [x] Covered by the `ErrorBoundary` unit tests above (real component render
      + real `componentDidCatch` logic in jsdom, mocked `location.reload`);
      no separate manual dev-server check performed
