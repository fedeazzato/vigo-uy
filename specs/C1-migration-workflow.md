# C1 — Supabase CLI migration workflow

**Status:** TODO · **Phase:** C · **Depends on:** nothing

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
