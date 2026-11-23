-- Car updates, PLAN D2 (specs/car-updates.md; car side: vigo-hack updater/PLAN.md sections 10-11). NOT APPLIED YET.
--
-- WikiVigo keeps only the SIGNED release list: the maintainer signs each manifest offline (vigo-hack
-- updater/tools/SignManifest.java, ECDSA P-256) and a moderator pastes manifest + signature on "Versiones". The files
-- themselves live on GitHub Releases (owner O7): the car downloads <download_base><blob id> and checks every file's size
-- and sha256 against the signed manifest, and the manifest against the keys compiled into the car. The server never signs
-- and cannot make a car install anything the maintainer did not sign; it can only withhold (rollout cap, pause).
--
-- Postgres cannot verify P-256: the moderator page verifies the signature in the browser before publishing (UX: rejects a
-- wrong paste early); the car verifies again, which is the real boundary. SQL checks the structure and the serial rule.
--
-- Serials are global (one sequence for both channels) so the beta car, which takes the newest of beta and stable, never
-- sees a serial go backwards (the car refuses a lower serial than the last one it accepted).
--
-- Anon surface added: none. Apply with `npx supabase db push`, deploy car-device, then `npm run gen:types`.

-- 1. Releases --------------------------------------------------------------

create table if not exists public.car_releases (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('stable', 'beta')),
  serial bigint not null unique check (serial > 0),
  manifest text not null check (octet_length(manifest) <= 65536
                                and left(manifest, 14) = E'vigo-update 1\n'
                                and right(manifest, 4) = E'end\n'),
  signature text not null check (signature ~ '^[A-Za-z0-9+/]{60,200}={0,2}$'),
  -- GitHub Releases download folder, e.g. https://github.com/<owner>/<repo>/releases/download/<tag>/
  download_base text not null check (download_base ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/[A-Za-z0-9_.+-]+/$'),
  -- parsed from the signed text at publish (display + selection; the car re-parses the signed bytes)
  is_kill boolean not null,
  rollout_percent smallint not null check (rollout_percent between 0 and 100),
  rollout_salt text not null check (rollout_salt ~ '^[A-Za-z0-9._+-]{1,64}$'),
  expires_at timestamptz not null,
  -- server-side withhold: effective percent = least(rollout_percent, rollout_cap). 0 = paused. Never raises the signed percent.
  rollout_cap smallint check (rollout_cap between 0 and 100),
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists car_releases_channel_serial_idx on public.car_releases (channel, serial desc);

comment on table public.car_releases is
  'Signed car update manifests (specs/car-updates.md). Inserted only by admin_publish_car_release; files live on GitHub Releases.';

alter table public.car_releases enable row level security;
revoke all on public.car_releases from anon, authenticated;
grant select on public.car_releases to authenticated;

create policy "moderators read car releases"
  on public.car_releases for select to authenticated
  using (public.is_active_moderator(auth.uid()));

-- 2. Beta cars (owner O4: the owner's car gets every release first) -------

create table if not exists public.car_update_beta (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now()
);

alter table public.car_update_beta enable row level security;
revoke all on public.car_update_beta from anon, authenticated;
grant select on public.car_update_beta to authenticated;

create policy "moderators read beta cars"
  on public.car_update_beta for select to authenticated
  using (public.is_active_moderator(auth.uid()));

-- 3. Per-car status (latest row only, no history: D7) ----------------------

create table if not exists public.car_update_status (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  channel text not null default 'stable' check (channel in ('stable', 'beta')),
  firmware text check (firmware is null or char_length(firmware) <= 64),
  -- {"<package>": versionCode} of OUR packages + com.google.android.gms + com.waze
  installed jsonb not null default '{}'::jsonb check (jsonb_typeof(installed) = 'object'),
  phase text check (phase is null or phase in ('IDLE', 'STAGING', 'STAGED', 'APPLYING', 'TRIAL', 'ROLLING_BACK')),
  last_line text check (last_line is null or char_length(last_line) <= 300),
  serial bigint,                 -- serial the car reported (installed / in progress)
  offered_serial bigint,         -- serial the last update_check returned
  checked_at timestamptz,
  reported_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.car_update_status enable row level security;
revoke all on public.car_update_status from anon, authenticated;
grant select on public.car_update_status to authenticated;

create policy "members and moderators read car update status"
  on public.car_update_status for select to authenticated
  using (vehicle_id = public.current_user_vehicle_id() or public.is_active_moderator(auth.uid()));

-- 4. Moderator RPCs --------------------------------------------------------

-- Parses the header records of a manifest (serial, expires, kill, rollout); null when one is missing or malformed.
create or replace function public.car_manifest_header(p_manifest text)
returns table (serial bigint, expires bigint, is_kill boolean, rollout_percent int, rollout_salt text)
language plpgsql
immutable
set search_path = public
as $$
declare
  l text;
  f text[];
begin
  for l in select unnest(string_to_array(p_manifest, E'\n')) loop
    f := string_to_array(l, ' ');
    if f[1] = 'serial' and array_length(f, 1) = 2 and f[2] ~ '^[0-9]{1,18}$' then serial := f[2]::bigint;
    elsif f[1] = 'expires' and array_length(f, 1) = 2 and f[2] ~ '^[0-9]{1,18}$' then expires := f[2]::bigint;
    elsif f[1] = 'kill' and array_length(f, 1) = 2 and f[2] in ('0', '1') then is_kill := f[2] = '1';
    elsif f[1] = 'rollout' and array_length(f, 1) = 3 and f[2] ~ '^[0-9]{1,3}$' and f[2]::int <= 100
          and f[3] ~ '^[A-Za-z0-9._+-]{1,64}$' then
      rollout_percent := f[2]::int;
      rollout_salt := f[3];
    end if;
  end loop;
  if serial is null or expires is null or is_kill is null or rollout_percent is null then
    return;
  end if;
  return next;
end;
$$;

revoke execute on function public.car_manifest_header(text) from public, anon;
grant execute on function public.car_manifest_header(text) to authenticated, service_role;

-- Publishes a signed manifest (the page verified the signature in the browser; the car verifies again). Refuses a serial
-- that is not above every published one, an expired manifest, a malformed header. Returns the new row id.
create or replace function public.admin_publish_car_release(
  p_channel text, p_manifest text, p_signature text, p_download_base text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  v_id uuid;
begin
  if not public.is_active_moderator(auth.uid()) then
    raise exception 'not a moderator';
  end if;
  if p_channel not in ('stable', 'beta') then
    raise exception 'canal inválido';
  end if;
  select * into h from public.car_manifest_header(p_manifest);
  if h.serial is null then
    raise exception 'manifiesto inválido: faltan serial, expires, kill o rollout';
  end if;
  if h.expires <= extract(epoch from now()) then
    raise exception 'manifiesto vencido';
  end if;
  if exists (select 1 from public.car_releases where serial >= h.serial) then
    raise exception 'el serial % no es mayor que el último publicado', h.serial;
  end if;
  insert into public.car_releases
    (channel, serial, manifest, signature, download_base, is_kill, rollout_percent, rollout_salt, expires_at, note, created_by)
  values
    (p_channel, h.serial, p_manifest, p_signature, p_download_base, h.is_kill, h.rollout_percent, h.rollout_salt,
     to_timestamp(h.expires), nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_publish_car_release(text, text, text, text, text) from public, anon;
grant execute on function public.admin_publish_car_release(text, text, text, text, text) to authenticated;

-- Server-side withhold of one release: null = as signed, 0 = paused, n = at most n % (never above the signed percent).
create or replace function public.admin_set_car_release_cap(p_release uuid, p_cap smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_moderator(auth.uid()) then
    raise exception 'not a moderator';
  end if;
  if p_cap is not null and (p_cap < 0 or p_cap > 100) then
    raise exception 'porcentaje inválido';
  end if;
  update public.car_releases set rollout_cap = p_cap where id = p_release;
end;
$$;

revoke execute on function public.admin_set_car_release_cap(uuid, smallint) from public, anon;
grant execute on function public.admin_set_car_release_cap(uuid, smallint) to authenticated;

-- Marks / unmarks a vehicle as a beta car.
create or replace function public.admin_set_car_beta(p_vehicle uuid, p_beta boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_moderator(auth.uid()) then
    raise exception 'not a moderator';
  end if;
  if p_beta then
    insert into public.car_update_beta (vehicle_id, set_by) values (p_vehicle, auth.uid())
    on conflict (vehicle_id) do nothing;
  else
    delete from public.car_update_beta where vehicle_id = p_vehicle;
  end if;
end;
$$;

revoke execute on function public.admin_set_car_beta(uuid, boolean) from public, anon;
grant execute on function public.admin_set_car_beta(uuid, boolean) to authenticated;

-- Moderator view of every linked car's update status (vehicles have no public name: labelled by member display names).
create or replace function public.admin_list_car_updates()
returns table (vehicle_id uuid, members text, beta boolean, channel text, firmware text, installed jsonb, phase text,
               last_line text, serial bigint, offered_serial bigint, checked_at timestamptz, reported_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_moderator(auth.uid()) then
    raise exception 'not a moderator';
  end if;
  return query
    select d.vehicle_id,
           (select string_agg(coalesce(p.display_name, '?'), ', ' order by p.display_name)
              from public.vehicle_members m left join public.profiles p on p.id = m.user_id
             where m.vehicle_id = d.vehicle_id),
           exists (select 1 from public.car_update_beta b where b.vehicle_id = d.vehicle_id),
           s.channel, s.firmware, coalesce(s.installed, '{}'::jsonb), s.phase, s.last_line, s.serial, s.offered_serial,
           s.checked_at, s.reported_at
      from (select distinct cd.vehicle_id from public.car_devices cd where cd.revoked_at is null) d
      left join public.car_update_status s on s.vehicle_id = d.vehicle_id
     order by s.checked_at desc nulls last;
end;
$$;

revoke execute on function public.admin_list_car_updates() from public, anon;
grant execute on function public.admin_list_car_updates() to authenticated;

-- "Estado del auto" (owner O6): the Google software notices of the release the caller's car would see (newest unexpired
-- non-kill release of stable, or of beta/stable for a beta car). Only the notice lines (package, versionCode, label):
-- nothing else of the manifest reaches members. Empty when there is no linked car or no release.
create or replace function public.car_update_notices()
returns table (package text, version_code bigint, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vehicle uuid := public.current_user_vehicle_id();
  v_beta boolean;
  v_manifest text;
  l text;
  f text[];
begin
  if auth.uid() is null or v_vehicle is null then
    return;
  end if;
  v_beta := exists (select 1 from public.car_update_beta b where b.vehicle_id = v_vehicle);
  select c.manifest into v_manifest from public.car_releases c
   where c.expires_at > now() and not c.is_kill and (c.channel = 'stable' or v_beta)
   order by c.serial desc limit 1;
  if v_manifest is null then
    return;
  end if;
  for l in select unnest(string_to_array(v_manifest, E'\n')) loop
    f := string_to_array(l, ' ');
    if f[1] = 'notice' and array_length(f, 1) = 4 and f[3] ~ '^[0-9]{1,18}$' then
      package := f[2];
      version_code := f[3]::bigint;
      label := replace(f[4], '_', ' ');
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.car_update_notices() from public, anon;
grant execute on function public.car_update_notices() to authenticated;

-- 5. Signed car calls (service role only; car-device verified the device signature) ------

-- update_check: records the car's report and returns the candidate releases newest first (at most 5, unexpired, of the
-- channels this car may take: beta cars take both). The Edge Function picks the first one whose rollout includes this
-- car (sha256(salt:device_id), like the car's own Policy.bucket); kill manifests always.
-- p_report = {"channel","firmware","installed":{pkg:int},"phase","last","serial"}; unknown/oversized values are dropped.
create or replace function public.car_update_check(p_device_id uuid, p_ts bigint, p_report jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_beta boolean;
  v_installed jsonb := '{}'::jsonb;
  v_k text;
  v_v jsonb;
  v_out jsonb;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  v_beta := exists (select 1 from public.car_update_beta b where b.vehicle_id = g.accepted_vehicle);

  if jsonb_typeof(p_report -> 'installed') = 'object' then
    for v_k, v_v in select key, value from jsonb_each(p_report -> 'installed') limit 32 loop
      if v_k ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' and char_length(v_k) <= 128 and jsonb_typeof(v_v) = 'number' then
        v_installed := v_installed || jsonb_build_object(v_k, v_v);
      end if;
    end loop;
  end if;

  insert into public.car_update_status as s
    (vehicle_id, device_id, channel, firmware, installed, phase, last_line, serial, checked_at, updated_at)
  values
    (g.accepted_vehicle, p_device_id, case when v_beta then 'beta' else 'stable' end,
     left(nullif(p_report ->> 'firmware', ''), 64), v_installed,
     case when p_report ->> 'phase' in ('IDLE', 'STAGING', 'STAGED', 'APPLYING', 'TRIAL', 'ROLLING_BACK') then p_report ->> 'phase' end,
     left(nullif(p_report ->> 'last', ''), 300),
     case when jsonb_typeof(p_report -> 'serial') = 'number' then (p_report ->> 'serial')::bigint end,
     now(), now())
  on conflict (vehicle_id) do update
     set device_id = excluded.device_id, channel = excluded.channel, firmware = excluded.firmware,
         installed = excluded.installed, phase = coalesce(excluded.phase, s.phase),
         last_line = coalesce(excluded.last_line, s.last_line), serial = coalesce(excluded.serial, s.serial),
         checked_at = now(), updated_at = now();

  select coalesce(jsonb_agg(r order by r.serial desc), '[]'::jsonb) into v_out
    from (select c.serial, c.channel, c.manifest, c.signature, c.download_base, c.is_kill,
                 least(c.rollout_percent, coalesce(c.rollout_cap, 100)) as percent, c.rollout_salt as salt
            from public.car_releases c
           where c.expires_at > now() and (c.channel = 'stable' or v_beta)
           order by c.serial desc
           limit 5) r;

  return jsonb_build_object('ok', true, 'beta', v_beta, 'releases', v_out);
exception when others then
  return jsonb_build_object('error', 'bad_request');
end;
$$;

revoke execute on function public.car_update_check(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.car_update_check(uuid, bigint, jsonb) to service_role;

-- Remembers which serial update_check offered (written by the Edge Function after it picked one; no guard needed: the
-- same signed call already passed car_device_accept, and this only touches the caller's own row).
create or replace function public.car_update_offered(p_device_id uuid, p_serial bigint)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.car_update_status set offered_serial = p_serial
   where vehicle_id = (select vehicle_id from public.car_devices where id = p_device_id and revoked_at is null);
$$;

revoke execute on function public.car_update_offered(uuid, bigint) from public, anon, authenticated;
grant execute on function public.car_update_offered(uuid, bigint) to service_role;

-- update_report {serial, phase, last}: after every state change on the car. A ROLLING_BACK report (or a "ROLLBACK" last
-- line) notifies every active moderator once per serial per 24 h: "Rollback en N autos (serial S)".
create or replace function public.car_update_report(p_device_id uuid, p_ts bigint, p_serial bigint, p_phase text, p_last text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_rollback boolean;
  v_count integer;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  if p_phase is null or p_phase not in ('IDLE', 'STAGING', 'STAGED', 'APPLYING', 'TRIAL', 'ROLLING_BACK')
     or (p_last is not null and char_length(p_last) > 300) or (p_serial is not null and p_serial < 0) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  insert into public.car_update_status as s (vehicle_id, device_id, phase, last_line, serial, reported_at, updated_at)
  values (g.accepted_vehicle, p_device_id, p_phase, p_last, p_serial, now(), now())
  on conflict (vehicle_id) do update
     set device_id = excluded.device_id, phase = excluded.phase, last_line = coalesce(excluded.last_line, s.last_line),
         serial = coalesce(excluded.serial, s.serial), reported_at = now(), updated_at = now();

  v_rollback := p_phase = 'ROLLING_BACK' or coalesce(p_last, '') ilike 'rollback%';
  if v_rollback and p_serial is not null then
    begin
      select count(*) into v_count from public.car_update_status
       where serial = p_serial and (phase = 'ROLLING_BACK' or coalesce(last_line, '') ilike 'rollback%');
      insert into public.notifications (user_id, kind, title)
      select p.id, 'car_rollback', left('Rollback en ' || v_count || ' auto' || case when v_count = 1 then '' else 's' end
                                         || ' (serial ' || p_serial || ')', 200)
        from public.profiles p
       where public.is_active_moderator(p.id)
         and not exists (select 1 from public.notifications n
                          where n.user_id = p.id and n.kind = 'car_rollback' and n.read_at is null
                            and n.title like '%(serial ' || p_serial || ')' and n.created_at > now() - interval '24 hours');
    exception when others then
      null;                                                     -- a notification problem never blocks the report
    end;
  end if;

  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('error', 'bad_request');
end;
$$;

revoke execute on function public.car_update_report(uuid, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.car_update_report(uuid, bigint, bigint, text, text) to service_role;

-- 6. Notification kind -----------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('station_failure', 'comment', 'reaction', 'vehicle_trip', 'vehicle_service', 'car_rollback', 'car_charge_draft'));
