-- Audit item A2: stop leaking email local-parts as public display names.
-- handle_new_user() defaulted display_name to split_part(email, '@', 1), and
-- public_profiles exposes display_name to anon — so every user who never
-- edited their name had part of their email published to the open internet.
-- New default: 'Miembro NNNN' (4 random digits, uniqueness not required).
-- Mi Vigo prompts users with a placeholder name to pick a real one.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Re-run note: everything here is safely re-runnable (create or replace +
-- an idempotent backfill UPDATE).

-- 1. handle_new_user: based on the 0015 version (vehicle provisioning must
--    stay intact); only the display name default changes.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_vehicle_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Miembro ' || lpad((floor(random() * 10000))::int::text, 4, '0'));

  insert into public.vehicles (join_code, created_by)
  values (public.generate_join_code(), new.id)
  returning id into new_vehicle_id;

  insert into public.vehicle_members (vehicle_id, user_id)
  values (new_vehicle_id, new.id);

  return new;
end;
$$;

-- 2. Backfill: any profile still named exactly like its email local-part
--    gets a neutral name. Runs as postgres in the SQL Editor, so joining
--    auth.users is fine. Accepted edge case: a user who deliberately chose
--    a name identical to their email local-part gets renamed too.

update public.profiles p
set display_name = 'Miembro ' || lpad((floor(random() * 10000))::int::text, 4, '0')
from auth.users u
where u.id = p.id
  and p.display_name = split_part(u.email, '@', 1);

-- Verification (run separately; must return 0 rows):
--   select p.id
--   from public.profiles p
--   join auth.users u on u.id = p.id
--   where p.display_name = split_part(u.email, '@', 1);
