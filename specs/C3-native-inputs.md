# C3 — Replace ChEdit with native inputs

**Status:** TODO · **Phase:** C · **Depends on:** nothing

## Context

Forms use `ChEdit` from `@genexus/chameleon-controls-library` (wrapped in
`src/lib/chameleon/`). Costs of keeping it:

- A documented quirk: it must be controlled or it displays the literal string
  `"undefined"` (see comment in `LoginPage.tsx`).
- Every handler is `onInput={(e: any) => …}` — no typing.
- Attributes critical for mobile don't pass through reliably:
  `autocomplete="email"`, `autocomplete="one-time-code"`, `inputmode`,
  `enterkeyhint`.
- It's a large dependency for what are plain text fields, and the app already
  mixes paradigms (CommunityFeedPage uses native `<input>`/`<select>` styled
  with `formStyles.chInput`).

## Requirements

1. Replace every `ChEdit` usage with native elements styled by
   `src/styles/formControls.module.css`:
   - text → `<input type="text">`
   - email (login) → `<input type="email" autocomplete="email" inputmode="email">`
   - OTP code → `<input inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*">`
   - numeric fields → `<input type="text" inputmode="numeric">` (or
     `inputmode="decimal"` where ChEdit used `mode="decimal"`); keep values
     as strings in state, parsing on submit exactly as today.
   - date → `<input type="date">`
   - multiline/autoGrow → `<textarea>`; replicate auto-grow with a small
     `onInput` height adjustment or accept a fixed `rows={3}` (preferred:
     keep it simple, fixed rows).
2. Review `formControls.module.css`: it contains ch-edit-specific notes
   (shadow-DOM min-height comment). Restyle so native inputs get the same
   look (padding, border, radius, focus ring, dark mode). Font-size ≥ 16px
   (coordinates with B3).
3. Change handlers to typed `onChange={(e) => set(e.target.value)}` — remove
   every `(e: any)`.
4. Remove the dependency: delete `src/lib/chameleon/` entirely, drop
   `@genexus/chameleon-controls-library` from `package.json`, and delete the
   ChEdit-specific comments (LoginPage's controlled-component note becomes
   obsolete).
5. Affected files: LoginPage, NewTripLogPage, NewServiceEntryPage,
   NewPartPurchasePage, ProfileCard, VehicleCard (grep `ChEdit` for the full
   list).
6. Verify each form still submits and validates identically (values are
   strings, trimmed/parsed on submit — that logic is untouched).

## Acceptance criteria

- `grep -r "chameleon\|ChEdit" src/` returns nothing; dependency removed;
  bundle size drops (note before/after of `npm run build` output in the PR).
- On a phone: email field gets the email keyboard, OTP field gets the numeric
  keyboard and offers the emailed code, numeric trip fields get numeric
  keyboards.
- All forms create/edit rows exactly as before (manually verify one of each:
  trip, service, purchase, plate, join-code, login).
- `npm run type-check` passes with no `any` in input handlers.
