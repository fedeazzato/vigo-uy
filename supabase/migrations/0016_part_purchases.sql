-- Phase 7: part purchases (repuestos y consumibles).
-- Users log purchases of consumables/spare parts (tires, filters, wipers,
-- glass, mirrors, body panels...) to track their expenses and share
-- recommendations. Mirrors the service_entries model exactly: public by
-- default, hidden by moderators, banned authors filtered, vehicle_id forced
-- server-side, 20-inserts/day cap.
-- `category` holds a slug from the curated catalog in src/data/parts.json
-- (plus 'otros'); `item` is free text (brand/model/size).
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table public.part_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_date date not null,
  category text not null,
  item text not null,
  store text not null,
  price_uyu numeric not null,
  odometer_km integer,
  city text,
  rating smallint check (rating between 1 and 5),
  notes text,
  is_public boolean not null default true,
  hidden boolean not null default false,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.part_purchases enable row level security;

-- Same policy set as service_entries (0002 + 0010 + 0011).

create policy "users can insert their own part purchases"
  on public.part_purchases for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_user_banned(auth.uid()));

create policy "users can update their own part purchases, moderators any"
  on public.part_purchases for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  );

create policy "users can delete their own part purchases, moderators any"
  on public.part_purchases for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_moderator)
  );

create policy "select own, public+non-hidden, or moderator on public purchases"
  on public.part_purchases for select
  to authenticated
  using (
    auth.uid() = user_id
    or (is_public and not hidden and not public.is_user_banned(user_id))
    or (is_public and exists (select 1 from public.profiles where id = auth.uid() and is_moderator))
  );

create policy "anon selects public+non-hidden purchases"
  on public.part_purchases for select
  to anon
  using (is_public and not hidden and not public.is_user_banned(user_id));

-- Reuse the existing content-table triggers (0009/0010 rate limit + banned
-- check, 0012 server-side vehicle attribution).

create trigger limit_part_purchases_per_day
  before insert on public.part_purchases
  for each row execute function public.enforce_daily_insert_limit();

create trigger set_part_purchase_vehicle
  before insert or update on public.part_purchases
  for each row execute function public.set_vehicle_id_on_write();

-- cleanup_orphan_vehicle (0012) must also treat purchases as content that
-- keeps a memberless vehicle alive, so historical attribution isn't lost.
create or replace function public.cleanup_orphan_vehicle(v_id uuid)
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
    and not exists (select 1 from public.trip_logs t where t.vehicle_id = v_id)
    and not exists (select 1 from public.part_purchases pp where pp.vehicle_id = v_id);
end;
$$;

-- admin_list_users gains a purchase count (return type changes: drop first).
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  city text,
  model text,
  is_moderator boolean,
  banned_at timestamptz,
  created_at timestamptz,
  service_count bigint,
  trip_count bigint,
  purchase_count bigint,
  vehicle_member_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_moderator();

  return query
  select
    p.id,
    p.display_name,
    p.city,
    p.model,
    p.is_moderator,
    p.banned_at,
    p.created_at,
    (select count(*) from public.service_entries e where e.user_id = p.id),
    (select count(*) from public.trip_logs t where t.user_id = p.id),
    (select count(*) from public.part_purchases pp where pp.user_id = p.id),
    (
      select count(*)
      from public.vehicle_members m2
      where m2.vehicle_id = (
        select m.vehicle_id from public.vehicle_members m where m.user_id = p.id
      )
    )
  from public.profiles p
  order by p.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- community_totals: purchase authors count as contributors too (same
-- columns, so create or replace works).
create or replace view public.community_totals
with (security_invoker = true) as
select
  (select count(*) from public.trip_logs where is_public and not hidden) as total_trips,
  (select coalesce(sum(distance_km), 0)::bigint from public.trip_logs where is_public and not hidden) as total_km,
  (
    select count(distinct user_id) from (
      select user_id from public.trip_logs where is_public and not hidden
      union
      select user_id from public.service_entries where is_public and not hidden
      union
      select user_id from public.part_purchases where is_public and not hidden
    ) contributors
  ) as contributor_count;
