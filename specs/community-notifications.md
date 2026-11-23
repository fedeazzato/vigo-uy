# Community notifications (PLAN.md B6, web part)

## Context

Comments, likes and vehicle-group activity happen without the people involved
ever finding out unless they revisit the page. This adds in-site
notifications. (Delivery to the car's notification panel is a later, car-side
step and is out of scope here.)

## Requirements

- R1 Follows: `content_follows` (one of station / trip / service / purchase per
  row, own rows only, unique per user+target). "🔔 Seguir" on every community
  post (ContentReactions) and "🔔 Avisarme si falla" on stations; signed-in only.
- R2 `notifications` rows are created only by SECURITY DEFINER triggers on
  existing tables (no client insert/update):
  - `station_reports` "fallo" -> station followers (specs/station-alerts.md)
  - `content_comments` -> post author + followers (followers only while the post
    is public and not hidden)
  - `content_reactions` -> post author, at most one unread per post per 24 h
  - `trip_logs` / `service_entries` insert -> the other members of the vehicle
  Never the actor, never from a banned actor; trigger errors are swallowed so
  they never block the original write.
- R3 Recipient reads (own rows), marks read via `mark_notifications_read(p_ids)`
  (all when null; also prunes own read rows older than 90 days) and deletes.
- R4 UI: bell in the mobile header with an unread dot, "🔔 Notificaciones (n)"
  in the sidebar footer (signed-in only); unread count polled every 60 s while
  the tab is visible. Page `#/notificaciones` (RequireAuth): list with icon,
  title, relative time, link to the page the content lives on, "Marcar todas
  como leídas", "Borrar", empty state explaining how to follow.
- R5 No email (the site sends none). Anon surface: none.

## Files

- `supabase/migrations/0058_notifications.sql` (NOT applied)
- `src/lib/notifications.ts`, `src/components/FollowButton.tsx`,
  `src/components/ContentReactions.tsx`, `src/components/Layout.tsx` (+ css),
  `src/components/Icon.tsx` (bell), `src/pages/NotificationsPage.tsx` (+ css),
  `src/App.tsx`
- `src/lib/database.types.ts`: hand-written `content_follows`,
  `notifications`, `mark_notifications_read` until `gen:types`

## Test plan

- `src/lib/notifications.test.ts`: link per kind, unread count, follow keys.
- `src/pages/NotificationsPage.test.tsx`: empty state, list + link + mark all
  read, delete.
- After applying 0058 (manual, SQL editor as two users): comment on B's trip as
  A -> B gets one row; A gets none; like twice -> one unread row; follow a
  station as B, report "fallo" as A -> B notified once in 24 h.

## Owner decisions

- O1 Moderation results ("tu publicación fue ocultada") and "new verified
  station in your city" are in PLAN.md B6 but not built: they need a moderation
  hook / a city on profiles match. Build next?
- O2 Retention 90 days for read notifications: OK?
- O3 Notify vehicle members on every trip/service, or only public ones?
