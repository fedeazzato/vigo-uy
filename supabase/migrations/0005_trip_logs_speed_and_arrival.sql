-- Phase 3 follow-up: battery on arrival at the final destination, and mean
-- speed (overall trip, and per charging-stop leg — the latter lives inside
-- the existing charging_stops jsonb column, no schema change needed for it).
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

alter table public.trip_logs
  add column ending_charge_percentage smallint check (ending_charge_percentage between 0 and 100),
  add column average_speed_kmh numeric check (average_speed_kmh >= 0);
