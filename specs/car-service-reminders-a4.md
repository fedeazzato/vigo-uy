# A4 Service reminders from the odometer

**Status:** spec 2026-11-22, built offline on branch `wave2-features`. **Migration 0054 NOT applied, `car-device` NOT deployed** (owner
OK required).

## Context

`vigo-hack/wikivigo/PLAN.md` A4. The schedule is the importer's, as `src/data/mantenimiento.json` states it: first service at 5.000 km
(free), then every 15.000 km or 12 months, whichever comes first; the 30.000 km tasks are spread over those visits (every 30.000 km is
the "service general"). The odometer is `IC_TOTAL_ODMETER 0x21402229` (vigo-hack `charge_app/PROPERTIES.md`, VERIFIED), already sampled
by Carga.

## R1. Odometer in the status snapshot (migration 0054)

Optional `odometer_km` (integer 0..999999) in the status object; Carga adds it to every snapshot (trip end, charge end, live) when known;
stored in `car_status.odometer_km` (kept when a snapshot omits it). Members-only like the rest of `car_status`.

## R2. Schedule (shared numbers)

Milestones 5.000, 15.000, 30.000, 45.000, …; labels "Primer service (5.000 km)", "Service de 15.000 km", "Service general de 30.000 km".
`src/lib/serviceReminder.ts` and vigo-hack `charge_app/core/ServiceSchedule.java` use the same numbers (a test checks them against
`mantenimiento.json`'s text).

## R3. Next service and the draft (web)

- Next milestone = first milestone after (highest odometer among the vehicle's `service_entries` + 2.000 km slack); no entries → 5.000.
- State: `due` when the odometer reached it or the last service is 12 months old; `soon` within 1.000 km; else `ok`.
- **Draft** = the new-entry form prefilled: `#/costos/nuevo?km=<odometer>&tipo=<label>` (`NewServiceEntryPage` reads `km` (digits) and
  `tipo` (≤ 80 chars) for a NEW entry only). Nothing is stored until the owner submits it; the vehicle id is still set by the trigger.

## R4. Web card "Próximo service" (Mi Vigo)

Label, "Faltan 820 km." / "Te pasaste 300 km." (warning) / "Por tiempo ya corresponde…", odometer and when it was read, last recorded
service, and "Registrar service" (the draft link) when `soon` or `due`. Hidden until the car reported an odometer.

## R5. Car reminder (Carga)

- `ServiceSchedule.due(odo, lastNotified)`: the next milestone at or after the odometer, when it is ≤ 500 km away and was not announced
  yet. `notice()` builds an `Alerts.Alert` (channel `aviso_service` "Service", id 104): toast + bell entry through `Avisos.post`, category
  `dfcv_ntf_message` (HANDOFF 11.ah). Title = label, text "Faltan 420 km. Pedí turno en el concesionario y registralo en WikiVigo (Mi Vigo ›
  Próximo service)."
- `SamplerService.serviceStep`: only when the whole-km odometer changes; the announced milestone is stored (`service_notified_km`) even
  when "Avisos" is off (no burst when it is switched on later). Under the existing "Avisos" switch.
- The car knows neither the delivery date nor recorded services: only the km rule runs on the car; the 12-month rule is web-only.

## Non-goals

Writing service entries from the car; dealer booking; severe-condition intervals (shown on Mantenimiento as text).

## Test plan

- Edge Function / SQL: `odometer_km` accepted, refused when decimal / negative / > 999999 / text; kept when absent.
- Web: `serviceReminder.test.ts` (milestones, labels, slack, highest entry, 12 months, wording, draft link), `FirmwareCard.test.tsx`
  (ServiceReminderCard hidden / soon with link / ok without link).
- vigo-hack: Carga `ServiceScheduleTest` (milestones, once per milestone, notice, odometer in snapshots).
- Car: with an odometer 400 km before a milestone, the first sample shows the toast and the bell entry once.
