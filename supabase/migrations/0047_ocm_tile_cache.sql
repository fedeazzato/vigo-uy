-- Open Charge Map proxy (specs/ocm-proxy.md R2): the tile cache, the rate
-- counters and the upstream circuit breaker behind the Edge Function
-- `ocm-stations`. Everything here is service-role only: RLS on, no policies,
-- no client privileges, functions executable by service_role alone. The cache
-- holds OCM data and tile keys only (no user data); the counters hold keyed
-- hashes (HMAC) of client IPs for at most one day.
-- Apply with `npx supabase db push`.

-- 1. Tables -------------------------------------------------------------------------

-- One row per 0.5 x 0.5 degree tile, key 'v1:<floor(lat*2)>:<floor(lng*2)>'.
-- payload is null while the first fetch of the tile is in flight (lease) or
-- after it failed; then {v, stations, providers} as built by the function.
create table public.ocm_tile_cache (
  tile_key text primary key check (tile_key ~ '^v1:-?[0-9]{1,3}:-?[0-9]{1,3}$'),
  payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  station_count integer not null default 0 check (station_count >= 0),
  truncated boolean not null default false,
  fetched_at timestamptz,
  expires_at timestamptz,
  lease_until timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index ocm_tile_cache_fetched_idx on public.ocm_tile_cache (coalesce(fetched_at, updated_at));

-- Fixed-window counters: 'req:<hmac>' (10-minute windows), 'fetch:<hmac>' and
-- 'fetch:all' (hour windows).
create table public.ocm_rate_counters (
  bucket text not null check (char_length(bucket) between 1 and 80),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create index ocm_rate_counters_window_idx on public.ocm_rate_counters (window_start);

-- Single row: while blocked_until is in the future no OCM call is made at all
-- (set after OCM rejected the key or rate-limited us).
create table public.ocm_upstream_state (
  id smallint primary key default 1 check (id = 1),
  blocked_until timestamptz,
  last_error text check (char_length(last_error) <= 40),
  updated_at timestamptz not null default now()
);

alter table public.ocm_tile_cache enable row level security;
alter table public.ocm_rate_counters enable row level security;
alter table public.ocm_upstream_state enable row level security;

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated: take them back. No policies = unreachable from client
-- sessions; the Edge Function uses the service role through the functions
-- below.
revoke all on public.ocm_tile_cache from anon, authenticated;
revoke all on public.ocm_rate_counters from anon, authenticated;
revoke all on public.ocm_upstream_state from anon, authenticated;

-- 2. Begin: rate limit, cached tiles, which tiles this request may fetch ------------

create function public.ocm_tiles_begin(p_client text, p_tiles text[], p_can_fetch boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  max_tiles constant integer := 20;
  max_fetch_per_request constant integer := 12;
  req_limit constant integer := 60;            -- requests per client per 10 minutes
  fetch_limit_client constant integer := 120;  -- upstream fetches per client per hour
  fetch_limit_global constant integer := 600;  -- upstream fetches per hour, everyone
  lease constant interval := interval '60 seconds';
  fail_cooldown constant interval := interval '10 minutes';
  v_now timestamptz := now();
  v_req_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  v_hour timestamptz := date_trunc('hour', now());
  v_hits integer;
  v_wanted text[];
  v_fetch text[] := '{}';
  v_blocked timestamptz;
  v_client_used integer;
  v_global_used integer;
  v_budget integer;
  v_tiles jsonb;
  v_linked jsonb;
begin
  if p_client is null or p_client !~ '^[0-9a-f]{32}$' then
    raise exception 'ocm_tiles_begin: invalid client';
  end if;
  if p_tiles is null or cardinality(p_tiles) < 1 or cardinality(p_tiles) > max_tiles then
    raise exception 'ocm_tiles_begin: 1 to % tiles', max_tiles;
  end if;
  if exists (select 1 from unnest(p_tiles) k where k is null or k !~ '^v1:-?[0-9]{1,3}:-?[0-9]{1,3}$') then
    raise exception 'ocm_tiles_begin: invalid tile key';
  end if;
  if (select count(distinct k) from unnest(p_tiles) k) <> cardinality(p_tiles) then
    raise exception 'ocm_tiles_begin: duplicate tile key';
  end if;

  -- Serialise: the budgets and leases below cannot be raced.
  perform pg_advisory_xact_lock(hashtext('public.ocm_tiles_begin'));

  -- Housekeeping (cleanup policy): counters live one day; a tile nobody asked
  -- for in 30 days is dropped (it refills on demand).
  delete from public.ocm_rate_counters c where c.window_start < v_now - interval '1 day';
  delete from public.ocm_tile_cache c where coalesce(c.fetched_at, c.updated_at) < v_now - interval '30 days';

  -- Per-client request cap (counted even when refused).
  insert into public.ocm_rate_counters as c (bucket, window_start, hits)
  values ('req:' || p_client, v_req_window, 1)
  on conflict (bucket, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;
  if v_hits > req_limit then
    return jsonb_build_object(
      'error', 'rate_limited',
      'retry_after', greatest(1, ceil(extract(epoch from (v_req_window + interval '10 minutes' - v_now)))::integer)
    );
  end if;

  -- Tiles that need an upstream fetch, in the caller's order (centre first).
  select coalesce(array_agg(t.k order by t.ord), '{}')
  into v_wanted
  from unnest(p_tiles) with ordinality as t(k, ord)
  left join public.ocm_tile_cache c on c.tile_key = t.k
  where (c.tile_key is null or c.expires_at is null or c.expires_at <= v_now)
    and (c.lease_until is null or c.lease_until <= v_now)
    and (c.failed_at is null or c.failed_at <= v_now - fail_cooldown);

  select s.blocked_until into v_blocked from public.ocm_upstream_state s where s.id = 1;

  if p_can_fetch and cardinality(v_wanted) > 0 and (v_blocked is null or v_blocked <= v_now) then
    select coalesce(sum(c.hits), 0) into v_client_used
    from public.ocm_rate_counters c where c.bucket = 'fetch:' || p_client and c.window_start = v_hour;
    select coalesce(sum(c.hits), 0) into v_global_used
    from public.ocm_rate_counters c where c.bucket = 'fetch:all' and c.window_start = v_hour;

    v_budget := least(
      max_fetch_per_request,
      fetch_limit_client - v_client_used,
      fetch_limit_global - v_global_used,
      cardinality(v_wanted)
    );

    if v_budget > 0 then
      v_fetch := v_wanted[1:v_budget];

      insert into public.ocm_tile_cache as c (tile_key, lease_until, updated_at)
      select k, v_now + lease, v_now from unnest(v_fetch) k
      on conflict (tile_key) do update set lease_until = excluded.lease_until, updated_at = excluded.updated_at;

      insert into public.ocm_rate_counters as c (bucket, window_start, hits)
      values ('fetch:' || p_client, v_hour, v_budget), ('fetch:all', v_hour, v_budget)
      on conflict (bucket, window_start) do update set hits = c.hits + excluded.hits;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', c.tile_key,
           'payload', c.payload,
           'fetched_at', c.fetched_at,
           'fresh', c.expires_at is not null and c.expires_at > v_now
         )), '[]'::jsonb)
  into v_tiles
  from public.ocm_tile_cache c
  where c.tile_key = any (p_tiles) and c.payload is not null;

  -- OCM POIs already in WikiVigo (any row, hidden ones too): the function
  -- leaves them out of every answer.
  select coalesce(jsonb_agg(distinct s.ocm_id), '[]'::jsonb)
  into v_linked
  from public.charging_stations s
  where s.ocm_id is not null;

  return jsonb_build_object(
    'tiles', v_tiles,
    'fetch', to_jsonb(v_fetch),
    'throttled', cardinality(v_wanted) > cardinality(v_fetch),
    'linked_ocm_ids', v_linked
  );
end;
$$;

-- 3. Store fetched tiles --------------------------------------------------------------

create function public.ocm_tiles_store(p_tiles jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ttl constant interval := interval '24 hours';
  max_payload_bytes constant integer := 2000000;
  t jsonb;
  v_key text;
  v_payload jsonb;
  v_count integer;
  v_stored integer := 0;
begin
  if p_tiles is null or jsonb_typeof(p_tiles) <> 'array' or jsonb_array_length(p_tiles) > 20 then
    raise exception 'ocm_tiles_store: expected an array of at most 20 tiles';
  end if;

  for t in select value from jsonb_array_elements(p_tiles) loop
    v_key := t->>'key';
    v_payload := t->'payload';
    if v_key is null or v_key !~ '^v1:-?[0-9]{1,3}:-?[0-9]{1,3}$' then
      raise exception 'ocm_tiles_store: invalid tile key';
    end if;
    if v_payload is null or jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > max_payload_bytes then
      raise exception 'ocm_tiles_store: invalid payload for %', v_key;
    end if;
    v_count := least(greatest(coalesce((t->>'count')::integer, 0), 0), 100000);

    insert into public.ocm_tile_cache as c
      (tile_key, payload, station_count, truncated, fetched_at, expires_at, lease_until, failed_at, updated_at)
    values
      (v_key, v_payload, v_count, coalesce((t->>'truncated')::boolean, false), now(), now() + ttl, null, null, now())
    on conflict (tile_key) do update set
      payload = excluded.payload,
      station_count = excluded.station_count,
      truncated = excluded.truncated,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at,
      lease_until = null,
      failed_at = null,
      updated_at = excluded.updated_at;
    v_stored := v_stored + 1;
  end loop;

  return v_stored;
end;
$$;

-- 4. Record failed fetches ------------------------------------------------------------

create function public.ocm_tiles_fail(p_keys text[], p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_reason is null or p_reason not in ('timeout', 'network', 'http', 'bad_data', 'auth', 'rate_limited') then
    raise exception 'ocm_tiles_fail: invalid reason';
  end if;
  if p_keys is not null and cardinality(p_keys) > 0 then
    update public.ocm_tile_cache c
    set failed_at = now(), lease_until = null, updated_at = now()
    where c.tile_key = any (p_keys);
  end if;
  -- OCM refused the key or rate-limited us: stop calling it for a while.
  if p_reason in ('auth', 'rate_limited') then
    insert into public.ocm_upstream_state as s (id, blocked_until, last_error, updated_at)
    values (1, now() + interval '15 minutes', p_reason, now())
    on conflict (id) do update set
      blocked_until = excluded.blocked_until, last_error = excluded.last_error, updated_at = excluded.updated_at;
  end if;
end;
$$;

-- 5. Privileges -------------------------------------------------------------------------
-- Supabase's default privileges grant EXECUTE to anon/authenticated
-- independently of PUBLIC (see 0015 section 5): revoke from each explicitly.

revoke execute on function public.ocm_tiles_begin(text, text[], boolean) from public, anon, authenticated;
revoke execute on function public.ocm_tiles_store(jsonb) from public, anon, authenticated;
revoke execute on function public.ocm_tiles_fail(text[], text) from public, anon, authenticated;
grant execute on function public.ocm_tiles_begin(text, text[], boolean) to service_role;
grant execute on function public.ocm_tiles_store(jsonb) to service_role;
grant execute on function public.ocm_tiles_fail(text[], text) to service_role;
