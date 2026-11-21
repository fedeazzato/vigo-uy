-- Car diagnostics (specs/car-diagnostics.md): the user presses "Enviar diagnóstico" in Mi Vigo on the car; the logs of our car
-- apps, redacted on the car (no keys, tokens, passwords; location only if the user ticked it), arrive here as gzip + base64 in
-- parts. The vehicle's members and the moderators (the site owner / maintainers) can read them; nobody else.
--
-- Trust model: unchanged from 0045. The car signs every part, the Edge Function `car-device` verifies the signature (action
-- "diag_put") and calls car_submit_diag_part (service role only), which runs the common guard car_device_accept first (replay,
-- freshness, 120 calls/hour, revocation, bound vehicle). On top: at most 5 uploads per vehicle per 24 h, 40 parts of 24 000
-- base64 characters each (< 1 MB), parts > 0 only for an upload this vehicle started in the last 24 h.
-- Retention: incomplete uploads older than 24 h, and every upload older than 90 days, are deleted when the vehicle starts a new
-- one; at most 20 per vehicle are kept (the oldest go). Members and moderators can delete one at any time.
--
-- Anon surface added: none. Apply with `npx supabase db push`, deploy the Edge Function, then `npm run gen:types`.

-- 1. Tables ---------------------------------------------------------------------------

create table if not exists public.car_diagnostics (
  id uuid primary key,                                       -- the upload id chosen by the car
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  parts smallint not null check (parts between 1 and 40),
  received smallint not null default 0 check (received between 0 and 40),
  note text not null default '' check (char_length(note) <= 600),
  apps jsonb not null default '[]'::jsonb check (jsonb_typeof(apps) = 'array' and jsonb_array_length(apps) <= 16),
  complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists car_diagnostics_vehicle_idx on public.car_diagnostics (vehicle_id, created_at desc);
create index if not exists car_diagnostics_created_idx on public.car_diagnostics (created_at desc);

create table if not exists public.car_diagnostic_parts (
  diagnostic_id uuid not null references public.car_diagnostics (id) on delete cascade,
  part smallint not null check (part between 0 and 39),
  data text not null check (char_length(data) between 4 and 24000 and data ~ '^[A-Za-z0-9+/]*={0,2}$'),
  primary key (diagnostic_id, part)
);

comment on table public.car_diagnostics is
  'Diagnostics sent from the linked car (specs/car-diagnostics.md). Written only by car_submit_diag_part; members and moderators read.';
comment on table public.car_diagnostic_parts is
  'base64 slices of gzip(report JSON) of a car diagnostic, in order (part 0..parts-1).';

alter table public.car_diagnostics enable row level security;
alter table public.car_diagnostic_parts enable row level security;
revoke all on public.car_diagnostics from anon, authenticated;
revoke all on public.car_diagnostic_parts from anon, authenticated;
grant select, delete on public.car_diagnostics to authenticated;
grant select on public.car_diagnostic_parts to authenticated;

-- Readers: the vehicle's members, and non-banned moderators (who maintain the apps).
create or replace function public.can_read_car_diagnostic(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_vehicle_id = public.current_user_vehicle_id()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_moderator and p.banned_at is null);
$$;

revoke execute on function public.can_read_car_diagnostic(uuid) from public, anon;
grant execute on function public.can_read_car_diagnostic(uuid) to authenticated;

create policy "members and moderators can read car diagnostics"
  on public.car_diagnostics for select
  to authenticated
  using (public.can_read_car_diagnostic(vehicle_id));

create policy "members and moderators can delete car diagnostics"
  on public.car_diagnostics for delete
  to authenticated
  using (public.can_read_car_diagnostic(vehicle_id));

create policy "members and moderators can read car diagnostic parts"
  on public.car_diagnostic_parts for select
  to authenticated
  using (exists (select 1 from public.car_diagnostics d
                 where d.id = diagnostic_id and public.can_read_car_diagnostic(d.vehicle_id)));

-- No insert/update policy: writes only through car_submit_diag_part.

-- 2. The signed call ------------------------------------------------------------------

-- One part of an upload. p_note / p_apps are given with part 0 only (null otherwise). Returns
-- {"ok":true,"received":n,"parts":m,"complete":bool}, {"error":<guard reason>}, {"error":"rate_limited"} or {"error":"bad_request"}.
-- A repeated part (a retry after a lost reply) replaces the same slice: harmless.
create or replace function public.car_submit_diag_part(
  p_device_id uuid,
  p_ts bigint,
  p_upload_id uuid,
  p_part integer,
  p_parts integer,
  p_note text,
  p_apps jsonb,
  p_data text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  max_per_day constant integer := 5;
  keep_per_vehicle constant integer := 20;
  g record;
  d public.car_diagnostics;
  v_received integer;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;

  if p_upload_id is null or p_parts is null or p_parts < 1 or p_parts > 40
     or p_part is null or p_part < 0 or p_part >= p_parts
     or p_data is null or char_length(p_data) < 4 or char_length(p_data) > 24000 or p_data !~ '^[A-Za-z0-9+/]*={0,2}$' then
    return jsonb_build_object('error', 'bad_request');
  end if;

  select * into d from public.car_diagnostics where id = p_upload_id for update;

  if d.id is null then
    if p_part <> 0 or p_note is null or char_length(p_note) > 600
       or p_apps is null or jsonb_typeof(p_apps) <> 'array' or jsonb_array_length(p_apps) > 16 then
      return jsonb_build_object('error', 'bad_request');
    end if;
    -- housekeeping for this vehicle: stale incomplete uploads and old reports
    delete from public.car_diagnostics x
     where x.vehicle_id = g.accepted_vehicle
       and ((not x.complete and x.created_at < now() - interval '24 hours') or x.created_at < now() - interval '90 days');
    if (select count(*) from public.car_diagnostics x
         where x.vehicle_id = g.accepted_vehicle and x.created_at > now() - interval '24 hours') >= max_per_day then
      return jsonb_build_object('error', 'rate_limited');
    end if;
    insert into public.car_diagnostics (id, vehicle_id, device_id, parts, note, apps)
    values (p_upload_id, g.accepted_vehicle, p_device_id, p_parts, p_note, p_apps)
    returning * into d;
    delete from public.car_diagnostics x
     where x.vehicle_id = g.accepted_vehicle
       and x.id in (select id from public.car_diagnostics
                     where vehicle_id = g.accepted_vehicle order by created_at desc offset keep_per_vehicle);
  elsif d.vehicle_id <> g.accepted_vehicle or d.parts <> p_parts or d.created_at < now() - interval '24 hours'
        or (p_part > 0 and (p_note is not null or p_apps is not null)) then
    return jsonb_build_object('error', 'bad_request');
  end if;

  insert into public.car_diagnostic_parts (diagnostic_id, part, data)
  values (d.id, p_part, p_data)
  on conflict (diagnostic_id, part) do update set data = excluded.data;

  select count(*) into v_received from public.car_diagnostic_parts where diagnostic_id = d.id;
  update public.car_diagnostics
     set received = v_received,
         complete = v_received = d.parts,
         completed_at = case when v_received = d.parts then coalesce(completed_at, now()) else null end
   where id = d.id;

  return jsonb_build_object('ok', true, 'received', v_received, 'parts', d.parts, 'complete', v_received = d.parts);
exception when others then
  return jsonb_build_object('error', 'bad_request');
end;
$$;

-- 3. Privileges -----------------------------------------------------------------------

revoke execute on function public.car_submit_diag_part(uuid, bigint, uuid, integer, integer, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.car_submit_diag_part(uuid, bigint, uuid, integer, integer, text, jsonb, text) to service_role;
