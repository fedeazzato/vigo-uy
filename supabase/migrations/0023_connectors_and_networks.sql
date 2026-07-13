-- D4 follow-up: connector depends on current type, and networks include
-- Argentina/Brazil providers for international trips.
-- AC posts use Tipo 2 / Tipo 1 (or are socket-only: "Sin cable");
-- DC fast chargers use CCS2 / CCS1; GB/T exists in both; 'otro' is the
-- escape hatch for both. Enforced so the pairing can't drift from whatever
-- the form of the day allows.
-- Apply with `npx supabase db push`.

-- 1. Cross-border networks: members drive to Argentina (YPF) and southern
--    Brazil (Tupinambá, Zletric, EDP). 'otro' keeps covering the rest.

alter table public.charging_stations
  drop constraint charging_stations_network_check;

alter table public.charging_stations
  add constraint charging_stations_network_check
  check (network in (
    'ute', 'eone', 'dmc', 'evergo', 'eosvolt',
    'ypf', 'tupinamba', 'zletric', 'edp',
    'otro'
  ));

-- 2. Connector ↔ current-type pairing.

alter table public.charging_stations
  drop constraint charging_stations_connector_check;

alter table public.charging_stations
  add constraint charging_stations_connector_check
  check (connector in ('Tipo 2', 'Tipo 1', 'CCS2', 'CCS1', 'GB/T', 'Sin cable', 'otro'));

-- Clamp any existing mismatched rows (the old constraint allowed e.g.
-- AC + CCS2) before the pairing constraint lands.
update public.charging_stations set connector = 'otro'
where not (
  connector in ('GB/T', 'otro')
  or (current_type = 'AC' and connector in ('Tipo 2', 'Tipo 1', 'Sin cable'))
  or (current_type = 'DC' and connector in ('CCS2', 'CCS1'))
);

alter table public.charging_stations
  add constraint charging_stations_connector_matches_current
  check (
    connector in ('GB/T', 'otro')
    or (current_type = 'AC' and connector in ('Tipo 2', 'Tipo 1', 'Sin cable'))
    or (current_type = 'DC' and connector in ('CCS2', 'CCS1'))
  );
