# C5 — Trip form progressive disclosure

**Status:** Done (2026-07-12) · **Phase:** C · **Depends on:** C3 (do input migration first
so this spec doesn't restyle ChEdit markup it's about to delete)

## Context

`src/pages/NewTripLogPage.tsx` presents ~8 top-level fields plus unbounded
per-stop sub-forms before the save button — a wall of optional numeric inputs
on a phone. Two concrete problems for non-technical users:

- The battery/speed fields are optional power-user detail but visually equal
  to the required basics.
- The "model required when public" rule surfaces only as a submit-time error
  referring to a field at the very bottom of the form.

## Requirements

1. **Sectioning.** Keep visible by default: Título, Origen, Destino, Fecha,
   Distancia, Calificación, Notas, Modelo, checkbox "Compartir con la
   comunidad", submit/cancel.
2. Collapse behind a disclosure ("Agregar detalles de batería y carga ▾"):
   Batería al salir/llegar, Velocidad media, and the whole Paradas de carga
   block. Implementation: a `<details>`/`<summary>` styled to match cards, or
   equivalent `useState` toggle — no new dependency. **Auto-expand** in edit
   mode when any of those fields already has a value (otherwise the user
   can't see their data).
3. **Model placement.** Move the Modelo selector + the public checkbox into
   one visually grouped block near the submit button, with inline helper
   text: when `isPublic` and no model selected, show the hint next to the
   selector *before* submit (keep the submit-time guard as backstop).
4. Preserve every existing validation rule and the payload shape exactly
   (server trigger handles `vehicle_id`; never send it).
5. Apply the same pattern to `NewPartPurchasePage`/`NewServiceEntryPage`
   **only if** they have a comparable optional-detail cluster (odometer/
   city/rating could group under "Más detalles ▾" — use judgment; the trip
   form is the mandatory deliverable).

## Files

- `src/pages/NewTripLogPage.tsx`, `NewTripLogPage.module.css`
- Optionally the other two form pages + their module CSS

## Acceptance criteria

- Fresh "Nuevo viaje" on a 390px viewport: everything above the fold or one
  short scroll; battery/stops hidden until expanded.
- Editing a trip that has stops or battery data opens with the section
  expanded and populated.
- Submitting public-without-model shows guidance at the model block without
  losing entered data.
- Payloads identical to before (verify an insert in the network tab).
- Spanish text; `npm run type-check` passes.
