-- A8 "Firmware tracker" (specs/car-firmware-a8.md): the community table of head-unit software versions seen on linked cars.
-- The car reports its version as car_status.fw_version (0054). This function is the ONLY cross-vehicle read of it: an anonymous
-- aggregate (version, number of cars, when it was last seen as a month), never a vehicle, a member or a timestamp per car.
--
-- NEW ANON SURFACE (by design, owner OK required): car_firmware_versions() is executable by anon so signed-out visitors see the
-- table. It reads only car_status.fw_version / received_at and returns counts; the version string is a build name shared by
-- every car with that software, not an identifier.
--
-- NOT APPLIED (owner OK required). Needs 0054. Apply with `npx supabase db push`, then `npm run gen:types`.

create or replace function public.car_firmware_versions()
returns table (fw_version text, cars integer, last_seen_month date)
language sql
stable
security definer
set search_path = public
as $$
  select s.fw_version,
         count(*)::integer as cars,
         date_trunc('month', max(s.received_at))::date as last_seen_month
  from public.car_status s
  where s.fw_version is not null
    and s.received_at > now() - interval '18 months'   -- a car not seen for a year and a half no longer says what is current
  group by s.fw_version
  order by s.fw_version desc;
$$;

comment on function public.car_firmware_versions() is
  'Anonymous aggregate of head-unit software versions reported by linked cars (specs/car-firmware-a8.md). Anon by design.';

revoke execute on function public.car_firmware_versions() from public;
grant execute on function public.car_firmware_versions() to anon, authenticated;
