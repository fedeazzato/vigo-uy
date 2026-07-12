# A4 — CSV formula-injection guard

**Status:** Done (2026-07-12) · **Phase:** A · **Depends on:** nothing

## Context

`src/lib/csvExport.ts` (`escapeCsvValue`) escapes quotes/commas/newlines but
not spreadsheet formula triggers. A cell beginning with `=`, `+`, `-`, `@`,
tab, or CR executes as a formula when the exported file opens in Excel/Sheets
(e.g. `=HYPERLINK(...)` in a trip note). Exports currently contain only the
user's own rows, but notes can hold pasted content, and future exports may
include community data.

## Requirements

1. In `escapeCsvValue`, when the string starts with `=`, `+`, `-`, `@`, `\t`
   or `\r`, prefix it with a single quote `'` **before** the existing
   quote-wrapping logic runs.
2. Do not mangle plain negative numbers: values that arrive as `number` type
   must be stringified **without** the prefix (only apply the guard to values
   that were strings to begin with). A negative cost typed as a number should
   export as `-500`, not `'-500`.
3. Add a short comment explaining why (formula injection), per the existing
   comment style.

## Files

- `src/lib/csvExport.ts`

## Acceptance criteria

- A note of `=1+2` exports as `'=1+2`; opening in Excel shows the literal
  text, not `3`.
- Numeric columns (costs, km) are unchanged in the output.
- Quoting behavior for commas/quotes/newlines unchanged.
- `npm run type-check` passes.
