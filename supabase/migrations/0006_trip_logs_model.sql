-- Phase 3 follow-up: record which Vigo model (E2 / E2+) a trip was made
-- with, since battery size changes what "normal" charging behavior looks
-- like for anyone reading a shared trip. Required in the app whenever
-- is_public is true; nullable here since private entries can skip it.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.trip_logs
  add column model text check (model in ('E2', 'E2+'));
