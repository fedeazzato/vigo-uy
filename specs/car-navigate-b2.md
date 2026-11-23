# B2 "Enviar al auto": send a destination from WikiVigo to the car

**Status:** spec 2026-11-22, built offline on branch `wave2-features` (vigo-wiki + vigo-hack). **Migrations 0054 and 0055 NOT applied,
`car-device` NOT deployed** (owner OK required). Web button behind the E3 flag `VITE_CAR_REMOTE=1` (still off in production).

## Context

`vigo-hack/wikivigo/PLAN.md` B2. An owner sees a station, a place or a stop of a trip on WikiVigo and wants the car to navigate there.
The E3 remote-order channel (`car-remote-e3.md`, migration 0052, applied) already carries signed orders from the web to the car while it
is awake and online: Mi Vigo polls every 10 s while ACC is on or charging, Copiloto executes. B2 is one more order kind, `navigate`.

## R1. Order kind `navigate` (migration `0055_car_navigate.sql`)

- `car_orders.kind` adds `navigate`; `args` exactly `{"lat": <number -90..90>, "lon": <number -180..180>, "label": <text 1..80>}`.
  The table check pins the shape (`car_navigate_args_ok`, internal), `create_car_order` validates and normalises: unknown keys, text
  coordinates, (0, 0) and an empty label → `bad_request`; lat/lon rounded to 6 decimals; label through `car_clean_text(label, 80)`.
- Same rate limits (6/min, 40/h per vehicle), same 2-minute expiry, same supersede rule (a new destination replaces a queued one).
- New car result code `no_app` (Waze missing or the start refused): table check, `car_order_result`, Edge Function `ORDER_RESULT_CODES`.
- The inline checks of 0052 are dropped by their Postgres names: `car_orders_kind_check`, `car_orders_check` (the args check reads
  two columns, so Postgres named it after the table; verified on PGlite), `car_orders_result_code_check`.

## R2. Copiloto's switch on the web (`remote_on`, migration `0054_car_status_wave2.sql`)

- The status object (status call and the poll's `live`) accepts an optional `remote_on` boolean, stored in `car_status.remote_on`
  (a snapshot without it keeps the stored value).
- Mi Vigo sends it: in `live` (the switch as asked at the start of the awake period / every 60 s while off) and in E1 snapshots (last
  answer in this process).
- **Behaviour change (owner may revisit):** with the switch OFF, Mi Vigo now polls once per 60-s off re-check (only while awake, no new
  process): the poll carries `remote_on:false` and any waiting order is answered `remote_off` at once (Copiloto is not called), instead
  of expiring as "not picked up". At most 60 polls/hour, under the 600/hour poll cap.
- The web shows "Los comandos remotos están apagados en el auto (Copiloto › Ajustes › Comandos remotos)…" in the send dialog when
  `remote_on = false`, and lets the owner "Enviar igual" (the value may be stale). Unknown (null, old apps, 0054 not applied) = no warning.

## R3. Result codes

E3's R3 plus `no_app`. On the page: "Waze no está instalado en el auto o no abrió el destino".

## R4. Car side (vigo-hack)

- **Mi Vigo** (`accounts_proxy`): `RemoteOrder` parses `navigate` (lat/lon JSON numbers, label re-cleaned to ≤ 80; anything else = kept
  with a problem and answered `car_error`); passes extras `lat`, `lon` (double) and `label` to Copiloto. The log says `navigate`, never
  the destination. `OrderResult` accepts `no_app`.
- **Copiloto** (`voice_es`, DECISIONS D25): `navigate` checks the "Comandos remotos" switch (`remote_off`) and the shared rate limit
  (`busy`), **not** P / speed 0: it only sets a destination, the driver sees the on-screen notice ("Orden remota de Fede: navegando a
  Tata Rivera con Waze") and the bell entry (E3 sender display), and Waze's own screen. It opens `waze://?ll=LAT,LON&navigate=yes`
  (6 decimals, `Locale.ROOT`) with `setPackage("com.waze")` and `NEW_TASK | CLEAR_TOP`, like the voice navigation and Cargadores. Not
  started → `no_app`. Never writes a vehicle property.
- Background activity start from the receiver relies on `START_ACTIVITIES_FROM_BACKGROUND` (already in the manifest): **to confirm on
  the car** (CAR_TEST B2).

## R5. Web

- `src/lib/carNavigate.ts`: `cleanLabel`, `validDestination`, `sendDestination` (→ `create_car_order('navigate', …)`), `fetchCarLink`
  (active device + `remote_on`, cached 60 s, tolerant of a missing column), the notice texts.
- `src/components/SendToCarButton.tsx`: "🚗 Enviar al auto" → confirmation ("Navegar a …", delivery notice "solo si está encendido (o
  cargando) y con internet; si no lo recibe en 2 minutos, se cancela", driving notice "Si el auto está en marcha, Waze cambia el destino
  en pantalla y el auto muestra quién lo mandó. Quien maneja no tiene que tocar nada.", remote-off warning) → "Destino enviado. Seguí si
  el auto lo recibió en Mi Vigo › Control remoto". Rendered only with the flag, signed in, and a linked car.
- Where: station popups of the stations map (`StationsMap`), point popups of a trip's map (`TripMap`: origin, destination, charge
  stops = "trip plans"), and the Mi Vigo card "Enviar un destino al auto" (`SendPlaceCard`: free-text place / address search through
  OpenStreetMap Nominatim, `searchPlaces`, up to 5 results).
- The "Control remoto" order list words a navigate order "Navegar a <label>".

## Non-goals

Route planning with stops, sending a whole trip, other navigation apps, location of the car, waking the car.

## Security notes

| Threat | Mitigation |
|---|---|
| A stolen session sends the car somewhere while driving | Same membership + rate limits as E3; the switch is default OFF; the notice and the bell entry name the sender; Waze shows the destination; nothing is driven or written to the car |
| Malformed destination reaches Waze | Server check + `create_car_order` validation; Mi Vigo and Copiloto re-validate; the URI is built from two doubles only (the label never enters the URI) |
| Location leak | Destinations are visible only to the vehicle's members (`car_orders` RLS); the car logs never contain them |

## Test plan

- Edge Function (`carDevice.test.ts`): `no_app` accepted; status keys (R2) incl. the cross-language pin `ORDERS_BODY_W2`.
- Web: `carNavigate.test.ts` (validation, RPC args, cache, missing column, list wording), `SendToCarButton.test.tsx` (hidden cases,
  confirm + send, remote-off warning, error), `nominatimGeocoding.test.ts` (`searchPlaces`).
- SQL (PGlite harness, not in the repo, 37 assertions for 0054-0056): navigate validation and normalisation, other kinds unchanged, client
  insert refused, check refuses bad args, poll hands args + sender, `no_app` result, privileges.
- vigo-hack: Mi Vigo `Wave2Tests` (navigate parse, remote-off executor, fallback), Copiloto `NavigateTests` (no gear/speed needed, switch,
  `no_app`, bad destination, rate limit, Waze URI).
- Car (NEXT_VISIT): with the car on and online, "Enviar al auto" on a station → Waze navigates within ~10 s, notice + bell entry; with the
  switch off → the page shows "Falló: los comandos remotos están apagados" within ~60 s.

## Production steps (owner OK required)

```
npx supabase db push --dry-run   # must list 0054, 0055, 0056
npx supabase db push
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types                # replaces the hand-written types
```
Then install the car apps (Mi Vigo, Copiloto, Carga). Mi Vigo falls back to sending status without the new keys if the server still
refuses them (one retry, remembered per process), so the order of the two steps is not critical, but deploy the server first.
