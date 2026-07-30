-- Trip titles are fully derived (specs/trip-title-arrow-separator.md — no
-- UI ever lets a user type a custom one), previously generated as
-- "{origin} - {destination}". Standardize on the arrow the search RPC
-- already uses for the same route (0028_site_search.sql:
-- origin || ' → ' || destination): "{origin} → {destination}".
--
-- Re-run note: safe to re-run — recomputes every row's title from its own
-- origin/destination columns rather than string-replacing the old
-- separator, so a second run is a no-op.

update public.trip_logs
  set title = origin || ' → ' || destination
  where title <> origin || ' → ' || destination;
