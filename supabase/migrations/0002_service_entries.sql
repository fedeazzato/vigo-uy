-- Phase 2: service_entries table + RLS.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table public.service_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_date date not null,
  odometer_km integer not null,
  dealer text not null,
  service_type text not null,
  cost_uyu numeric not null,
  city text,
  notes text,
  is_public boolean not null default true,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.service_entries enable row level security;

create policy "users can insert their own service entries"
  on public.service_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own service entries, moderators any"
  on public.service_entries for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  );

create policy "users can delete their own service entries, moderators any"
  on public.service_entries for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  );

-- Owners see all of their own entries (public or private); everyone else
-- sees only public, non-hidden ones. This same policy will power the
-- Phase 4 community feed off this same table.
create policy "select own entries, or public+non-hidden entries"
  on public.service_entries for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden)
  );
