# Station alerts (PLAN.md B4)

## Context

Check-ins (`station_reports`: funcionó / falló / ocupado) already feed a 90-day
reliability badge ("Fallas reportadas"), but a charger that broke this morning
looks the same as one that failed twice last month. Owners need "UTE Florida
reportada fuera de servicio hoy" before they drive there.

## Requirements

- R1 A station is "failing" when, among its reports in the last 48 h, the
  newest "falló" has no newer "funcionó" ("ocupado" does not clear it).
  Computed in the browser from the existing public `station_reports` rows
  (`src/lib/stationAlerts.ts`); no new view.
- R2 Station list (Carga): red badge "Falló recientemente" (replaces the amber
  reliability badge while active) and a line "Reportada fuera de servicio hace
  X (N reportes)". Refreshes after the user's own check-in.
- R3 Route planner never suggests a failing station and names it
  (specs/route-plans.md R5).
- R4 Optional per-user alert: signed-in users tap "🔔 Avisarme si falla" on a
  station (a `content_follows` row); every later "falló" check-in by someone
  else creates an in-site notification "Reportaron una falla en <estación>"
  (trigger `notify_station_failure`, migration 0055). At most one unread
  alert per station per 24 h. Delivery and reading: specs/community-notifications.md.
- R5 No email: the site sends no email of its own (only Supabase's auth OTP).

## Files

- `src/lib/stationAlerts.ts`, `src/components/CommunityStations.tsx`,
  `src/components/FollowButton.tsx`
- `supabase/migrations/0055_notifications.sql` (NOT applied)

## Test plan

`src/lib/stationAlerts.test.ts`: newest failure flagged with count, a newer
"funcionó" clears, failures older than 48 h ignored. CommunityStations tests
mock the alerts hook.

## Owner decisions

- O1 48 h window and "a newer funcionó clears it": OK?
- O2 Should a single "falló" alert, or wait for 2 reports?
