# D2 — Moderator-verified content (the end state for "Oficial")

**Status:** Done (2026-07-12) · **Phase:** D · **Depends on:** A1 (migration numbering) —
content-wise independent

## Context

Today "Oficial" content means hand-edited JSON in `src/data/`. The end state
of the static→dynamic transition (see D1) is that curation happens **in the
database**: moderators promote high-quality community entries to verified
status, and verified rows render with the "Oficial" badge. Hand-maintained
JSON then retires page by page.

Security constraint: users can UPDATE their own rows, so a plain `verified`
column would be self-assignable. It needs the same protection pattern as
`profiles.is_moderator` (trigger reverts changes unless the caller is a
moderator) — but note the mechanism must differ slightly: content-row updates
by moderators happen through normal UPDATEs (the update RLS policy already
allows moderators to update any row), not through a SECURITY DEFINER RPC, so
the trigger should check moderator status directly rather than the
`vigo.admin_action` GUC.

## Requirements

### 1. Migration (next free number)

- Add `verified boolean not null default false` to `service_entries`,
  `trip_logs`, `part_purchases`.
- One trigger function `public.prevent_unauthorized_verify()` applied
  `before update` on all three tables: if `new.verified is distinct from
  old.verified` and the caller is not a non-banned moderator (check via a
  SECURITY DEFINER helper against `profiles`, reusing `is_user_banned` /
  the pattern of `assert_moderator` but returning boolean, not raising),
  revert `new.verified := old.verified`. Also revert when `auth.uid()` is
  null-safe direct SQL? No — keep the SQL Editor bootstrap path working like
  0008 does: only revert when `auth.uid() is not null`.
- Also force `verified := false` on INSERT (before-insert trigger or column
  default + strip from insert): a user must not be able to insert
  pre-verified rows. Simplest: in the same trigger function handle
  `TG_OP = 'INSERT'` by setting `new.verified := false` unless the caller is
  a moderator.
- No RLS changes: verified rows are already public rows; visibility rules
  unchanged.

### 2. Moderation UI

`src/pages/ModerationPage.tsx`: add a "Verificar" / "Quitar verificación"
action next to Ocultar/Eliminar on each content item, doing a normal
`update({ verified: !current })`. Show a "Verificado" badge on verified items
in the list.

### 3. Public rendering

- `types.ts` (or generated types per C2): add `verified` to the three row
  types.
- CommunityFeedPage, CostsPage community entries, RoutesPage community
  trips: verified rows get `Badge color="blue">Oficial</Badge>` instead of
  (or in addition to) "Comunidad", and sort **verified first** within their
  sections.
- D1's `preferCommunity` thresholds may later count only verified rows —
  leave a comment hook, don't implement.

## Files

- `supabase/migrations/00XX_verified_content.sql` (new)
- `src/pages/ModerationPage.tsx`, `CommunityFeedPage.tsx`, `CostsPage.tsx`,
  `RoutesPage.tsx`, `src/types.ts`

## Acceptance criteria

- A regular user updating their own row with `verified: true` via PostgREST
  gets the value silently reverted (row saves, flag unchanged) — verify with
  a direct REST call.
- A moderator can toggle it from the moderation page; the badge and ordering
  update on the public feed.
- Inserting with `verified: true` as a regular user results in `false`.
- SQL Editor manual updates still work (bootstrap path preserved).
- `npm run type-check` passes; Spanish UI text.
