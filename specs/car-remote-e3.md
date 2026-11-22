# Car remote actions E3: "Control remoto" from WikiVigo

**Status:** spec 2026-11-22, built offline on branch `car-remote-e3` (R1-R4 server side, R6 web card; see "Implementation notes").
**Migration 0052 and the `car-device` deploy NOT applied** (owner OK pending, see "Production steps"). Web card behind
`VITE_CAR_REMOTE=1` (off in production until the migration is applied). Car side in `vigo-hack` (Mi Vigo + Copiloto + Carga), inert
until Copiloto's "Comandos remotos" switch is on (default off).

## Context

`vigo-hack/wikivigo/PLAN.md` **E3**, owner decisions 2026-11-22:
- Uses: open the windows before a drive (all four, or "ventilar" = all four to a preset gap; **no auto-close timer**), close them all,
  read the car's status (battery, charging / plugged / unplugged, **time to full while charging**), set the **charge limit** (60-100 %).
- Phone side = this site (PWA). No separate phone app.
- Car-side kill switch = Copiloto › Ajustes › "Comandos remotos" (default OFF), checked by the car before every order.
- Remote orders require the car **in P with speed 0** (read and valid). Voice orders while driving are a separate, local rule (Copiloto D23).

Hard constraints (measured on the car, `car-status-e1.md`):
- The head unit **sleeps when parked** and has **no SIM**: it is reachable only while awake AND online (Wi-Fi or phone tethering). An
  order the car does not pick up **expires after 2 minutes**; the page says so. Waking the car is out of scope (blocked area).
- **No new always-on process** on the car: polling runs only while the car is awake (see R4).
- **Charge schedule is NOT in this spec.** With no T-Box, a schedule can only be carried out by the head unit starting/stopping the
  charge at the set hours (vigo-hack `charge_app/PROPERTIES.md` section 4), which is the blocked timed-wake area. A later spec if that changes.

## R1. Migration `0052_car_remote.sql`

- **`car_orders`**: `id uuid pk default gen_random_uuid()`, `vehicle_id uuid not null → vehicles on delete cascade`,
  `created_by uuid not null → auth.users on delete set null` (nullable after delete), `kind text not null` check in
  (`windows_open_all`, `windows_close_all`, `ventilate`, `charge_limit`, `charge_stop`), `args jsonb not null default '{}'`
  (`charge_limit`: `{"pct": 60..100}` integer; every other kind: `{}`), `state text not null default 'queued'` check in
  (`queued`, `taken`, `done`, `failed`, `expired`, `cancelled`), `created_at timestamptz default now()`,
  `expires_at timestamptz not null default now() + interval '2 minutes'`, `taken_at`, `finished_at timestamptz`,
  `result_code text` (see R3), `result_text text` (≤ 200 chars, Spanish, shown as is), `device_id uuid → car_devices on delete set null`.
  Index `(vehicle_id, created_at desc)`.
  - RLS on; `anon` nothing; `authenticated` `select` only rows of `current_user_vehicle_id()`; **no** insert/update/delete policies
    (writes only through the RPCs below).
- **`create_car_order(p_kind text, p_args jsonb) → jsonb`** (SECURITY DEFINER, `authenticated`): caller must be a member of a vehicle
  (`current_user_vehicle_id()` not null) that has at least one non-revoked `car_devices` row → else `{"error":"no_car"}`. Validates kind and
  args exactly (unknown keys → `bad_request`). Rate limit per vehicle: ≤ 6 orders per minute and ≤ 40 per hour → `{"error":"rate_limited"}`.
  A new order **expires older `queued` orders of the same vehicle** (state `expired`, `result_code` `superseded`): the car only ever runs
  the latest intent. Returns `{"ok":true,"id":"<uuid>"}`.
- **`cancel_car_order(p_id uuid) → jsonb`** (`authenticated`, member of the order's vehicle): `queued` → `cancelled`; any other state → `{"error":"not_queued"}`.
- **`car_poll_orders(p_device_id uuid, p_ts bigint, p_live jsonb) → jsonb`** (`service_role` only):
  1. `car_device_accept(p_device_id, p_ts)` first (as every car call). The device's `last_seen` is updated by the guard (phase 0).
  2. Marks `queued` orders with `expires_at < now()` as `expired` (`result_code` `not_picked_up`).
  3. If `p_live` is not null: validates it like `car_submit_status`'s object (same keys, plus R2's new ones, `event` = `live`) and
     upserts `car_status` if newer.
  4. Returns at most 3 oldest `queued`, unexpired orders of the device's vehicle, and marks them `taken` (`taken_at`, `device_id`):
     `{"ok":true,"orders":[{"id":"…","kind":"…","args":{…},"created_at":<ms>,"expires_at":<ms>,"sender":"Fede"|null}]}`.
     `sender` (owner 2026-11-22): first word of the sender's `profiles.display_name`, trimmed, at most 20 characters, letters /
     digits / spaces / `.-'` only (anything else removed); null when the profile is gone or the result is empty.
- **`car_order_result(p_device_id uuid, p_ts bigint, p_id uuid, p_state text, p_code text, p_text text) → jsonb`** (`service_role` only):
  guard first; the order must belong to the device's vehicle and be `taken` → else `{"error":"bad_request"}`; `p_state` in (`done`,`failed`);
  `p_code` in R3's list; stores `finished_at`.
- The guard's per-device cap (phase 0: 120 calls/hour) would stop a 10-second poll: `car_device_accept` gets an optional
  `p_kind text default 'default'`; for `'poll'` the cap is **600/hour**, counted separately. Every other call keeps 120/hour.
- `execute` on the car RPCs revoked from `public`, `anon`, `authenticated`; granted to `service_role`.

## R2. `car_status` additions (same migration)

- New nullable columns: `remain_charge_min smallint` (0-1440, minutes to full while charging; null otherwise / unknown),
  `limit_pct smallint` (60-100, the car's charge limit).
- `event` check adds `live` (a snapshot sent with a poll while the car is awake).
- `car_submit_status` and the `status` wire action accept the two new keys (optional, so old cars keep working).

## R3. Result codes (car → server → page, `result_code`)

`ok` · `remote_off` (Copiloto switch off) · `not_parked` (gear not P or speed not 0 / unreadable) · `not_calibrated` (ventilar) ·
`car_wash` (opening refused in car-wash mode) · `not_charging` (charge_stop while not charging) · `car_error` (write failed / read-back
differs) · `busy` (Copiloto rate limit) · `no_executor` (Copiloto not installed / did not answer) · `expired_on_car` (taken after
`expires_at` on the car's clock: not run). Server-only: `not_picked_up`, `superseded`.

## R4. Edge Function `car-device`: actions `orders` and `order_result` (wire v1, same signing as every car call)

```
{"v":1,"action":"orders","device_id":"<uuid>","ts":<ms>,"live":<status object or null>}
{"v":1,"action":"order_result","device_id":"<uuid>","ts":<ms>,"id":"<uuid>","state":"done"|"failed","code":"<R3>","text":"<≤200>"}
```

- `live` uses the `status` object of `car-status-e1.md` R2 with `event:"live"` and the optional `remain_charge_min`, `limit_pct`.
  Unknown keys → 400. Replies: `orders` → 200 `{"ok":true,"orders":[…]}`; `order_result` → 200 `{"ok":true}`; guard answers mapped as
  for heartbeat; database `bad_request` → 400.
- **Cross-language pins** (the car's `Wire` builders produce exactly these; `carDevice.test.ts` parses exactly them):

```
ORDERS_BODY = {"v":1,"action":"orders","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"live":{"event":"live","observed_at":1763639995000,"soc":64,"range_km":212,"charging":true,"plugged":true,"charge_end_reason":null,"remain_charge_min":95,"limit_pct":90}}
ORDER_RESULT_BODY = {"v":1,"action":"order_result","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640001000,"id":"0b6c7e2a-1f3d-4a5b-8c9d-e0f1a2b3c4d5","state":"done","code":"ok","text":"Ventanas cerradas (4 de 4)."}
```

## R5. Car side (vigo-hack; listed so the contract is complete)

- **Mi Vigo** (`accounts_proxy`, holds the device key):
  - **When it polls:** only while the car is awake AND Mi Vigo is linked AND online AND Copiloto answered "remote on" (R5 Copiloto) at
    the start of the awake period. Every **10 s** for the first 10 minutes after ACC on, ACC off, or plug-in; every **60 s** after that
    while ACC is on or the car is charging; **stops** at ACC off + 10 min (unless charging). No wake locks, no alarms that wake the car,
    nothing while asleep. Driven by the existing ACC / charge events (Carga's T-Box/sampler events or the car power state), hosted in
    a component that only lives during those periods (no all-day service).
  - Each poll sends `live` = Carga's newest snapshot (Carga hands it over on its sampler tick through the existing STATUS broadcast,
    now with `event:"live"`, `remain_charge_min`, `limit_pct`; only when `share_status=true` — otherwise `live:null`).
  - For each order: if the car's clock is past `expires_at` → result `expired_on_car` without running. Else hand it to Copiloto (below)
    and send `order_result` with Copiloto's code and text. Network / server errors on the result: retry with the next poll (keep at most
    10 pending results). Logs through common/vigolog (order id first 8 chars, kind, code; never args other than pct).
- **Copiloto** (executor, `voice_es`):
  - Explicit ordered broadcast `com.vigo.copiloto.REMOTE_ORDER` to `com.vigo.copiloto`, guarded by a **new signature permission**
    `com.vigo.copiloto.permission.REMOTE` (declared by Copiloto, held by Mi Vigo). Extras: `id`, `kind`, `pct` (charge_limit only), `sender` (optional String, as received; Copiloto re-sanitises it).
    Result: `resultCode` 1 = done / 0 = failed, `resultData` = R3 code, extras `text`. Timeout on Mi Vigo's side 20 s → `no_executor`.
  - Query `com.vigo.copiloto.REMOTE_STATE` (same permission): result `remote_on` true/false (Mi Vigo asks at the start of each awake period).
  - Checks, in order: `Remote` switch (D23 item 4) → `remote_off`; `Safety.remoteGate` P + speed 0 read and valid → `not_parked`;
    rate limit (same counters as voice, D3) → `busy`; then the action:
    `windows_open_all` / `windows_close_all` (D23, same writes and read-back as voice), `ventilate` (calibration gate → `not_calibrated`),
    `charge_limit` (write `0x21402187 MP5_RESERVED_CHRG_SOCTARGET` = pct, read back `0x214020da PDCU_CHRG_SOCFB`), `charge_stop`
    (only when charge state = 2 → else `not_charging`; write `0x21402185 MP5_RESERVED_CHRG_STOP_REQ` = 1, like the stock "end charge" button).
  - On screen: a short notice ("Orden remota de <sender>: ventanas cerradas", or "Orden remota: …" without a sender) — the driver always sees what ran.
- **Carga** (`charge_app`): adds `remain_charge_min` (`0x214020ab PDCU_BMS_REMAIN_CHRG_TIME`, only while charging) and `limit_pct` to
  its snapshot; sends an `event:"live"` snapshot to Mi Vigo at most every 60 s while awake (only if `share_status=true`).

## R6. Web card "Control remoto" (Mi Vigo page, signed in, `VITE_CAR_REMOTE=1`)

- Shown to members of a vehicle with a linked car. Top line: **"En línea"** (device `last_seen` < 30 s) / **"Sin conexión — visto hace X"**
  with the muted explanation "El auto solo recibe órdenes mientras está encendido y con internet; si no la recibe en 2 minutos, se cancela."
- Live block when `car_status.event = 'live'` and fresh: battery %, range, Cargando / Enchufado / Desenchufado, **"Carga completa en ~1 h 35 min"**
  (from `remain_charge_min`), limit %.
- Buttons (stock-look, large): **Ventilar**, **Abrir todas las ventanas**, **Cerrar todas las ventanas**, **Detener la carga** (only when
  charging), **Límite de carga** (stepper 60-100 by 5, "Aplicar"). "Abrir"/"Ventilar" ask for one confirmation ("¿Abrir las 4 ventanas?").
- Order list (last 10): kind in words, who sent it, state with an icon (en cola → recibida → hecha / falló: reason in words from R3 /
  vencida), "Cancelar" while queued. The page polls the orders every 3 s while visible (no Realtime), stops when hidden.
- Needs `npm run gen:types` after the migration.

## Non-goals

Waking the car; charge schedule; locks, doors, lights, tailgate, sunroof, driving functions; single-window orders from the web; push
notifications; location.

## Security notes

| Threat | Mitigation |
|---|---|
| Stolen session opens the windows | Membership check; rate limits; car-side switch default OFF; P + speed 0; every order logged with who sent it; on-screen notice in the car |
| Replay of an old order | Orders are fetched by the car over the signed, replay-guarded channel; `expires_at` checked on the server AND on the car |
| Order run while someone is driving | P + speed 0 read and valid on the car, refused otherwise (`not_parked`) |
| Poll traffic | Only while awake; separate 600/hour cap for `poll` |
| Forged result | Only the device that took the order can report it (same vehicle, same `device_id`, state `taken`); a finished order cannot be rewritten (only an identical retry answers ok) |
| Skipping the guard | `car_device_accept`, `car_store_status` and `car_orders_expire` are executable by nobody, not even `service_role`; the poll and the result run the guard first |
| Unknown status keys (e.g. a location) | Refused by the Edge Function AND by `car_store_status` (the database is the boundary) |
| Order table writes from the browser | No insert/update/delete grants or policies on `car_orders`; the table `check` also pins `args` per kind |
| A member races the rate limit | `create_car_order` takes a per-vehicle transaction advisory lock before counting |

## Implementation notes (2026-11-22, branch `car-remote-e3`)

Files: `supabase/migrations/0052_car_remote.sql`; `supabase/functions/_shared/carDevice.ts` (+ `carDevice.test.ts`, 137 tests,
49 new); `src/lib/database.types.ts` (hand-edited for 0052: **regenerate with `npm run gen:types` after apply**);
`src/lib/carRemote.ts` (+ test), `src/lib/carRemoteFlag.ts`, `src/components/CarRemoteCard.tsx` (+ `.module.css`, test),
`src/pages/MyVigoPage.tsx`, `src/types.ts`, `src/vite-env.d.ts`, `src/lib/carStatus.ts` (+ test). The Deno entry
`supabase/functions/car-device/index.ts` is unchanged.

Interpretations of the spec (owner may revisit):
- **The guard.** `car_device_accept(uuid, bigint)` was last defined in `0045_car_link.sql` (section 8); 0048-0051 only call it.
  0052 drops it and creates `car_device_accept(p_device_id, p_ts, p_kind text default 'default')` with the same body; the old
  overload has to go because both would make every two-argument call ambiguous. Every existing caller (heartbeat, unpair, status,
  inbox key/put, trip draft, diag part) calls it with two arguments and keeps the 120/hour window. `'poll'` uses new columns
  `car_devices.poll_window_started_at` / `poll_window_count` (not granted to clients). The replay counter (`last_request_ts`) is
  shared by both kinds. Any other `p_kind` raises (internal function, a programming error). Only `car_poll_orders` passes `'poll'`;
  `car_order_result` counts in the 120/hour window (at most 3 results per poll).
- **`created_by`**: the spec says `not null` and `on delete set null`; it is nullable (always set on insert from `auth.uid()`,
  null only after the account is deleted). The web shows "una cuenta borrada".
- **Status validation** moved into an internal `car_store_status(vehicle, device, status, live)` shared by `car_submit_status`
  (events `trip_end` / `charge_end` only; a `status` call cannot send `live`) and `car_poll_orders` (event `live` only). It now
  also refuses unknown keys in the database (0048 only did so in the Edge Function). The `status` action and the `live` object
  accept `remain_charge_min` 0-1440 and `limit_pct` 60-100, both optional; old cars keep working.
- **Live with a bad value**: the poll answers `bad_request` (400) and hands over no order (the guard already consumed `ts`, as for
  every refused call). The car's own parser makes this a bug, not a runtime case.
- **`live` missing** from an `orders` body is treated as `null`.
- **Expiry**: `car_orders_expire` runs in `car_poll_orders`, `create_car_order` and `cancel_car_order`. A car that is never online
  never polls, so the web also shows a `queued` order past `expires_at` as "Vencida" (not picked up). Cancelling one returns
  `not_queued` and marks it expired.
- **`cancel_car_order`** on an order of another vehicle (or unknown id) answers `{"error":"not_found"}` (the spec named only `not_queued`).
- **`create_car_order`** with `p_args` null is treated as `{}`; `charge_limit` must be exactly `{"pct": <integer 60..100>}` (80.0,
  "80", extra keys → `bad_request`). The web stepper moves by 5; the server accepts any integer in range. Banned members are not
  refused (the spec does not say so; a ban is about publishing content). Open question for the owner.
- **`car_order_result`**: `p_text` is cleaned with `car_clean_text` (control characters stripped, 200 chars) and stored as null
  when empty; the wire allows an empty `text`. `done` / `failed` are not tied to a code (the car decides). An identical repeat of
  the stored result by the same device answers `{"ok":true}` so a retry after a lost reply is not dropped as `bad_request`.
- **Taken orders without a result** stay `taken` on the server; the page shows them as **"Sin respuesta del auto"** once `taken_at` is
  more than 60 s old (owner 2026-11-22 follow-up), and a late result still updates the row.
- **Web card**: "En línea" uses the newest `last_seen_at` of the vehicle's active devices; the live block needs `event = 'live'`
  and `received_at` (server clock) within 2 minutes; "Detener la carga" shows when the newest status row says `charging = true`;
  the stepper starts at the car's `limit_pct` (else 80 %). The card polls devices, status and the last 10 orders every 3 s while
  the page is visible. The E1 card ("Estado del auto") words a `live` row as "con el auto encendido" and does not select the new
  columns, so it keeps working before 0052 is applied.

Verified during development: all 52 migrations applied in order to PGlite 0.3.14 (Postgres 17 in WASM) with Supabase-like roles,
default privileges and a stub `auth` schema, then **99 assertions passed** covering the checklist below (harness not in the repo,
like phase 0). `npm run type-check`, `npm run lint`, `npx vitest run` (61 files, 727 tests) pass; `vite build` with
`VITE_CAR_REMOTE=1` builds.

## SQL review checklist (0052)

- [ ] Exactly one `car_device_accept` exists; nobody (not `service_role`) can execute it, `car_store_status` or `car_orders_expire`.
- [ ] Two-argument callers (`car_heartbeat`, `car_unpair`, `car_submit_status` exercised in the harness; inbox, trip draft and diag
      part use the identical `car_device_accept(p_device_id, p_ts)` call) still pass and count
      in `window_count` (120/hour, resets after an hour); polls count only in `poll_window_count` (601st in an hour → `rate_limited`
      while heartbeats still pass, and the reverse).
- [ ] A poll and another call with the same `ts` → `replay` (one counter).
- [ ] `authenticated` cannot select `poll_window_*` of `car_devices`; it still selects the granted columns.
- [ ] `anon` cannot select `car_orders` or execute any new function; `authenticated` can execute only `create_car_order` and
      `cancel_car_order`; `car_poll_orders` / `car_order_result` only `service_role`.
- [ ] No insert/update/delete on `car_orders` for `authenticated`; members see only their vehicle's orders.
- [ ] `create_car_order`: no vehicle / no active device → `no_car`; unknown kind, wrong or extra args, pct outside 60-100, decimals
      or text → `bad_request`; the 7th order in a minute and the 41st in an hour → `rate_limited`; a new order marks the older queued
      ones `expired` / `superseded`; `expires_at` = `created_at` + 2 min.
- [ ] `cancel_car_order`: another vehicle's order → `not_found`; queued → `cancelled`; again → `not_queued`; past expiry →
      `not_queued` and `expired` / `not_picked_up`.
- [ ] `car_poll_orders`: expired queued orders become `expired` / `not_picked_up` and are not handed over; at most 3, oldest
      first, marked `taken` with `taken_at` and `device_id`; a second poll gets none; `created_at` / `expires_at` in ms.
- [ ] Live: `event` must be `live`; ranges (`limit_pct` 60-100, `remain_charge_min` 0-1440), no reason, no unknown key → `bad_request`;
      an older `observed_at` is ignored; JSON `null` = no live.
- [ ] `car_submit_status`: E1 bodies unchanged; new keys accepted; `live` refused.
- [ ] `car_order_result`: another device (also of the same vehicle) → `bad_request`; server-only codes, other states, text > 200 →
      `bad_request`; stores state, code, cleaned text, `finished_at`; identical retry → ok without change; a different result
      after finishing → `bad_request`; a queued (not taken) order → `bad_request`.
- [ ] Revoked device → `revoked`; deleting the account sets `created_by` null; deleting the vehicle removes its orders.

## Production steps (owner OK required)

What changes in production:
- Database (0052): new table `car_orders` (members read their vehicle's orders; written only by the functions), new columns
  `car_status.remain_charge_min` / `limit_pct` and the `live` event, new columns `car_devices.poll_window_*`, the guard
  `car_device_accept` replaced by the same function with an optional `p_kind`, `car_submit_status` re-created on the shared
  validation, new functions `create_car_order`, `cancel_car_order` (signed-in members), `car_poll_orders`, `car_order_result`
  (service role), `car_store_status`, `car_orders_expire` (internal). No anon surface.
- Edge Function `car-device`: two new signed actions (`orders`, `order_result`); the `status` object accepts the two optional keys;
  every existing action behaves as before.
- Site: nothing visible changes unless it is built with `VITE_CAR_REMOTE=1`; the E1 card words `live` rows.

Commands (from `C:\Projects\vigo-wiki`, after merging `car-remote-e3` into an up-to-date `main`):
```
git pull
npx supabase db push --dry-run          # must list only 0052_car_remote.sql
npx supabase db push
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types                        # replaces the hand-written 0052 types
npm run type-check && npm run lint && npm test
git commit -am "Regenerate DB types after 0052 (car remote)" && git push
# when the car side is installed and tested: build with VITE_CAR_REMOTE=1 (e.g. in .env.production) and npm run deploy
```
Undo (if ever needed): a new migration dropping `car_orders` and the new functions/columns and restoring the two-argument guard;
redeploy the previous `car-device` from git.

Car (vigo-hack NEXT_VISIT): Mi Vigo with the orders poll + Copiloto with the "Comandos remotos" switch on; a "Cerrar todas las
ventanas" from the card while the car is on and online shows "Hecha" within ~10 s.
