# Route plans with charging stops (PLAN.md B3)

## Context

Rutas shows curated routes and community trips, but nothing answers "I want to
go from A to B with my Vigo: where do I charge?". The site already has every
ingredient: OSRM road routing (`osrmRouting.ts`, trip map), curated city
coordinates + Nominatim fallback, WikiVigo stations with coordinates,
reliability (`station_reliability`) and real trip logs with SOC and billed
energy. No paid API is added.

## Requirements

- R1 Page `#/rutas/planificar` (public), linked from Rutas. Inputs: origin,
  destination (CityCombobox, free text), model (E2/E2+, default from Mi Vigo),
  battery at departure (%), minimum arrival battery (% reserve, default 15),
  optional consumption override (kWh/100 km).
- R2 Consumption: median kWh/100 km over public trips (>= 40 km, start and end
  SOC, every stop with `energy_kwh`) of the chosen model (or no model):
  `(start-end)% x battery + sum(stop energy_kwh)` / distance. Needs >= 3 such
  trips, else the curated "ruta con aire" figure, 15 kWh/100 km. The form says
  which one is used and the resulting range at 100%.
- R3 Battery: gross capacity from charging.json (E2 44,94 kWh, E2+ 51,87 kWh).
- R4 Route: OSRM road geometry; distance is the sum of the polyline.
  Candidate stations: WikiVigo stations within 10 km of the road (vertex snap);
  the detour counts both ways.
- R5 Plan (greedy): from the current position, among the stations reachable
  while keeping the reserve, go to the furthest, preferring a DC, non-flaky one
  in the last 30% of that reach; charge to 80%. Stations with a recent failure
  (specs/station-alerts.md) are never suggested and are listed as skipped.
  If no station can bridge a gap the plan says so (not feasible) and points to
  the Carga map (includes Open Charge Map).
- R6 Output: distance, stops, consumption, arrival %; leg list (km, detour,
  arrival/departure %, DC/AC, power, "Fallas reportadas"); map with the route
  and pins; caveat note.
- R7 Share: "Copiar enlace" copies `#/rutas/planificar?o&d&m&soc&min[&c]`;
  opening it re-plans with current data. Values are clamped on parse.
- R8 Save: signed-in users can "Guardar plan" into `route_plans` (migration
  0054, own rows only, 20/day, snapshot jsonb <= 16 KB) and see/delete "Mis
  planes", each a share link.

## Files

- `supabase/migrations/0054_route_plans.sql` (NOT applied)
- `src/lib/routePlan.ts` (pure), `src/lib/routePlanData.ts` (network)
- `src/pages/RoutePlannerPage.tsx` + `.module.css`, route in `src/App.tsx`,
  link in `src/pages/RoutesPage.tsx`
- `src/lib/tripMap.ts`: `lookupCityCoords` export
- `src/lib/database.types.ts`: hand-written `route_plans` until `gen:types`

## Acceptance criteria

- Montevideo -> Punta del Este at 100% plans with no stop; a long trip
  (Montevideo -> Artigas) gets stops with every arrival >= the reserve.
- A station with a recent "falló" is not suggested.
- The share link reproduces the plan; bad params are clamped.

## Test plan

`src/lib/routePlan.test.ts`: trip consumption (SOC + billed energy, rejects
short/incomplete trips), community median vs fallback and per-model filter,
range, geometry snapping, plan: no stop / furthest reachable / DC preference /
failing skipped / detour + 10 km limit / multi-stop chain, share link
round-trip and clamping.

## Owner decisions

- O1 Charge target 80% and reserve default 15%: fine, or other values?
- O2 Gross vs usable battery capacity (no usable figure known; gross is
  slightly optimistic).
- O3 Include Open Charge Map stations as stop candidates (now WikiVigo only)?
- O4 Plans are private; should a plan be publishable as a community route?
