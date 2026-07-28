-- Follow-up to 0030 (specs/site-search.md): "servicio" (the actual Spanish
-- word) returned zero results even though "service" and "taller" already
-- worked. Postgres's 'spanish' text search config doesn't stem the English
-- loanword "service" down to the same root as "servicio", so the two never
-- matched each other -- needs to be listed explicitly, same as the other
-- fixed per-kind keywords.
create or replace function public.search_community_content(search_query text, result_limit int default 20)
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
        to_tsvector('spanish', 'service servicio taller ' || coalesce(s.service_type, '') || ' ' || coalesce(s.dealer, '') || ' ' || coalesce(s.city, '') || ' ' || coalesce(s.notes, '')),
        websearch_to_tsquery('spanish', coalesce(search_query, ''))
      ) as rank
    from public.service_entries s
    where s.is_public and not s.hidden
      and to_tsvector('spanish', 'service servicio taller ' || coalesce(s.service_type, '') || ' ' || coalesce(s.dealer, '') || ' ' || coalesce(s.city, '') || ' ' || coalesce(s.notes, ''))
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
        to_tsvector('spanish', 'viaje ruta ' || coalesce(t.title, '') || ' ' || coalesce(t.origin, '') || ' ' || coalesce(t.destination, '') || ' ' || coalesce(t.notes, '')),
        websearch_to_tsquery('spanish', coalesce(search_query, ''))
      )
    from public.trip_logs t
    where t.is_public and not t.hidden
      and to_tsvector('spanish', 'viaje ruta ' || coalesce(t.title, '') || ' ' || coalesce(t.origin, '') || ' ' || coalesce(t.destination, '') || ' ' || coalesce(t.notes, ''))
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
        to_tsvector('spanish', 'compra repuesto accesorio ' || coalesce(p.item, '') || ' ' || coalesce(p.store, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.city, '') || ' ' || coalesce(p.notes, '')),
        websearch_to_tsquery('spanish', coalesce(search_query, ''))
      )
    from public.part_purchases p
    where p.is_public and not p.hidden
      and to_tsvector('spanish', 'compra repuesto accesorio ' || coalesce(p.item, '') || ' ' || coalesce(p.store, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.city, '') || ' ' || coalesce(p.notes, ''))
        @@ websearch_to_tsquery('spanish', coalesce(search_query, ''))
  ) matches
  order by rank desc, created_at desc
  limit result_limit;
$$;
