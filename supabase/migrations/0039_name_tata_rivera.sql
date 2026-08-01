-- One "Ta-Ta" row (Rivera, Avenida Sarandí 950) was missing the city
-- qualifier every other Ta-Ta station has (Ta-Ta Durazno, Ta-Ta Florida,
-- etc.) — OCM's own name field for this POI was just the bare brand name.
-- Apply with `npx supabase db push`.

update public.charging_stations
set name = 'Ta-Ta Rivera'
where id = 'a4366b0d-9033-4a08-a64b-85dbc717a237';
