# C1 — Supabase CLI migration workflow

**Status:** Done (2026-07-12) — code/docs complete; the link + baseline steps
below require the maintainer's Supabase access token · **Phase:** C ·
**Depends on:** nothing

## Maintainer checklist (run once, ~5 minutes)

The CLI is installed as a dev dependency and `supabase/config.toml` is
committed. The existing `NNNN_name.sql` filenames are valid CLI versions —
no renames needed. To finish:

1. `npx supabase login` (opens browser; or set `SUPABASE_ACCESS_TOKEN`).
2. `npx supabase link --project-ref <ref>` — the ref is the subdomain of
   `VITE_SUPABASE_URL` (e.g. `abcd1234` from `https://abcd1234.supabase.co`).
3. Baseline the hand-pasted history (marks 0001–0019 as already applied):
   `npx supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 0019`
4. Verify: `npx supabase migration list` shows local and remote in sync, and
   `npx supabase db push` reports nothing to push.
5. Drift audit: `npx supabase db diff --linked` — an empty diff confirms the
   hand-pasting never missed a migration; if it reports drift, save the output
   (that is the audit this spec exists for) before reconciling.
6. Then C2: `npm run gen:types` to generate `src/lib/database.types.ts`.

## Context

Sixteen (and counting) migration files are applied by hand-pasting into the
Supabase SQL Editor. There is no record of what has actually been applied to
production, and several migrations `create or replace` earlier objects — one
missed paste means silent drift the frontend cannot detect (all reads are
blind type casts). This also blocks C2 (generated types need a linked
project or a local shadow DB).

## Requirements

1. Add the Supabase CLI as the migration path:
   - `supabase init` (commit `supabase/config.toml`; keep the existing
     `supabase/migrations/` files — the CLI uses the same directory and the
     files are already timestamp-ordered by their numeric prefix; **rename
     only if the CLI requires its `<timestamp>_name.sql` format** — if so,
     rename preserving order and document the mapping in the commit message).
   - `supabase link --project-ref <ref>` (ref comes from
     `VITE_SUPABASE_URL`; requires an access token — the maintainer must run
     this step; make the spec's setup section a checklist for them).
   - Baseline: mark all existing migrations as applied on the remote with
     `supabase migration repair --status applied <version>` for each (they
     were pasted by hand), then verify `supabase migration list` shows local
     and remote in sync, and `supabase db diff --linked` is empty (or explain
     any diff found — that *is* the drift audit this spec exists for).
2. New workflow, documented in `CLAUDE.md` (replace the "paste into SQL
   Editor" convention):
   - create: `supabase migration new <name>`
   - apply: `supabase db push`
   - never edit an applied migration.
3. Update the header comment convention for future migration files (no more
   "paste into the SQL Editor" line).
4. Do **not** set up local Docker-based development (`supabase start`) as a
   requirement — optional note only.

## Files

- `supabase/config.toml` (new, committed)
- `CLAUDE.md` (workflow section)
- Possibly renamed files under `supabase/migrations/`

## Acceptance criteria

- `supabase migration list` shows every migration as applied both locally
  and remotely.
- `supabase db diff --linked` reports no unexpected drift (any drift found is
  written up in the commit/PR description).
- CLAUDE.md documents create/apply commands; the old paste instruction is
  gone.
- A dry-run `supabase db push` with no pending migrations is a no-op.

## Out of scope

CI automation of migrations; generated types (C2).
