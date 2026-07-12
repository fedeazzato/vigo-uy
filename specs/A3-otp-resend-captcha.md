# A3 — Fix OTP resend CAPTCHA bypass

**Status:** TODO · **Phase:** A · **Depends on:** nothing

## Context

`src/pages/LoginPage.tsx` gates the first "Enviar código" behind Cloudflare
Turnstile (`TurnstileWidget`, enabled when `VITE_TURNSTILE_SITE_KEY` is set),
but `handleResend()` calls `sendOtp(email)` **without a token**. Consequences:

- If CAPTCHA verification is enforced in Supabase Auth settings, "Reenviar
  código" always fails — with a raw English error.
- If it is not enforced server-side, the widget on the first step is
  decorative (any bot can call `signInWithOtp` directly).

## Requirements

1. On the **code step**, when `TURNSTILE_ENABLED`, render a `TurnstileWidget`
   (reuse the existing `turnstileKey` remount pattern) and disable the
   "Reenviar código" button until a fresh token exists.
2. `handleResend()` passes the token to `sendOtp(email, captchaToken)`, then
   clears the token and bumps `turnstileKey` (tokens are single-use).
3. Keep the 60 s cooldown; the button label already shows the countdown.
   Wording when waiting for the widget: keep it simple — the button stays
   disabled; add a short hint only if the widget is slow to load.
4. Verify (and note in the PR/commit message) whether "CAPTCHA protection" is
   actually enabled in the Supabase dashboard for this project. If it is off,
   recommend turning it on — otherwise the whole Turnstile flow enforces
   nothing. This is a dashboard setting, not code; flag it for the maintainer.
5. Any error surfaced must be in Spanish (coordinate with A5 if it landed
   first; otherwise a minimal inline mapping is fine).

## Files

- `src/pages/LoginPage.tsx`
- `src/components/TurnstileWidget.tsx` (only if it needs an `onExpire`
  callback or similar; prefer not touching it)

## Acceptance criteria

- With Turnstile enabled: resend is blocked until the widget solves, then
  succeeds; a second resend requires a new token.
- With `VITE_TURNSTILE_SITE_KEY` unset: behavior identical to today (no
  widget, resend works).
- `npm run type-check` passes.

## Out of scope

Rate-limiting on the Supabase side; passkey flows.
