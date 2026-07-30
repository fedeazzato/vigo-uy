# City input: replace native datalist with a custom combobox

## Context

Every city field (`ProfileCard`, `CommunityStations`, `NewServiceEntryPage`,
`NewPartPurchasePage`, `NewTripLogPage`'s origin/destination) suggests
Uruguayan cities via a native `<input list={UY_CITIES_LIST_ID}>` pointed at
`<CityDatalist>` (`src/components/CityDatalist.tsx` + `src/lib/cities.ts`).
Native `<datalist>` rendering is inconsistent and largely broken on mobile
browsers: no real dropdown appears, at best a keyboard-autocomplete strip
that most users never notice — the component's own comment already flags
this as a known limitation. This replaces it with a small custom combobox
(text input + filtered, tappable option list) that behaves the same on every
device, while keeping the two properties that made datalist attractive:
plain free-text entry (trips abroad, missing towns) and a single shared
Uruguayan city list.

This does not touch `C3-native-inputs.md` (that spec retired `ChEdit` in
favor of native inputs generally) — the city field stays a native `<input>`
under the hood, just paired with a custom dropdown instead of `<datalist>`.

## Requirements

1. New `src/components/CityCombobox.tsx` exporting a controlled component:
   `{ id: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }`.
2. Behavior:
   - Free text is always accepted — the dropdown is a suggestion, never a
     hard constraint. No validation forces the value to be a listed city.
   - Filters `UY_CITIES` (`src/lib/cities.ts`, unchanged) by substring match
     on the current value, case- and accent-insensitive (so "salto" matches
     "Salto", "condo" does not need to match anything special, but "boues"
     should still match "Ombúes de Lavalle"-style accents — normalize both
     sides with `.normalize('NFD').replace(/[̀-ͯ]/g, '')` before
     comparing).
   - Caps the visible suggestion list (e.g. top 6 matches) so it stays
     short and fully reachable on a phone screen without scrolling past the
     fold.
   - Opens on focus (showing matches for whatever is already typed) and on
     every keystroke; closes on `Escape`, on selecting an option, or on
     blur/click-outside.
   - Keyboard support: `ArrowDown`/`ArrowUp` move the highlighted option,
     `Enter` selects the highlighted option (or just closes the list if
     none highlighted, leaving typed text as-is), `Escape` closes without
     changing the value.
   - On blur, free text is snapped to a canonical casing so it visually
     matches the curated list, via a new `normalizeCityCasing(input: string)`
     helper exported from `src/lib/cities.ts`:
     - If the trimmed value matches a `UY_CITIES` entry accent/case
       -insensitively, replace it with that entry's exact canonical string
       (e.g. "montevideo" / "MONTEVIDEO" → "Montevideo").
     - Otherwise, title-case each word, keeping a small set of Spanish
       connector words (`de`, `del`, `la`, `las`, `los`, `y`) lowercase
       when not the first word — mirroring how `UY_CITIES` itself is
       written (`"Punta del Este"`, `"San José de Mayo"`,
       `"Ciudad de la Costa"`). Don't touch accents/diacritics the user
       typed; only adjust letter casing.
     - Selecting a dropdown option already yields canonical casing
       directly, so this only visibly changes something for typed values
       that were never selected from the list.
   - Touch/mouse: tapping an option selects it. Use `onMouseDown` +
     `preventDefault` on options (not `onClick`) so selection fires before
     the input's blur closes the list.
   - Follows the ARIA 1.2 combobox pattern (`role="combobox"` on the input,
     `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
     `aria-activedescendant`; `role="listbox"` / `role="option"` on the
     dropdown) so this is a real accessibility improvement, not just a
     visual one.
   - Reuses `formStyles.input` for the input's visual chrome (border,
     radius, focus ring, dark-mode tokens, 16px mobile font-size per the
     iOS-zoom comment already in `formControls.module.css`) — no
     duplicated styling. A new colocated `CityCombobox.module.css` handles
     only the dropdown positioning (`position: relative` wrapper,
     `position: absolute` option list, `max-height` + scroll, dark-mode
     surface/border colors, z-index above surrounding card content).
3. Replace every `CityDatalist`/`UY_CITIES_LIST_ID` usage with
   `<CityCombobox>`:
   - `src/components/ProfileCard.tsx`
   - `src/components/CommunityStations.tsx`
   - `src/pages/NewServiceEntryPage.tsx`
   - `src/pages/NewPartPurchasePage.tsx`
   - `src/pages/NewTripLogPage.tsx` (both origin and destination fields)
4. Delete `src/components/CityDatalist.tsx` once nothing references it
   (confirm with `grep -r "CityDatalist\|UY_CITIES_LIST_ID" src/` returning
   nothing outside the deleted file).
5. `src/lib/cities.ts`: the `UY_CITIES` array is unchanged; add and export
   the new `normalizeCityCasing` helper (and whatever accent-stripping
   utility it shares with the dropdown's filter match — keep the two in one
   place instead of duplicating a normalize function).

6. Existing rows already have free-text city/origin/destination values typed
   before this UI existed, in whatever casing the author used. A one-time
   migration (`supabase/migrations/0032_normalize_city_casing.sql`) applies
   the same canonicalization rule server-side (SQL port of
   `normalizeCityCasing`, using the `unaccent` extension for the
   accent-insensitive match) to: `profiles.city`, `service_entries.city`,
   `part_purchases.city`, `charging_stations.city`,
   `trip_logs.origin`, `trip_logs.destination`.

## Files to touch

- `src/lib/cities.ts` (add `normalizeCityCasing` + shared normalize helper)
- `src/lib/cities.test.ts` (new — unit tests for `normalizeCityCasing`)
- `src/components/CityCombobox.tsx` (new)
- `src/components/CityCombobox.module.css` (new)
- `src/components/CityCombobox.test.tsx` (new)
- `supabase/migrations/0032_normalize_city_casing.sql` (new — backfills
  existing rows; run `npx supabase db push` once merged, no
  `npm run gen:types` needed since no schema shape changes)
- `src/components/CityDatalist.tsx` (deleted)
- `src/components/ProfileCard.tsx`
- `src/components/CommunityStations.tsx`
- `src/pages/NewServiceEntryPage.tsx`
- `src/pages/NewPartPurchasePage.tsx`
- `src/pages/NewTripLogPage.tsx`

No entry in `specs/CONTENT-MIGRATION.md` is affected (city suggestions are
static UI data, not a curated-vs-community content source).

## Test plan

New `src/lib/cities.test.ts`:

- `normalizeCityCasing("montevideo")` and `("MONTEVIDEO")` both return
  `"Montevideo"` (canonical match, case-insensitive).
- `normalizeCityCasing("ombues de lavalle")` returns `"Ombúes de Lavalle"`
  (canonical match, accent-insensitive).
- `normalizeCityCasing("punta del este")` (already exactly canonical) is a
  no-op.
- `normalizeCityCasing("buenos aires")` (no match in `UY_CITIES` — a trip
  abroad) returns `"Buenos Aires"` via the connector-aware title-case
  fallback.
- `normalizeCityCasing("villa de las flores")` (fictional, not in
  `UY_CITIES`, chosen specifically to exercise two connector words at once)
  returns `"Villa de las Flores"`: first word capitalized, `"de"`/`"las"`
  lowercased, `"Flores"` capitalized.

New `src/components/CityCombobox.test.tsx`:

- Typing a substring (e.g. "monte") filters the dropdown to matches
  containing it (e.g. "Montevideo"), case-insensitively.
- Typing an accented match target without accents (e.g. "ombues") still
  matches "Ombúes de Lavalle".
- The suggestion list is capped at the configured max even when more cities
  match.
- Clicking/selecting an option calls `onChange` with that city and closes
  the dropdown.
- `ArrowDown` then `Enter` selects the first highlighted match.
- `Escape` closes the dropdown and leaves the current value untouched.
- Typing a value with no match in `UY_CITIES` (e.g. "Buenos Aires") is
  retained as-is via `onChange` — free text is never rejected or reset.
- Blur (simulated click-outside) closes the dropdown without altering the
  value.

Existing colocated tests (`NewTripLogPage.test.tsx`, others touching these
forms) should continue to pass unchanged — none currently assert on
`list=`/datalist behavior directly (verified: only a comment referencing
`role="combobox"` on an unrelated `<select>`).

## Acceptance criteria

- [x] `CityCombobox` implemented and used by all five call sites; free text
      still works everywhere city was previously typed.
- [x] `CityDatalist.tsx` and `UY_CITIES_LIST_ID` removed with no remaining
      references.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [ ] `0032_normalize_city_casing.sql` pushed to the linked project
      (`npx supabase db push`) and spot-checked against a few known-messy
      rows (e.g. anything previously saved all-lowercase). **Not yet run —
      needs explicit go-ahead since it writes to the live project.**
- [x] Manual check on a mobile viewport (per the `verify` skill, via a
      temporary unauthenticated route since every real city field sits
      behind `RequireAuth`): typing shows a tappable dropdown of matches in
      both light and dark mode, tapping "Montevideo" fills the field and
      closes the dropdown, and typing "buenos aires" (not in the list) is
      accepted and snapped to "Buenos Aires" on blur.
