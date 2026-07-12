# D3 — Minor security follow-ups

**Status:** TODO · **Phase:** D · **Depends on:** nothing

## Context

Lower-severity audit findings, batched. Each item is independent; do them in
one migration + small frontend edits where noted.

## Requirements

### 1. Narrow the authenticated `profiles` SELECT policy

Today any signed-in user can read every profile's `city`, `model`, `color`,
`is_moderator`, and `banned_at` (ban status especially should be
moderator-only). Change the authenticated select policy to own-row only
(`auth.uid() = id`). Prerequisite frontend changes — do them in the same PR:

- `src/pages/ModerationPage.tsx` builds its author-name map from
  `profiles.select('id, display_name')`. Replace with the data already
  returned by `admin_list_users()` (it includes `id` + `display_name` for
  every user, including banned ones — `public_profiles` excludes banned
  users so it is NOT a substitute here).
- Grep for other `from('profiles').select` uses: `AuthContext.refreshProfile`
  (own row — fine), `ProfilePrefsSync` (own row update — fine),
  `ProfileCard` (verify it reads/writes own row only).
- Verify RLS policy subqueries that reference `profiles` (moderator checks in
  content-table policies) still work: they run as the querying user, but
  `exists (select 1 from profiles where id = auth.uid() and is_moderator)`
  is an own-row read, so it passes the narrowed policy. Confirm with a test
  query as a moderator.

### 2. Rate-limit `join_vehicle_by_code`

Brute-forcing the 31^6 code space is impractical, but the RPC is unmetered.
Add a small attempts table (`join_code_attempts(user_id, attempted_at)`,
no RLS needed if only touched inside the SECURITY DEFINER function) and
reject with a Spanish message after 10 failed attempts per hour per user.
Clean old rows opportunistically inside the function.

### 3. Document the `is_user_banned` oracle as accepted

`is_user_banned(uuid)` is executable by `anon` and reveals ban status for
arbitrary UUIDs. It **cannot** be revoked: the anon RLS policies call it and
policy expressions run with the caller's privileges. UUIDs are not
enumerable, so accept the risk — add a comment in the function (via
`comment on function`) and a line in CLAUDE.md's anon-surface list so a
future audit doesn't re-flag it.

### 4. Self-host fonts

`index.html` loads Inter + Space Grotesk from Google Fonts (third-party
request, needs network on first PWA load before the runtime cache warms).
Replace with `@fontsource/inter` and `@fontsource/space-grotesk` npm
packages imported in `src/main.tsx` (only the used weights: 400/500/600 and
400/500/600/700). Remove the `<link>` tags and the two Google Fonts
runtimeCaching entries in `vite.config.ts`. Verify woff2 files land in the
precache manifest (`globPatterns` already includes woff2).

## Files

- One new migration (policy change, attempts table, function comment)
- `src/pages/ModerationPage.tsx`
- `index.html`, `vite.config.ts`, `src/main.tsx`, `package.json`
- `CLAUDE.md` (anon-surface note)

## Acceptance criteria

- Signed-in non-moderator querying another user's profile row gets zero rows;
  moderation page still shows author names for all content, including from
  banned users; content-table moderator policies still function.
- 11th failed join-code attempt within an hour returns the Spanish
  rate-limit error; a correct code still works after entering it correctly
  on a fresh hour.
- Site loads with fonts and zero requests to `fonts.googleapis.com` /
  `fonts.gstatic.com`; fonts render offline in the installed PWA.
- `npm run build` and `npm run type-check` pass.
