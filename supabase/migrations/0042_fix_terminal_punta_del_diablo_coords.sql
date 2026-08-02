-- 0040 estimated this station's location as the town center of Punta del
-- Diablo, since no precise address was on file. A user reported the pin
-- looked "way off" on the map. Looked up the real "Terminal de Omnibus"
-- (bus terminal) via OpenStreetMap/Nominatim -- it's ~2.4km from the town
-- -center estimate, which is enough to visibly miss the town on a
-- street-level zoom. Apply with `npx supabase db push`.

update public.charging_stations
set lat = -34.0367, lng = -53.5618
where id = '801092c5-cdb1-4924-8df6-5b43fa6a701f';
