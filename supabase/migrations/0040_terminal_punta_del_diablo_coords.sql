-- "Terminal Punta del Diablo" (UTE network) was added manually without
-- lat/lng, unlike the 209 OpenChargeMap-seeded stations which all carry
-- coordinates. It's the only charging_stations row missing coordinates
-- (verified by a full-table audit). No precise street address is on file,
-- so this uses the town center of Punta del Diablo, Rocha -- close enough
-- for the trip map to place the pin correctly at zoom levels used there.
-- Apply with `npx supabase db push`.

update public.charging_stations
set lat = -34.0489, lng = -53.5406
where id = '801092c5-cdb1-4924-8df6-5b43fa6a701f';
