-- Normalizes casing of "Ta-Ta" (the supermarket chain, official spelling)
-- in station names — OpenChargeMap contributors wrote it three different
-- ways ("Ta-Ta", "TaTa", "Tata"). Explicit per-row updates, generated from
-- the actual live data, same approach as 0035_clean_station_names.sql.
-- Apply with `npx supabase db push`.

update public.charging_stations set name = 'Ta-Ta Durazno' where id = '04b730e6-19c0-4ebc-b1df-9e8f8345a231';
update public.charging_stations set name = 'Ta-Ta Florida' where id = '84f3771f-18d4-4a5a-82f8-77371103760f';
update public.charging_stations set name = 'Ta-Ta Maldonado' where id = '1e95e21d-0b69-4e94-836c-35df9135b503';
update public.charging_stations set name = 'Ta-Ta Paysandú' where id = '109b6b26-a9df-45ad-88e2-e940ba23bec6';
update public.charging_stations set name = 'Ta-Ta Tacuarembó' where id = '0ad09e4e-9745-4f34-ab3e-0f750e6e3c67';
