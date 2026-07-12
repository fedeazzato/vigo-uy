# A5 — Friendly Spanish errors + app-level error boundary

**Status:** Done (2026-07-12) · **Phase:** A · **Depends on:** nothing

## Context

Two failure modes reach non-technical Spanish-speaking users raw:

1. Supabase/network errors are shown verbatim via `setError(error.message)` —
   English strings like `Failed to fetch`, `JWT expired`, PostgREST codes.
   This happens in LoginPage, Dashboard, all three form pages, VehicleCard,
   ProfileCard, ModerationPage, CommunityFeedPage.
2. Any uncaught render error blanks the entire app (no React error boundary).

Note: the database triggers deliberately `raise exception` with **Spanish**
messages ("Tu cuenta está suspendida.", "Límite diario…", "Código no
válido.") — those must pass through untouched.

## Requirements

### 1. `src/lib/errors.ts` (new)

Export `toFriendlyError(error: unknown): string`:

- If the error is a PostgREST/PL-pgSQL raised exception (Supabase error with
  `code === 'P0001'`, or the message matches one of our known Spanish trigger
  messages), return the message as-is — these are intentional user-facing
  strings from our own migrations.
- Map known English patterns to Spanish:
  - `Failed to fetch` / `NetworkError` / `Load failed` → "Sin conexión.
    Revisá tu internet e intentá de nuevo."
  - Rate limit (`over_email_send_rate_limit`, 429) → "Demasiados intentos.
    Esperá un momento e intentá de nuevo."
  - Invalid/expired OTP (`otp_expired`, "Token has expired") → "El código no
    es válido o venció. Pedí uno nuevo."
  - CAPTCHA failure (`captcha`) → "Falló la verificación de seguridad.
    Recargá la página e intentá de nuevo."
  - RLS violation (`42501` / "row-level security") → "No tenés permiso para
    hacer eso."
  - CHECK violation (`23514`) → "Alguno de los datos ingresados no es válido."
- Fallback: "Ocurrió un error inesperado. Intentá de nuevo." — and
  `console.error` the original error so it stays debuggable.

### 2. Apply it everywhere errors are surfaced

Replace every `setError(error.message)` / `setError(res.error?.message …)`
with `setError(toFriendlyError(error))`. Grep for `.message` across
`src/` to find them all. `communityData.ts` helpers return `error?.message ??
null` — route those through the mapper too (at the helper level, so pages
stay unchanged).

### 3. `src/components/ErrorBoundary.tsx` (new)

Class component (boundaries must be classes). Renders a centered Card with:
"Algo salió mal." + a "Recargar la página" button (`location.reload()`).
Mount it in `src/App.tsx` **inside** `Layout`'s content area if practical, or
wrap `<Routes>`; the sidebar/header surviving a page crash is preferred but
not required. Match existing UI primitives (`Card`, `Alert`) and CSS-module
styling; dark mode must work (use existing tokens).

## Files

- `src/lib/errors.ts` (new)
- `src/components/ErrorBoundary.tsx` (new)
- `src/App.tsx`
- Every page/component currently doing `setError(....message)` (~9 files)
- `src/lib/communityData.ts`

## Acceptance criteria

- Kill the network (devtools offline) and load /comunidad → Spanish offline
  message, not "Failed to fetch".
- Enter a wrong OTP code → Spanish message.
- A banned user's insert still shows "Tu cuenta está suspendida." verbatim.
- Throwing inside a page component shows the fallback card instead of a
  white screen; theme toggle still styled correctly in dark mode.
- All new UI text in Latin American Spanish; `npm run type-check` passes.
