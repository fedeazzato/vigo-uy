-- Fix: «Permitir que el auto envíe la frase» (Bóveda › Recibir la frase desde
-- el auto) always failed with "No tenés permiso para hacer eso" (owner car
-- session 2026-11-26).
--
-- Cause: vault_inbox_keys.public_key (0049) is checked by
-- public.is_p256_spki(), and 0045 revoked EXECUTE on that helper from
-- authenticated on the assumption that only SECURITY DEFINER functions write
-- the tables that use it. vault_inbox_keys is the one table the browser
-- inserts into directly, so Postgres evaluates the CHECK as `authenticated`
-- and refuses: SQLSTATE 42501 "permission denied for function is_p256_spki"
-- (reproduced on Postgres/PGlite with 0049's grants and policies). The page
-- maps 42501 to the generic not-allowed message.
--
-- Fix: the same canonical-SPKI pattern inline, so the CHECK needs no function
-- privilege. is_p256_spki stays unreachable from clients (0045's intent), and
-- the definer-only tables (car_devices, car_pairing_requests, vault_inbox.epk)
-- keep their constraint unchanged. Rows already in the table (none can exist:
-- every insert failed) are re-validated by the ADD CONSTRAINT.
--
-- Apply with `npx supabase db push`; no type changes.

do $$
declare
  c record;
begin
  -- The constraint was unnamed in 0049 (normally vault_inbox_keys_public_key_check);
  -- drop whatever CHECK on this table calls is_p256_spki.
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.vault_inbox_keys'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%is_p256_spki%'
  loop
    execute format('alter table public.vault_inbox_keys drop constraint %I', c.conname);
  end loop;
end;
$$;

-- Same pattern as public.is_p256_spki (0045): canonical base64 of an
-- uncompressed P-256 X.509 SubjectPublicKeyInfo (fixed 27-byte DER prefix +
-- 64-byte point). The browser validated the point when it generated the key.
alter table public.vault_inbox_keys
  add constraint vault_inbox_keys_public_key_check
  check (public_key ~ '^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$');
