-- Audit item A1: server-side sanity limits on community-submitted numbers,
-- missing indexes, and outlier-robust (median) stats views.
-- RLS controls WHO can write; these CHECK constraints control WHAT they can
-- write — until now any authenticated user could POST distance_km: 999999999
-- straight to PostgREST, topping the leaderboard and poisoning the public
-- consumption estimate on /costos.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Re-run note: the UPDATE clamps, `create index if not exists` and
-- `create or replace view` statements are all safely re-runnable. The
-- `alter table ... add constraint` statements are NOT — they fail loudly
-- with "constraint already exists" on a second run, which is fine (nothing
-- is left in a broken state; just skip them).

-- 1. Clamp existing rows that would violate the new constraints, so the
--    alter tables below never fail on legacy data.

update public.trip_logs set distance_km = null
  where distance_km is not null and distance_km not between 0 and 5000;
update public.trip_logs set average_speed_kmh = null
  where average_speed_kmh > 250;
update public.trip_logs set charging_stops = '[]'::jsonb
  where jsonb_array_length(charging_stops) > 20
     or pg_column_size(charging_stops) > 20000;
update public.trip_logs set title = left(title, 200) where char_length(title) > 200;
update public.trip_logs set origin = left(origin, 120) where char_length(origin) > 120;
update public.trip_logs set destination = left(destination, 120) where char_length(destination) > 120;
update public.trip_logs set notes = left(notes, 2000) where char_length(notes) > 2000;

update public.service_entries set odometer_km = least(greatest(odometer_km, 0), 1000000)
  where odometer_km not between 0 and 1000000;
update public.service_entries set cost_uyu = least(greatest(cost_uyu, 0), 10000000)
  where cost_uyu not between 0 and 10000000;
update public.service_entries set dealer = left(dealer, 120) where char_length(dealer) > 120;
update public.service_entries set service_type = left(service_type, 120) where char_length(service_type) > 120;
update public.service_entries set city = left(city, 80) where char_length(city) > 80;
update public.service_entries set notes = left(notes, 2000) where char_length(notes) > 2000;

update public.part_purchases set price_uyu = least(greatest(price_uyu, 0), 10000000)
  where price_uyu not between 0 and 10000000;
update public.part_purchases set odometer_km = null
  where odometer_km is not null and odometer_km not between 0 and 1000000;
update public.part_purchases set item = left(item, 160) where char_length(item) > 160;
update public.part_purchases set store = left(store, 120) where char_length(store) > 120;
update public.part_purchases set category = left(category, 40) where char_length(category) > 40;
update public.part_purchases set city = left(city, 80) where char_length(city) > 80;
update public.part_purchases set notes = left(notes, 2000) where char_length(notes) > 2000;

update public.profiles set display_name = 'Usuario' where char_length(display_name) < 1;
update public.profiles set display_name = left(display_name, 60) where char_length(display_name) > 60;
update public.profiles set city = left(city, 80) where char_length(city) > 80;

update public.vehicles set plate = left(plate, 16) where char_length(plate) > 16;

-- 2. CHECK constraints. Bounds already enforced elsewhere (charge
--    percentages 0-100, average_speed_kmh >= 0, rating 1-5, model E2/E2+)
--    are deliberately not duplicated here. CHECKs pass on NULL, so nullable
--    columns stay nullable.

alter table public.trip_logs
  add constraint trip_logs_distance_km_range check (distance_km between 0 and 5000),
  add constraint trip_logs_average_speed_kmh_max check (average_speed_kmh <= 250),
  add constraint trip_logs_charging_stops_count check (jsonb_array_length(charging_stops) <= 20),
  add constraint trip_logs_charging_stops_size check (pg_column_size(charging_stops) <= 20000),
  add constraint trip_logs_title_len check (char_length(title) <= 200),
  add constraint trip_logs_origin_len check (char_length(origin) <= 120),
  add constraint trip_logs_destination_len check (char_length(destination) <= 120),
  add constraint trip_logs_notes_len check (char_length(notes) <= 2000);

alter table public.service_entries
  add constraint service_entries_odometer_km_range check (odometer_km between 0 and 1000000),
  add constraint service_entries_cost_uyu_range check (cost_uyu between 0 and 10000000),
  add constraint service_entries_dealer_len check (char_length(dealer) <= 120),
  add constraint service_entries_service_type_len check (char_length(service_type) <= 120),
  add constraint service_entries_city_len check (char_length(city) <= 80),
  add constraint service_entries_notes_len check (char_length(notes) <= 2000);

alter table public.part_purchases
  add constraint part_purchases_price_uyu_range check (price_uyu between 0 and 10000000),
  add constraint part_purchases_odometer_km_range check (odometer_km between 0 and 1000000),
  add constraint part_purchases_item_len check (char_length(item) <= 160),
  add constraint part_purchases_store_len check (char_length(store) <= 120),
  add constraint part_purchases_category_len check (char_length(category) <= 40),
  add constraint part_purchases_city_len check (char_length(city) <= 80),
  add constraint part_purchases_notes_len check (char_length(notes) <= 2000);

alter table public.profiles
  add constraint profiles_display_name_len check (char_length(display_name) between 1 and 60),
  add constraint profiles_city_len check (char_length(city) <= 80);

alter table public.vehicles
  add constraint vehicles_plate_len check (char_length(plate) <= 16);

-- 3. Indexes. vehicle_members needs none: (vehicle_id) is the composite PK's
--    leading column and (user_id) has a unique constraint.

create index if not exists service_entries_user_id_idx
  on public.service_entries (user_id);
create index if not exists service_entries_public_feed_idx
  on public.service_entries (created_at desc) where is_public and not hidden;

create index if not exists trip_logs_user_id_idx
  on public.trip_logs (user_id);
create index if not exists trip_logs_public_feed_idx
  on public.trip_logs (created_at desc) where is_public and not hidden;
create index if not exists trip_logs_vehicle_id_idx
  on public.trip_logs (vehicle_id);

create index if not exists part_purchases_user_id_idx
  on public.part_purchases (user_id);
create index if not exists part_purchases_public_feed_idx
  on public.part_purchases (created_at desc) where is_public and not hidden;

-- 4. Outlier-robust stats: medians instead of means, so one absurd (but
--    now merely in-bounds) row can't drag the public stat cards around.
--    Column names and types are unchanged (avg_* kept to avoid frontend
--    changes; percentile_cont returns double precision, cast back to
--    numeric), so create or replace view works.

create or replace view public.service_cost_stats_by_city
with (security_invoker = true) as
select
  city,
  count(*) as entry_count,
  -- Median, despite the avg_ name (kept for frontend compatibility).
  (percentile_cont(0.5) within group (order by cost_uyu))::numeric as avg_cost_uyu
from public.service_entries
where is_public and not hidden and city is not null
group by city;

create or replace view public.trip_stats_by_model
with (security_invoker = true) as
select
  model,
  count(*) as trip_count,
  -- Medians, despite the avg_ names (kept for frontend compatibility).
  (percentile_cont(0.5) within group (order by distance_km))::numeric as avg_distance_km,
  (percentile_cont(0.5) within group (order by average_speed_kmh))::numeric as avg_speed_kmh
from public.trip_logs
where is_public and not hidden and model is not null
group by model;
