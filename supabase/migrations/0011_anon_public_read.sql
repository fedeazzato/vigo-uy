-- Phase 6: open community content to anonymous visitors.
-- Community trips/costs get blended into the public wiki pages (/rutas,
-- /costos, /mi-vigo) and /comunidad becomes publicly readable, so the anon
-- role needs read access to public, non-hidden rows from non-banned authors.
-- Submitting still requires an account; RLS remains the security boundary.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

-- 1. Content tables: recreate the SELECT policies from 0007, now also
--    filtering out banned authors for regular readers, and add anon policies.
--    Moderators intentionally still see banned users' public content so they
--    can review it (and un-ban with context) from the moderation page.

drop policy "select own, public+non-hidden, or moderator on public rows" on public.service_entries;
create policy "select own, public+non-hidden, or moderator on public rows"
  on public.service_entries for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden and not public.is_user_banned(user_id))
    or (is_public and exists (select 1 from public.profiles where id = auth.uid() and is_moderator))
  );

create policy "anon selects public+non-hidden entries"
  on public.service_entries for select
  to anon
  using (is_public and not hidden and not public.is_user_banned(user_id));

drop policy "select own, public+non-hidden, or moderator on public trip logs" on public.trip_logs;
create policy "select own, public+non-hidden, or moderator on public trip logs"
  on public.trip_logs for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden and not public.is_user_banned(user_id))
    or (is_public and exists (select 1 from public.profiles where id = auth.uid() and is_moderator))
  );

create policy "anon selects public+non-hidden trip logs"
  on public.trip_logs for select
  to anon
  using (is_public and not hidden and not public.is_user_banned(user_id));

-- 2. Author attribution for signed-out visitors. Deliberately a plain
--    (security definer) view, NOT security_invoker: it must bypass profiles
--    RLS, exposing exactly two columns -- id and display_name -- and nothing
--    else (city/model/color/is_moderator stay authenticated-only). The
--    Supabase linter flags security-definer views; here it is the point.
create view public.public_profiles as
  select id, display_name
  from public.profiles
  where banned_at is null;

grant select on public.public_profiles to anon, authenticated;

-- 3. Stats views: they are security_invoker (0007), so the anon policies
--    above (including the banned-author filter) apply automatically -- only
--    the grant is missing.
grant select on public.service_cost_stats_by_city to anon;
grant select on public.trip_stats_by_model to anon;
