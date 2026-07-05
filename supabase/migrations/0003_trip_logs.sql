-- Phase 3: trip_logs table + RLS.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table public.trip_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  origin text not null,
  destination text not null,
  distance_km integer,
  trip_date date not null,
  charging_stops jsonb not null default '[]'::jsonb,
  rating smallint check (rating between 1 and 5),
  notes text,
  is_public boolean not null default true,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.trip_logs enable row level security;

create policy "users can insert their own trip logs"
  on public.trip_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own trip logs, moderators any"
  on public.trip_logs for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  );

create policy "users can delete their own trip logs, moderators any"
  on public.trip_logs for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  );

-- Same shape as service_entries: owners see all of their own rows, everyone
-- else only public+non-hidden ones. Powers both "Mi actividad" and the
-- Phase 4 community feed off this same table.
create policy "select own trip logs, or public+non-hidden trip logs"
  on public.trip_logs for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden)
  );
