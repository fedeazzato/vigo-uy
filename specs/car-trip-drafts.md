# Car trip drafts (PLAN A1): share a trip from the car to WikiVigo as a draft

**Status:** Implemented on branch `trip-drafts` (merged to main), **migration 0050 not applied, `car-device` not redeployed**. The page
and the Mi Vigo entry stay hidden until the table exists (feature-detected, like the E1 status card). Owner steps at the end.

## Context

The owner wants to share road trips with the community "from the car directly" (2026-11-21), including the charging stops. WikiVigo
already has trip logs (`trip_logs`, `NewTripLogPage`, specs/trip-log*.md) with charging stops (`TripChargingStop`). The car's Carga app
records trips (distance, energy, SOC, speed), charging sessions and, since 2026-11-21, a GPS track per trip (vigo-hack
`charge_app` TripTracks). Owner rule (PLAN 5 Q2): **car-sourced trips are always drafts**; nothing is published without the owner.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Who starts it | The driver, on the car: Carga > a trip, or several selected trips (a road trip) > "Compartir en WikiVigo" > a confirmation dialog that lists what is shared (numbers, route, charging stops). No automatic sharing. |
| D2 | Transport | Carga -> Mi Vigo (explicit broadcast, signature permission, like E1) -> signed `car-device` action `trip_draft` (protocol v1). Mi Vigo keeps unsent drafts (max 5) and retries when a new one arrives or on "Sincronizar ahora": no background service. |
| D3 | Payload | Totals (distance, energy, start/end time and SOC, average speed, number of trips), the route as `[lat, lon]` pairs simplified on the car (Douglas-Peucker, 5 decimals, at most 1200 points so the body stays under 32 KB), and the charging sessions inside the span (times, SOC, battery energy, end reason, location = where the car stopped before it, from the track). No other location, no VIN, no account data. |
| D4 | Size | Body limit of `car-device` raised from 8 KB to 32 KB for all actions (each action's parser stays strict). The car simplifies the route further until the draft fits. |
| D5 | Station match | Done on the web at review time (nearest community station within 300 m of a charge's location), shown as a suggestion the owner can change in the trip form. The server stores raw coordinates only. |
| D6 | Publishing | "Usar para registrar el viaje" fills the existing new-trip form through its local draft store (`tripDraftStore`), the owner completes origin/destination/notes and saves as usual; the car draft is marked `used`. Route geometry is not copied into `trip_logs` (no column); it stays with the draft. Battery energy is NOT put into a stop's `energy_kwh` (that field is the charger-billed figure, D4 of the charging costs spec); it goes into the stop note. |
| D7 | Retention | Drafts stay until the owner discards them or uses them; at most 50 pending per vehicle (the oldest pending are dropped on insert). |

## Requirements

- R1. Migration `0050_car_trip_drafts.sql`: table `car_trip_drafts` (members read; members may update only `status`/`used_at` and
  delete; inserts only via `car_submit_trip_draft`), unique `(vehicle_id, client_id)` for idempotent retries, checks on every number,
  `route` = jsonb array (<= 2000 pairs), `charges` = jsonb array (<= 30 objects). Function `car_submit_trip_draft(p_device_id uuid,
  p_ts bigint, p_draft jsonb)` (service role only): `car_device_accept` guard first, validation again, insert on conflict do nothing,
  returns `{"ok":true,"stored":bool}`.
- R2. `car-device` action `trip_draft` with a strict parser (`parseTripDraft`), mapped to `car_submit_trip_draft`, reply
  `{ok:true, stored}`; `MAX_BODY_BYTES` 32768.
- R3. Web: `src/lib/carTripDrafts.ts` (fetch pending, mark used/discarded, station match, conversion to `TripDraftState`), page
  `#/mi-vigo/borradores` ("Borradores del auto": list, map of the route with charge dots, numbers, the two actions), and an entry in Mi
  Vigo shown only when the table exists and there is at least one pending draft.
- R4. Car (vigo-hack): Carga core `TripShare` (pure, tested) builds the draft; Carga UI action + confirmation dialog; Mi Vigo core
  `TripDraft` (validation, limits), `Client.tripDraft`, receiver + sender (pending files, flush on receive / sync), version bump.

## Test plan

- carDevice.test.ts: `trip_draft` accepted/refused cases (unknown keys, out-of-range numbers, too many points, bad pairs), RPC args,
  `stored` passthrough, 32 KB limit.
- carTripDrafts.test.ts: station match (inside/outside 300 m, nearest wins), conversion to the trip form state (distance, SOC, date,
  stops with durations and notes, no `energy_kwh`), describe/summary helpers.
- CarDraftsPage.test.tsx: hidden when the fetch fails, list renders, "Usar" writes the trip draft and navigates.
- vigo-hack: Carga `TripShareTest` (span selection, simplification, size cap, charge location), Mi Vigo `TripDraft` tests (limits,
  round trip), wire body test.

## Owner steps (production; each needs the owner's OK)
```
cd C:\Projects\vigo-wiki
git pull
npx supabase db push --dry-run          # must list only 0050_car_trip_drafts.sql
npx supabase db push
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types
npm run type-check && npm run lint && npm test
git commit -am "Regenerate DB types after 0050" && git push
```
What changes in production: one new table `car_trip_drafts` with its RLS and one SQL function; `car-device` accepts the new action and
bodies up to 32 KB (each action's parser stays strict). No existing table changes.
