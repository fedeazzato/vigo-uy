-- Site search (v1): plain Postgres full-text search over community content,
-- no LLM/embeddings. See specs/site-search.md. Curated-content search (the
-- other half of the feature) is entirely client-side against already-
-- imported JSON, so it needs no migration.
--
-- Plain `language sql stable` function, deliberately NOT `security definer`:
-- unlike is_user_banned (which must bypass profiles RLS), this function only
-- touches service_entries/trip_logs/part_purchases, which anon and
-- authenticated already have direct SELECT access to (0011). Running as
-- invoker means the caller's own RLS applies automatically -- a signed-in
-- user searching sees their own private rows too, same as querying the
-- tables directly would give them; the explicit is_public/not hidden filters
-- below additionally keep search itself scoped to public discovery instead
-- of doubling as a private-notes search tool.
create function public.search_community_content(search_query text, result_limit int default 20)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  category text,
  created_at timestamptz,
  rank real
)
language sql
stable
as $$
  select kind, id, title, subtitle, category, created_at, rank
  from (
    select
      'service_entry'::text as kind,
      s.id,
      s.service_type as title,
      s.dealer as subtitle,
      null::text as category,
      s.created_at,
      ts_rank(
        to_tsvector('spanish', coalesce(s.service_type, '') || ' ' || coalesce(s.dealer, '') || ' ' || coalesce(s.city, '') || ' ' || coalesce(s.notes, '')),
        websearch_to_tsquery('spanish', coalesce(search_query, ''))
      ) as rank
    from public.service_entries s
    where s.is_public and not s.hidden
      and to_tsvector('spanish', coalesce(s.service_type, '') || ' ' || coalesce(s.dealer, '') || ' ' || coalesce(s.city, '') || ' ' || coalesce(s.notes, ''))
        @@ websearch_to_tsquery('spanish', coalesce(search_query, ''))

    union all

    select
      'trip_log'::text,
      t.id,
      t.title,
      t.origin || ' → ' || t.destination,
      null::text,
      t.created_at,
      ts_rank(
        to_tsvector('spanish', coalesce(t.title, '') || ' ' || coalesce(t.origin, '') || ' ' || coalesce(t.destination, '') || ' ' || coalesce(t.notes, '')),
        websearch_to_tsquery('spanish', coalesce(search_query, ''))
      )
    from public.trip_logs t
    where t.is_public and not t.hidden
      and to_tsvector('spanish', coalesce(t.title, '') || ' ' || coalesce(t.origin, '') || ' ' || coalesce(t.destination, '') || ' ' || coalesce(t.notes, ''))
        @@ websearch_to_tsquery('spanish', coalesce(search_query, ''))

    union all

    select
      'part_purchase'::text,
      p.id,
      p.item,
      p.store,
      p.category,
      p.created_at,
      ts_rank(
        to_tsvector('spanish', coalesce(p.item, '') || ' ' || coalesce(p.store, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.city, '') || ' ' || coalesce(p.notes, '')),
        websearch_to_tsquery('spanish', coalesce(search_query, ''))
      )
    from public.part_purchases p
    where p.is_public and not p.hidden
      and to_tsvector('spanish', coalesce(p.item, '') || ' ' || coalesce(p.store, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.city, '') || ' ' || coalesce(p.notes, ''))
        @@ websearch_to_tsquery('spanish', coalesce(search_query, ''))
  ) matches
  order by rank desc, created_at desc
  limit result_limit;
$$;

revoke execute on function public.search_community_content(text, int) from public;
grant execute on function public.search_community_content(text, int) to anon, authenticated;
