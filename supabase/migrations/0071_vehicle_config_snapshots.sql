-- C4 "Vehicle config fingerprint" (specs/vehicle-config-fingerprint.md): the car's factory configuration bytes (props
-- sys.df.vehicle_config_head / _tail: market, options) and the decoded items 119/134/161 + GPS source flag, as the installer reads
-- them (installer/car/install_all.sh fingerprint) at install, "Antes del service" and "Después del service". The owner uploads the
-- installer's file "configuracion_del_auto.txt" on Mi Vigo > Configuración del auto and compares two snapshots
-- ("el taller cambió el mercado").
--
-- PRIVATE ONLY: rows belong to ONE account (user_id). Not readable by other members of the same vehicle, not by moderators, never by
-- anon, no aggregate, no function exposes them. The bytes identify the car's build options, so they are treated like the vault.
--
-- NOT APPLIED (owner OK required). Apply with `npx supabase db push`, then `npm run gen:types`.

create table if not exists public.vehicle_config_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (label in ('instalacion', 'antes_del_service', 'despues_del_service', 'manual')),
  taken_at timestamptz not null,
  firmware text check (firmware ~ '^[A-Za-z0-9_.-]{1,80}$'),
  -- decimal bytes separated by '-', as getprop prints them (24+ bytes in head+tail on the owner's car)
  config_head text not null check (config_head ~ '^[0-9]{1,3}(-[0-9]{1,3}){0,127}$'),
  config_tail text not null check (config_tail ~ '^([0-9]{1,3}(-[0-9]{1,3}){0,127})?$'),
  -- decoded items, e.g. {"item119":1,"item134":6,"item161":0,"gps_source":"1"}: only short scalar values
  items jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object' and octet_length(items::text) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_config_snapshots_user_idx on public.vehicle_config_snapshots (user_id, taken_at desc);

comment on table public.vehicle_config_snapshots is
  'C4: private vehicle config fingerprints (installer file), one account only. Never public, never shared with vehicle members.';

alter table public.vehicle_config_snapshots enable row level security;
revoke all on public.vehicle_config_snapshots from anon, authenticated;
grant select, insert, delete on public.vehicle_config_snapshots to authenticated;

create policy "own config snapshots: select" on public.vehicle_config_snapshots for select to authenticated
  using (user_id = auth.uid());
create policy "own config snapshots: insert" on public.vehicle_config_snapshots for insert to authenticated
  with check (user_id = auth.uid());
create policy "own config snapshots: delete" on public.vehicle_config_snapshots for delete to authenticated
  using (user_id = auth.uid());

-- At most 50 snapshots per account (a dealer visit makes two).
create or replace function public.vehicle_config_snapshots_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.vehicle_config_snapshots s where s.user_id = new.user_id) >= 50 then
    raise exception 'Límite de 50 copias de la configuración: borrá alguna vieja.';
  end if;
  return new;
end;
$$;

revoke all on function public.vehicle_config_snapshots_limit() from public, anon, authenticated;

drop trigger if exists vehicle_config_snapshots_limit on public.vehicle_config_snapshots;
create trigger vehicle_config_snapshots_limit
  before insert on public.vehicle_config_snapshots
  for each row execute function public.vehicle_config_snapshots_limit();
