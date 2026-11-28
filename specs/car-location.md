# Car location: "Dónde está tu auto" (opt-in, off by default)

**Status:** spec 2026-11-24, built offline on branch `car-location` (both repos). Migration `0083_car_location.sql` **NOT applied**,
`car-device` **NOT deployed**, `database.types.ts` extended by hand (run `npm run gen:types` after applying). Web card behind
`VITE_CAR_LOCATION=1` (off until the migration is applied and the car side is tested). Car side: Mi Vigo 2.16 (versionCode 19) +
Carga 0.12 (versionCode 12), inert until the owner picks a mode in Mi Vigo › Ajustes (default "Apagado").

## Context

`car-status-e1.md` deliberately kept location out of the status ("a later opt-in spec may add it"), and `vigo-hack/wikivigo/PLAN.md`
1.4 says location is minimised and raw GPS tracks never leave the car "unless a future opt-in feature says so explicitly". This is that
opt-in feature, and it is deliberately narrow: **the latest position only**, plus (third mode) **the parking spots of the last 7 days**.
No track, no route, no history beyond 7 days.

Owner decisions (2026-11-24):

1. **Off by default.** Chosen on the car, in Mi Vigo › Ajustes, one of three: **Apagado** (default) / **Última ubicación** (last known
   position, parked or driving) / **Última ubicación + estacionamientos de 7 días**.
2. **Who sees it:** the vehicle's creator and members with the `control` role (the people who can send remote orders, 0070/0081).
   View-only members do not see it. Enforced in the database (the read RPC), not only in the UI.
3. **Retention:** only the latest position; parking spots only in mode 3, deleted by the server after 7 days. Turning the mode down
   deletes what the new mode no longer allows (off: last position + spots; last-only: spots); the car sends that change.

Hard constraints (as E1/E3): the head unit sleeps when parked and has no SIM, so every point is *last known*, sent only while the car is
awake and online (home Wi-Fi, a phone hotspot). No new always-on process on the car.

## Decisions

| # | Decision | Why |
|---|---|---|
| L1 | New signed action **`location`**; `status` and `live` keep refusing any location key. | Separate consent, separate table, separate retention; E1's privacy guarantees stay literally true. |
| L2 | **Coordinates rounded to 4 decimals** (≈ 11 m north-south, ≈ 9 m east-west at Uruguay's latitude) by the car AND again by the server (Edge Function and `numeric(…,4)` columns), so more precision can never be stored. | The car's GPS is 5-15 m anyway: 4 decimals still finds the car in a street or a parking lot; 3 decimals (≈ 110 m) would not. Nothing finer than the use needs is kept. |
| L3 | **Accuracy** `acc_m` (whole metres, optional) is sent and shown ("precisión ~12 m"); the car drops fixes worse than **100 m** and never sends (0, 0). | Lets the page be honest about a weak fix (garage entrance); a 100 m+ fix would point at the wrong block. |
| L4 | **While driving: one point every 5 minutes** (the first as soon as the trip has a fix), **a parked point at trip end** (the trip's last fix if it is at most 15 minutes older than the trip end). Nothing while parked/charging (the car does not move). | ≤ 13 calls/hour, well under the device cap of 120/hour shared with every other non-poll call; 5 minutes is enough to answer "where is the car" without becoming a track. |
| L5 | **Purge without pg_cron** (not used in this project): spots older than 7 days are deleted on every `car_submit_location` (all vehicles, indexed) and on every `get_car_location` (the caller's vehicle); the read also filters `observed_at > now() − 7 days`, so an expired spot is never shown even if no write happened. Spots per vehicle capped at 300 (oldest deleted). | Works on the current Supabase setup; retention holds at read time regardless of traffic. |
| L6 | **Mode travels with every call** (`off` / `last` / `spots`). `off` deletes the row and every spot; `last` deletes the spots; `spots` keeps them. A **forget call** is a call with the new mode and `point: null`; the car keeps it pending until the server answered OK. | One code path for "turn down" and "send a point"; a late point can never resurrect what a lower mode deleted, because the car empties its queue first (R5). |
| L7 | When the vehicle has **no active (non-revoked) device** left, its location and spots are deleted (trigger on `car_devices`). | Nobody can turn the mode down from an unlinked screen; an old position must not stay forever. |
| L8 | **Who collects:** Carga (the only app with `ACCESS_FINE_LOCATION`, GPS provider only, already running GPS during trips for "Recorrido de los viajes"). Mi Vigo holds the mode, the device key and the queue. No new process: Carga's existing trip sampler, Mi Vigo's existing receivers. | Owner rule "no extra processes on the car". |

## R1. Migration `0083_car_location.sql`

- **`car_location`**: `vehicle_id uuid pk → vehicles on delete cascade`, `device_id uuid → car_devices on delete set null`,
  `mode text not null check in ('last','spots')` (a row never says `off`: off = no row), `kind text check in ('driving','parked')`,
  `lat numeric(6,4)` −90..90, `lon numeric(7,4)` −180..180, `acc_m smallint` 0..10000, `observed_at timestamptz`, `received_at`,
  `updated_at timestamptz not null default now()`; the point columns are all null (mode set, no point yet) or all set (acc_m optional).
- **`car_parking_spots`**: `id bigint identity pk`, `vehicle_id → vehicles on delete cascade`, `lat`, `lon`, `acc_m`, `observed_at
  timestamptz not null`, `received_at`; unique `(vehicle_id, observed_at)` (a retried call does not duplicate a spot); index on `observed_at`.
- RLS on for both; **no grants at all** to `anon` / `authenticated` (reads only through `get_car_location`).
- **`car_submit_location(p_device_id uuid, p_ts bigint, p_mode text, p_point jsonb) → jsonb`** (SECURITY DEFINER, `service_role` only):
  1. `car_device_accept(p_device_id, p_ts)` first (default 120/hour window).
  2. Validates again (the database is the boundary): mode in (`off`,`last`,`spots`); `off` requires `p_point` null; a point has exactly
     the keys `kind`, `observed_at`, `lat`, `lon`, `acc_m` (acc_m optional / null), kind in (`driving`,`parked`), observed_at (Unix ms)
     within now − 7 days .. now + 5 minutes, lat/lon in range and not both 0, acc_m integer 0..10000 → `{"error":"bad_request"}` otherwise.
  3. Global purge of spots older than 7 days.
  4. `off`: delete the vehicle's row and spots → `{"ok":true,"stored":false}`.
  5. `last` / `spots`: upsert the row's `mode` (and `device_id`, `updated_at`); `last` deletes the vehicle's spots. With a point: the
     row's point is replaced **only if newer** (`observed_at` greater, or no point yet); in `spots` a `parked` point also inserts a spot
     (`on conflict do nothing`), then the vehicle keeps at most 300 spots. Lat/lon are rounded to 4 decimals.
  6. Returns `{"ok":true,"stored":<the row's point or a spot changed>}`.
- **`get_car_location() → jsonb`** (SECURITY DEFINER, `authenticated`): `v := current_user_vehicle_id()`; if null or
  `not can_control_car(v)` → `{"allowed":false}` (view-only members and people without a vehicle learn nothing, not even whether a row
  exists). Else deletes the vehicle's spots older than 7 days and returns
  `{"allowed":true,"mode":null|"last"|"spots","last":null|{kind,lat,lon,acc_m,observed_at,received_at},"spots":[{lat,lon,acc_m,observed_at}…]}`
  (spots only in mode `spots`, newest first, at most 300; times as ISO strings). Volatile (it purges).
- **Trigger** `car_location_forget_unlinked` after update of `revoked_at` / after delete on `car_devices`: when the vehicle has no
  non-revoked device left, delete its `car_location` row and spots.
- Grants: `car_submit_location` only `service_role`; `get_car_location` only `authenticated`; nothing to `anon`.

## R2. Edge Function `car-device`: action `location` (wire v1, same signing)

```
{"v":1,"action":"location","device_id":"<uuid>","ts":<ms>,"mode":"off"|"last"|"spots",
 "point":null|{"kind":"driving"|"parked","observed_at":<ms>,"lat":<number>,"lon":<number>,"acc_m":<int|null>}}
```

- Top-level keys exactly `v`, `action`, `device_id`, `ts`, `mode`, `point` (`point` may be omitted = null); point keys exactly the five
  above (`acc_m` may be omitted). Anything else → 400. `off` with a point → 400. Lat/lon must be finite numbers in range, not (0, 0);
  the function rounds them to 4 decimals before calling the database. `acc_m` integer 0..10000.
- Verified with the device's stored key (as every device call), then `car_submit_location`. Replies: 200 `{"ok":true,"stored":bool}`;
  database `bad_request` → 400; guard answers mapped exactly as for heartbeat (401, 409, 410, 429); 500 on database failure.
- The function never logs a body, a point or coordinates (only the action and the database error text, which carries no values).
- **Cross-language pins** (the car's `Wire.locationBody` produces exactly these; `carDeviceLocation.test.ts` parses exactly them):

```
LOCATION_BODY = {"v":1,"action":"location","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"mode":"spots","point":{"kind":"parked","observed_at":1763639990000,"lat":-34.9058,"lon":-56.1913,"acc_m":12}}
LOCATION_FORGET_BODY = {"v":1,"action":"location","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640001000,"mode":"off","point":null}
```

## R3. Car: Mi Vigo (`accounts_proxy`, holds the mode, the key and the queue)

- **Ajustes** card "Ubicación del auto": the stock radio pill (SelectionRadioGroup look, as Carga's Ajustes) with **Apagado** /
  **Última ubicación** / **Ubicación y paradas**, and under it the selected option in full ("Última ubicación + estacionamientos de 7
  días") with a plain explanation of who sees it and what is kept. (The third label in full does not fit a pill third at 28 sp; the
  caption carries the owner's wording.) Default Apagado; stored as `location_mode=off|last|spots` in `files/ajustes.txt` (never seeded
  from `mivigo.conf`). Hint when Carga lacks the location permission: "Necesita Carga con «Registrar viajes y cargas» y el permiso de
  ubicación."
- **Mode query** (no new receiver): Carga asks with an ordered explicit broadcast `com.vigo.mivigo.LOCATION_MODE` to `StatusReceiver`
  (same signature permission `STATUS`); the result data is the mode (`off` when not linked).
- **Point hand-over:** explicit broadcast `com.vigo.mivigo.LOCATION` (same receiver and permission), extras `kind`, `observed_at`,
  `lat`, `lon` (double), `acc_m` (int, optional). Mi Vigo validates and rounds again, drops it when the mode is `off`, queues it and
  sends inside `goAsync`.
- **Queue** `files/location_pending.json` (core `CarLocation.Queue`): mode `last` = only the newest point; mode `spots` = every parked
  point of the last 7 days (at most 50, oldest dropped) plus a driving point only if newer than all of them. Sent oldest first, at most
  20 calls per flush; network / server / rate-limit errors keep the rest for the next point, "Sincronizar ahora" or the Ajustes change;
  `bad_request` / `revoked` / unknown device drop the point.
- **Forget:** turning the mode down empties the queue of what the new mode does not allow, marks `forget pending` and sends a
  `point:null` call with the new mode at once (any mode change does, so the web learns "on, waiting for the first point"); the flag
  stays until the server answered OK. A later point call carries the new mode too (L6).
- **Logs:** `location: parked -> OK`, `location: mode last -> forget OK`; never coordinates or accuracy (the vigolog Redactor would also
  hide `lat=`/`lon=` and decimal pairs).

## R4. Car: Carga (`charge_app`, collects)

- Asks Mi Vigo's mode at sampler start and when a trip opens (at most once a minute). No answer / old Mi Vigo = off.
- GPS (`TripTracks`): runs while a trip is open if "Recorrido de los viajes" is on **or** the mode is not off (and the permission is
  granted). The track file is still written only with "Recorrido" on; for location the newest fix (time, lat, lon, accuracy) is kept
  in memory only.
- Core `LocationShare` (pure, tested): rounding, the 100 m / (0, 0) filter, `drivingDue` (fix ≤ 2 minutes old and ≥ 5 minutes since the
  last driving point) and `parkedFix` (the last fix ≤ 15 minutes before the trip end). The sampler sends the driving point on its tick
  and the parked point in the step that closes the trip. Nothing is stored on disk for this feature; nothing is logged but the kind.

## R5. Web: "Dónde está tu auto" (Mi Vigo, signed in, `VITE_CAR_LOCATION=1`)

- Its own card right below "Tu auto ahora", rendered only when `get_car_location` says `allowed` (creator / control) **and** the
  vehicle has a linked screen. View-only members see nothing (and the RPC gives them nothing).
- `mode` null → empty state: "Viene apagado. Para verlo acá, en la pantalla del auto entrá a Mi Vigo › Ajustes › Ubicación del auto
  y elegí «Última ubicación» o «Ubicación y paradas»."
- Mode set, no point → "Activado. La primera ubicación llega cuando el auto ande con internet."
- A point → the site's map (OpenFreeMap through `FittedMapContainer`, no new provider), an accent dot for the car; text "Estacionado ·
  hace 2 h" / "En viaje · hace 4 min" (`observed_at`), "precisión ~12 m", a "Cómo llegar" link (Google Maps directions in a new tab)
  and the muted line "Último dato que el auto envió con conexión; no es en vivo."
- Mode `spots`: ring markers for the spots and a list "Estacionamientos de los últimos 7 días" (day + time + "hace X").
- Footer: "Lo ven solo quien creó el vehículo y quienes tienen control. Se guarda solo la última ubicación[ y los estacionamientos de
  7 días]. Se cambia en la pantalla del auto."
- Re-read every 60 s while the page is visible. The map is lazy-loaded (Leaflet / MapLibre stay out of Mi Vigo's first load).

## Non-goals

Live tracking (anything finer than 5 minutes), routes or tracks, history beyond 7 days, geofencing / alerts, sharing with view-only
members or publicly, waking the car to ask, a web switch for the mode (the owner sets it on the car; the web only explains how),
location in `status` / `live` / logs / diagnostics.

## Files

- New `supabase/migrations/0083_car_location.sql`.
- `supabase/functions/_shared/carDevice.ts` (`parseLocationRequest`, action `location`), new `carDeviceLocation.test.ts`.
- `src/lib/carLocation.ts` (+ test), `src/lib/carLocationFlag.ts`, `src/components/CarLocationCard.tsx` (+ map part, css, test),
  `src/pages/MyVigoPage.tsx`, `src/lib/database.types.ts` (hand-edited: regenerate after apply), `src/vite-env.d.ts`.
- vigo-hack: Mi Vigo core `CarLocation`, `Wire.locationBody`, `Client.location`, `OwnerSettings`/`Config` (`location_mode`), app
  `LocationSender`, `StatusReceiver`, Ajustes card, manifest actions; Carga core `LocationShare`, `TripTracks`, `SamplerService`,
  `MiVigoShare`.

## Test plan

- `carDeviceLocation.test.ts`: both pins parse; driving/parked, acc_m omitted/null; refusals (unknown top-level key, unknown point key,
  `off` with a point, bad mode, bad kind, lat/lon out of range or (0, 0), string/NaN coordinates, acc_m fractional/negative/too big,
  observed_at not a positive integer); rounding to 4 decimals before the RPC; routing to `car_submit_location` with `p_point` null for a
  forget; guard mapping; bad signature never reaches the database.
- `carLocation.test.ts`: response parsing (allowed false, mode null, last + spots), wording (parked/driving, accuracy, spot labels),
  directions URL.
- `CarLocationCard.test.tsx`: hidden when not allowed or no linked car; empty state with the car instructions; waiting state; point
  with its wording; spots list only in mode spots; flag off = nothing fetched.
- Car: Mi Vigo core `LocationTests` (pins byte-equal, rounding, validation, queue rules per mode, forget, JSON round trip, settings);
  Carga core `LocationShareTests` (rounding, filters, driving cadence, parked fix window).
- SQL (after applying; no SQL harness in the repo): checklist below.

Verified during development (2026-11-24): `0083` applied to PGlite 0.3.14 (Postgres 17 in WASM) on stubs of `vehicles`,
`vehicle_members`, `car_devices`, `car_device_accept`, `current_user_vehicle_id`, `can_control_car` and `auth.uid()` (copied from
0012/0070; harness not in the repo, like E3): **41 assertions passed**, covering every item of the checklist below. Still to check on
the real project after `db push`: the same list against the real guard and roles.

## SQL review checklist

- [ ] `anon` / `authenticated` cannot select either table; only `service_role` executes `car_submit_location`; only `authenticated`
      executes `get_car_location`.
- [ ] A view-only member gets `{"allowed":false}`; the creator and a control member get the data; a user of another vehicle gets
      only their own vehicle's.
- [ ] Guard first: revoked / replayed / skewed / rate-limited calls change nothing.
- [ ] Bad mode / kind, extra keys, `off` with a point, out-of-range or (0,0) coordinates, observed_at > 7 days old or in the future →
      `bad_request`, nothing changed.
- [ ] `off` deletes row + spots; `last` deletes spots and keeps/updates the point; `spots` + parked inserts a spot once (retry = no
      duplicate); an older point does not replace a newer one but still lands as a spot.
- [ ] Spots older than 7 days: never returned; deleted by the next write or read; more than 300 → oldest deleted.
- [ ] Coordinates stored with 4 decimals even when sent with more.
- [ ] Revoking the last device (or deleting it) deletes the location; revoking one of two devices does not.

## Security notes

| Threat | Mitigation |
|---|---|
| A family member with "solo ver" sees where the car is | `get_car_location` checks `can_control_car`; no table grants; the card is hidden too |
| Stalking through history | Only the latest point; spots only by explicit choice and only 7 days; no tracks |
| Stolen session | Same exposure as remote orders (control role); the owner can turn it off on the car, which deletes everything |
| Compromised car writes false positions | Only its own vehicle; bounded values; the page says "último dato que el auto envió" |
| Location leaks into logs / diagnostics | Never logged on the car (kind only), Redactor as a second net; the Edge Function logs no values |
| Old data after unlinking | Trigger deletes it when no active device remains |

## Production steps (owner OK required)

What changes in production: new tables `car_location`, `car_parking_spots` (no client grants), functions `car_submit_location`
(service role), `get_car_location` (signed-in creator / control), the trigger on `car_devices`; `car-device` gains the `location`
action (every existing action unchanged). Site: nothing visible unless built with `VITE_CAR_LOCATION=1`.

```
git pull
npx supabase db push --dry-run          # must list only 0083_car_location.sql
npx supabase db push
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types                        # replaces the hand-written 0083 types
npm run type-check && npm run lint && npm test
git commit -am "Regenerate DB types after 0083 (car location)" && git push
# after the car test: build with VITE_CAR_LOCATION=1 and npm run deploy
```

Undo: a new migration dropping the two tables, the three functions and the trigger; redeploy the previous `car-device`.

Car test (vigo-hack NEXT_VISIT / `charge_app/CAR_TEST.md` L1-L6): Mi Vigo 2.16 + Carga 0.12; Carga with "Registrar viajes y cargas"
and the location permission; Mi Vigo › Ajustes › "Última ubicación"; drive 10 min online → the card shows "En viaje"; park → "Estacionado"
at the spot; switch to "Ubicación y paradas", two short trips → two spots; back to "Apagado" → the card shows the empty state.

## Follow-up 2026-11-27 (owner): parking list
The list of the 7-day parkings is collapsed by default (summary with the count). A row is a button: it highlights that parking
on the map (bigger accent dot, map moved to it, popup open); tapping a marker highlights its row.
