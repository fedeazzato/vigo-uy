-- Every charging_stations row now has coordinates (209 from the OpenChargeMap
-- seed, plus the one manually-added gap fixed in migration 0040). The app's
-- only insert path (createChargingStation) now always supplies lat/lng too,
-- via a required LocationPicker field on both add-station forms. This makes
-- that guarantee durable at the data layer: if any row still had a null
-- (e.g. one added outside the app, via the SQL Editor), this migration fails
-- loudly against the remote DB instead of letting the gap reopen silently.
-- Apply with `npx supabase db push`.

alter table public.charging_stations
  alter column lat set not null,
  alter column lng set not null;
