-- Security fix: the profiles UPDATE policy (auth.uid() = id) only checks row
-- ownership, not which columns change -- meaning any authenticated user could
-- currently self-promote via `update profiles set is_moderator = true where
-- id = auth.uid()` through the normal API, since RLS operates at the row
-- level, not the column level.
--
-- This trigger forces is_moderator back to its previous value whenever an
-- update happens through an authenticated client session (auth.uid() is not
-- null in that context). Direct SQL (e.g. the Supabase SQL Editor) runs
-- without a JWT context, so auth.uid() is null there and the intended
-- promotion path -- "set the first moderator(s) manually via SQL" -- still
-- works.
-- Apply by pasting into the Supabase SQL Editor (Project -> SQL Editor -> New query).

create function public.prevent_is_moderator_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.is_moderator is distinct from old.is_moderator then
    new.is_moderator := old.is_moderator;
  end if;
  return new;
end;
$$;

create trigger prevent_is_moderator_self_update
  before update on public.profiles
  for each row execute function public.prevent_is_moderator_self_update();
