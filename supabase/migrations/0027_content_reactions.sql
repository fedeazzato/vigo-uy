-- Thumbs-up + short comments on community content (service_entries,
-- trip_logs, part_purchases). Deliberately NOT extended to curated JSON
-- content (FAQ, routes): that content is already on a path to retirement as
-- community rows accumulate (preferCommunity(), specs/CONTENT-MIGRATION.md),
-- so it isn't worth a table+RLS surface for something meant to disappear.
--
-- One pair of tables for all three content kinds instead of six bespoke
-- tables: each row targets exactly one of three nullable FK columns (real
-- FKs, not a text discriminator + loose id, since every target here is an
-- actual database row -- gives automatic ON DELETE CASCADE and referential
-- integrity for free). Adding a fourth community content type later is one
-- more nullable column + one more OR-branch in each policy, not a new table.
-- Apply with `npx supabase db push`.

create table public.content_reactions (
  id uuid primary key default gen_random_uuid(),
  service_entry_id uuid references public.service_entries (id) on delete cascade,
  trip_log_id uuid references public.trip_logs (id) on delete cascade,
  part_purchase_id uuid references public.part_purchases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(service_entry_id, trip_log_id, part_purchase_id) = 1),
  -- Toggle, not a counter: one like per user per content row. NULLs in the
  -- other two columns don't collide across rows (Postgres treats NULL <>
  -- NULL in unique constraints), so these only constrain within their own type.
  unique (service_entry_id, user_id),
  unique (trip_log_id, user_id),
  unique (part_purchase_id, user_id)
);

create index content_reactions_service_entry_idx on public.content_reactions (service_entry_id)
  where service_entry_id is not null;
create index content_reactions_trip_log_idx on public.content_reactions (trip_log_id)
  where trip_log_id is not null;
create index content_reactions_part_purchase_idx on public.content_reactions (part_purchase_id)
  where part_purchase_id is not null;

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  service_entry_id uuid references public.service_entries (id) on delete cascade,
  trip_log_id uuid references public.trip_logs (id) on delete cascade,
  part_purchase_id uuid references public.part_purchases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) <= 280),
  created_at timestamptz not null default now(),
  check (num_nonnulls(service_entry_id, trip_log_id, part_purchase_id) = 1)
  -- No unique(_, user_id): unlike reactions, multiple comments from the same
  -- user over time are fine. No update policy either (immutable, same as
  -- station_reports): editing is delete + repost.
);

create index content_comments_service_entry_idx on public.content_comments (service_entry_id)
  where service_entry_id is not null;
create index content_comments_trip_log_idx on public.content_comments (trip_log_id)
  where trip_log_id is not null;
create index content_comments_part_purchase_idx on public.content_comments (part_purchase_id)
  where part_purchase_id is not null;

alter table public.content_reactions enable row level security;
alter table public.content_comments enable row level security;

-- Visibility mirrors each target table's own RLS exactly (is_public, not
-- hidden, author not banned) -- a like/comment on a private or hidden row
-- must not leak that the row exists to someone who couldn't see it directly.

create policy "anon selects reactions on public non-hidden content"
  on public.content_reactions for select
  to anon
  using (
    not public.is_user_banned(user_id)
    and (
      (service_entry_id is not null and exists (
        select 1 from public.service_entries s
        where s.id = service_entry_id and s.is_public and not s.hidden and not public.is_user_banned(s.user_id)
      ))
      or (trip_log_id is not null and exists (
        select 1 from public.trip_logs t
        where t.id = trip_log_id and t.is_public and not t.hidden and not public.is_user_banned(t.user_id)
      ))
      or (part_purchase_id is not null and exists (
        select 1 from public.part_purchases p
        where p.id = part_purchase_id and p.is_public and not p.hidden and not public.is_user_banned(p.user_id)
      ))
    )
  );

create policy "select own reactions, on visible content, or moderator on public content"
  on public.content_reactions for select
  to authenticated
  using (
    auth.uid() = user_id
    or (
      not public.is_user_banned(user_id)
      and (
        (service_entry_id is not null and exists (
          select 1 from public.service_entries s where s.id = service_entry_id
          and (
            (s.is_public and not s.hidden and not public.is_user_banned(s.user_id))
            or s.user_id = auth.uid()
            or (s.is_public and public.is_active_moderator(auth.uid()))
          )
        ))
        or (trip_log_id is not null and exists (
          select 1 from public.trip_logs t where t.id = trip_log_id
          and (
            (t.is_public and not t.hidden and not public.is_user_banned(t.user_id))
            or t.user_id = auth.uid()
            or (t.is_public and public.is_active_moderator(auth.uid()))
          )
        ))
        or (part_purchase_id is not null and exists (
          select 1 from public.part_purchases p where p.id = part_purchase_id
          and (
            (p.is_public and not p.hidden and not public.is_user_banned(p.user_id))
            or p.user_id = auth.uid()
            or (p.is_public and public.is_active_moderator(auth.uid()))
          )
        ))
      )
    )
  );

create policy "users can react to content they can see"
  on public.content_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_user_banned(auth.uid())
    and (
      (service_entry_id is not null and exists (
        select 1 from public.service_entries s where s.id = service_entry_id
        and (s.user_id = auth.uid() or (s.is_public and not s.hidden and not public.is_user_banned(s.user_id)))
      ))
      or (trip_log_id is not null and exists (
        select 1 from public.trip_logs t where t.id = trip_log_id
        and (t.user_id = auth.uid() or (t.is_public and not t.hidden and not public.is_user_banned(t.user_id)))
      ))
      or (part_purchase_id is not null and exists (
        select 1 from public.part_purchases p where p.id = part_purchase_id
        and (p.user_id = auth.uid() or (p.is_public and not p.hidden and not public.is_user_banned(p.user_id)))
      ))
    )
  );

create policy "users can remove their own reactions, moderators any"
  on public.content_reactions for delete
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

-- content_comments: identical shape.

create policy "anon selects comments on public non-hidden content"
  on public.content_comments for select
  to anon
  using (
    not public.is_user_banned(user_id)
    and (
      (service_entry_id is not null and exists (
        select 1 from public.service_entries s
        where s.id = service_entry_id and s.is_public and not s.hidden and not public.is_user_banned(s.user_id)
      ))
      or (trip_log_id is not null and exists (
        select 1 from public.trip_logs t
        where t.id = trip_log_id and t.is_public and not t.hidden and not public.is_user_banned(t.user_id)
      ))
      or (part_purchase_id is not null and exists (
        select 1 from public.part_purchases p
        where p.id = part_purchase_id and p.is_public and not p.hidden and not public.is_user_banned(p.user_id)
      ))
    )
  );

create policy "select own comments, on visible content, or moderator on public content"
  on public.content_comments for select
  to authenticated
  using (
    auth.uid() = user_id
    or (
      not public.is_user_banned(user_id)
      and (
        (service_entry_id is not null and exists (
          select 1 from public.service_entries s where s.id = service_entry_id
          and (
            (s.is_public and not s.hidden and not public.is_user_banned(s.user_id))
            or s.user_id = auth.uid()
            or (s.is_public and public.is_active_moderator(auth.uid()))
          )
        ))
        or (trip_log_id is not null and exists (
          select 1 from public.trip_logs t where t.id = trip_log_id
          and (
            (t.is_public and not t.hidden and not public.is_user_banned(t.user_id))
            or t.user_id = auth.uid()
            or (t.is_public and public.is_active_moderator(auth.uid()))
          )
        ))
        or (part_purchase_id is not null and exists (
          select 1 from public.part_purchases p where p.id = part_purchase_id
          and (
            (p.is_public and not p.hidden and not public.is_user_banned(p.user_id))
            or p.user_id = auth.uid()
            or (p.is_public and public.is_active_moderator(auth.uid()))
          )
        ))
      )
    )
  );

create policy "users can comment on content they can see"
  on public.content_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_user_banned(auth.uid())
    and (
      (service_entry_id is not null and exists (
        select 1 from public.service_entries s where s.id = service_entry_id
        and (s.user_id = auth.uid() or (s.is_public and not s.hidden and not public.is_user_banned(s.user_id)))
      ))
      or (trip_log_id is not null and exists (
        select 1 from public.trip_logs t where t.id = trip_log_id
        and (t.user_id = auth.uid() or (t.is_public and not t.hidden and not public.is_user_banned(t.user_id)))
      ))
      or (part_purchase_id is not null and exists (
        select 1 from public.part_purchases p where p.id = part_purchase_id
        and (p.user_id = auth.uid() or (p.is_public and not p.hidden and not public.is_user_banned(p.user_id)))
      ))
    )
  );

create policy "users can remove their own comments, moderators any"
  on public.content_comments for delete
  to authenticated
  using (auth.uid() = user_id or public.is_active_moderator(auth.uid()));

-- Same generic anti-spam cap as everywhere else: 20/day, per table.

create trigger limit_content_reactions_per_day
  before insert on public.content_reactions
  for each row execute function public.enforce_daily_insert_limit();

create trigger limit_content_comments_per_day
  before insert on public.content_comments
  for each row execute function public.enforce_daily_insert_limit();

-- Aggregate like counts; security_invoker means the caller's own RLS on
-- content_reactions (above) filters the rows before they're grouped.
create view public.content_reaction_counts
with (security_invoker = true) as
select
  service_entry_id,
  trip_log_id,
  part_purchase_id,
  count(*) as like_count
from public.content_reactions
group by service_entry_id, trip_log_id, part_purchase_id;

grant select on public.content_reaction_counts to anon, authenticated;
