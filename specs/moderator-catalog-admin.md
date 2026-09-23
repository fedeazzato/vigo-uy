# Moderator UI for reference catalogs + missing content moderation

## Context

Three reference tables are moderator-writable via RLS but had no UI:
`charging_networks` (0024), `insurance_providers` (0043), `insurance_addons`
(0044). The only documented way to add a row was the Supabase SQL Editor —
explicitly called out as "out of scope" in both `specs/D4-charging-stations.md`
and `specs/insurance-quotes.md`. That was an acceptable gap while the person
doing it was the project owner (who has SQL Editor access), but this
project's moderators are a broader group — **they don't have direct Supabase
access**, so "SQL Editor" was never actually usable by them. This spec adds
real UI for all three catalogs, plus a second, independently-discovered gap:
`charging_stations` and `insurance_quotes` — both community content with the
same `hidden`/`verified` + moderator-RLS shape as `service_entries`/
`trip_logs`/`part_purchases` — were never wired into `ModerationPage.tsx`'s
existing "Contenido" tab, so a moderator had no way to hide/verify/delete a
bad charging-station listing or insurance quote either.

**Why three separate components, not one generic table editor.** The three
catalogs share a state machine (load a list, edit one row in place, or add a
new one, each write followed by cache-invalidate-and-reload) but have
genuinely different columns (`charging_networks` has a country `<select>`
and a free-text instructions textarea; `insurance_addons` has a `limit_kind`
`<select>` that changes what a 4th field even means). A single fully-generic
component would need `supabase.from(table as any)`, losing the per-table
type safety every other Supabase call in this codebase relies on. Instead:
a typed hook, `useCatalogAdmin<Row>`, owns the shared state machine and
takes the caller's own typed `load`/`write` calls as parameters (same
dependency-injection shape `useEntrySubmit` already uses for entry forms);
three small shared UI primitives (`CatalogEditActions`, `CatalogSlugField`,
`CatalogAddButton`) cover the pixel-identical bits; each catalog's specific
fields stay in its own component. This is the same tradeoff this codebase
already made for `NewServiceEntryPage`/`NewPartPurchasePage`/
`NewInsuranceQuotePage` — sibling forms that share a shape but not a
component, a deliberate "suppress rather than force a generic hook" call
for this class of duplication (a 2026-07-24 repo cleanup accepted the
same tradeoff for those three forms' shared `handleSubmit` guard clause).

**Why no delete UI.** None of the three catalog tables has a `delete` RLS
policy (by design, established at `charging_networks`' creation — a
moderator retires an entry by leaving it out of new content, not by
removing the row a `references` constraint elsewhere may still point at).
The editors match that: add and edit-in-place only.

## Requirements

### 1. `src/lib/useCatalogAdmin.ts`

```ts
export function useCatalogAdmin<Row extends { slug: string }>(
  load: () => Promise<{ data: Row[] | null; error: unknown }>
)
```

Returns `{ rows, loading, error, setError, saving, editingSlug, adding,
startEdit, startAdd, cancel, save }`.

- Loads on mount (`useEffect`, `reload()`).
- `startEdit(slug)` / `startAdd()` set `editingSlug`/`adding` (mutually
  exclusive) and clear `error`.
- `cancel()` closes both.
- `save(write, onSuccess?)` — `write: () => PromiseLike<{ error: unknown
  }>` (not `Promise` — Supabase's query builder is a thenable, not a
  `Promise`, same reason `useEntrySubmit.submit`'s `run` param is typed
  `PromiseLike`). Sets `saving`, runs `write()`, on error calls
  `toFriendlyError` into `error` and stops; on success calls
  `invalidateCommunityCache()`, `cancel()`, the caller's `onSuccess` (for
  resetting "add new" draft state), then reloads.
- Callers supply their own field-level validation *before* calling `save`
  (matching every entry form's convention) — the hook only handles the
  write/reload cycle, not per-field rules, which differ per catalog.

### 2. Shared UI primitives

- `src/components/CatalogEditActions.tsx` — the "Guardar / Cancelar" button
  row, identical in every editor's edit-in-place and add-new forms.
- `src/components/CatalogSlugField.tsx` — the "Identificador (slug)" input
  + hint (`^[a-z0-9-]{2,30}$`, immutable after creation), identical across
  all three catalogs' add-new forms since all three use that same slug
  convention as their primary key.
- `src/components/CatalogAddButton.tsx` — the "+ Agregar X" toggle shown
  when neither editing nor adding.

### 3. `src/components/ChargingNetworksAdmin.tsx`

Fields: name, country (`<select>` UY/AR/BR/otro), instructions (optional
textarea), sort_order. New row's slug is free-typed (validated against the
same regex the DB `CHECK`s).

### 4. `src/components/InsuranceProvidersAdmin.tsx`

Fields: name, sort_order. Simplest of the three — mirrors the shape
`specs/insurance-quotes.md`'s provider seed established.

### 5. `src/components/InsuranceAddonsAdmin.tsx`

Fields: icon, checkbox_label, badge_label, limit_kind (`<select>` none/
cost/count — see `specs/insurance-quotes.md` Requirement 7 for what each
means), sort_order. This is the concrete answer to "avoid a schema change
for future addons" (owner ask, earlier this feature): a moderator adding
"asistencia mecánica" or similar now takes one form submission, not a
migration.

### 6. `src/pages/ModerationPage.tsx`

- New third tab, "Catálogos", rendering `InsuranceProvidersAdmin`,
  `InsuranceAddonsAdmin`, `ChargingNetworksAdmin` in that order (grouped by
  "things insurance moderators touch most" first), with a one-line
  explainer of the `limit_kind` behavior above them.
- `ContentTable` type gains `'charging_stations' | 'insurance_quotes'`;
  `load()`'s `Promise.all` gains both fetches (`charging_stations` has no
  `is_public` column — it's public data by nature per the D4 spec, so every
  row is in scope; `insurance_quotes` mirrors the existing
  `.eq('is_public', true)` pattern the other three content fetches use);
  `patchRows`/`deleteItem` gain a branch each. Two new Cards in the
  existing "Contenido" tab — "Estaciones de carga" and "Seguros" — using
  the exact same Verificar/Ocultar/Eliminar row shape the other three
  content types already have. Provider/network names are shown as their
  raw slug (`bse`, `ute`) rather than resolved to a display name — a
  deliberate simplification for this internal tool, not a public-facing
  page, avoiding a second cross-reference fetch in `load()`.

### Out of scope

- Deleting a catalog row (see Context).
- Resolving `insurance_quotes.provider`/`charging_stations.network` to a
  display name in the moderation list (raw slug is legible enough for a
  moderator; see Requirement 6).
- `station_reports` moderation — reports are an ephemeral reliability
  signal (D4), not persistent content; a moderator can already delete any
  report via RLS, no UI added here.
- Extending `content_reactions`/`content_comments` moderation to cover
  reactions/comments on charging stations or insurance quotes — comments
  and reactions were never wired to those two content kinds in the first
  place (0027 predates both), unrelated to this spec.

## Files to touch

- `src/lib/useCatalogAdmin.ts` — new.
- `src/components/CatalogEditActions.tsx` — new.
- `src/components/CatalogSlugField.tsx` — new.
- `src/components/CatalogAddButton.tsx` — new.
- `src/components/ChargingNetworksAdmin.tsx` — new.
- `src/components/InsuranceProvidersAdmin.tsx` — new.
- `src/components/InsuranceAddonsAdmin.tsx` — new.
- `src/pages/ModerationPage.tsx` — "Catálogos" tab; `charging_stations`/
  `insurance_quotes` added to the "Contenido" tab.

No migration — every RLS policy these editors rely on (moderator insert/
update on the three catalogs; moderator update/delete on the two newly-
covered content tables) already existed before this spec.

## Test plan

No component tests added — matches this codebase's existing precedent:
`ModerationPage.tsx` itself has no test file, and none of the entry-form
pages with comparable load/validate/save complexity that also lack one
(`NewServiceEntryPage.tsx`) do either; component tests in this app are
reserved for the more complex forms (`NewPartPurchasePage`,
`NewTripLogPage`, `NewInsuranceQuotePage`). Verified instead by:
- `npm run type-check`, `npm run lint`, `npm test` (no regressions in the
  existing 305 tests).
- Fallow duplication check before/after: confirms `useCatalogAdmin` +
  the three shared primitives collapsed the state-machine duplication
  between the three editors (16 clone groups → 12, matching this repo's
  pre-existing baseline of 7 plus 5 remaining small, table-specific
  payload-building blocks — the same class of sibling-component
  duplication already accepted elsewhere in this codebase).
- Manual/runtime verification (via the `verify` skill, mobile viewport):
  `/moderacion` redirects to `/login` when signed out (`RequireModerator`,
  consistent with every other gated route) and `/costos` renders
  unaffected. The tab UI itself, and the actual add/edit flows, aren't
  independently driveable by the headless verify browser (moderator auth
  is behind the same Turnstile/OTP wall noted in
  `specs/trip-draft-autosave.md`) — someone signed in as a moderator should
  spot-check the "Catálogos" tab and the two new "Contenido" cards once.

## Acceptance criteria

- [x] `useCatalogAdmin` implemented; all three catalog editors use it.
- [x] `ChargingNetworksAdmin`, `InsuranceProvidersAdmin`,
      `InsuranceAddonsAdmin` support add-new and edit-in-place, no delete.
- [x] `ModerationPage.tsx`'s "Catálogos" tab renders all three editors.
- [x] `ModerationPage.tsx`'s "Contenido" tab covers `charging_stations` and
      `insurance_quotes` with the same Verificar/Ocultar/Eliminar actions
      the other three content types have.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [x] Manual verification per the test plan above — `/moderacion` redirects
      correctly when signed out; no console errors on `/costos` after the
      change. Full interactive verification of the moderator UI itself
      needs a signed-in moderator spot-check (auth-gated, can't be driven
      headlessly).
- [ ] Commit and push to `origin/main`.
