-- D4 follow-up: "Sin cable" (socket-only / bring your own cable) applies to
-- both current types, and the 'otro' connector escape hatch is removed —
-- every charger has one of the known connectors or no cable at all.
-- Apply with `npx supabase db push`.

-- Clamp any legacy 'otro' rows to the dominant connector of their current
-- type (Tipo 2 rules AC in the region, CCS2 rules DC) before narrowing.
update public.charging_stations
set connector = case current_type when 'AC' then 'Tipo 2' else 'CCS2' end
where connector = 'otro';

alter table public.charging_stations
  drop constraint charging_stations_connector_check;

alter table public.charging_stations
  add constraint charging_stations_connector_check
  check (connector in ('Tipo 2', 'Tipo 1', 'CCS2', 'CCS1', 'GB/T', 'Sin cable'));

alter table public.charging_stations
  drop constraint charging_stations_connector_matches_current;

alter table public.charging_stations
  add constraint charging_stations_connector_matches_current
  check (
    connector in ('GB/T', 'Sin cable')
    or (current_type = 'AC' and connector in ('Tipo 2', 'Tipo 1'))
    or (current_type = 'DC' and connector in ('CCS2', 'CCS1'))
  );
