# A8 Firmware tracker: head-unit software versions seen by the community

**Status:** spec 2026-11-22, built offline on branch `wave2-features`. **Migrations 0054 and 0056 NOT applied, `car-device` NOT deployed**
(owner OK required). **0056 adds an anon-callable function (owner OK required for the new anon surface).**

## Context

`vigo-hack/wikivigo/PLAN.md` A8; research in `vigo-hack/updates/FIRMWARE_RESEARCH.md` (commits 012356a, 9bb57d7): the Vigo cannot get OTA
in Uruguay (market 6), updates come only from the dealer, and nobody publishes the versions. Owners can tell each other which version
their car has and whether a newer one exists. The version is `ro.build.version.software`, e.g. `DFRD_S32O_MPU_V01811_20250814_128G`
(the value Settings › Car info › System info shows): `V01811` = version number, `20250814` = build date.

## R1. The car reports its version (migration 0054)

- Optional `fw_version` in the status object (status call and `live`): `^[A-Za-z0-9_.-]{1,64}$`, stored in `car_status.fw_version`; a
  snapshot without it keeps the stored value. Validated by the Edge Function and by `car_store_status`.
- Mi Vigo reads `ro.build.version.software` once per process (`android.os.SystemProperties` by reflection) and adds it to every snapshot.
  Nothing personal is read (no VIN, PDSN, serials, MCU part numbers).

## R2. Community aggregate (migration `0056_car_firmware.sql`)

- `car_firmware_versions() returns table (fw_version, cars, last_seen_month)`: SECURITY DEFINER, `anon` + `authenticated`. Counts
  vehicles per version among `car_status` rows received in the last 18 months; `last_seen_month` is a month, not a timestamp. No vehicle,
  member or time per car leaves the function. **New anon surface** (by design, owner OK).

## R3. Ordering

`compareFirmware`: version number (after `_V`) descending, then build date (`_YYYYMMDD_`, a real date) descending; names without a
version number sort last. "Newer" needs a version number on both sides.

## R4. Web

- `src/lib/carFirmware.ts`: parse, compare, `newerThan`, `fetchFirmwareVersions` (RPC, `[]` on error), `fetchOwnFirmware`.
- `src/components/FirmwareCard.tsx`, "Versiones de software de la pantalla", on **Tecnología** (public) and **Mi Vigo** (signed in):
  table (Versión, Compilada, Autos, Vista por última vez; the member's row marked "(tu auto)") and, when the member's car reported its
  version, "¿Hay una versión más nueva?" → "Sí: X (vista en N autos)… Pedila en el service." / "No, tu auto tiene la más nueva que vio
  la comunidad" / "no sabemos compararla". Note: "En Uruguay la pantalla no se actualiza sola: una versión nueva la instala el
  concesionario." Hidden while nothing was reported.

## Non-goals

MCU / camera (IFC/HAD) versions (not readable without the dealer's UDS tool, FIRMWARE_RESEARCH section 4), release notes, update files.

## Test plan

- Edge Function: `fw_version` accepted / refused (empty, spaces, 65 chars, number); pin `ORDERS_BODY_W2`.
- SQL (PGlite): stored, kept when absent, refused when malformed; anon aggregate returns only the three columns and counts 2 cars; anon
  cannot read `car_status`.
- Web: `carFirmware.test.ts`, `FirmwareCard.test.tsx` (hidden, newer, newest, signed out).
- vigo-hack: Mi Vigo `Wave2Tests` (validation, round trip, pin, fallback).
- Car: after installing Mi Vigo, a trip end (share on) → Tecnología shows the version with 1 car.
