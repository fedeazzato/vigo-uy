-- Bóveda inbox (specs/vault-onboarding.md Phase C): the linked car sends the
-- dashcam's 24 recovery words into the owner's vault without a second QR scan,
-- and WikiVigo still only ever stores ciphertext.
--
--   browser: ECDH P-256 key pair; private key stored as a vault item
--            (kind 'vault_inbox_private_key', encrypted with the vault data key);
--            public key published in vault_inbox_keys (one per user, key_id
--            changes on every rotation).
--   car:     fetches that public key through car-device (device-signed), ECIES:
--            ephemeral ECDH + HKDF-SHA-256 + AES-256-GCM (AAD binds user, kind,
--            key_id), uploads epk/iv/ciphertext into vault_inbox.
--   browser: unwraps the private key with the passkey, decrypts, stores a normal
--            'dashcam_recovery' item, deletes the inbox row.
--
-- Number 0049: 0048 is taken by the unmerged car-status-e1 branch. Apply with
-- `npx supabase db push`, then `npm run gen:types` (the hand-written types in
-- src/lib/database.types.ts match this file), deploy car-device, and build the
-- web with VITE_VAULT_INBOX=1 to show the UI.

-- 1. The inbox private key is one more vault item kind.
alter table public.vault_items drop constraint if exists vault_items_kind_check;
alter table public.vault_items
  add constraint vault_items_kind_check
  check (kind in ('dashcam_recovery', 'settings_backup_passphrase', 'vault_inbox_private_key'));

-- 2. One inbox public key per user.
create table public.vault_inbox_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_id uuid not null default gen_random_uuid(),
  public_key text not null check (public.is_p256_spki(public_key)),
  created_at timestamptz not null default now()
);

comment on table public.vault_inbox_keys is
  'Bóveda inbox: the user''s ECDH P-256 public key (SPKI base64) the linked car encrypts to. Own rows only for clients; cars read it through car_vault_inbox_key. specs/vault-onboarding.md Phase C';

-- 3. What the car sent, still encrypted (at most one row per user and kind).
create table public.vault_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid references public.car_devices (id) on delete set null,
  kind text not null check (kind in ('dashcam_recovery')),
  key_id uuid not null,
  -- The car's ephemeral ECDH public key (SPKI base64).
  epk text not null check (public.is_p256_spki(epk)),
  -- AES-GCM IV, 12 bytes.
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  -- AES-GCM ciphertext || tag of the canonical words (24 words < 300 bytes).
  ciphertext text not null check (
    ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'
    and char_length(ciphertext) between 24 and 1400
    and char_length(ciphertext) % 4 = 0
  ),
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

comment on table public.vault_inbox is
  'Bóveda inbox: ECIES ciphertext sent by a linked car (never plaintext). Clients may read/delete their own rows; only car_vault_inbox_put inserts. specs/vault-onboarding.md Phase C';

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated; take them back and grant only what the page needs.
alter table public.vault_inbox_keys enable row level security;
alter table public.vault_inbox enable row level security;
revoke all on public.vault_inbox_keys from anon, authenticated;
revoke all on public.vault_inbox from anon, authenticated;

grant select, delete on public.vault_inbox_keys to authenticated;
grant insert (public_key) on public.vault_inbox_keys to authenticated;
grant select, delete on public.vault_inbox to authenticated;

create policy "owners can select their inbox key"
  on public.vault_inbox_keys for select to authenticated using (user_id = auth.uid());
create policy "owners can insert their inbox key"
  on public.vault_inbox_keys for insert to authenticated with check (user_id = auth.uid());
create policy "owners can delete their inbox key"
  on public.vault_inbox_keys for delete to authenticated using (user_id = auth.uid());

create policy "owners can select their inbox"
  on public.vault_inbox for select to authenticated using (user_id = auth.uid());
create policy "owners can delete their inbox"
  on public.vault_inbox for delete to authenticated using (user_id = auth.uid());

-- The key counts as a vault write (same daily limit as items and passkeys).
create trigger vault_inbox_keys_20_write_limit
  before insert on public.vault_inbox_keys
  for each row execute function public.enforce_vault_write_limit();

-- 4. Car side (service role only, called by the car-device Edge Function after
-- it verified the device signature). The recipient is the member who paired
-- the device, while still a member of the device's vehicle.
create function public.car_vault_recipient(p_device_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.created_by
  from public.car_devices d
  where d.id = p_device_id
    and d.created_by is not null
    and exists (
      select 1 from public.vehicle_members m
      where m.vehicle_id = d.vehicle_id and m.user_id = d.created_by
    );
$$;

create function public.car_vault_inbox_key(p_device_id uuid, p_ts bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_user uuid;
  v_key public.vault_inbox_keys;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  v_user := public.car_vault_recipient(p_device_id);
  if v_user is null then
    return jsonb_build_object('error', 'no_inbox');
  end if;
  select * into v_key from public.vault_inbox_keys k where k.user_id = v_user;
  if v_key.user_id is null then
    return jsonb_build_object('error', 'no_inbox');
  end if;
  return jsonb_build_object('user_id', v_user, 'key_id', v_key.key_id, 'public_key', v_key.public_key);
end;
$$;

create function public.car_vault_inbox_put(
  p_device_id uuid,
  p_ts bigint,
  p_kind text,
  p_key_id uuid,
  p_epk text,
  p_iv text,
  p_ciphertext text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  g record;
  v_user uuid;
  v_key uuid;
begin
  select * into g from public.car_device_accept(p_device_id, p_ts);
  if g.reject_reason is not null then
    return jsonb_build_object('error', g.reject_reason);
  end if;
  v_user := public.car_vault_recipient(p_device_id);
  if v_user is null then
    return jsonb_build_object('error', 'no_inbox');
  end if;
  select k.key_id into v_key from public.vault_inbox_keys k where k.user_id = v_user;
  if v_key is null then
    return jsonb_build_object('error', 'no_inbox');
  end if;
  -- Encrypted to a rotated (old) key: the browser could not open it.
  if v_key <> p_key_id then
    return jsonb_build_object('error', 'stale_key');
  end if;
  -- The newest sending replaces an older one of the same kind.
  delete from public.vault_inbox i where i.user_id = v_user and i.kind = p_kind;
  insert into public.vault_inbox (user_id, device_id, kind, key_id, epk, iv, ciphertext)
  values (v_user, p_device_id, p_kind, p_key_id, p_epk, p_iv, p_ciphertext);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.car_vault_recipient(uuid) from public, anon, authenticated;
revoke execute on function public.car_vault_inbox_key(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.car_vault_inbox_put(uuid, bigint, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.car_vault_inbox_key(uuid, bigint) to service_role;
grant execute on function public.car_vault_inbox_put(uuid, bigint, text, uuid, text, text, text) to service_role;
