# A2 — Neutral default display names + first-login name prompt

**Status:** TODO · **Phase:** A · **Depends on:** nothing

## Context

`handle_new_user()` (defined in 0001, last replaced in
`supabase/migrations/0015_vehicle_identity.sql` — **edit that latest version**)
sets `display_name = split_part(new.email, '@', 1)`. `public_profiles` exposes
`display_name` to the `anon` role, so every user who never edits their name has
their email local-part published to the open internet (the leaderboard also
lists member names publicly). This is a PII leak for non-technical users who
will never find the ProfileCard editor on their own.

## Requirements

### 1. Migration `supabase/migrations/0018_neutral_display_names.sql`

- `create or replace function public.handle_new_user()` based on the **0015
  version** (it also provisions the vehicle — keep that logic intact), changing
  only the display name to a neutral default: `'Miembro ' || <4 random digits>`
  e.g. `'Miembro ' || lpad((floor(random() * 10000))::int::text, 4, '0')`.
  Uniqueness is not required.
- Backfill: for existing profiles whose `display_name` still equals their email
  local-part, replace it with a neutral name. The migration runs in the SQL
  Editor as postgres, so it can join `auth.users`:
  `update public.profiles p set display_name = ... from auth.users u where u.id = p.id and p.display_name = split_part(u.email, '@', 1);`
  (Accepted edge case: a user who deliberately chose a name identical to their
  email local-part gets renamed too.)

### 2. Frontend prompt

- In `src/pages/MyVigoPage.tsx` (the account page), when signed in and
  `profile.display_name` matches `/^Miembro \d{4}$/`, show a dismissable
  `Alert type="info"` above `ProfileCard`: explain that their public name is a
  placeholder and they should pick one ("Elegí cómo querés aparecer en la
  comunidad — ahora te mostramos como *Miembro 1234*."). No modal, no new
  route — ProfileCard directly below already edits the name.
- Optional (nice-to-have): the community feed already falls back to
  `'un usuario'`; nothing else changes.

## Files

- `supabase/migrations/0018_neutral_display_names.sql` (new)
- `src/pages/MyVigoPage.tsx`

## Acceptance criteria

- A brand-new signup gets `Miembro NNNN` as public name; vehicle provisioning
  still works (profile + vehicle + membership rows all created).
- No `public_profiles` row equals the local-part of the user's email after
  backfill (verify with a join query in the SQL Editor; include that query as
  a comment in the migration).
- Signed-in user with a placeholder name sees the prompt on Mi Vigo; it
  disappears once they save a custom name (state comes from `profile`, so
  `refreshProfile()` after ProfileCard save must already handle this — verify).
- UI text in Latin American Spanish.

## Out of scope

Renaming the leaderboard label scheme; moderation tooling.
