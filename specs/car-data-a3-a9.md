# Car data: verified km, battery health, consumption atlas, eco board, warnings log (PLAN A3, A5, A6, A7, A9)

**Status:** built offline 2026-11-23 (branch `wave3-data`, both repos). Migration `0061_car_data.sql` **NOT applied**
(after 0060), `car-device` **NOT deployed**, `database.types.ts` extended by hand (run `npm run gen:types` after applying).
Car side: Carga 0.8 (records + switches), Mi Vigo 2.10 core `TripDraft` (kinds battery / drive / fault).

## Context

Carga already measures every charge (kWh, SOC), every trip (distance, energy) and the braking analysis "Frenadas"
(vigo-hack `charge_app/BRAKING.md`); Mi Vigo already sends signed status snapshots with `odometer_km` (0054). This spec
turns that into private per-vehicle history plus opt-in community views, under PLAN 1.4: private by default, no location,
nothing public without a member switching it on.

## Decisions

| # | Decision |
|---|---|
| D1 | Transport: Mi Vigo's trip-draft outbox and action `trip_draft`, draft `kind` = `battery` / `drive` / `fault` → Edge Function action `car_data` → `car_submit_data`. No new receiver on the car. |
| D2 | Car switch (Carga): "Guardar mis datos del auto en WikiVigo (privado)", **off by default**; turning it on backfills the last 90 days once (deterministic client_id, server dedupes). A9 needs a second switch "Registrar avisos del tablero" (off). |
| D3 | Every row is members-only (RLS select/delete). Members can delete each kind (`delete_my_car_data`). |
| D4 | Sharing opt-ins per vehicle in `vehicle_data_sharing` (no row = all off), written only by `set_vehicle_data_sharing`: `verified_km_public`, `battery_community`, `consumption_atlas`, `eco_league`, `fault_matching`. Turning one off removes the vehicle at once (aggregates are computed live). |
| D5 | A3: a trigger on `car_status` keeps a daily odometer (`car_odometer_log`); a reading lower than an earlier day sets `anomaly` and keeps the vehicle off the verified board. `verified_km_leaderboard()` (anon): opted-in, ≥ 2 readings, no anomaly. Badge "✓ km verificados por el auto" on the community km ranking. |
| D6 | A5: `capacity_kwh` = kWh added × 100 / SOC delta, only for charges of ≥ 20 points (generated column). Private chart in Mi Vigo; charges below 10 °C drawn hollow and left out of the estimate when there are ≥ 3 warm ones. Community: median per vehicle, then median per model and 20 000 km band, ≥ 5 vehicles (`battery_health_community`, anon). Note: Carga's kWh are as measured by the car (charger side losses included), so the estimate is a trend, not a lab capacity. |
| D7 | A6: `consumption_atlas()` (anon): kWh/100 km by season (southern hemisphere), outside temperature band and average-speed band; trips ≥ 2 km with 3–60 kWh/100 km; ≥ 5 vehicles per bucket. Drive samples carry no location. |
| D8 | A7: monthly km-weighted regen % in Mi Vigo; `eco_league(month)` (anon) lists opted-in vehicles with ≥ 3 trips with braking data, labelled by member names like the km leaderboard. |
| D9 | A9: `car_fault_events` private; `fault_code_counts()` (authenticated only) = number of opted-in vehicles that saw a code, ≥ 3, never which. The meaning of the cluster fault values is not verified on the car yet (vigo-hack `charge_app/FAULTS.md`). |
| D10 | Rate: the device guard plus at most 200 rows per vehicle and kind per day; samples older than 90 days refused. |

## Wire

- battery `{"kind","client_id","started_at","ended_at"(ms),"energy_kwh" 0.5..200,"start_soc","end_soc" int, end > start,"temp_c"? int -40..70,"odometer_km"?}`
- drive `{"kind","client_id","started_at","ended_at","distance_km" 0.5..2000,"energy_kwh"?,"avg_speed_kmh"? 0..200,"temp_c"?,"regen_kwh"?,"brake_events"? int 0..10000,"regen_pct"? 0..100}`, energy_kwh or regen_kwh required
- fault `{"kind","client_id","observed_at","source" cluster|tpms|charge|traction,"code" [a-z0-9_]{1,40},"value" int32,"odometer_km"?}`

Unknown keys refused (car, Edge Function and SQL). Reply `{ok, stored}` (false = duplicate client_id).

## Files

- `supabase/migrations/0061_car_data.sql`; `supabase/functions/_shared/carDevice.ts` (`parseCarData`, action `car_data`)
- `src/lib/carData.ts`, `src/components/CarDataCard.tsx` (Mi Vigo), `src/components/CommunityCarData.tsx` (Comunidad),
  `src/components/VehicleLeaderboard.tsx` (verified badge), `src/lib/database.types.ts`

## Test plan

- `carDeviceData.test.ts`: full/minimal samples parse; refusals (extra key, location, SOC not rising, < 0.5 kWh, fractional
  ints, ranges, drive without energy/regen, fault source/code/value); routing to `car_submit_data`; 429 on the daily cap.
- `carData.test.ts`: verified summary + anomaly, capacity points/estimate (cold handling), monthly weighting, labels, atlas order.
- `CarDataCard.test.tsx`: hidden without data; verified km, warnings with "otros N dueños", five switches all off, toggle calls the RPC.
- SQL (after applying): a member cannot read another vehicle's rows; aggregates return nothing below 5 vehicles; turning a
  flag off removes the vehicle; an odometer drop sets anomaly.
- Car: Carga core tests, Mi Vigo `TripDraftTests`, CAR_TEST A5/A6/A7/A9 (vigo-hack `charge_app/CAR_TEST.md`).

## Owner decisions (open)

- O-D1 Car upload switch off by default (D2) vs on (private data only, "start collecting now"; Carga keeps the history locally and backfills 90 days either way).
- O-D2 Thresholds: 5 vehicles per aggregate bucket, 3 for fault matching; 20 SOC points for a capacity estimate.
- O-D3 Public names on the verified-km and eco boards (opt-in) vs anonymous ranks.
- O-D4 Consent wording of the five switches (`SHARING_TEXT` in `src/lib/carData.ts`).
