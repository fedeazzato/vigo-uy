-- Audit item D2: moderator-verified community content.
-- Adds `verified` to the three content tables. Verified rows render with the
-- "Oficial" badge — the end state of the static→dynamic content transition:
-- curation happens in the database, not in hand-edited JSON.
--
-- Security: users can UPDATE their own rows, so a plain column would be
-- self-assignable. A before-insert-or-update trigger reverts any change to
-- `verified` unless the caller is a non-banned moderator. Like 0008, the
-- trigger only intervenes when auth.uid() is not null, so the SQL Editor
-- bootstrap path (runs as postgres, no JWT) keeps working.
-- Apply with `npx supabase db push`.

alter table public.service_entries add column verified boolean not null default false;
alter table public.trip_logs add column verified boolean not null default false;
alter table public.part_purchases add column verified boolean not null default false;

-- Boolean moderator check (assert_moderator raises; policies and triggers
-- sometimes need the non-raising form). SECURITY DEFINER so it can read
-- profiles regardless of the caller's RLS visibility.
create or replace function public.is_active_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and is_moderator and banned_at is null
  );
$$;

revoke execute on function public.is_active_moderator(uuid) from public, anon;
grant execute on function public.is_active_moderator(uuid) to authenticated;

create or replace function public.prevent_unauthorized_verify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT (SQL Editor / server-side maintenance): leave untouched.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Users must not insert pre-verified rows.
    if new.verified and not public.is_active_moderator(auth.uid()) then
      new.verified := false;
    end if;
  elsif new.verified is distinct from old.verified
    and not public.is_active_moderator(auth.uid()) then
    -- Silently revert: the rest of the update still applies.
    new.verified := old.verified;
  end if;

  return new;
end;
$$;

create trigger protect_service_entry_verified
  before insert or update on public.service_entries
  for each row execute function public.prevent_unauthorized_verify();

create trigger protect_trip_log_verified
  before insert or update on public.trip_logs
  for each row execute function public.prevent_unauthorized_verify();

create trigger protect_part_purchase_verified
  before insert or update on public.part_purchases
  for each row execute function public.prevent_unauthorized_verify();
