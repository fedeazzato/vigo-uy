# Car link, phase 0: pair the car to a vehicle, linked devices, signed car calls

**Status:** Implemented on branch `car-link-phase0`; **not applied**. The owner reviews the migration and the Edge Function, then runs `npx supabase db push`, deploys the function, runs `npm run gen:types`, merges and deploys (see "Owner steps").

## Context

The companion repo's plan (`vigo-hack/wikivigo/PLAN.md`, section 1 "Foundation", approved as "Phase 0") links an owner's car head unit to their WikiVigo vehicle so the car can later feed the community (trip drafts, charging check-ins, verified km) and the community can feed the car. Phase 0 builds only the foundation:

1. **Pairing, TV-login style.** The car shows a 6-character code and a QR code (`https://fedeazzato.github.io/vigo-uy/#/mi-vigo/vincular?c=K7Q2M9`). The owner, signed in on the phone, opens it and binds the car to **their vehicle** (`vehicles` / `vehicle_members`, migration 0012). No email or OTP is typed on the car.
2. **A device identity, not a session.** The car generates an ECDSA P-256 key pair in the Android Keystore; the code request carries the public key. From then on every car call is signed with the private key (nonce = strictly increasing timestamp). No refresh token or bearer credential sits on the car: a stolen device id grants nothing, and a device can only ever act on its own vehicle's car data.
3. **"Dispositivos vinculados"** in Mi Vigo: name, linked date, last seen, revoke (immediate).
4. **A heartbeat**, the template every later `car_submit_*` call follows (signature, freshness, replay guard, rate limit, revocation, bound vehicle).

Owner decisions that shape this spec: car-sourced items always go through a drafts inbox (nothing public without the owner confirming on the phone; no such item exists yet in phase 0); the car side lives in the existing Accounts tile (renamed "Mi Vigo"); the car UI follows the stock head-unit design.

### Why an Edge Function verifies the signatures (and not SQL)

- The head unit runs **Android 10 (API 29)**. Its Keystore (Keymaster 4) generates EC keys on the NIST curves only; **Ed25519 needs Android 13** (KeyMint). So the device key is **ECDSA P-256 / SHA-256**.
- Postgres on Supabase cannot verify ECDSA P-256: **pgcrypto** has no public-key signatures (only PGP encryption), and **pgsodium** wraps libsodium, which has Ed25519 but no P-256 (and Supabase lists pgsodium as pending deprecation). A pure PL/pgSQL P-256 implementation would be slow and unreviewable.
- Therefore: one Supabase **Edge Function `car-device`** (Deno, WebCrypto `ECDSA`/`P-256`/`SHA-256`) verifies the signature and the timestamp, then calls **service-role-only SQL functions** that do the database work atomically (replay guard, rate limit, revocation, bound vehicle). The task's `poll_car_pairing(code, signature)` and `car_heartbeat(device_id, ts, signature)` are therefore split: the signature parameter is checked in the function, and the SQL functions of the same names take the already-verified fields and are not executable by `anon`/`authenticated`.

## Requirements

### R1. Migration `0045_car_link.sql`

Tables (RLS enabled on all three; `anon` gets nothing):

- **`car_devices`**: `id uuid pk`, `vehicle_id uuid not null → vehicles on delete cascade`, `public_key text not null` (base64 X.509 SubjectPublicKeyInfo of a P-256 key, checked by `is_p256_spki`), `name text not null` (1-40 chars), `app_version text` (≤ 20), `created_by uuid → auth.users on delete set null`, `created_at`, `last_seen_at`, `last_request_ts bigint` (highest accepted signed timestamp, the replay guard), `window_started_at` + `window_count` (per-device request cap), `revoked_at`, `revoked_by`. Unique partial index: one **active** (non-revoked) device per public key.
  - RLS: `select` for authenticated members of the device's vehicle (`vehicle_id = current_user_vehicle_id()`); no insert/update/delete policies (writes only through the RPCs).
  - Column privileges: `authenticated` may select only `id, vehicle_id, name, app_version, created_by, created_at, last_seen_at, revoked_at, revoked_by` (the key and the replay/rate counters stay server-side). The client therefore always selects explicit columns, never `*`.
- **`car_pairing_requests`**: `code text pk` (6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, the join-code alphabet without lookalikes), `public_key`, `device_name`, `created_at`, `expires_at` (created + **10 min**), `claimed_at`, `claimed_by`, `vehicle_id`, `device_id`. RLS enabled with **no policies** and all privileges revoked from `anon`/`authenticated`: only SECURITY DEFINER functions touch it. Rows older than 1 day are deleted opportunistically.
- **`car_pairing_attempts`**: failed claims per user (same pattern as `join_code_attempts`, 0021). No policies.

Functions:

| Function | Callable by | What it does |
|---|---|---|
| `is_p256_spki(text) → boolean` | nobody (internal; used by CHECK constraints inside the definer functions) | Exact canonical form: `^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$` (the 27-byte DER prefix of an uncompressed P-256 SPKI, 91 bytes total, canonical padding bits). Point validity is checked by WebCrypto at verify time. |
| `car_clean_text(text, int) → text` | nobody (internal) | Strips control characters, trims, caps the length (device names, app version). |
| `generate_car_pairing_code() → text` | nobody (internal) | 6 chars, CSPRNG (`gen_random_uuid()` bytes = `pg_strong_random`, rejection sampling < 248 so no modulo bias, skipping the UUID version/variant bytes); unique among stored requests. |
| `request_car_pairing(p_public_key, p_device_name default null) → jsonb` | **anon**, authenticated | Validates the key; refuses a key that is already an active device ("Este auto ya está vinculado."); sanitises the name (control chars stripped, 40 chars, default "Vigo"); rate limits under a transaction advisory lock: **≤ 6 requests per key per hour**, **≤ 200 requests per hour in total**; stores the request; returns `{code, expires_at, ttl_seconds: 600}`. |
| `claim_car_pairing(p_code, p_name default null) → jsonb` | authenticated | Not banned; **≤ 10 failed claims per user per hour** (a failure returns `null` instead of raising, so the attempt row survives, as `join_vehicle_by_code` does); the code is normalised (uppercase, non-alphanumerics stripped); request must be unexpired and unclaimed (row locked `for update`: **single use**); vehicle = caller's vehicle; **≤ 3 active devices per vehicle**; creates the `car_devices` row, marks the request claimed, clears the caller's failures; returns `{device_id, name}`. |
| `revoke_car_device(p_device_id) → void` | authenticated | Caller must be a member of the device's vehicle (banned members too: revoking only removes capability); sets `revoked_at`/`revoked_by` (idempotent). Takes effect on the device's next call. |
| `poll_car_pairing(p_code) → jsonb` | **service_role only** | For the Edge Function: `{public_key, status: pending|claimed|expired, expires_in, device_id, device_name, members}` or `null` for an unknown code. The function returns nothing to the car before verifying the signature with `public_key`. |
| `car_device_public_key(p_device_id) → text` | service_role only | The stored key (also for revoked devices, so a revoked car can be told so after proving its key). |
| `car_device_accept(p_device_id, p_ts) → (accepted_vehicle, reject_reason)` | nobody (internal; not even `service_role`, so the guard cannot be skipped) | **The guard every signed car call runs first** (template for `car_submit_*`): device exists (`unknown`), not revoked (`revoked`), its vehicle still has members (otherwise the device self-revokes: nobody could manage it), `abs(ts - now) ≤ 5 min` (`clock`), `ts > last_request_ts` (`replay`), **≤ 120 signed requests per device per hour** (`rate_limited`); on success it stores `ts`, bumps the window and `last_seen_at`, and returns the bound vehicle. The row is locked `for update`, so two concurrent requests cannot both pass with the same ts. |
| `car_heartbeat(p_device_id, p_ts, p_app_version) → jsonb` | service_role only | Guard, store `app_version`, return `{device_id, device_name, members}`. |
| `car_unpair(p_device_id, p_ts) → jsonb` | service_role only | Guard, then the device revokes itself (the car's "Desvincular" button). |
| `car_vehicle_member_names(p_vehicle_id) → jsonb` | nobody (internal) | Sorted display names of the vehicle's non-banned members (what the car shows as "Vinculado a: …"). |

All SECURITY DEFINER functions use `set search_path = public`; `execute` is revoked from `public`, `anon`, `authenticated` and (for the internal helpers) `service_role` explicitly, because Supabase's default privileges grant those roles independently of `PUBLIC` (see 0015 section 5; the development run below caught the `service_role` case).

### R2. Edge Function `car-device` (wire protocol v1)

`POST {SUPABASE_URL}/functions/v1/car-device`, deployed with `verify_jwt = false` (`supabase/config.toml`): it authenticates by signature, not by JWT. The logic lives in `supabase/functions/_shared/carDevice.ts` (pure TypeScript, WebCrypto only, no imports) so Vitest can test it; `supabase/functions/car-device/index.ts` is the Deno entry point (reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects; calls the SQL functions through PostgREST).

**Request**
- Headers: `Content-Type: application/json`, `x-vigo-signature: <base64 of the 64-byte IEEE P1363 r‖s>`. (`apikey: <anon key>` may be sent; it is not needed.)
- Body: a JSON object, **≤ 8 KB**, UTF-8: `{"v":1,"action":"poll","code":"K7Q2M9","ts":1763640000000}`, `{"v":1,"action":"heartbeat","device_id":"<uuid>","ts":…,"app_version":"2.0"}`, `{"v":1,"action":"unpair","device_id":"<uuid>","ts":…}`. `ts` = Unix milliseconds (integer).
- **Signed message** = the UTF-8 bytes of `"vigo-car-v1\n" + <the exact request body>`, ECDSA P-256 with SHA-256. Java's `SHA256withECDSA` (Android Keystore) outputs DER; the car converts it to P1363 before sending.
- The verifying key: the pairing request's key for `poll`; `car_devices.public_key` for `heartbeat` and `unpair`.

**Responses** (JSON; every one carries `server_time` in ms):

| Status | Body | When |
|---|---|---|
| 200 | `{"ok":true,"status":"pending","expires_in":s}` / `{"ok":true,"status":"claimed","device_id","device_name","members":[…]}` / `{"ok":true,"status":"expired"}` | poll |
| 200 | `{"ok":true,"device_id","device_name","members":[…]}` | heartbeat |
| 200 | `{"ok":true}` | unpair |
| 400 | `{"ok":false,"error":"bad_request"}` | not JSON, wrong `v`, unknown action, bad field |
| 401 | `{"ok":false,"error":"bad_signature"}` | bad/missing signature, **unknown code or device** (indistinguishable: no oracle), malformed stored key |
| 401 | `{"ok":false,"error":"clock"}` | `ts` more than 5 min from the server clock (the car re-bases on `server_time` and retries once) |
| 405 | `{"ok":false,"error":"method"}` | not POST |
| 409 | `{"ok":false,"error":"replay"}` | `ts` not greater than the last accepted one |
| 410 | `{"ok":false,"error":"revoked"}` | device revoked (said only after the signature verified) |
| 413 | `{"ok":false,"error":"too_large"}` | body over 8 KB |
| 429 | `{"ok":false,"error":"rate_limited"}` | per-device cap |
| 500 | `{"ok":false,"error":"server"}` | database/network failure (details only in the function log) |

Poll is read-only and idempotent: once claimed it keeps returning the device id to the key holder (a lost response does not strand the car), so it checks freshness but not monotonicity. Every state-changing action goes through `car_device_accept`.

**Code request** (anon, plain PostgREST, no signature possible in SQL): `POST {SUPABASE_URL}/rest/v1/rpc/request_car_pairing`, headers `apikey` (+ `Authorization: Bearer` for a legacy JWT anon key), body `{"p_public_key":"MFkw…","p_device_name":"Vigo"}` → `{"code":"K7Q2M9","expires_at":"…","ttl_seconds":600}`; a raised error comes back as HTTP 400 `{"code":"P0001","message":"<Spanish text>"}`.

**QR content**: `<site>#/mi-vigo/vincular?c=<CODE>` with `site` = `https://fedeazzato.github.io/vigo-uy/` by default.

**Cross-language test vector** (made with the JDK's `SHA256withECDSA` + DER→P1363; public data only, no private key is kept anywhere):

```
SPKI = MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEgGSLj9m2SBQna08UIFyIJavl7cVrlJ6CkwBHxi/GFf+lzWZHJNvJge17xBBGCbxpSENqS1/AD1ICMgk7TdnVZQ==
BODY = {"v":1,"action":"heartbeat","device_id":"6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f","ts":1763640000000,"app_version":"2.0"}
SIG  = dIFlvU00qEIqt7o8x0Uj2+gq7MkfG5d2a6pBv2ScX3mp1BrqPMhXQC5yuOKPM7UQAYHfEBcSkibS67Q/ik6msA==
SIG (DER, as Java outputs it) = MEUCIHSBZb1NNKhCKre6PMdFI9voKuzJHxuXdmuqQb9knF95AiEAqdQa6jzIV0AucrjijzO1EAGB3xAXEpIm0uu0P4pOprA=
BODY2 = {"v":1,"action":"poll","code":"K7Q2M9","ts":1763640000000}
SIG2  = sJWREXr0kOv6DUoUaM8AfQXPwKsy8iqrpoP37wSnmGUbuv8bzSwISgIRwhBtoaT2JPRMqML7bP+WImX+KBgv/A==
```

### R3. Web: "Vincular auto" (`/mi-vigo/vincular`)

- Route inside `RequireAuth`. `HashRouter` parses `#/mi-vigo/vincular?c=K7Q2M9` into pathname `/mi-vigo/vincular` and search `?c=K7Q2M9`, so `useSearchParams` reads the code. **`RequireAuth` must remember `pathname + search`** (it kept only the pathname, which would drop the code across the login detour).
- The code field is prefilled from `?c=` (normalised: uppercase, spaces/dashes dropped; a pasted full link is accepted too), 6 characters from the pairing alphabet, monospace, like the join code.
- Shows which vehicle the car will be bound to ("Se va a vincular al vehículo de: Ana, Juan") and an optional "Nombre del auto".
- "Vincular este auto" → `claim_car_pairing`. `null` → "Código no válido o vencido. Pedí uno nuevo en la pantalla del auto."; raised messages (rate limit, 3-device cap, banned) pass through `toFriendlyError`.
- Success: "¡Listo! El auto quedó vinculado…" plus a link back to Mi Vigo. Privacy note: the car can only send data to this vehicle and nothing is published without confirming it on the phone.

### R4. Web: "Dispositivos vinculados" (Mi Vigo, signed in, under "Mi vehículo")

- Lists the vehicle's devices (explicit columns), active first, then revoked; newest first within each group.
- Each row: name, "Vinculado el {fecha}", last seen ("Última conexión: hace 5 min" / "Todavía no se conectó"), app version when known; revoked rows show "Desvinculado el {fecha}" and no action.
- "Desvincular" (danger style, `confirm()`): `revoke_car_device`, then reload.
- Empty state explains where to find the code on the car, with a "Vincular auto" link.

### R5. Car side (companion repo, `vigo-hack/accounts_proxy`)

Out of this repo, listed so the contract is complete: the Accounts tile app `com.vigo.accountslauncher` becomes a small Java app "Mi Vigo" (pairing with Keystore key + code + QR + polling, linked state with member names, sync status with an outbox stub, the existing "Cuentas de Android" entry, the status-bar user icon receiver kept). It reads `wikivigo_url` / `wikivigo_anon_key` from a config file pushed to the car, never from its source.

### Explicit non-goals (later phases)

- No `car_submit_*`, drafts inbox, car status, backups or releases yet (PLAN phases 1-5). The heartbeat is the template they copy.
- No renaming of a linked device from the web (the name is chosen at claim time).
- No IP-based rate limiting (PostgREST's forwarded headers are not a trustworthy client IP); the global cap bounds abuse instead.

## Files to touch

- New `supabase/migrations/0045_car_link.sql`.
- New `supabase/functions/_shared/carDevice.ts` + `carDevice.test.ts` (Vitest, node environment, real WebCrypto), new `supabase/functions/car-device/index.ts` (Deno entry).
- `supabase/config.toml`: `[functions.car-device] verify_jwt = false`.
- New `tsconfig.functions.json` (type-checks and lints `supabase/functions/_shared`), referenced from `tsconfig.json`; `eslint.config.mjs` ignores the Deno entry points (`supabase/functions/*/index.ts`).
- `src/lib/database.types.ts`: **hand-extended** with the three tables and the new functions, consistent with the migration — **regenerate with `npm run gen:types` after `db push`** (the generated file replaces the hand edit; nothing else depends on its exact layout).
- `src/types.ts`: `CarDevice`.
- New `src/lib/carLink.ts` + test: code normalisation/extraction, claim/list/revoke helpers, labels.
- New `src/pages/LinkCarPage.tsx` (+ `.module.css`, test); `src/App.tsx` route.
- New `src/components/CarDevicesCard.tsx` + test; `src/pages/MyVigoPage.tsx` mounts it.
- `src/components/RequireAuth.tsx` (+ test): keep the query string.
- `src/test/setup.ts`: the jsdom stubs only when `window` exists (the Edge Function test runs in the `node` environment for Node's WebCrypto).
- `src/lib/errors.ts`: the new raised messages in `KNOWN_TRIGGER_MESSAGES`.
- `CLAUDE.md`: the anon surface now includes `request_car_pairing`; car-link notes.

## Test plan

Vitest (`npm test`):

- `supabase/functions/_shared/carDevice.test.ts`
  - The Java-made vectors above verify; a one-byte change to the body, the wrong key, a DER-encoded signature, a 63-byte signature and garbage base64 all fail without throwing.
  - `isP256Spki` accepts the vector key and rejects other curves' prefixes, wrong length, non-base64.
  - Handler with a fake `rpc` and a fixed clock: 405 for GET; 413 over 8 KB; 400 for non-JSON, `v` ≠ 1, unknown action, missing/invalid fields; poll unknown code → 401 `bad_signature` (same as a bad signature); poll pending/claimed/expired mapping; clock skew → 401 `clock` with `server_time`; heartbeat maps the SQL errors `replay`→409, `revoked`→410, `rate_limited`→429, `unknown`→401, `clock`→401; a revoked device with a bad signature gets 401, not 410; database failure → 500 without leaking details; a signature made in the test with a fresh WebCrypto key passes end to end.
- `src/lib/carLink.test.ts`: normalisation (lowercase, spaces, dashes, full link, `c=` in a hash link), validity (lookalikes I/L/O/0/1 rejected, length), claim mapping (`null` → the "no válido o vencido" message, RPC error → friendly message, success → device), sorting, last-seen labels.
- `src/pages/LinkCarPage.test.tsx`: `?c=` prefills the field (MemoryRouter) and **also through a real `HashRouter`** with `window.location.hash = '#/mi-vigo/vincular?c=k7q2m9'`; invalid code keeps the button disabled; success shows the confirmation; `null` shows the error.
- `src/components/CarDevicesCard.test.tsx`: rows, labels, revoked rows without action, revoke asks for confirmation and calls the RPC, empty state links to the pairing page.
- `src/components/RequireAuth.test.tsx`: a signed-out visit to `/mi-vigo/vincular?c=K7Q2M9` lands on `/login` with `from = '/mi-vigo/vincular?c=K7Q2M9'`.

SQL (the repo has no SQL test harness; review checklist, also run once against an in-memory Postgres during development, see "Implementation notes"):

- [ ] `anon` can execute only `request_car_pairing` of the new functions; `authenticated` additionally `claim_car_pairing` and `revoke_car_device`; the four car functions only `service_role`; the internal helpers (`is_p256_spki`, `car_clean_text`, `generate_car_pairing_code`, `car_vehicle_member_names`, `car_device_accept`) nobody, not even `service_role`.
- [ ] `anon` cannot select any of the three tables; `authenticated` sees only its own vehicle's `car_devices` rows and only the granted columns; `car_pairing_requests` and `car_pairing_attempts` are unreadable by clients.
- [ ] No policy allows insert/update/delete on the three tables.
- [ ] `request_car_pairing`: invalid key raises; an active key raises; the 7th request for one key in an hour raises; the 201st in an hour raises; codes match the alphabet and length; `expires_at` = now + 10 min.
- [ ] `claim_car_pairing`: expired, claimed or unknown code returns `null` and records an attempt; the 11th failure in an hour raises; success clears the failures; a second claim of the same code returns `null` (single use); the 4th active device raises; banned users raise.
- [ ] `revoke_car_device`: a non-member gets an error; a member revokes; repeating is a no-op (keeps the first `revoked_by`).
- [ ] `car_device_accept`: replayed or older `ts` → `replay`; skew > 5 min → `clock`; the 121st request in an hour → `rate_limited` and the window resets after an hour; revoked → `revoked`; a device whose vehicle has no members left self-revokes; it never touches another vehicle.
- [ ] `poll_car_pairing` never returns members before the claim; `car_vehicle_member_names` excludes banned members.
- [ ] Removing a member, or a member leaving, does not touch the vehicle's devices; deleting an orphan vehicle (`cleanup_orphan_vehicle`) cascades to its devices and requests.

## Security review (threats)

| Threat | Mitigation | Residual risk |
|---|---|---|
| **Code guessing** (a signed-in attacker claims someone else's car, so that car would later send data to the attacker's vehicle) | 31^6 ≈ 8.9·10^8 codes, 10-minute life, single use, ≤ 10 failed claims per user per hour, accounts need email OTP (+ Turnstile). With 20 codes alive at once, one guess succeeds with p ≈ 2·10^-8; 240 guesses a day per account ≈ 5·10^-6. The car then shows the members it was bound to, and nothing is public without the vehicle members confirming drafts. | Many throwaway accounts multiply the rate linearly; a global failed-claim cap would add a DoS lever, so it is not added in phase 0. |
| **Shoulder-surfing the code** | Same as above; the owner sees the code consumed ("no válido") and the car shows the wrong names; revoke + re-pair. | Accepted: the attacker must be physically near the car within 10 minutes. |
| **Replay** of a captured car request | TLS; every state-changing request carries `ts` that must exceed the last accepted one and be within 5 minutes; the signature covers the whole body. Poll replays only return the device id, which is useless without the key. | None known. |
| **Device id theft** | The id is not a credential: every call needs a signature from the Keystore key. | None. |
| **Device key theft** (root on the head unit, or extracting the keystore) | Keystore key is non-exportable to apps; the device can act only on its own vehicle's car data (no reads of other vehicles, nothing public, drafts need a human); rate limit per device; owner revokes from the web, effective on the next call. | A rooted head unit (this car is rooted) could use the key while it is not revoked. Accepted for phase 0; the blast radius is the owner's own vehicle. |
| **Member removal / leaving** | Devices belong to the **vehicle**, not to the member who paired them. A removed member loses visibility (RLS by current vehicle) and can no longer revoke. If the person who keeps the car is not a remaining member, they revoke and re-pair. If the vehicle is deleted as an orphan, its devices cascade away and the car reports the link as lost. | A removed member who still has the car physically can keep it sending to the old vehicle until a remaining member revokes it (visible in the list). |
| **Revoke** | `revoked_at` is checked by `car_device_accept` on every call; the car is told `revoked` only after proving its key, then clears its link and deletes its key. | None. |
| **Pairing-request flooding** (anon) | Key format check, ≤ 6 per key and ≤ 200 per hour in total, rows expire and are purged after a day. | An attacker can exhaust the hourly budget and delay legitimate pairing for up to an hour (availability only). |
| **Oracle on codes/devices** via the function | Unknown code/device and bad signature return the same 401. | Timing differences (one RPC either way); acceptable. |
| **Key substitution** (registering another car's public key) | Public keys are not readable by clients; an active key cannot be requested again; without the private key, poll and every call fail. | None. |

## Implementation notes

- The migration was executed during development against PGlite 0.3.14 (Postgres 17 in WASM) after all 44 earlier migrations, with Supabase-like roles (`anon`, `authenticated`, `service_role` with BYPASSRLS), Supabase's default privileges and a stub `auth` schema (`auth.users`, `auth.uid()` from `request.jwt.claim.sub`): **83 assertions covering every checklist item passed** (plus code-alphabet coverage and uniformity over 12 000 generated characters). The harness is not part of the repo (no new dev dependency); the checklist stays the review artefact. It found one real issue, fixed before commit: the internal helpers were still executable by `service_role` through Supabase's default privileges.
- The car never needs the service key or a user session: anon key for `request_car_pairing`, its signature for everything else.
- `last_request_ts` makes the car's timestamps a per-device monotonic counter: the car sends `max(now + offset, last_sent + 1)`, where `offset` is re-based from `server_time` on a `clock` answer.

## Owner steps

1. Review `0045_car_link.sql` and `supabase/functions/`.
2. `npx supabase db push`.
3. `npx supabase functions deploy car-device --no-verify-jwt`.
4. `npm run gen:types` (replaces the hand-extended types) → `npm run type-check`.
5. Merge `car-link-phase0` into `main`, `npm run deploy`.
6. Car: see `vigo-hack/accounts_proxy/` (build, install, push `mivigo.conf`).

## Acceptance criteria

- `npm run type-check`, `npm run lint`, `npm test` pass on the branch.
- The migration matches the SQL checklist; nothing new is anon-readable.
- A signed-out phone opening the QR link is sent to login and comes back to the prefilled pairing page.
- A member sees the vehicle's linked devices with last seen and can revoke one; the next car call gets `revoked`.
- The Java-made signature vector verifies in the function's tests.
