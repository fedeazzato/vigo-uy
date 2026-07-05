-- Phase 3 follow-up: track battery charge at trip start.
-- Per-stop charge fields (distance from previous stop, arrival/departure %,
-- charging duration) live inside the existing charging_stops jsonb column
-- and need no schema change — only this trip-level column does.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.trip_logs
  add column starting_charge_percentage smallint check (starting_charge_percentage between 0 and 100);
