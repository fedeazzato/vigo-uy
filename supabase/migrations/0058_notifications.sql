-- In-site notifications (specs/community-notifications.md, PLAN.md B6) and station failure alerts
-- (specs/station-alerts.md, PLAN.md B4). NOT APPLIED YET.
--
-- Two tables:
--   content_follows  what a user follows: a charging station, or a trip / service / purchase post. Own rows only.
--   notifications    one row per recipient. Written ONLY by the SECURITY DEFINER triggers below (no client insert or
--                    update grant); the recipient reads, marks read (mark_notifications_read RPC) and deletes own rows.
--
-- Producers (all AFTER INSERT triggers on existing tables, no new client write path):
--   station_reports status 'fallo'  -> followers of that station           (kind 'station_failure', B4)
--   content_comments                -> the post's author + its followers   (kind 'comment')
--   content_reactions               -> the post's author                   (kind 'reaction')
--   trip_logs / service_entries     -> the other members of the vehicle    (kind 'vehicle_trip' / 'vehicle_service')
-- Never the actor themself, never from a banned actor. station_failure and reaction are de-duplicated: no new row while
-- the recipient still has an unread one for the same target from the last 24 h. Every producer swallows its own errors:
-- a notification problem must never block the report/comment/trip it reacts to.
--
-- Email: none. The site sends no email of its own (only Supabase's auth OTP), so notifications are in-site only.
-- Anon surface added: none. Apply with `npx supabase db push`, then `npm run gen:types`.

-- 1. Follows ---------------------------------------------------------------

create table if not exists public.content_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  station_id uuid references public.charging_stations (id) on delete cascade,
  trip_log_id uuid references public.trip_logs (id) on delete cascade,
  service_entry_id uuid references public.service_entries (id) on delete cascade,
  part_purchase_id uuid references public.part_purchases (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(station_id, trip_log_id, service_entry_id, part_purchase_id) = 1),
  unique (station_id, user_id),
  unique (trip_log_id, user_id),
  unique (service_entry_id, user_id),
  unique (part_purchase_id, user_id)
);

create index if not exists content_follows_station_idx on public.content_follows (station_id) where station_id is not null;
create index if not exists content_follows_trip_idx on public.content_follows (trip_log_id) where trip_log_id is not null;
create index if not exists content_follows_service_idx on public.content_follows (service_entry_id) where service_entry_id is not null;
create index if not exists content_follows_purchase_idx on public.content_follows (part_purchase_id) where part_purchase_id is not null;

alter table public.content_follows enable row level security;

create policy "own follows: select" on public.content_follows for select to authenticated
  using (auth.uid() = user_id);
create policy "own follows: insert" on public.content_follows for insert to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));
create policy "own follows: delete" on public.content_follows for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.content_follows from anon;
grant select, insert, delete on public.content_follows to authenticated;

-- 2. Notifications ---------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('station_failure', 'comment', 'reaction', 'vehicle_trip', 'vehicle_service')),
  actor_id uuid references auth.users (id) on delete set null,
  station_id uuid references public.charging_stations (id) on delete cascade,
  trip_log_id uuid references public.trip_logs (id) on delete cascade,
  service_entry_id uuid references public.service_entries (id) on delete cascade,
  part_purchase_id uuid references public.part_purchases (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "own notifications: select" on public.notifications for select to authenticated
  using (auth.uid() = user_id);
create policy "own notifications: delete" on public.notifications for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;

-- Marks the caller's notifications read (all unread, or just p_ids) and prunes the caller's read rows older than 90 days.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  delete from public.notifications
   where user_id = auth.uid() and read_at is not null and created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- 3. Producers -------------------------------------------------------------

-- B4: a 'fallo' check-in alerts everyone who follows the station.
create or replace function public.notify_station_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'fallo' or public.is_user_banned(new.user_id) then
    return new;
  end if;
  begin
    insert into public.notifications (user_id, kind, actor_id, station_id, title)
    select f.user_id, 'station_failure', new.user_id, new.station_id,
           left('Reportaron una falla en ' || s.name, 200)
      from public.content_follows f
      join public.charging_stations s on s.id = new.station_id
     where f.station_id = new.station_id
       and f.user_id <> new.user_id
       and not s.hidden
       and not exists (
         select 1 from public.notifications n
          where n.user_id = f.user_id and n.kind = 'station_failure' and n.station_id = new.station_id
            and n.read_at is null and n.created_at > now() - interval '24 hours');
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger notify_station_failure
  after insert on public.station_reports
  for each row execute function public.notify_station_failure();

-- Title and author of the post a comment/reaction targets, and whether followers may still see it.
create or replace function public.content_target(
  p_trip uuid, p_service uuid, p_purchase uuid,
  out author uuid, out label text, out visible boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_trip is not null then
    select user_id, title, is_public and not hidden into author, label, visible from public.trip_logs where id = p_trip;
  elsif p_service is not null then
    select user_id, service_type, is_public and not hidden into author, label, visible from public.service_entries where id = p_service;
  elsif p_purchase is not null then
    select user_id, item, is_public and not hidden into author, label, visible from public.part_purchases where id = p_purchase;
  end if;
end;
$$;

revoke all on function public.content_target(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if public.is_user_banned(new.user_id) then
    return new;
  end if;
  begin
    select * into t from public.content_target(new.trip_log_id, new.service_entry_id, new.part_purchase_id);
    insert into public.notifications (user_id, kind, actor_id, trip_log_id, service_entry_id, part_purchase_id, title)
    select r.uid, 'comment', new.user_id, new.trip_log_id, new.service_entry_id, new.part_purchase_id,
           left('Nuevo comentario en "' || coalesce(t.label, 'una publicación') || '"', 200)
      from (
        select t.author as uid
        union
        select f.user_id
          from public.content_follows f
         where coalesce(t.visible, false)
           and (f.trip_log_id = new.trip_log_id
                or f.service_entry_id = new.service_entry_id
                or f.part_purchase_id = new.part_purchase_id)
      ) r
     where r.uid is not null and r.uid <> new.user_id;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger notify_comment
  after insert on public.content_comments
  for each row execute function public.notify_comment();

create or replace function public.notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if public.is_user_banned(new.user_id) then
    return new;
  end if;
  begin
    select * into t from public.content_target(new.trip_log_id, new.service_entry_id, new.part_purchase_id);
    if t.author is not null and t.author <> new.user_id and not exists (
      select 1 from public.notifications n
       where n.user_id = t.author and n.kind = 'reaction' and n.read_at is null
         and n.created_at > now() - interval '24 hours'
         and (n.trip_log_id = new.trip_log_id or n.service_entry_id = new.service_entry_id
              or n.part_purchase_id = new.part_purchase_id)
    ) then
      insert into public.notifications (user_id, kind, actor_id, trip_log_id, service_entry_id, part_purchase_id, title)
      values (t.author, 'reaction', new.user_id, new.trip_log_id, new.service_entry_id, new.part_purchase_id,
              left('A alguien le gustó "' || coalesce(t.label, 'tu publicación') || '"', 200));
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger notify_reaction
  after insert on public.content_reactions
  for each row execute function public.notify_reaction();

-- Vehicle group: the other members of the vehicle hear about a new trip or service (vehicle_id is set by the existing
-- BEFORE trigger, so it is final here).
create or replace function public.notify_vehicle_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_kind text;
  v_title text;
begin
  if new.vehicle_id is null or public.is_user_banned(new.user_id) then
    return new;
  end if;
  begin
    select display_name into v_name from public.profiles where id = new.user_id;
    if TG_TABLE_NAME = 'trip_logs' then
      v_kind := 'vehicle_trip';
      v_title := coalesce(v_name, 'Alguien') || ' registró un viaje: ' || new.title;
    else
      v_kind := 'vehicle_service';
      v_title := coalesce(v_name, 'Alguien') || ' registró un service: ' || new.service_type;
    end if;
    insert into public.notifications (user_id, kind, actor_id, trip_log_id, service_entry_id, title)
    select m.user_id, v_kind, new.user_id,
           case when TG_TABLE_NAME = 'trip_logs' then new.id end,
           case when TG_TABLE_NAME = 'service_entries' then new.id end,
           left(v_title, 200)
      from public.vehicle_members m
     where m.vehicle_id = new.vehicle_id and m.user_id <> new.user_id;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger notify_vehicle_trip
  after insert on public.trip_logs
  for each row execute function public.notify_vehicle_members();

create trigger notify_vehicle_service
  after insert on public.service_entries
  for each row execute function public.notify_vehicle_members();

revoke all on function public.notify_station_failure() from public, anon, authenticated;
revoke all on function public.notify_comment() from public, anon, authenticated;
revoke all on function public.notify_reaction() from public, anon, authenticated;
revoke all on function public.notify_vehicle_members() from public, anon, authenticated;
