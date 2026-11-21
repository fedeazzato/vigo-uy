# Car diagnostics: "Enviar diagnóstico" from the car to WikiVigo

**Status:** Implemented on branch `car-diagnostics` (merged to main). **Migration 0051 is not applied and `car-device` is not
redeployed.** The page and the Mi Vigo card stay hidden until the table exists (feature-detected, like the trip drafts). Owner steps
are at the end.

## Context

Owner requirement (vigo-hack `wikivigo/DISTRIBUTION.md` section 9, 2026-11-21): every car app we ship keeps its own logs, and the
user can send them to the maintainer so that an issue any Vigo owner reports can be analysed. Two problems on the car session of
2026-11-21 were visible only through adb: Voz en español crashed at start, and Copiloto's recogniser failed to load.

On the car (vigo-hack):
- `common/vigolog` keeps a rotating log per app, redacted when written.
- Mi Vigo 2.4 collects every app's bundle and shows a preview. The user can include location (off by default) and add a note.
- Mi Vigo redacts again, then uploads over the signed car channel.

This spec is the server side.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Who starts it | The user, on the car: Mi Vigo › Enviar diagnóstico › Enviar. Nothing is ever sent automatically. |
| D2 | Transport | The signed `car-device` action `diag_put` (protocol v1, the device key). The body limit stays at 32 KB, so the report travels as gzip + base64 in parts of at most 24 000 characters, up to 40 parts (< 1 MB). Note and per-app summary go with part 0 only. |
| D3 | Privacy | Redaction happens on the car, twice: no keys, tokens, passwords (incl. the SU password pattern), e-mails, Wi-Fi names/keys, serials or VINs. Location only if the user turned it on. The server stores what it gets; it does not inspect the logs. |
| D4 | Readers | The uploading vehicle's members, and non-banned moderators (the site owner and maintainers who analyse the logs). Members and moderators may delete. Nobody else, never anon. |
| D5 | Limits | `car_device_accept` (120 calls/hour per device, replay, freshness, revocation). At most 5 uploads per vehicle per 24 h. Parts > 0 only for an upload this vehicle started in the last 24 h, with the same `parts`. A repeated part replaces the same slice (a retry after a lost reply). |
| D6 | Retention | When a vehicle starts a new upload, its incomplete uploads older than 24 h and every upload older than 90 days are deleted, and at most 20 are kept (the oldest go). |
| D7 | Reading | The browser joins the parts, decodes base64 and gunzips with `DecompressionStream('gzip')`. The page shows each app's crashes and log, and "Descargar .txt" saves a plain-text version. The first 8 characters of the upload id are the "código del informe" the car shows, so the user can tell the maintainer which one. |

## Requirements

- R1. Migration `0051_car_diagnostics.sql`:
  - Tables `car_diagnostics` (id = upload id, vehicle, device, parts, received, note ≤ 600, apps jsonb array ≤ 16, complete, created_at,
    completed_at) and `car_diagnostic_parts` (diagnostic_id, part 0..39, data base64 4..24000; primary key (diagnostic_id, part),
    cascade on delete).
  - RLS select (both tables) and delete (`car_diagnostics`) through `can_read_car_diagnostic(vehicle_id)`: member or non-banned
    moderator. No insert/update grants.
  - `car_submit_diag_part(p_device_id, p_ts, p_upload_id, p_part, p_parts, p_note, p_apps, p_data)` (service role only). It runs the
    guard first, then the validation, the D5 rules, upsert of the part, and the counters. It returns
    `{"ok":true,"received":n,"parts":m,"complete":bool}` or `{"error":...}`.
- R2. `car-device` action `diag_put` with a strict parser:
  - uuid `device_id` / `upload_id`; integer `parts` 1..40, `part` 0..parts-1;
  - `data` = base64, length multiple of 4, 4..24000;
  - part 0: `note` string ≤ 500 characters and `apps` = at most 16 objects with exactly `app` (1..80), `version` (≤ 40), `state`
    (ok | no_answer | not_installed | file | invalid), `crashes` (0..1000), `chars` (0..10 000 000);
  - parts > 0: no `note`/`apps`.

  It is mapped to `car_submit_diag_part` and replies `{ok:true, received, complete}`.
- R3. Web:
  - `src/lib/carDiagnostics.ts`: list, parts → report, plain text, delete, labels.
  - Page `#/mi-vigo/diagnosticos` ("Diagnósticos del auto"): list with date, code, note, per-app state, crash count, "Incompleto"
    badge; "Ver registros", "Descargar .txt", "Borrar" (second tap confirms).
  - A Mi Vigo card shown only when the caller can read at least one diagnostic.
- R4. Car (vigo-hack):
  - `common/vigolog` (log, redaction, crash records, bundle);
  - Mi Vigo 2.4: `DiagCollector`, core `DiagReport` (second redaction, pack/unpack), `Wire.diagPutBody`, `Client.diagPut`, page,
    `DIAG` signature permission;
  - per-app adoption checklists in `common/vigolog/README.md`.

## Report format (what the page decompresses; Mi Vigo core `DiagReport.combinedJson`)

```json
{"schema":1,"created_at":1763640000000,"mivigo":"2.4","device_build":"V01811 · Android 10 · DFRD","location":false,
 "note":"Se cerró Carga al enchufar",
 "apps":[{"app":"com.vigo.carga","label":"Carga","state":"ok","version":"0.4 (4)","device_build":"…","truncated":false,
          "log":"2026-11-21 10:22:33.123 -0300 I Carga: …\n","crashes":["=== crash … thread main\n…"]}]}
```

Apps that are not apps send a file through Mi Vigo's `diag_in` folder and show as `"app":"file:vtbox.log"`, `"state":"file"`.

## Test plan

- `carDevice.test.ts`:
  - `diag_put` parser: part 0 vs later parts, id lower-casing, and every refusal (part range, base64, length, note length in
    characters, unknown app keys/states, 17 apps, note/apps on parts > 0);
  - a full part with a 500-character note and 16 apps fits 32 KB;
  - handler: RPC args, `received`/`complete` passthrough, refusals mapped (rate_limited 429, bad_request 400, revoked 410), a bad
    signature never reaches the function.
- `carDiagnostics.test.ts` (node: real gzip and DecompressionStream): join parts / a missing part; gunzip of a report split like the
  car splits it; non-ASCII; bad gzip; report parsing (odd shapes dropped); plain text order (crashes before the log); summary;
  labels; code.
- `CarDiagnosticsPage.test.tsx`: empty when the table is missing; list (code, note, apps, crash badge); incomplete cannot be opened;
  "Ver registros" shows the log; delete needs a second tap.
- vigo-hack:
  - `common/vigolog/run_tests.sh` (redaction cases incl. the SU password, rotation, crash records, bundle, gzip guards, linear time
    on long runs);
  - Mi Vigo `DiagTests` (second redaction, packing ≤ 40 parts, unpack round trip, wire body, 32 KB fit, replies, client signature).
- SQL is not unit-tested here (no local database). Check it after `db push` with the car (the steps below) or `select` probes in
  the SQL editor.

## Owner steps (production; each needs the owner's OK)

```
cd C:\Projects\vigo-wiki
git pull
npx supabase db push --dry-run          # must list only 0051_car_diagnostics.sql
npx supabase db push
npx supabase functions deploy car-device --no-verify-jwt
npm run gen:types
npm run type-check && npm run lint && npm test
git commit -am "Regenerate DB types after 0051 (car diagnostics)" && git push
```

Then on the car:
1. Install Mi Vigo 2.4.
2. Mi Vigo › Enviar diagnóstico › Enviar.
3. The car shows "Enviado. Código del informe: xxxxxxxx".
4. WikiVigo › Mi Vigo › Diagnósticos del auto lists it under the same code.
