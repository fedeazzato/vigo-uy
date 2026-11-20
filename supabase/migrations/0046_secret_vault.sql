-- Bóveda (specs/secret-vault.md): end-to-end encrypted secrets unlocked with
-- a passkey (WebAuthn PRF). The browser derives a key-encryption key from
-- each passkey's PRF output and wraps one random data key per user with it;
-- the data key encrypts each item (AES-256-GCM). This database only ever
-- stores CIPHERTEXT: wrapped data keys, PRF salts, credential ids and
-- encrypted items. It never sees a plaintext secret or an unwrapped key, and
-- it never verifies WebAuthn assertions (the passkey is a key-derivation
-- device, not a login; see the spec's R2 and threat model).
--
-- Access: own rows only, for authenticated sessions. Nothing here is
-- reachable by anon, by vehicle mates, by moderators or through any view.
-- Apply with `npx supabase db push`, then run `npm run gen:types`.

-- 1. Tables ---------------------------------------------------------------------

-- One row per enrolled passkey: its own wrap of the user's data key.
create table public.vault_keys (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- WebAuthn rawId, base64url without padding (the spec allows up to 1023
  -- bytes). Length checked apart: Postgres regex repetition counts stop at 255.
  credential_id text not null check (
    credential_id ~ '^[A-Za-z0-9_-]+$'
    and char_length(credential_id) between 16 and 1400
  ),
  -- Random 32-byte PRF input for this passkey (canonical base64).
  prf_salt text not null check (prf_salt ~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$'),
  -- AES-256-GCM wrap of the 32-byte data key: IV 12 || ciphertext 32 || tag 16 = 60 bytes.
  wrapped_dk text not null check (wrapped_dk ~ '^[A-Za-z0-9+/]{80}$'),
  -- User-chosen, non-secret ("Teléfono Android").
  label text not null check (
    char_length(label) between 1 and 40
    and label = btrim(label)
    and label !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  primary key (user_id, credential_id)
);

comment on table public.vault_keys is
  'Bóveda: one wrapped data key per passkey (ciphertext only). Own rows only; never anon. specs/secret-vault.md';

-- One row per secret kind and user.
create table public.vault_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('dashcam_recovery', 'settings_backup_passphrase')),
  -- Envelope format version (part of the AAD).
  version smallint not null default 1 check (version = 1),
  -- AES-GCM IV, 12 bytes (base64, no padding needed).
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  -- AES-GCM ciphertext || tag. The client always writes 528 bytes (512-byte
  -- padded plaintext + 16-byte tag = 704 base64 chars); the cap leaves room
  -- for a later format version without allowing a blob store.
  ciphertext text not null check (
    ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'
    and char_length(ciphertext) between 24 and 2800
    and char_length(ciphertext) % 4 = 0
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.vault_items is
  'Bóveda: AES-GCM ciphertext of a secret (never plaintext). Own rows only; never anon. specs/secret-vault.md';

-- Every insert/update on the two tables, for the daily write limit. Only the
-- SECURITY DEFINER trigger below touches it.
create table public.vault_write_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

create index vault_write_log_user_time_idx on public.vault_write_log (user_id, at);

-- 2. RLS and privileges -------------------------------------------------------------
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated; take everything back and grant only what the page needs.
-- user_id is never client-writable: it always comes from `default auth.uid()`.

alter table public.vault_keys enable row level security;
alter table public.vault_items enable row level security;
alter table public.vault_write_log enable row level security;

revoke all on public.vault_keys from anon, authenticated;
revoke all on public.vault_items from anon, authenticated;
revoke all on public.vault_write_log from anon, authenticated;

grant select, delete on public.vault_keys to authenticated;
grant insert (credential_id, prf_salt, wrapped_dk, label) on public.vault_keys to authenticated;

grant select, delete on public.vault_items to authenticated;
grant insert (kind, version, iv, ciphertext) on public.vault_items to authenticated;
grant update (version, iv, ciphertext) on public.vault_items to authenticated;

create policy "owners can select their vault keys"
  on public.vault_keys for select
  to authenticated
  using (user_id = auth.uid());

create policy "owners can insert their vault keys"
  on public.vault_keys for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "owners can delete their vault keys"
  on public.vault_keys for delete
  to authenticated
  using (user_id = auth.uid());

create policy "owners can select their vault items"
  on public.vault_items for select
  to authenticated
  using (user_id = auth.uid());

create policy "owners can insert their vault items"
  on public.vault_items for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "owners can update their vault items"
  on public.vault_items for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owners can delete their vault items"
  on public.vault_items for delete
  to authenticated
  using (user_id = auth.uid());

-- vault_write_log: RLS on, no policies, no grants = unreachable from clients.

-- 3. Limits ----------------------------------------------------------------------------

-- 20 inserts/updates per user in a rolling 24 h window across both tables
-- (the same 20/day as enforce_daily_insert_limit, 0009). Deletes are never
-- limited: removing a lost passkey must always work, and deletes cannot
-- flood because the row count is bounded. The advisory lock serialises one
-- user's concurrent writes so two of them cannot both pass at the limit.
create function public.enforce_vault_write_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_per_day constant integer := 20;
  recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('vault_write_limit'), hashtext(new.user_id::text));

  delete from public.vault_write_log l
  where l.user_id = new.user_id and l.at < now() - interval '2 days';

  select count(*) into recent_count
  from public.vault_write_log l
  where l.user_id = new.user_id and l.at > now() - interval '1 day';

  if recent_count >= max_per_day then
    raise exception 'Límite diario de % cambios en la bóveda alcanzado. Probá de nuevo mañana.', max_per_day;
  end if;

  insert into public.vault_write_log (user_id) values (new.user_id);
  return new;
end;
$$;

-- At most 10 passkeys per user.
create function public.enforce_vault_key_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_keys constant integer := 10;
begin
  perform pg_advisory_xact_lock(hashtext('vault_key_cap'), hashtext(new.user_id::text));
  if (select count(*) from public.vault_keys k where k.user_id = new.user_id) >= max_keys then
    raise exception 'Ya tenés % llaves en la bóveda. Quitá una antes de agregar otra.', max_keys;
  end if;
  return new;
end;
$$;

create function public.touch_vault_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Triggers of one event fire in name order: the cap first, then the log.
create trigger vault_keys_10_cap
  before insert on public.vault_keys
  for each row execute function public.enforce_vault_key_cap();

create trigger vault_keys_20_write_limit
  before insert on public.vault_keys
  for each row execute function public.enforce_vault_write_limit();

create trigger vault_items_10_touch
  before update on public.vault_items
  for each row execute function public.touch_vault_item();

create trigger vault_items_20_write_limit
  before insert or update on public.vault_items
  for each row execute function public.enforce_vault_write_limit();

-- Trigger functions run regardless of EXECUTE; nobody needs to call them
-- directly. Supabase's default privileges grant EXECUTE to anon,
-- authenticated and service_role independently of PUBLIC (0015 section 5).
revoke execute on function public.enforce_vault_write_limit() from public, anon, authenticated, service_role;
revoke execute on function public.enforce_vault_key_cap() from public, anon, authenticated, service_role;
revoke execute on function public.touch_vault_item() from public, anon, authenticated, service_role;
