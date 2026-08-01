-- Normalizes casing of "ANCAP" (Uruguay's state fuel-station brand, an
-- acronym — official spelling is all-caps) in station names — most
-- OpenChargeMap contributors wrote "Ancap" (title case), a few "ANCAP".
-- Explicit per-row updates generated from the live data, same approach as
-- 0035_clean_station_names.sql / 0037_normalize_tata_names.sql.
-- Apply with `npx supabase db push`.

update public.charging_stations set name = 'ANCAP America' where id = '2fb0ea2c-ceb8-4b2e-ae8d-c351a337ed2c';
update public.charging_stations set name = 'ANCAP Canelones' where id = 'e33edb7d-e1c0-4af6-be85-40714526bf57';
update public.charging_stations set name = 'ANCAP Carrasco' where id = 'a8961564-e738-453c-8a99-32112a4a320d';
update public.charging_stations set name = 'ANCAP Constancia' where id = 'f6c679bf-de67-47f8-b41e-0434f32e16c5';
update public.charging_stations set name = 'ANCAP Dolores' where id = '92dcbe91-b511-4bcd-9033-378f6a91a56f';
update public.charging_stations set name = 'ANCAP Florencio Sánchez' where id = '336551d9-e130-4661-a871-e7a182c2d460';
update public.charging_stations set name = 'ANCAP Francolino' where id = 'e5d299e2-8bf2-473d-aac6-a9b20289166e';
update public.charging_stations set name = 'ANCAP Fray Bentos' where id = '40531df8-c739-45cc-8c40-871f9b17ab48';
update public.charging_stations set name = 'ANCAP Guichon' where id = 'd554002f-be7b-46ce-ac07-b1f24ac47397';
update public.charging_stations set name = 'ANCAP Jose Enrique Rodo' where id = '07f733b1-df0c-4c4b-8924-7e1cce510636';
update public.charging_stations set name = 'ANCAP Jose Ignacio' where id = '25ec6945-8cf0-4964-bd2e-31d0fbf0d26e';
update public.charging_stations set name = 'ANCAP La Radial' where id = '1c22023a-48fb-4339-9c1b-e4f69c1c823a';
update public.charging_stations set name = 'ANCAP Mercedes' where id = '74e6f93e-d7f4-45c0-b456-a35c0b6c2e50';
update public.charging_stations set name = 'ANCAP Nueva Palmira' where id = '08b5b220-e7e8-4fc1-80cf-e11a138a24e1';
update public.charging_stations set name = 'ANCAP Paso de los Toros' where id = '89b13504-860c-4821-9839-ffe6f3a6f581';
update public.charging_stations set name = 'ANCAP Rio Branco' where id = '994f0d95-bf9b-4c85-840d-9e0c768aa1db';
update public.charging_stations set name = 'ANCAP Rocha' where id = 'e88db722-8e95-4dba-8c79-c4c93d2758dd';
update public.charging_stations set name = 'ANCAP Roosevelt' where id = '4d7919f3-a02c-4012-b3c6-e76b2664c4ca';
update public.charging_stations set name = 'ANCAP Ruta 39 Y Perimetral' where id = 'be621f99-13a0-4bf6-ba01-b444c9294012';
update public.charging_stations set name = 'ANCAP Ruta 39 Y Perimetral' where id = '0ddeb8ff-33bb-48a4-9cb6-a66f99579747';
update public.charging_stations set name = 'ANCAP San Jacinto' where id = '5635dcbf-710b-40f1-aff2-b5945d71364f';
update public.charging_stations set name = 'ANCAP San Jose de Mayo' where id = '0e6590c9-699a-4e89-adc2-62e3c51240eb';
update public.charging_stations set name = 'ANCAP SanLuis' where id = 'f5258d70-44ac-4da5-8458-3d49020c9bcd';
update public.charging_stations set name = 'ANCAP SanLuis' where id = 'e1408fc4-26dd-4a13-a936-2419216fdcfd';
update public.charging_stations set name = 'ANCAP Trinidad' where id = 'ae1566fb-0fae-4183-ab2a-9af0af9ce1a7';
update public.charging_stations set name = 'Cargador Ute ANCAP' where id = '5d68d833-9566-4013-b641-bc3df2c0fc32';
update public.charging_stations set name = 'Cargador Ute ANCAP Mariscala' where id = '73a9d2d1-f01e-4516-a510-142d03274c6d';
