# Guest mode ("Modo invitado") from WikiVigo: remote on/off and forgotten-PIN recovery (phase 2)

**Status:** spec 2026-11-26, server and web built offline on branch `feature/guest-mode`. Migration `0085_car_guest_mode.sql`
**NOT applied**, `car-device` **NOT deployed**, `database.types.ts` extended by hand (run `npm run gen:types` after applying). The
car side is built separately in `vigo-hack` (Mi Vigo + the root helper, `docs/GUEST_MODE.md` step 10); until a car reports guest
mode support, the web card does not exist (no build flag needed, see R4).

## Context

`vigo-hack/docs/GUEST_MODE.md` (plan + owner decisions 2026-11-26): guest mode hides the owner's personal info on the car screen
while the car is left with someone else (car wash, parking garage). It is entered on the car (Mi Vigo button, Copiloto voice) and left on the
car **only with the owner PIN** (Mi Vigo). Owner decision **D7**: WikiVigo is the second way to switch it on/off, and the recovery when
the PIN is forgotten. Remote exit is authorised by the account role, not by the PIN; the PIN digits never leave the car (plan 2.3).

Hard constraints (as E1/E3): the head unit sleeps when parked and has no SIM, so it learns anything only while awake and online. No
new always-on process on the car; no new car call (guest mode rides on the existing `orders` poll).

## Decisions

| # | Decision | Why |
|---|---|---|
| G1 | A **request** (desired state) per vehicle, not a 2-minute remote order. At most one pending per vehicle; a newer one supersedes it. | The car is often asleep when the owner asks. A forgotten-PIN "off" must still work when the car wakes hours later. |
| G2 | **"off" never expires; "on" expires after 12 hours** (proposal: one constant in `set_car_guest_mode`, easy to change). | Off is always safe. An old "on" request landing days later would surprise the owner when he drives himself. |
| G3 | The car **reports its actual state on every guest-capable poll** (`on`/`off`/`unsupported`, since when) and the **last request it handled** (id + code). | The card shows the truth, including changes made on the car screen with the PIN; a lost reply is fixed by the next poll. |
| G4 | The card shows the request as pending until the car confirms; **"Sin respuesta del auto"** once the car received it more than 60 s ago without confirming (as E3). While the car has not received it: "Enviando al auto…" (online) or "lo aplica cuando se encienda con internet" (offline). | Same language as the remote orders. |
| G5 | **Who:** read and change = the vehicle's creator and `control` members (0070 `can_control_car`), checked in the database. **Notifications** (`car_guest_mode`) to **every** member of the vehicle (also view-only): when someone asks (not to the asker) and when the car confirms it entered/left guest mode, also when that happened on the car screen. | "So a family member sees it." The state is not sensitive; only acting on it is. |
| G6 | **Enabled only when the car reported support** (`state` on/off): `set_car_guest_mode` answers `not_supported` otherwise, and the web card is hidden until the first report (shows an update hint for `unsupported`). | Nothing on an old car would ever pick a request up. |
| G7 | **No remote PIN reset in this phase** (proposal P1 below). | The car-side plan keeps the PIN only in Mi Vigo and has no reset path yet; the PIN also guards the Dashcam (D1). |
| G8 | Unlinking the last screen deletes the stored state and cancels a pending request (trigger on `car_devices`, as 0083). | A stale state must not show; the next screen linked must not run an old request. |

## R1. Migration `0085_car_guest_mode.sql`

- **`car_guest_state`** (one row per vehicle, written only by the car's poll): `vehicle_id pk → vehicles on delete cascade`,
  `state text check in ('on','off','unsupported')`, `since timestamptz` (only with `on`), `device_id → car_devices on delete set null`,
  `reported_at timestamptz`.
- **`car_guest_requests`**: `id uuid pk`, `vehicle_id`, `want text check in ('on','off')`, `created_by → auth.users on delete set null`,
  `created_at`, `expires_at` (set iff `want = 'on'`), `sent_at` (first poll that handed it over), `device_id`, `state text check in
  ('pending','done','failed','cancelled','expired','superseded')`, `result_code text check in ('ok','unsupported','no_pin','failed',
  'expired_on_car')`, `finished_at` (null iff pending). Unique partial index: one `pending` per vehicle.
- RLS on for both, **no grants and no policies** for `anon` / `authenticated` (like 0083/0084): everything goes through the functions.
- `notifications.kind` check gains `car_guest_mode`.
- **`get_car_guest_mode() → jsonb`** (`authenticated`): `{"allowed":false}` for no vehicle / view-only; otherwise expires old `on`
  requests and returns `{"allowed":true,"linked":bool,"last_seen_at":iso|null,"car":null|{"state","since","reported_at"},
  "request":null|{"id","want","state","code","by","created_at","sent_at","finished_at","expires_at"}}` (latest non-superseded request;
  `by` = display name, `''` without one, null for a deleted account).
- **`set_car_guest_mode(p_on boolean) → jsonb`** (`authenticated`): `{"ok":true,"id"}` or `{"error": not_allowed | no_car |
  not_supported | rate_limited | bad_request}`. Per-vehicle advisory lock; at most **10 requests per vehicle per hour**; supersedes the
  pending one; notifies the other members ("Ana pidió activar el modo invitado del auto").
- **`cancel_car_guest_request() → jsonb`** (`authenticated`): `{"ok":true}` or `{"error": not_allowed | not_pending}`.
- **`car_poll_orders(p_device_id, p_ts, p_live, p_guest jsonb default null)`** replaces the 3-argument version (dropped; one overload
  only). Same body as 0052, plus: when `p_guest` is given, validate + store it (`car_guest_store`, internal) **before** handing out
  orders (a bad guest object = `bad_request`, nothing handed over), and add `"guest"` to the reply. Without `p_guest` the reply is
  byte-identical to 0052 and no request is marked sent.
- Internal (nobody may execute, not even `service_role`): `car_guest_store`, `car_guest_expire`, `car_guest_notify`.
- Notifications on a reported transition: `off→on` (or a first report `on`) "El auto entró en modo invitado", `on→off` "El auto salió del
  modo invitado", with "(lo pidió Ana desde WikiVigo)" when a request in that direction finished in the last 5 minutes, else "(desde la
  pantalla del auto)". `unsupported` never notifies.

## R2. Car contract (Edge Function `car-device`, action `orders`, wire v1, same signing)

**Request body**: the existing `orders` body with one new optional key, `guest`:

```
{"v":1,"action":"orders","device_id":"<uuid>","ts":<ms>,"live":<status object or null>,
 "guest":{"state":"on"|"off"|"unsupported","since":<ms>|null,"last_id":"<uuid>"|null,"last_code":"<code>"|null}}
```

- `state`: the car's **actual** guest mode (`Settings.Global vigo_guest_mode` / the helper's `guest=` status line). `unsupported` = Mi
  Vigo knows guest mode but the root helper reports no support.
- `since`: Unix ms when guest mode began (only with `on`; may be null).
- `last_id` / `last_code`: the **last request the car handled** (applied or refused), both or neither. The car keeps sending the same
  pair on every poll (idempotent: the server settles a request only once, and only a pending one of the same vehicle).
- `last_code`: `ok` (state now equals `want`) · `unsupported` (helper without guest support) · `no_pin` (reserved: only if the car side
  decides that "on" needs a PIN set first, see C3) · `failed` (helper did not confirm within its timeout) · `expired_on_car` (car clock
  past `expires_at`: not applied).
- Strict: unknown keys in `guest` → 400 (a PIN or anything else can never travel here); `since` with a state other than `on` → 400;
  `guest` missing or `null` = an older car.

**Reply** (200), only when the body had `guest`:

```
{"ok":true,"orders":[…],"guest":null|{"id":"<uuid>","want":"on"|"off","at":<ms>,"expires_at":<ms>|null,"sender":"Fede"|null},"server_time":<ms>}
```

- `guest` = the pending request (handed over on every poll until the car reports it handled), or `null`. `sender` sanitised like
  remote orders (`car_order_sender`: first name, ≤ 20 chars). `expires_at` null for `off`.
- Errors exactly as the `orders` action today (400 bad_request, 401, 409 replay, 410 revoked, 429, 500).

**Cross-language pins** (the car's `Wire.ordersBody` with a guest report must produce exactly these bytes; `carDeviceGuest.test.ts`
parses exactly them):

```
GUEST_ORDERS_BODY = {"v":1,"action":"orders","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"live":null,"guest":{"state":"on","since":1763639000000,"last_id":"0b6c7e2a-1f3d-4a5b-8c9d-e0f1a2b3c4d5","last_code":"ok"}}
GUEST_FIRST_BODY  = {"v":1,"action":"orders","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640001000,"live":null,"guest":{"state":"off","since":null,"last_id":null,"last_code":null}}
reply guest       = {"id":"9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d","want":"off","at":1763639990000,"expires_at":null,"sender":"Fede"}
```

Key order in the body: `v, action, device_id, ts, live, guest`; inside `guest`: `state, since, last_id, last_code` (nulls written).

## R3. Car side (vigo-hack, built separately; listed so the contract is complete)

- **C1 Mi Vigo poll:** add `guest` to every `orders` body once Mi Vigo has guest mode (also when the helper says `unsupported`).
  Persist `last_id` / `last_code` in Mi Vigo's private files (they survive a reboot); reset both on link / unlink.
- **C2 Polling even with "Comandos remotos" off:** today `RemotePoller` polls only while Copiloto's remote switch is on (or one
  "off" poll). Guest mode must not depend on that switch, or the forgotten-PIN recovery fails for owners who never turned remote
  commands on. Proposal: while linked and online, poll as today whenever the car is awake (same 10 s / ACC rules), and send
  orders to Copiloto only when its switch is on (a waiting order is still answered `remote_off`). **Car-side decision.**
- **C3 Applying a request** (`reply.guest` non-null and `id` ≠ the stored `last_id`):
  - car clock past `expires_at` → `last_code = expired_on_car`, nothing changes;
  - `want = off` → leave guest mode **without asking the PIN** (the account role authorised it), exactly as the PIN exit does; also
    reset the PIN lockout counter (proposal);
  - `want = on` → enter guest mode as the Mi Vigo button does. If no owner PIN exists yet: recommended = enter anyway (leaving is
    then only possible from WikiVigo until a PIN is set, and the guest screen says so); alternative = refuse with `no_pin`. Owner
    decision; the server accepts both.
  - Then poll again soon (the helper confirms within ~10 s) with the new `state` and `last_id` = the request id, `last_code`
    `ok` / `unsupported` / `failed`.
- **C4 Car screen:** "Modo invitado activado desde WikiVigo (lo pidió Fede)" / "desactivado desde WikiVigo", in the same toast / bell
  style as remote orders (C7 of the plan: hide the sender's name while in guest mode, so "Modo invitado desactivado desde WikiVigo").
- **C5 Logs:** request id (first 8 chars), want, code. Never the PIN, never the sender name.

## R4. Web card "Modo invitado" (Mi Vigo, signed in)

- Right below "Tu auto ahora". Rendered only when `get_car_guest_mode` says `allowed` (creator / control), `linked`, and `car` is not
  null (the car reported at least once). Every read error, including 0085 not applied, hides it. **No build flag:** the card cannot
  appear before the migration, the function and a guest-capable car all exist.
- `car.state = unsupported` → only "Tu auto todavía no puede usar el modo invitado desde acá. Actualizá las mejoras con el instalador
  (Preparar mi Vigo)."
- Otherwise: explainer (what it hides, that on the car it is left with the PIN and here without, also for a forgotten PIN), the state
  in bold ("Modo invitado activado" / "desactivado"), a muted line ("Desde hace 2 h · Dato del auto de hace 1 min · el auto ahora está
  sin conexión"), the request line (G4) or the last result of the day ("Hecho: Ana lo pidió hace 5 min.", "No se pudo desactivar: …",
  "El pedido se canceló solo: el auto no se conectó en 12 horas."), one button **«Activar modo invitado»** (primary) or
  **«Desactivar modo invitado»** (secondary) with one confirmation each, and **«Cancelar pedido»** while a request waits.
- Footer: "Lo ven y lo cambian solo quien creó el vehículo y quienes tienen control. Todos los integrantes reciben un aviso cuando
  cambia."
- Re-read every 3 s while a request waits, every 30 s otherwise, only while the page is visible.
- Notification kind `car_guest_mode` (🕶️) links to `/mi-vigo`.

## Proposals (not built)

- **P1 Remote PIN reset.** Today the forgotten-PIN path is: "Desactivar modo invitado" here → the car leaves guest mode → the owner
  sets a new PIN in Mi Vigo (Privacidad). Whether that needs the old PIN is a car-side choice: if changing the PIN on the car
  needs the old PIN, a forgotten PIN also locks the Dashcam (D1) forever. Proposal: a third request kind `pin_reset` (same table,
  `want` gains `pin_reset`, control role, notification "Ana borró el PIN del auto"), on which Mi Vigo deletes the PIN hash and the
  lockout, so the next guest-mode entry asks for a new PIN. Needs the owner's OK and the car-side plan to define it first (what happens
  to Dashcam clips protected by the old PIN).
- **P2** A short guide page "Modo invitado" (how to enter, how to leave, forgotten PIN), plan step 11.

## Files

- New `supabase/migrations/0085_car_guest_mode.sql`.
- `supabase/functions/_shared/carDevice.ts` (`parseGuestReport`, `guest` on `orders`), new `carDeviceGuest.test.ts`. The Deno entry
  `supabase/functions/car-device/index.ts` is unchanged.
- `src/lib/carGuest.ts` (+ test), `src/components/CarGuestCard.tsx` (+ css, test), `src/pages/MyVigoPage.tsx`,
  `src/lib/notifications.ts` (+ test), `src/lib/database.types.ts` (hand-edited: regenerate after apply).

## Verified during development (2026-11-26)

- All 85 migrations applied in order to PGlite 0.3.14 (Postgres 17 in WASM) with Supabase-like roles and a stub `auth` schema;
  **72 assertions passed** on the real guard, roles and tables (harness not in the repo, like 0052/0083): the checklist below.
- `npx vitest run`, `npx tsc -p . --noEmit`, `npm run build`.

## SQL review checklist (0085)

- [ ] `anon`/`authenticated` cannot select either table; `get_car_guest_mode`, `set_car_guest_mode`, `cancel_car_guest_request`
      only `authenticated`; `car_poll_orders` only `service_role` and exactly one overload; `car_guest_store` / `_expire` / `_notify`
      nobody.
- [ ] View-only member / no session: `allowed:false`, `not_allowed` on set and cancel; another vehicle sees nothing.
- [ ] Before any report, or with `unsupported`: `not_supported`; no linked screen: `no_car`; 11th request in an hour: `rate_limited`.
- [ ] A 3-argument poll (old Edge Function or old car): reply without `guest`, the request is not marked sent.
- [ ] A guest poll hands the pending request over (sender, ms times, `expires_at` null for off) on every poll until the car reports
      its id; then `done`/`failed` with the code; a retry or another vehicle's id changes nothing.
- [ ] A newer request supersedes the pending one; cancel works once; an `on` request past 12 h is `expired` and never handed over.
- [ ] Validation: non-object, unknown key, bad state, `since` with off / future / fractional / string / before 2025, id without code,
      code without id, bad code or uuid → `bad_request`; guard first (replay, unknown device).
- [ ] Notifications: request → every other member (also view-only), not the asker; transitions → every member with who asked or "desde
      la pantalla del auto"; repeated same state or `unsupported` → none.
- [ ] Revoking one of two screens keeps the state; revoking or deleting the last forgets it and cancels the pending request.

## Security notes

| Threat | Mitigation |
|---|---|
| A stolen session turns guest mode off and exposes the owner's data to the person who has the car | Same exposure class as remote orders (control role); every member is notified; the car screen shows that it came from WikiVigo |
| A view-only family member switches it | `can_control_car` in every function; no table grants |
| The guest flips it from the car | The car never accepts a guest-mode change except from the PIN screen or this signed, device-key channel |
| A PIN leaks to the server | No PIN field exists; unknown keys are refused by the Edge Function AND the database |
| An old request runs on a newly linked screen | Unlinking the last screen cancels it; the car runs each id once |
| Notification spam | 10 requests per hour per vehicle; transitions only |

## Production steps (owner OK required)

What changes in production: tables `car_guest_state`, `car_guest_requests` (no client grants), functions `get_car_guest_mode`,
`set_car_guest_mode`, `cancel_car_guest_request` (signed-in, creator/control checked inside), `car_poll_orders` gains the optional
`p_guest` (old calls unchanged), three internal functions, the trigger on `car_devices`, notification kind `car_guest_mode`.
`car-device`: the `orders` action accepts and answers `guest` (unchanged for cars that do not send it). Site: the card appears only
for a car that reported guest mode.

```
git pull
npx supabase db push --dry-run          # must list only 0085_car_guest_mode.sql
npx supabase db push
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types                        # replaces the hand-written 0085 types
npm run type-check && npm run lint && npm test
git commit -am "Regenerate DB types after 0085 (guest mode)" && git push
npm run deploy                           # the card stays hidden until a car reports guest mode
```

Order: migration before the function (the function passes `p_guest` only for guest-capable cars, so deploying the function first is
also safe for every car that exists today). Undo: a new migration recreating the 3-argument `car_poll_orders` from 0052 and dropping
the two tables, the new functions, the trigger and the kind; redeploy the previous `car-device`.

Car test (vigo-hack NEXT_VISIT, plan G7): Mi Vigo with guest support + helper; WikiVigo «Activar modo invitado» with the car on and
online → the car enters within ~20 s and the card says "Modo invitado activado" (members get the notification); «Desactivar» → back;
then enter on the car with the PIN, turn the car off, «Desactivar» from the phone → the card says it applies when the car connects;
start the car → it leaves guest mode without the PIN. A view-only member does not see the card.
