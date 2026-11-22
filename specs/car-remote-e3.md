# Car remote actions E3: "Control remoto" from WikiVigo

**Status:** spec 2026-11-22, built offline. **Migration 0052 and the `car-device` deploy NOT applied** (owner OK pending). Web card behind
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
     `{"ok":true,"orders":[{"id":"…","kind":"…","args":{…},"created_at":<ms>,"expires_at":<ms>}]}`.
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
    `com.vigo.copiloto.permission.REMOTE` (declared by Copiloto, held by Mi Vigo). Extras: `id`, `kind`, `pct` (charge_limit only).
    Result: `resultCode` 1 = done / 0 = failed, `resultData` = R3 code, extras `text`. Timeout on Mi Vigo's side 20 s → `no_executor`.
  - Query `com.vigo.copiloto.REMOTE_STATE` (same permission): result `remote_on` true/false (Mi Vigo asks at the start of each awake period).
  - Checks, in order: `Remote` switch (D23 item 4) → `remote_off`; `Safety.remoteGate` P + speed 0 read and valid → `not_parked`;
    rate limit (same counters as voice, D3) → `busy`; then the action:
    `windows_open_all` / `windows_close_all` (D23, same writes and read-back as voice), `ventilate` (calibration gate → `not_calibrated`),
    `charge_limit` (write `0x21402187 MP5_RESERVED_CHRG_SOCTARGET` = pct, read back `0x214020da PDCU_CHRG_SOCFB`), `charge_stop`
    (only when charge state = 2 → else `not_charging`; write `0x21402185 MP5_RESERVED_CHRG_STOP_REQ` = 1, like the stock "end charge" button).
  - On screen: a short notice ("Orden remota de <first name or 'WikiVigo'>: ventanas cerradas") — the driver always sees what ran.
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
| Forged result | Only the device that took the order can report it (same vehicle, state `taken`) |
