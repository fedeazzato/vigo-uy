# Car status E1: "last known status" of the linked car

**Status:** Merged into `main` with R4 built and the site deployed (2026-11-21); the card stays hidden until migration 0048 is applied. **Migration and Edge Function NOT applied** (owner OK pending, see "Production steps"). Car side in `vigo-hack`, off by default (`share_status=false`).

## Context

`vigo-hack/wikivigo/PLAN.md` feature **E1**: the owner (and the vehicle's other members, E2) see the car's battery, range and charging state in Mi Vigo, as of the last moment the car was online. It builds on car link phase 0 (`car-link-phase0.md`): pairing, the device key, the signed `car-device` Edge Function and its guard `car_device_accept`.

Constraints that shape it:

- **The head unit sleeps when parked** (kernel suspend; measured on the car). So the status is *last known*, never live: the car reports at a **trip end** or a **charge end**, and only if it is online at that moment (home Wi-Fi, a phone hotspot). Waking the car to report is out of scope.
- **No new always-on process on the car** (owner rule). The car app that already watches ACC and charging (Carga, opt-in "Registrar viajes y cargas") produces the snapshot when its recorder closes a trip or a charge; Mi Vigo, which holds the device key, sends it from a short-lived broadcast receiver.
- **Privacy**: no location in this spec. The table has no location column; the wire refuses unknown keys. A later spec may add an opt-in location (default off).
- **Owner switch**: the car sends nothing unless `share_status=true` in its `mivigo.conf` (default false).

## Requirements

### R1. Migration `0048_car_status.sql`

- **`car_status`**: `vehicle_id uuid pk → vehicles on delete cascade`, `device_id uuid → car_devices on delete set null`, `event text` (`trip_end` | `charge_end`), `soc smallint` 0-100, `range_km smallint` 0-1500, `charging boolean`, `plugged boolean`, `charge_end_reason text` (`completa`, `limite`, `desenchufado`, `fallo`, `detenida`, `sin_datos`; only for `charge_end`), `observed_at timestamptz not null` (car clock), `received_at timestamptz default now()`. Nullable fields = unknown.
  - RLS on; `anon` nothing; `authenticated` `select` only for members of the vehicle (`vehicle_id = current_user_vehicle_id()`); no insert/update/delete policies.
- **`car_submit_status(p_device_id uuid, p_ts bigint, p_status jsonb) → jsonb`**, SECURITY DEFINER, `service_role` only:
  1. `car_device_accept(p_device_id, p_ts)` first (unknown / revoked / clock / replay / rate_limited → `{"error": reason}`).
  2. Validates `p_status` again (the database is the boundary): event, `observed_at` (Unix ms) within **now − 7 days .. now + 5 min**, ranges, reason only for a charge → `{"error":"bad_request"}` otherwise.
  3. Upsert by `vehicle_id`, **only if newer** (`observed_at` greater than the stored one): a late, older snapshot is accepted but ignored.
  4. Returns `{"ok": true, "stored": <bool>}`.
- `execute` revoked from `public`, `anon`, `authenticated`; granted to `service_role`.

### R2. Edge Function `car-device`: action `status` (wire protocol v1, same signing)

Body (≤ 8 KB, signed like every car call):

```
{"v":1,"action":"status","device_id":"<uuid>","ts":<ms>,
 "status":{"event":"trip_end"|"charge_end","observed_at":<ms>,"soc":<0-100|null>,"range_km":<0-1500|null>,
           "charging":<bool|null>,"plugged":<bool|null>,"charge_end_reason":<text|null>}}
```

- `status` keys outside this list → 400 (nothing extra can be stored, e.g. a location). Integers only; booleans only; reason only with `charge_end`.
- Verified with the device's stored key (as heartbeat), then `car_submit_status`. Replies: 200 `{"ok":true,"stored":true|false}`; the database's `bad_request` → 400; guard answers map exactly as for heartbeat (401 `bad_signature`/`clock`, 409, 410, 429); 500 on database failure.
- **Cross-language pin**: the car's builder (`vigo-hack/accounts_proxy` core `Wire.statusBody`) produces exactly this string, and `carDevice.test.ts` parses exactly it:

```
STATUS_BODY = {"v":1,"action":"status","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"status":{"event":"charge_end","observed_at":1763639990000,"soc":80,"range_km":266,"charging":false,"plugged":true,"charge_end_reason":"limite"}}
```

### R3. Car side (companion repo; listed so the contract is complete)

- **Carga** (`charge_app`, core `StatusShare`): when its recorder closes a trip or a charge, an **explicit** broadcast `com.vigo.mivigo.STATUS` to `com.vigo.accountslauncher` with the snapshot as extras. Carga holds Mi Vigo's signature permission; it sends nothing to the network itself.
- **Mi Vigo** (`accounts_proxy`, `StatusReceiver` + `StatusSender`): accepts the broadcast only from holders of `com.vigo.accountslauncher.permission.STATUS` (signature); keeps the newest snapshot; sends it signed inside `goAsync` when `share_status=true`, linked and online; otherwise waits for the next trip/charge end or "Sincronizar ahora". Drops it on `bad_request` / `revoked` / unknown device; keeps it on network / server / rate-limit errors.
- Expected volume: a few calls per day per car (well under the 120/hour device cap).

### R4. Web card "Estado del auto" (Mi Vigo, signed in; built 2026-11-21: `src/components/CarStatusCard.tsx`, `src/lib/carStatus.ts`)

- Under "Mi vehículo", only when a `car_status` row exists for the vehicle: "Batería 80 %", "Autonomía 266 km", "Cargando" / "Enchufado" / "Desenchufado", the event in words ("al terminar una carga: llegó al límite" / "al terminar un viaje") and "hace 2 h" from `observed_at`, plus a muted line "Último dato que el auto envió con conexión; no es en vivo."
- Select explicit columns; empty state: nothing (or a hint to turn on `share_status` on the car).
- Needs `npm run gen:types` after the migration (the generated types add `car_status`).

### Non-goals

- Location (any form). Live status or remote wake. Status history (only the latest row). Family notifications.

## Files

- New `supabase/migrations/0048_car_status.sql`.
- `supabase/functions/_shared/carDevice.ts`: `CarStatus`, `parseCarStatus`, action `status`, `bad_request` from the database; `carDevice.test.ts`: parser (exact car body, nulls, 11 refusals incl. an extra key) and handler (stored / not stored, database refusal, guard mapping, bad signature never reaches the write).

## SQL review checklist (no SQL harness in the repo)

- [ ] `anon` cannot select `car_status`; `authenticated` sees only its vehicle's row; no write policies.
- [ ] Only `service_role` can execute `car_submit_status`; `anon`/`authenticated` cannot.
- [ ] The guard runs first: revoked / replayed / skewed / rate-limited calls change nothing.
- [ ] Out-of-range soc/range, a reason on a trip, an unknown reason, `observed_at` older than 7 days or in the future → `bad_request`, no row change.
- [ ] A snapshot older than the stored one returns `stored:false` and keeps the newer row.
- [ ] Deleting the vehicle removes its row; revoking or deleting the device keeps the last row (`device_id` set null on delete).

## Security notes

| Threat | Mitigation |
|---|---|
| A compromised (rooted) car writes false status | Only its own vehicle's single row; values bounded; members see it is "last known from the car"; revoke from "Dispositivos vinculados". |
| Location leak | No location field in the table, the wire (unknown keys refused) or the car code. |
| Another app on the car injects snapshots into Mi Vigo | The receiver requires a signature permission of the project key; Mi Vigo validates every value again. |
| Replay of a captured status call | Same as every car call: TLS, signed body, strictly increasing ts, 5-minute window. |

## Production steps (owner OK required; run once, applies BOTH 0048 car status and 0049 Bóveda inbox)

What changes in production:
- Database: new tables `car_status` (0048; members of a vehicle can read their row; written only by `car_submit_status`) and
  `vault_inbox_keys` / `vault_inbox` (0049; owners only), their RLS policies, the SQL functions `car_submit_status`,
  `car_vault_inbox_key`, `car_vault_inbox_put`, `car_vault_recipient`. No existing table or column is changed; 0048 and 0049 do not
  reference each other.
- Edge Function `car-device`: three new signed actions (`status`, `inbox_key`, `inbox_put`); the existing `poll` / `heartbeat` /
  `unpair` behave as before (58 tests).
- Site: nothing visible changes until a car sends a status (card) or `VITE_VAULT_INBOX=1` is built (inbox card).

Commands (from `C:Projectsigo-wiki`, on an up-to-date `main`):
```
git pull
npx supabase db push                                  # applies 0048_car_status.sql and 0049_vault_inbox.sql (it lists them first)
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types                                     # replaces the hand-written car_status / vault_inbox* types
npm run type-check && npm run lint && npm test
git commit -am "Regenerate DB types after 0048 and 0049" && git push
npm run deploy                                        # only needed if gen:types changed anything visible (it should not)
```
Undo (if ever needed): a new migration dropping those tables/functions; redeploy the previous `car-device` from git.

Car (vigo-hack NEXT_VISIT): Mi Vigo 2.2 + Carga installed; `share_status=true` in `mivigo.conf` when the owner wants it; end a short trip
online, then the card shows on Mi Vigo.
