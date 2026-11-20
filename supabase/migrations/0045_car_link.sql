-- Car link, phase 0 (specs/car-link-phase0.md): pair a car head unit to a
-- vehicle with a short code (TV-login style), list and revoke linked
-- devices, and the signed device-call template (heartbeat).
--
-- Trust model: the car holds an ECDSA P-256 key pair (Android Keystore);
-- every car call is signed and verified by the Edge Function `car-device`
-- (Postgres cannot verify P-256: pgcrypto has no public-key signatures and
-- pgsodium only does Ed25519). The function then calls the service-role-only
-- functions below, which do the database side atomically: replay guard
-- (strictly increasing signed timestamp), freshness, per-device rate limit,
-- revocation, and the bound vehicle. No bearer credential lives on the car.
--
-- Anon surface added: request_car_pairing only (anon-callable, rate
-- limited). Nothing here is anon-readable.
-- Apply with `npx supabase db push`, then deploy the Edge Function and run
-- `npm run gen:types`.

-- 1. Helpers -------------------------------------------------------------------

-- Canonical base64 of an uncompressed P-256 X.509 SubjectPublicKeyInfo
-- (91 bytes): the fixed 27-byte DER prefix (SEQUENCE, id-ecPublicKey,
-- prime256v1, BIT STRING, 0x04) followed by the 64-byte point. The point
-- itself is validated by WebCrypto when the function imports the key.
create function public.is_p256_spki(k text)
returns boolean
language sql
immutable
as $$
  select coalesce(k ~ '^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$', false);
$$;

-- Strips control characters and trims; '' when nothing printable is left.
create function public.car_clean_text(t text, max_len integer)
returns text
language sql
immutable
as $$
  select btrim(left(btrim(regexp_replace(coalesce(t, ''), '[[:cntrl:]]', '', 'g')), max_len));
$$;

-- 2. Tables --------------------------------------------------------------------

create table public.car_devices (
  id uuid primary key default gen_random_uuid(),
  -- A device belongs to the VEHICLE, not to the member who paired it: it
  -- survives member changes and dies with the vehicle.
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  public_key text not null check (public.is_p256_spki(public_key)),
  name text not null check (char_length(name) between 1 and 40),
  app_version text check (app_version is null or char_length(app_version) <= 20),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  -- Highest accepted signed timestamp (Unix ms): the replay guard.
  last_request_ts bigint not null default 0,
  -- Per-device hourly request cap.
  window_started_at timestamptz,
  window_count integer not null default 0,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);

-- One ACTIVE device per key (a revoked key may stay in history).
create unique index car_devices_active_key_idx
  on public.car_devices (public_key)
  where revoked_at is null;

create index car_devices_vehicle_idx on public.car_devices (vehicle_id);

create table public.car_pairing_requests (
  -- 6 chars from the join-code alphabet (no I/L/O/0/1).
  code text primary key check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  public_key text not null check (public.is_p256_spki(public_key)),
  device_name text not null check (char_length(device_name) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete cascade
);

create index car_pairing_requests_key_time_idx
  on public.car_pairing_requests (public_key, created_at);
create index car_pairing_requests_time_idx
  on public.car_pairing_requests (created_at);

-- Failed claims per user (same pattern as join_code_attempts, 0021).
create table public.car_pairing_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index car_pairing_attempts_user_time_idx
  on public.car_pairing_attempts (user_id, attempted_at);

-- 3. RLS and privileges ----------------------------------------------------------
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated; take them back and grant only what the web needs. Writes
-- happen exclusively inside the SECURITY DEFINER functions below.

alter table public.car_devices enable row level security;
alter table public.car_pairing_requests enable row level security;
alter table public.car_pairing_attempts enable row level security;

revoke all on public.car_devices from anon, authenticated;
revoke all on public.car_pairing_requests from anon, authenticated;
revoke all on public.car_pairing_attempts from anon, authenticated;

-- The public key and the replay/rate counters stay server-side: clients must
-- select these columns explicitly (a `select=*` is refused).
grant select (id, vehicle_id, name, app_version, created_by, created_at, last_seen_at, revoked_at, revoked_by)
  on public.car_devices to authenticated;

create policy "members can select their vehicle's car devices"
  on public.car_devices for select
  to authenticated
  using (vehicle_id = public.current_user_vehicle_id());

-- car_pairing_requests / car_pairing_attempts: RLS on, no policies, no
-- grants = unreachable from any client session.

-- 4. Code generation (internal) -----------------------------------------------------

-- 6 chars from a 31-letter alphabet, CSPRNG: gen_random_uuid() draws from
-- pg_strong_random. Rejection sampling (< 248 = 8 * 31) avoids modulo bias;
-- bytes 6 and 8 carry the UUID version/variant bits and are skipped.
create function public.generate_car_pairing_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  b bytea;
  v integer;
begin
  loop
    v_code := '';
    while length(v_code) < 6 loop
      b := uuid_send(gen_random_uuid());
      for i in 0..15 loop
        continue when i = 6 or i = 8;
        v := get_byte(b, i);
        continue when v >= 248;
        v_code := v_code || substr(alphabet, 1 + (v % 31), 1);
        exit when length(v_code) = 6;
      end loop;
    end loop;
    exit when not exists (select 1 from public.car_pairing_requests r where r.code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Display names of the vehicle's non-banned members (what the car shows as
-- "Vinculado a: ..."). Display names are public anyway (public_profiles).
create function public.car_vehicle_member_names(p_vehicle_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(p.display_name order by p.display_name), '[]'::jsonb)
  from public.vehicle_members m
  join public.profiles p on p.id = m.user_id
  where m.vehicle_id = p_vehicle_id and p.banned_at is null;
$$;

-- 5. Pairing: the car asks for a code (anon) ----------------------------------------

create function public.request_car_pairing(p_public_key text, p_device_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ttl constant interval := interval '10 minutes';
  max_per_key constant integer := 6;   -- per public key per hour
  max_total constant integer := 200;   -- all requests per hour (anon caller: no identity to meter)
  v_key text := btrim(coalesce(p_public_key, ''));
  v_name text;
  v_code text;
  v_expires timestamptz;
begin
  if not public.is_p256_spki(v_key) then
    raise exception 'Clave del dispositivo no válida.';
  end if;

  -- Serialise requests so the hourly caps cannot be raced.
  perform pg_advisory_xact_lock(hashtext('public.request_car_pairing'));

  delete from public.car_pairing_requests where created_at < now() - interval '1 day';

  if exists (select 1 from public.car_devices d where d.public_key = v_key and d.revoked_at is null) then
    raise exception 'Este auto ya está vinculado.';
  end if;

  if (
    select count(*) from public.car_pairing_requests r
    where r.public_key = v_key and r.created_at > now() - interval '1 hour'
  ) >= max_per_key then
    raise exception 'Demasiados códigos pedidos. Esperá una hora e intentá de nuevo.';
  end if;

  if (
    select count(*) from public.car_pairing_requests r
    where r.created_at > now() - interval '1 hour'
  ) >= max_total then
    raise exception 'Hay demasiados pedidos de vinculación en este momento. Intentá más tarde.';
  end if;

  v_name := public.car_clean_text(p_device_name, 40);
  if v_name = '' then
    v_name := 'Vigo';
  end if;

  v_code := public.generate_car_pairing_code();
  v_expires := now() + ttl;

  insert into public.car_pairing_requests (code, public_key, device_name, expires_at)
  values (v_code, v_key, v_name, v_expires);

  return jsonb_build_object(
    'code', v_code,
    'expires_at', v_expires,
    'ttl_seconds', extract(epoch from ttl)::integer
  );
end;
$$;

-- 6. Pairing: a signed-in member claims the code ------------------------------------

-- Returns null (instead of raising) for an unknown, expired or already used
-- code, so the failed attempt row survives for rate limiting (a raise would
-- roll it back) -- same contract as join_vehicle_by_code since 0021.
create function public.claim_car_pairing(p_code text, p_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  max_failures constant integer := 10;  -- failed claims per user per hour
  max_devices constant integer := 3;    -- active devices per vehicle
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_vehicle uuid;
  v_req public.car_pairing_requests;
  v_name text;
  v_device uuid;
  recent_failures integer;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;
  if public.is_user_banned(auth.uid()) then
    raise exception 'Tu cuenta está suspendida.';
  end if;

  delete from public.car_pairing_attempts
  where user_id = auth.uid() and attempted_at < now() - interval '1 hour';

  select count(*) into recent_failures
  from public.car_pairing_attempts
  where user_id = auth.uid();

  if recent_failures >= max_failures then
    raise exception 'Demasiados intentos. Esperá una hora e intentá de nuevo.';
  end if;

  select m.vehicle_id into v_vehicle
  from public.vehicle_members m
  where m.user_id = auth.uid();

  if v_vehicle is null then
    raise exception 'No autorizado.';
  end if;

  -- Row lock: a concurrent claim of the same code waits here, then sees it
  -- claimed (single use).
  select * into v_req
  from public.car_pairing_requests r
  where r.code = v_code
  for update;

  if v_req.code is null
     or v_req.claimed_at is not null
     or v_req.expires_at <= now()
     or exists (
       select 1 from public.car_devices d
       where d.public_key = v_req.public_key and d.revoked_at is null
     ) then
    insert into public.car_pairing_attempts (user_id) values (auth.uid());
    return null; -- "Código no válido o vencido." -- mapped by the frontend
  end if;

  -- Serialise claims per vehicle so the device cap cannot be raced.
  perform 1 from public.vehicles v where v.id = v_vehicle for update;

  if (
    select count(*) from public.car_devices d
    where d.vehicle_id = v_vehicle and d.revoked_at is null
  ) >= max_devices then
    raise exception 'Tu vehículo ya tiene % dispositivos vinculados. Desvinculá uno antes de agregar otro.', max_devices;
  end if;

  v_name := public.car_clean_text(p_name, 40);
  if v_name = '' then
    v_name := v_req.device_name;
  end if;

  insert into public.car_devices (vehicle_id, public_key, name, created_by)
  values (v_vehicle, v_req.public_key, v_name, auth.uid())
  returning id into v_device;

  update public.car_pairing_requests r
  set claimed_at = now(), claimed_by = auth.uid(), vehicle_id = v_vehicle, device_id = v_device
  where r.code = v_req.code;

  -- Success wipes the counter.
  delete from public.car_pairing_attempts where user_id = auth.uid();

  return jsonb_build_object('device_id', v_device, 'name', v_name);
end;
$$;

-- 7. Revoke (web) -----------------------------------------------------------------------

-- Any member of the device's vehicle may revoke it (banned members too:
-- revoking only removes capability). Idempotent. Effective on the device's
-- next call (car_device_accept checks revoked_at every time).
create function public.revoke_car_device(p_device_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_vehicle uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.';
  end if;

  select d.vehicle_id into v_vehicle
  from public.car_devices d
  where d.id = p_device_id;

  if v_vehicle is null or v_vehicle is distinct from public.current_user_vehicle_id() then
    raise exception 'Ese dispositivo no está vinculado a tu vehículo.';
  end if;

  update public.car_devices d
  set revoked_at = now(), revoked_by = auth.uid()
  where d.id = p_device_id and d.revoked_at is null;
end;
$$;

-- 8. Device side (service role only: called by the car-device Edge Function
--    AFTER it verified the request signature) -----------------------------------------

-- Pairing status for the car. The Edge Function verifies the poll signature
-- with public_key before returning anything to the caller. Unknown code = null.
create function public.poll_car_pairing(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_req public.car_pairing_requests;
  v_dev public.car_devices;
begin
  select * into v_req
  from public.car_pairing_requests r
  where r.code = upper(btrim(coalesce(p_code, '')));

  if v_req.code is null then
    return null;
  end if;

  if v_req.claimed_at is not null then
    select * into v_dev from public.car_devices d where d.id = v_req.device_id;
    if v_dev.id is not null and v_dev.revoked_at is null then
      return jsonb_build_object(
        'public_key', v_req.public_key,
        'status', 'claimed',
        'device_id', v_dev.id,
        'device_name', v_dev.name,
        'members', public.car_vehicle_member_names(v_dev.vehicle_id)
      );
    end if;
    return jsonb_build_object('public_key', v_req.public_key, 'status', 'expired');
  end if;

  if v_req.expires_at <= now() then
    return jsonb_build_object('public_key', v_req.public_key, 'status', 'expired');
  end if;

  return jsonb_build_object(
    'public_key', v_req.public_key,
    'status', 'pending',
    'expires_in', greatest(0, floor(extract(epoch from (v_req.expires_at - now()))))::integer
  );
end;
$$;

-- The verifying key of a device (also when revoked, so a revoked car can be
-- told so after proving its key). Unknown device = null.
create function public.car_device_public_key(p_device_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.public_key from public.car_devices d where d.id = p_device_id;
$$;

-- THE GUARD every signed device call runs first (template for the later
-- car_submit_* functions): device exists, not revoked, its vehicle still has
-- members, timestamp fresh (5 min) and strictly greater than the last
-- accepted one (replay), hourly cap. On success it records the timestamp and
-- last_seen_at and returns the bound vehicle; on failure reject_reason is one
-- of unknown | revoked | clock | replay | rate_limited and nothing else changes
-- (except the self-revoke of a memberless vehicle's device). Internal only.
create function public.car_device_accept(
  p_device_id uuid,
  p_ts bigint,
  out accepted_vehicle uuid,
  out reject_reason text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  max_skew_ms constant bigint := 300000;
  max_per_hour constant integer := 120;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_dev public.car_devices;
  v_window_start timestamptz;
  v_window_count integer;
begin
  -- Row lock: two concurrent requests with the same ts cannot both pass.
  select * into v_dev from public.car_devices d where d.id = p_device_id for update;

  if v_dev.id is null then
    reject_reason := 'unknown';
    return;
  end if;
  if v_dev.revoked_at is not null then
    reject_reason := 'revoked';
    return;
  end if;
  -- A vehicle nobody belongs to any more (its last member moved away and it
  -- was kept for its content) cannot be managed by anyone: retire the device.
  if not exists (select 1 from public.vehicle_members m where m.vehicle_id = v_dev.vehicle_id) then
    update public.car_devices d set revoked_at = now() where d.id = v_dev.id;
    reject_reason := 'revoked';
    return;
  end if;
  if p_ts is null or abs(p_ts - now_ms) > max_skew_ms then
    reject_reason := 'clock';
    return;
  end if;
  if p_ts <= v_dev.last_request_ts then
    reject_reason := 'replay';
    return;
  end if;

  v_window_start := v_dev.window_started_at;
  v_window_count := v_dev.window_count;
  if v_window_start is null or v_window_start < now() - interval '1 hour' then
    v_window_start := now();
    v_window_count := 0;
  end if;
  if v_window_count >= max_per_hour then
    reject_reason := 'rate_limited';
    return;
  end if;

  update public.car_devices d
  set last_request_ts = p_ts,
      last_seen_at = now(),
      window_started_at = v_window_start,
      window_count = v_window_count + 1
  where d.id = v_dev.id;

  accepted_vehicle := v_dev.vehicle_id;
end;
$$;

-- Heartbeat: the guard, then the app version; returns what the car shows.
create function public.car_heartbeat(p_device_id uuid, p_ts bigint, p_app_version text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_name text;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  update public.car_devices d
  set app_version = coalesce(nullif(public.car_clean_text(p_app_version, 20), ''), d.app_version)
  where d.id = p_device_id
  returning d.name into v_name;

  return jsonb_build_object(
    'device_id', p_device_id,
    'device_name', v_name,
    'members', public.car_vehicle_member_names(g.accepted_vehicle)
  );
end;
$$;

-- The car's own "Desvincular": the guard, then the device revokes itself.
create function public.car_unpair(p_device_id uuid, p_ts bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  update public.car_devices d set revoked_at = now(), revoked_by = null where d.id = p_device_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 9. Function privileges ---------------------------------------------------------------
-- Supabase's default privileges grant EXECUTE to anon/authenticated
-- independently of PUBLIC (see 0015 section 5): revoke from each explicitly.

-- Internal helpers: definer-to-definer calls only (the CHECK constraints
-- that use is_p256_spki run inside those definer functions too). Not even
-- the service role calls them directly: the guard must not be skippable.
revoke execute on function public.is_p256_spki(text) from public, anon, authenticated, service_role;
revoke execute on function public.car_clean_text(text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.generate_car_pairing_code() from public, anon, authenticated, service_role;
revoke execute on function public.car_vehicle_member_names(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.car_device_accept(uuid, bigint) from public, anon, authenticated, service_role;

-- The car (anon) asks for a code.
revoke execute on function public.request_car_pairing(text, text) from public;
grant execute on function public.request_car_pairing(text, text) to anon, authenticated;

-- Signed-in members claim and revoke.
revoke execute on function public.claim_car_pairing(text, text) from public, anon;
grant execute on function public.claim_car_pairing(text, text) to authenticated;
revoke execute on function public.revoke_car_device(uuid) from public, anon;
grant execute on function public.revoke_car_device(uuid) to authenticated;

-- Device side: only the Edge Function (service role).
revoke execute on function public.poll_car_pairing(text) from public, anon, authenticated;
revoke execute on function public.car_device_public_key(uuid) from public, anon, authenticated;
revoke execute on function public.car_heartbeat(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.car_unpair(uuid, bigint) from public, anon, authenticated;
grant execute on function public.poll_car_pairing(text) to service_role;
grant execute on function public.car_device_public_key(uuid) to service_role;
grant execute on function public.car_heartbeat(uuid, bigint, text) to service_role;
grant execute on function public.car_unpair(uuid, bigint) to service_role;

comment on function public.request_car_pairing(text, text) is
  'Anon-callable BY DESIGN (the car has no account): stores a pairing request '
  'for a P-256 public key and returns a 6-char code valid 10 minutes. Rate '
  'limited per key (6/h) and globally (200/h).';
