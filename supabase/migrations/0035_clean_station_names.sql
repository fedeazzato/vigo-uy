-- Strips redundant network-name tags from station names seeded in 0034 —
-- OpenChargeMap contributors habitually prefix a station with its operator
-- ("[DMC] Estación Mercedes", "UTE Joanicó"), which is pure duplication
-- once the station already sits under that network's Card heading in
-- CommunityStations.tsx. Generated from the actual live data and reviewed
-- by hand (specs/charging-stations-filters-and-cleanup.md) rather than a
-- live regex, so this is an explicit, auditable list.
-- Apply with `npx supabase db push`.

update public.charging_stations set name = 'Club Ituzaingo' where id = '567221e9-50b3-48ce-a94d-22bb64d7760e';
update public.charging_stations set name = 'Estación Atlántida' where id = '68862702-265f-40fc-9d21-c99c7bd486f7';
update public.charging_stations set name = 'Estación Centenario' where id = 'abc927e9-dc34-4e91-9c0c-b636b92c95b8';
update public.charging_stations set name = 'Estación Mercedes' where id = '93bb088b-d4e5-4fc5-a226-bd337bdf3eae';
update public.charging_stations set name = 'Estacion Salinas' where id = '60f5631b-446b-4361-8216-f51109398e46';
update public.charging_stations set name = 'Estación Sarandí Grande' where id = 'd33e6605-b1a3-49b3-a8c1-e45ef7c070da';
update public.charging_stations set name = 'Paysandú Sura' where id = 'aafde910-3104-4ce5-857b-66efc52e09d0';
update public.charging_stations set name = 'Axion Valdense' where id = '5422eccb-a10a-4dba-9a62-5051e74168d0';
update public.charging_stations set name = 'Disco Fresh Market Parada 5' where id = 'b14b455b-9265-4943-aef7-ab2838b36fda';
update public.charging_stations set name = 'Hotel Hampto By Hilton' where id = '390b3e9d-f087-4a70-9b78-5a6cf8adc346';
update public.charging_stations set name = 'Axion Carrasco' where id = '0309def2-986f-4b51-a8f2-414832769447';
update public.charging_stations set name = 'Axion Peninsula' where id = 'c473b8fa-c2e0-46b7-9991-3ee10082cbee';
update public.charging_stations set name = 'Axion Perimetral' where id = 'bb0f5c6f-be6d-4e38-ad74-26f646f554d2';
update public.charging_stations set name = 'Axion Prado' where id = 'bde413d0-872a-4a30-8dca-049bcefaa7f3';
update public.charging_stations set name = 'Axion Prado' where id = '326bfa98-27ad-4fe6-96fd-708d26af8f8f';
update public.charging_stations set name = 'Car One' where id = '1ccdb7f9-dd0c-4343-b104-815eaa9e5c93';
update public.charging_stations set name = 'Disco Fresh Market Italia' where id = '2877d6b5-ca12-47b1-ada5-071ba15c2440';
update public.charging_stations set name = 'Disco Fresh Market Legrand' where id = '7aba45eb-0e71-4164-861e-d838e1cff749';
update public.charging_stations set name = 'Disco Fresh Market Scoseria' where id = '105b07ae-1c2f-474a-803e-5023b8cd2aca';
update public.charging_stations set name = 'Fresh Market Disco 8' where id = '702d6d89-4076-448f-b9ef-a4d2d3db9ed0';
update public.charging_stations set name = 'Geant 1' where id = 'c68f7535-7ec7-47f4-9c33-7ba28797d8b9';
update public.charging_stations set name = 'Géant 2' where id = '351ebe32-e943-4ae9-9495-1ea609362be2';
update public.charging_stations set name = 'LIV District Carrasco 1' where id = '0542d197-3273-40e7-b12b-964db3aee919';
update public.charging_stations set name = 'Parador Fito' where id = 'a6792587-0d72-4174-ad37-d6e4a626ad60';
update public.charging_stations set name = 'DISA Punta Ballena' where id = 'fc846daf-2df7-43ac-91d6-a39d9ffa18b2';
update public.charging_stations set name = 'Open Mall' where id = '93189411-17a4-47d1-ad45-3b52d93e1883';
update public.charging_stations set name = 'Open Mall' where id = 'a2dcc923-e867-427b-9bf7-e5ced90930c5';
update public.charging_stations set name = 'Open Mall' where id = '78059962-214b-41eb-89b3-a4fb17175fc4';
update public.charging_stations set name = 'Atalantico Shopping' where id = '6307fd8d-a437-4f3b-b853-696169df7934';
update public.charging_stations set name = 'Atalantico Shopping' where id = '8d5df917-ec37-4c33-822e-86313e91bc22';
update public.charging_stations set name = 'Montevideo Shopping' where id = '0a51e026-c631-4476-b755-ac39e44dfef0';
update public.charging_stations set name = 'Shopping Plaza Italia' where id = '426894c3-2a5c-462b-bfa4-e0d92d2726b8';
update public.charging_stations set name = 'Shopping Tres Cruces' where id = 'ba4027a2-31ca-430d-93ff-ea08d45f22b1';
update public.charging_stations set name = 'Ta-Ta Rocha' where id = '94b10f01-c45f-4ed0-84bd-4d9d708a52a7';
update public.charging_stations set name = 'Estación Peninsula' where id = '0d3013c1-493f-41b3-adbb-7d011462f623';
update public.charging_stations set name = 'Estación Peninsula' where id = '54e73bae-ed67-440c-b203-00dffce58e81';
update public.charging_stations set name = 'Parque Nacional de Santa Teresa, Rocha' where id = 'a4852817-ebf6-4f9f-8b96-6d828bf7573b';
update public.charging_stations set name = 'Plaza de Los Ninos' where id = 'bdb0ef9c-f577-4c80-bc43-76bccf434a0d';
update public.charging_stations set name = 'Plaza San Jacinto' where id = '9ec4bc70-2002-4030-9dad-7cb50d262a38';
update public.charging_stations set name = 'Terminal Piriápolis' where id = 'e39ea296-f410-4c3a-98ea-21c4059f184a';
update public.charging_stations set name = 'Cementerio San José de Mayo' where id = '14fc93f1-9d25-4170-8f9d-fdb6ca132dce';
update public.charging_stations set name = 'Centro Cultural La Paloma' where id = 'b4ebeeb0-b5c1-43cb-b94e-84973ff16765';
update public.charging_stations set name = 'Colonia Shopping' where id = '2e8ab4bf-cd21-43fd-a4eb-01d4daf50295';
update public.charging_stations set name = 'Colonia Shopping' where id = '539647f1-615b-4c7f-97ee-6c29bd470666';
update public.charging_stations set name = 'Colonia Valdense' where id = '03012001-e3cf-42df-be40-e860e86130f3';
update public.charging_stations set name = 'Ecilda Paullier' where id = '42f4b147-fe9e-4639-b9b6-8ad3feb451be';
update public.charging_stations set name = 'El Pinar' where id = 'ffe5f5a1-4fae-466a-abdb-53c174cf959a';
update public.charging_stations set name = 'Estadio Martínez Monegal' where id = '275cb8ba-f4a1-4975-a190-6176833a4e4c';
update public.charging_stations set name = 'Joanicó' where id = 'c0d17bba-b3f0-4778-9268-75d1de73b324';
update public.charging_stations set name = 'Joanicó' where id = 'e2fce1b5-6128-4543-b658-bb55eecb95af';
update public.charging_stations set name = 'La Paloma' where id = 'dfbd42fb-a6ff-4da5-9408-25c45562dc1a';
update public.charging_stations set name = 'Montevideo Shopping' where id = '655fcdf9-9460-4907-8d02-513f1a2e1aef';
update public.charging_stations set name = 'Pinamar' where id = 'b65c1fa2-2b63-4c62-98ad-360697e3805e';
update public.charging_stations set name = 'Punta del Este - Parada 5' where id = '4c827d9e-14e0-4634-adaf-30810cbeab85';
update public.charging_stations set name = 'Punta del Este - Parada 5' where id = '0afc6960-c13b-4061-81f9-aa782d67b0c5';
update public.charging_stations set name = 'Ta-Ta' where id = 'a4366b0d-9033-4a08-a64b-85dbc717a237';
update public.charging_stations set name = 'Terminal Del Cerro' where id = '8664d91e-6e3d-4d98-b25c-3a9bc96c975a';
update public.charging_stations set name = 'Terminal Del Cerro' where id = '45b756e3-f89e-416d-8c86-6f478fde91c7';
update public.charging_stations set name = 'Terminal del Cerro 2' where id = 'd4de3c11-0a69-4df7-9cc6-bdbe0d394605';
