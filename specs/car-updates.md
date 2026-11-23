# Car updates: signed release list for the on-car updater (PLAN D2)

**Status:** built offline 2026-11-23 (branch `wave3-server`). Migration `0059_car_updates.sql` **NOT applied**, `car-device`
**NOT deployed**. Car side: vigo-hack `updater/PLAN.md` sections 10-11 (root helper) and the Mi Vigo 2.9 updater UI.
Design source: vigo-hack `updater/SPEC_car-updates.md` (kept in sync).

## Context

Owners have no Play Store, so nothing updates our apps after the cable install. The car's updater (Mi Vigo + a root
helper) asks WikiVigo for a signed manifest over the signed `car-device` channel, downloads the files on unmetered Wi-Fi
and verifies everything against the **maintainer's** signature (keys compiled into the car). WikiVigo is a mirror of
the signed release **list** only (owner O7): the files live on **GitHub Releases**. It never signs and cannot make a car
install anything the maintainer did not sign; it can only withhold.

## Decisions

| # | Decision |
|---|---|
| D1 | The maintainer signs offline (`updater/tools/SignManifest.java`, ECDSA P-256, DER base64). The moderator pastes manifest + signature; the page verifies the signature in the browser with the two trusted public keys (copy of `Crypto.TRUSTED_KEYS`) before publishing. Postgres cannot verify P-256; the car verifies again (the real boundary). |
| D2 | Files on GitHub Releases (O7). Each release row stores `download_base` = `https://github.com/<owner>/<repo>/releases/download/<tag>/`; the car downloads `download_base + <blob id>` (the manifest's 4th `file` field = the asset name) and checks size + sha256 from the signed text. A wrong/forged base can only cause a failed download. No Storage bucket, no `update_blob` action (R5 of the design dropped). |
| D3 | Text manifest signed byte-for-byte (format: updater core `Manifest.java`). |
| D4 | Serials are **global** (one sequence across `stable` and `beta`): the beta car takes the newest of both and must never see a serial go back. Publishing refuses a serial not above every published one. |
| D5 | Rollout: `rollout <percent> <salt>` is signed. `update_check` returns the newest unexpired release whose rollout includes the car: bucket = first two bytes of sha256(`salt:device_id`) mod 100 (same as the car's `Policy.bucket`; JDK-made vectors in the tests). A car outside the newest rollout gets the previous release (normally what it has). |
| D6 | Server-side withhold: `rollout_cap` per release (moderator: Pausar = 0, Limitar a 10/25/50 %, Sin límite). Effective percent = min(signed, cap): the server can lower, never raise. Raising = re-sign with the same salt and a higher serial. |
| D7 | Kill switch = a signed manifest with `kill 1` (pre-signed kill manifests kept offline by the maintainer) published through the same form; a kill release is served to every car regardless of percent. |
| D8 | Beta (O4): moderators mark vehicles as beta (`car_update_beta`); a beta car takes beta and stable releases at any percent. The car's own `channel` field is recorded, not trusted. |
| D9 | Google software (O6): `notice` lines only. Members read the notices of the release their car would see through `car_update_notices()` (notice lines only, never the rest of the manifest); "Estado del auto" shows those newer than the versionCode the car reported. |
| D10 | Privacy: `update_check` sends channel, firmware id, installed versionCodes of our packages + `com.google.android.gms` + `com.waze`, updater phase and last line. Stored as ONE row per vehicle (`car_update_status`), no history. |

## Wire (car-device, signed with the device key, protocol v1)

- `update_check` `{v,action,device_id,ts,channel?,firmware?,installed?:{pkg:int},phase?,last?,serial?,have_serial?}` (unknown
  keys refused; at most 32 packages; `last` at most 300 chars; phase one of IDLE/STAGING/STAGED/APPLYING/TRIAL/ROLLING_BACK)
  → `{ok,serial,channel,manifest,signature,download_base}` | `{ok,same:true,serial}` (have_serial equals the pick) | `{ok,none:true}`.
- `update_report` `{v,action,device_id,ts,serial?,phase,last?}` → `{ok}`. A ROLLING_BACK phase (or a last line starting
  with "ROLLBACK") notifies every active moderator: "Rollback en N autos (serial S)", at most one unread per serial per 24 h.
- Errors as every other action (guard `car_device_accept`: 120 calls/h per device).

## Requirements / files

- R1 `supabase/migrations/0059_car_updates.sql`: `car_releases` (moderators read; insert only `admin_publish_car_release`),
  `car_update_beta`, `car_update_status` (members + moderators read), `car_manifest_header`, `admin_set_car_release_cap`,
  `admin_set_car_beta`, `admin_list_car_updates`, `car_update_notices`, service-role `car_update_check` /
  `car_update_offered` / `car_update_report`; notifications kinds `car_rollback`, `car_charge_draft`. Anon surface: none.
- R2 `supabase/functions/_shared/carDevice.ts`: actions `update_check`, `update_report`; `pickRelease`, `rolloutBucket`.
- R3 Moderation › "Versiones del auto" (`src/components/CarReleasesAdmin.tsx`): newest serial and effective percent per
  channel, counts per phase, release list with Pausar/Limitar/Sin límite, publish form (channel, GitHub folder, manifest,
  signature, note; shows serial/rollout/apps/notices/expiry before publishing; "Publicar kill switch" for kill
  manifests), linked cars with phase, serial, offered serial, last check, firmware, last line, "Marcar como beta".
- R4 "Estado del auto" (`CarStatusCard` + `CarUpdateInfo`): "Actualizaciones: <fase> (versión N)" and one notice per
  Google app the car has older than the release's notice: "Actualización de Google disponible … usá el instalador con
  el cable (Preparar mi Vigo)". `ROLLBACK FAILED` → "Conectá el instalador con el cable".
- R5 `src/lib/carReleases.ts`: manifest reading, DER→P1363, signature check, notices, phase labels.

## Test plan

- `supabase/functions/_shared/carDeviceUpdates.test.ts`: bucket matches JDK vectors (r42 → 67, salt-7 → 28); pick
  newest in rollout / previous when out / none at 0 %; kill always; beta any percent; update_check body parsing and
  refusals; reply with download_base + offered bookkeeping; same/none; guard and malformed rows; update_report.
- `src/lib/carReleases.test.ts`: manifest parsing and refusals; a SignManifest.java-made DER signature verifies, a
  one-character change does not, the production keys do not accept the test signature; cap never raises; notices.

## Owner decisions (open)

- O-U1 Which GitHub repo hosts the release assets (public repo needed for anonymous downloads by the car).
- O-U2 Manifest expiry length (car refuses expired manifests; a stale mirror cannot pin old bugs, but a long gap
  without re-signing stops updates).
- O-U3 Should moderators other than the owner be able to publish? (Today: any active moderator; signatures still
  require the maintainer's key.)
