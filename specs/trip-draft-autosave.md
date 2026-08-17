# Trip draft autosave (resumable trip logging)

## Context

Users log a trip's charging stops after the fact, all at once, in [NewTripLogPage.tsx](../src/pages/NewTripLogPage.tsx). Users have asked to register stop data in real time as they drive — arriving at a charger, noting arrival %, cost, etc. — rather than reconstructing the whole trip from memory later.

Today the entire form (origin/destination/date/stops/rating/notes/...) lives only in React state and is written to Supabase in a single atomic insert/update when the user hits "Guardar". Nothing survives a refresh, a crash, or simply closing the tab between stops — the closest thing to draft protection is an in-memory `dirty` flag that shows a native `confirm()` before leaving, which doesn't actually preserve anything.

This spec adds **local-only, resumable drafts** to the new-trip flow: form state autosaves to `localStorage` as the user fills it in, so leaving the app between charging stops and coming back later resumes exactly where they left off. Nothing new is sent to Supabase until the user finishes and submits — the final save is the same single insert as today, so none of the DB-level constraints or gates change:

- `charging_stops` stays capped at 20 stops / 20KB jsonb (`0017_data_sanity.sql`).
- The INSERT-only daily limit of 20 entries/user (`0009`/`0010_daily_insert_limit.sql`) is untouched — a draft never triggers an INSERT until the user actually finishes.
- `vehicle_id` is still forced/frozen server-side by `set_vehicle_id_on_write()` — the client never sends it, draft or not.
- `specs/CONTENT-MIGRATION.md`'s `routes.json → trip_logs, ≥5 public trips` gate is unaffected: unfinished drafts never become `trip_logs` rows, public or otherwise, so that row does not need updating.

Reference for existing local-persistence conventions: `src/context/UserPrefsContext.tsx` (`localStorage` + `try/catch` around `JSON.parse`, loaded once via `useState(load)`).

## Requirements

- **Scope**: only the *new-trip* path (`/viajes/nuevo`, `isEdit === false`). Editing an already-saved trip (`/viajes/:id/editar`) is unaffected — no draft behavior there.
- **Autosave**: any change to the trip's form state (origin, destination, date, distance, model, rating, notes, `is_public`, battery %, avg speed, and the full `StopDraft[]` array) is debounced (~500ms) and persisted to a single fixed `localStorage` key.
- **One draft at a time**: the store holds at most one draft, keyed by a fixed key — not per-vehicle or per-attempt. Starting a fresh "new trip" while a draft already exists must not silently overwrite it.
- **Resume prompt**: landing on `/viajes/nuevo` with a saved draft present shows a choice — continue the saved draft (restores all fields, including reconstructed `StopDraft[]`) or discard it and start blank. Show a relative "last updated" time (e.g. "hace 10 min") so the user can judge whether it's worth resuming.
- **Discard**: an explicit "Descartar viaje" action clears the stored draft and resets the form to blank, without requiring a submit.
- **Clear on finish**: a successful insert clears the stored draft (mirroring the existing `invalidateCommunityCache()` call after submit in `useEntrySubmit`/`NewTripLogPage`).
- **Leaving no longer loses data**: since the draft persists automatically, drop the current native `confirm()`-before-leaving dialog for the new-trip path (it protected against a loss that no longer happens). Edit mode keeps its existing behavior unchanged, since edits are not drafted.
- **Versioned shape**: the stored draft JSON includes a schema `version` field so a future shape change can detect and discard an incompatible old draft instead of crashing on restore.
- **Corrupt/incompatible data is non-fatal**: malformed JSON, a `localStorage` write failure (quota, private browsing), or a version mismatch must be swallowed (`try/catch`) and treated as "no draft" — never throw and break the page.

### Explicit non-goals

- No cross-device sync and no server-side draft row. If local storage is cleared before finishing, the draft is lost.
- No offline write queue for the final save — finishing the trip still requires connectivity at that moment, same as today.
- No draft support for the edit-existing-trip flow.
- No change to how an individual stop is filled in (`StopCard`, `StationPickerModal` stay as-is) — this is only about the surrounding trip becoming resumable across sessions.

## Files to touch

- New `src/lib/tripDraftStore.ts` — `loadDraft()`, `saveDraft(state)`, `clearDraft()`, following the `UserPrefsContext.tsx` `localStorage` + `try/catch` pattern; owns the fixed key and the `version` field/migration check.
- New `src/lib/tripDraftStore.test.ts` — unit tests for the store in isolation.
- Modify `src/pages/NewTripLogPage.tsx`:
  - Load a candidate draft on mount (new-trip path only) and show the resume/discard choice before rendering the normal blank form.
  - Debounced autosave effect over the relevant form state.
  - "Descartar viaje" action wired to `clearDraft()` + form reset.
  - Clear draft on successful submit.
  - Remove the native `confirm()`-before-leaving dialog for the new-trip path (keep it for edit mode).
- Modify `src/pages/NewTripLogPage.test.tsx` — resume flow, discard flow, autosave-then-reload, clear-on-submit, corrupt-draft-is-ignored.

No migration needed. No `specs/CONTENT-MIGRATION.md` update needed (see Context).

## Test plan

In `src/lib/tripDraftStore.test.ts`:
- `saveDraft` then `loadDraft` round-trips the same state.
- `loadDraft` returns `null` when nothing is stored.
- `loadDraft` returns `null` (not a throw) on malformed JSON in the key.
- `loadDraft` returns `null` on a `version` mismatch (simulate an old-shape draft).
- `clearDraft` removes the key; subsequent `loadDraft` returns `null`.
- `saveDraft` swallows a `localStorage.setItem` throw (e.g. quota exceeded) without propagating.

In `src/pages/NewTripLogPage.test.tsx`:
- With no stored draft, `/viajes/nuevo` renders the normal blank form (no resume prompt).
- With a stored draft, `/viajes/nuevo` shows the resume/discard choice instead of the blank form.
- Choosing "continuar" restores origin/destination/stops/etc. into the form fields.
- Choosing "descartar" clears the stored draft and renders a blank form.
- Editing a field (e.g. typing an origin) results in the draft store receiving a save call after the debounce (fake timers).
- A successful submit calls `clearDraft()`.
- Edit mode (`/viajes/:id/editar`) never reads or writes a draft, regardless of what's in storage.

## Acceptance criteria

- [x] `npm run type-check` passes
- [x] `npm run lint` passes
- [x] `npm test` passes, including the new tests above
- [ ] Manual check via the `run`/`verify` flow: start a new trip, add a stop, reload the page mid-flow, confirm the resume prompt appears and restores state; confirm "Descartar" clears it; confirm finishing a trip leaves no draft behind. **Not run**: `/viajes/nuevo` sits behind `RequireAuth`, and per `verify`'s own documented limitation, signed-in flows can't be driven autonomously (Turnstile's closed shadow DOM + Supabase Auth rejecting captcha-less OTP). Covered instead by the full draft-lifecycle unit tests in `NewTripLogPage.test.tsx` (autosave → resume prompt → continue/discard → clear-on-submit → edit-mode-ignores-draft). Someone signed in locally should still spot-check this once.
