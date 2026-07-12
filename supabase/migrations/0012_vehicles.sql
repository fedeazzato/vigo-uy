-- Phase 6: shared vehicles.
-- Some members share one physical car (family groups). Every user gets a
-- vehicle automatically on signup; the profile page shows a short join code
-- that family members can enter to link their account to the same vehicle.
-- Content rows carry a vehicle_id so km aggregations (leaderboard, 0013)
-- group per vehicle instead of per user.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

-- 1. Tables ------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text check (model in ('E2', 'E2+')),
  color text,
  join_code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.vehicle_members (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (vehicle_id, user_id),
  -- one vehicle per user: joining another vehicle's code MOVES you
  unique (user_id)
);

alter table public.vehicles enable row level security;
alter table public.vehicle_members enable row level security;

-- 2. Helpers -----------------------------------------------------------------

-- 6 chars from an alphabet without lookalikes (no I/L/O/0/1). Internal only.
create function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.vehicles where join_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function public.generate_join_code() from public;

-- Anti-recursion helper: a vehicle_members policy that subqueries
-- vehicle_members recurses into its own policy. security definer breaks the
-- cycle and keeps the policies readable. Do NOT inline this subquery.
create function public.current_user_vehicle_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select vehicle_id from public.vehicle_members where user_id = auth.uid();
$$;

revoke execute on function public.current_user_vehicle_id() from public;
grant execute on function public.current_user_vehicle_id() to authenticated;

-- Deletes a vehicle nobody belongs to anymore, unless content still points at
-- it (then it stays so historical km remain attributed; it simply drops off
-- the leaderboard once memberless). Internal only.
create function public.cleanup_orphan_vehicle(v_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if v_id is null then
    return;
  end if;
  delete from public.vehicles v
  where v.id = v_id
    and not exists (select 1 from public.vehicle_members m where m.vehicle_id = v_id)
    and not exists (select 1 from public.service_entries e where e.vehicle_id = v_id)
    and not exists (select 1 from public.trip_logs t where t.vehicle_id = v_id);
end;
$$;

revoke execute on function public.cleanup_orphan_vehicle(uuid) from public;

-- 3. RLS ---------------------------------------------------------------------
-- Members can see and edit their own vehicle; nobody else can read it (the
-- join_code is the sensitive column -- public leaderboard exposure goes only
-- through the 0013 view, which never selects it). No insert/delete policies
-- on either table: membership changes happen only via the SECURITY DEFINER
-- RPCs below, and vehicles are created only by triggers/RPCs.

create policy "members can select their vehicle"
  on public.vehicles for select
  to authenticated
  using (id = public.current_user_vehicle_id());

create policy "members can update their vehicle"
  on public.vehicles for update
  to authenticated
  using (id = public.current_user_vehicle_id())
  with check (id = public.current_user_vehicle_id());

create policy "members can select their vehicle members"
  on public.vehicle_members for select
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- The UPDATE policy is row-level, so members could otherwise rewrite their
-- vehicle's join_code; revert any change made through a client session.
create function public.prevent_join_code_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.join_code := old.join_code;
  end if;
  return new;
end;
$$;

create trigger prevent_join_code_update
  before update on public.vehicles
  for each row execute function public.prevent_join_code_update();

-- 4. Auto-provision a vehicle on signup (extends the 0001 trigger fn) --------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_vehicle_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));

  insert into public.vehicles (name, join_code, created_by)
  values ('Vigo de ' || split_part(new.email, '@', 1), public.generate_join_code(), new.id)
  returning id into new_vehicle_id;

  insert into public.vehicle_members (vehicle_id, user_id)
  values (new_vehicle_id, new.id);

  return new;
end;
$$;

-- 5. Backfill existing users (idempotent: guarded by NOT EXISTS, so pasting
--    this migration twice is a no-op for this block) --------------------------

do $$
declare
  p record;
  v_id uuid;
begin
  for p in
    select pr.id, pr.display_name, pr.model, pr.color
    from public.profiles pr
    where not exists (select 1 from public.vehicle_members m where m.user_id = pr.id)
  loop
    insert into public.vehicles (name, model, color, join_code, created_by)
    values ('Vigo de ' || p.display_name, p.model, p.color, public.generate_join_code(), p.id)
    returning id into v_id;

    insert into public.vehicle_members (vehicle_id, user_id)
    values (v_id, p.id);
  end loop;
end;
$$;

-- 6. vehicle_id on content tables ---------------------------------------------

alter table public.service_entries
  add column vehicle_id uuid references public.vehicles (id) on delete set null;
alter table public.trip_logs
  add column vehicle_id uuid references public.vehicles (id) on delete set null;

update public.service_entries e
set vehicle_id = m.vehicle_id
from public.vehicle_members m
where m.user_id = e.user_id and e.vehicle_id is null;

update public.trip_logs t
set vehicle_id = m.vehicle_id
from public.vehicle_members m
where m.user_id = t.user_id and t.vehicle_id is null;

-- Server-side attribution: on insert, force vehicle_id to the author's
-- current vehicle (whatever the client sent); on update, freeze it -- a trip
-- stays attributed to the vehicle it was driven in even if the author later
-- switches vehicles, and nobody can reattribute content to another family's
-- car. No frontend changes needed in the submit forms.
create function public.set_vehicle_id_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.vehicle_id := (
      select vehicle_id from public.vehicle_members where user_id = new.user_id
    );
  else
    new.vehicle_id := old.vehicle_id;
  end if;
  return new;
end;
$$;

create trigger set_service_entry_vehicle
  before insert or update on public.service_entries
  for each row execute function public.set_vehicle_id_on_write();

create trigger set_trip_log_vehicle
  before insert or update on public.trip_logs
  for each row execute function public.set_vehicle_id_on_write();

-- 7. Membership RPCs -----------------------------------------------------------

-- Moves the caller to the vehicle matching the code. Their old vehicle is
-- deleted only if it ends up memberless with no content attached.
create function public.join_vehicle_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  old_vehicle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if public.is_user_banned(auth.uid()) then
    raise exception 'Tu cuenta está suspendida.';
  end if;

  select id into target_id
  from public.vehicles
  where join_code = upper(trim(code));

  if target_id is null then
    raise exception 'Código no válido.';
  end if;

  select vehicle_id into old_vehicle_id
  from public.vehicle_members
  where user_id = auth.uid();

  if old_vehicle_id = target_id then
    return target_id; -- already a member: no-op
  end if;

  delete from public.vehicle_members where user_id = auth.uid();
  insert into public.vehicle_members (vehicle_id, user_id)
  values (target_id, auth.uid());

  perform public.cleanup_orphan_vehicle(old_vehicle_id);
  return target_id;
end;
$$;

revoke execute on function public.join_vehicle_by_code(text) from public;
grant execute on function public.join_vehicle_by_code(text) to authenticated;

-- The undo path after joining someone else's vehicle: leave it and start a
-- fresh own vehicle again.
create function public.reset_my_vehicle()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  old_vehicle_id uuid;
  new_vehicle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'No autorizado.';
  end if;

  select vehicle_id into old_vehicle_id
  from public.vehicle_members
  where user_id = auth.uid();

  delete from public.vehicle_members where user_id = auth.uid();

  insert into public.vehicles (name, model, color, join_code, created_by)
  values ('Vigo de ' || me.display_name, me.model, me.color, public.generate_join_code(), auth.uid())
  returning id into new_vehicle_id;

  insert into public.vehicle_members (vehicle_id, user_id)
  values (new_vehicle_id, auth.uid());

  perform public.cleanup_orphan_vehicle(old_vehicle_id);
  return new_vehicle_id;
end;
$$;

revoke execute on function public.reset_my_vehicle() from public;
grant execute on function public.reset_my_vehicle() to authenticated;
