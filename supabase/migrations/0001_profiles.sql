-- Phase 1: profiles table, auto-provisioning trigger, and RLS.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  city text,
  model text check (model in ('E2', 'E2+')),
  color text,
  is_moderator boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any authenticated user can read profiles: display names need to be visible
-- on community feed entries (added in a later phase).
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-provision a profile row when a new auth user is created, so the app
-- never has to do a separate "create profile" round-trip after signup.
-- security definer: needs elevated privileges to insert into public.profiles
-- on behalf of a brand-new auth.users row during the same transaction.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
