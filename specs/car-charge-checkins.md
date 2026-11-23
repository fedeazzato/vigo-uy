# Charging check-ins from real charges (PLAN A2)

**Status:** built offline 2026-11-23 (branch `wave3-server`, both repos). Migration `0060_car_charge_checkins.sql` **NOT
applied** (needs 0059 first for the notification kinds), `car-device` **NOT deployed**. Car side: Carga 0.7
(`charge_app/core/.../ChargeCheckin.java`), Mi Vigo core `TripDraft` (kind "charge").

## Context

Station check-ins (`station_reports`: funcionó / falló / ocupado) are typed by hand, with guessed kW. The car knows what
really happened: Carga records every charging session (energy, peak and average power, minutes, SOC, end reason) and
the trip GPS. A2 turns that into a check-in **draft** the owner confirms with one tap; failed attempts (cable in, no
current) become "falló" drafts and, once confirmed, feed B4 station alerts.

## Decisions

| # | Decision |
|---|---|
| D1 | Transport: Mi Vigo's existing trip-draft outbox and action `trip_draft`, with a draft of `"kind":"charge"` (no new receiver or outbox on the car). |
| D2 | Station match on the server: the draft carries the car's position at the charger (Carga: last trip fix within 30 min before the charge); `car_submit_charge_draft` picks the nearest visible WikiVigo station within **100 m** and stores ONLY the station id + distance. No station nearby = `{ok, stored:false}` and nothing is stored (the position is never written). |
| D3 | Draft fields: status `funciono`/`fallo`, started/ended, energy_kwh, max_kw, avg_kw, charging_min, start/end SOC, end reason. |
| D4 | Members only (`car_charge_drafts` RLS). Nothing public until a member taps "Publicar check-in": `confirm_car_charge_draft` writes a `station_reports` row in that member's name with achieved_kw = peak kW, `energy_kwh`, `duration_min`, `from_car = true` (only that RPC can set it), created_at = when the charge ended. The member may change the result (incl. "ocupado") and add a note. |
| D5 | A new draft notifies the vehicle's members in-site ("¿Cargaste en X? Confirmá el check-in", kind `car_charge_draft`). |
| D6 | At most 50 pending per vehicle (oldest go); drafts older than 90 days refused. |

## Wire

`trip_draft` with `draft = {"kind":"charge","client_id","started_at","ended_at"(ms),"status":"funciono"|"fallo","lat","lon",
"energy_kwh"? 0..200,"max_kw"? 0..400,"avg_kw"? 0..400,"charging_min"? int 0..1440,"start_soc"?/"end_soc"? int 0..100,
"end_reason"?}`; unknown keys refused (car, Edge Function and SQL). Reply `{ok, stored}`.

## Files

- `supabase/migrations/0060_car_charge_checkins.sql`, `supabase/functions/_shared/carDevice.ts` (`parseChargeDraft`,
  action `charge_draft` internal → `car_submit_charge_draft`)
- `src/lib/carChargeDrafts.ts`, `src/components/CarChargeDrafts.tsx` (on "Borradores del auto"), `CarDraftsCard` counts them
- `src/lib/notifications.ts` (kinds `car_charge_draft` → Borradores, `car_rollback` → Moderación › Versiones)

## Test plan

- `carDeviceUpdates.test.ts`: full and minimal "falló" drafts parse; refusals (extra key, no location, unknown status,
  fractional minutes, kW over 400, unknown end reason, other kind); routing to `car_submit_charge_draft`.
- `carChargeDrafts.test.ts`: titles "¿Cargaste en UTE Florida? Funcionó a 42,5 kW" / "¿Falló la carga en …?".
- `CarChargeDrafts.test.tsx`: nothing rendered without drafts; publish with a corrected result; discard publishes nothing.
- Car: Carga `ChargeCheckinTest`; Mi Vigo `TripDraftTests`; on the car CAR_TEST A2-1..A2-4 (vigo-hack `charge_app`).

## Owner decisions (open)

- O-A1 Carga's switch "Proponer check-ins en estaciones de WikiVigo" is ON by default: every charge with a GPS fix (home
  charges too) sends its position to the server for the 100 m match; the server keeps only a matched station. Default
  on, or opt-in?
- O-A2 Thresholds: "funcionó" when ≥ 0.5 kWh or ≥ 5 min charging; "falló" when the cable was in 3–60 min with no current.
- O-A3 100 m match radius (stations with imprecise coordinates may need more).
- O-A4 Notify members of each new draft (D5), or only show the Mi Vigo card?
