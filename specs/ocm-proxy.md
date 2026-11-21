# Open Charge Map proxy: foreign charging stations on demand

**Status:** Implemented on branch `ocm-proxy`; **not applied**. The owner gets an Open Charge Map API key, sets it as a function
secret, pushes the migration, deploys the function, merges and deploys (see "Owner steps").

## Context

WikiVigo's `charging_stations` covers Uruguay (209 stations seeded from Open Charge Map in 0034, plus community submissions).
Members also drive to Argentina and southern Brazil, and the owner wants stations of any country to show up:

1. on WikiVigo's stations map (Carga, "Ver en mapa", `StationsMap`), and
2. in the car's "Cargadores cercanos" app (companion repo `vigo-hack/chargers`, package `com.df.autonavi`), which today reads
   WikiVigo's public table and can call Open Charge Map (OCM) directly only with its own key, which the owner has not set.

Both should get OCM data **through WikiVigo**: one server-side key (a Supabase function secret), one shared cache, one place that
honours OCM's fair-use rules ("do not repeatedly call the API with duplicate queries ... debounce/throttle ... the administrator
reserves the right to ban API callers") and its licence terms (data provider attribution, including licence terms, visible to the
end user).

## Decisions (owner may revisit any of them)

| # | Question | Decision | Why / alternative |
|---|---|---|---|
| D1 | Cache granularity | Fixed grid of **0.5° x 0.5° tiles** (about 55 x 46 km at 34° S), key `v1:<floor(lat*2)>:<floor(lng*2)>`. Every request is widened to whole tiles. | Shared cache hits for everyone in the same area; the server never needs (or stores) more precision than a tile. Zoom-based multi-size tiles were rejected: truncated "sampled" big tiles show arbitrary subsets. |
| D2 | What is fetched per tile | OCM `/v3/poi` with `boundingbox`, `maxresults=1000`, `compact=false`, `verbose=false`, `opendata=true`, `connectiontypeid=33,25,1036` (CCS2, Type 2 socket, Type 2 tethered: the Vigo's sockets, as in the car app). | `compact=false` embeds operator/status/connector names (no `/referencedata` round trip). `opendata=true` keeps only openly licensed data, so a public site may redistribute it with attribution. GB/T is not fetched (the export Vigo has CCS2 + Type 2); adding it = change the constant and bump the key prefix to `v2:`. |
| D3 | Freshness | 24 h; a stale tile is still served when OCM fails (stale-if-error) for up to 30 days, then purged. | OCM data changes slowly; 24 h bounds upstream calls to one per tile per day. |
| D4 | De-duplication with WikiVigo | **Server**: drops every OCM POI whose id is linked by `charging_stations.ocm_id` (any row, hidden ones too: a station a moderator hid must not come back through OCM). **Web**: also hides an OCM POI within 50 m of a WikiVigo station shown on the map. **Car**: keeps its own merge (ocm_id, or 50 m + similar name). | The id link is exact and cheap in SQL; name similarity stays client-side where each client already has its rule. |
| D5 | Where the web shows OCM | Everywhere (Uruguay too, after D4), but only when the visible area covers **at most 20 tiles** (about zoom 9 on a desktop modal, zoom 8 on a phone); farther out the map says "Acercá el mapa para ver también estaciones de Open Charge Map". Only for the all-stations map (not a single station's map) and not while a network or city filter is active (OCM has no WikiVigo network/city); the connector and power filters are passed through. | A pure "outside Uruguay" trigger would hide OCM stations WikiVigo does not know yet; after D4 the Uruguayan OCM stations left are genuinely missing ones. |
| D6 | Who may call | Anon: `verify_jwt = false`, no key needed (like `car-device`). CORS: browsers only from `OCM_ALLOWED_ORIGINS` (default `https://fedeazzato.github.io,http://localhost:5173`); a request with another `Origin` gets 403 `origin`; requests **without** `Origin` (the car, curl) are allowed. | CORS only stops other websites' scripts; non-browser abuse is bounded by the rate limits and budgets below, which are the real protection. |
| D7 | Client identity for rate limits | Best-effort client IP (first `x-forwarded-for` entry), stored only as `HMAC-SHA256(service role key, ip)` (32 hex) in counter rows of 10 min / 1 h windows, deleted after 1 day. | Forwarded headers can be spoofed, so the **global** budget is the real cap. Alternative with nothing stored: per-instance in-memory counters (weaker: reset on every cold start). |
| D8 | Car source order | No `ocm_key` in `cargadores.conf` -> the car uses this function (URL = `wikivigo_url` + `/functions/v1/ocm-stations`, the anon key as `apikey`). An `ocm_key` -> direct OCM as before. | Keeps the owner's explicit choice working; alternative: proxy first, direct only when the proxy fails. |

## Requirements

### R1. Edge Function `ocm-stations` (wire protocol v1)

`GET {SUPABASE_URL}/functions/v1/ocm-stations?<area>[&connectiontypeid=..][&min_kw=..]`, deployed with `verify_jwt = false`.
Logic in `supabase/functions/_shared/ocmStations.ts` (pure TypeScript, WebCrypto + fetch injected, Vitest-tested); the Deno entry
`supabase/functions/ocm-stations/index.ts` only wires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase),
`OCM_API_KEY` and optional `OCM_ALLOWED_ORIGINS` (function secrets).

**Area** (exactly one form):
- `bbox=south,west,north,east` (decimal degrees, `-90 <= south < north <= 90`, `-180 <= west < east <= 180`; no antimeridian
  crossing), or
- `lat=..&lng=..&radius_km=..` (radius 0 < r <= 60 km; converted to a box: 111.32 km per degree of latitude, divided by
  cos(lat) for longitude).

The area is widened to whole tiles; **more than 20 tiles -> 400 `area_too_large`**. Clients should send coarse coordinates
(the car rounds to 0.01°, the web sends the tile-aligned box) because request URLs may appear in Supabase's function logs.

**Filters** (optional, applied server-side to the cached tile data):
- `connectiontypeid=33,25,1036` (subset of the fetched set D2; anything else -> 400): keep stations with at least one such connector.
- `min_kw=0..1000`: keep stations where a connector (of the selected types, if given) reaches it.

**Response 200** (`application/json`):
```json
{
  "ok": true,
  "stations": [{
    "id": 123456, "name": "YPF Punto Eléctrico Colón", "operator": "YPF", "lat": -32.22, "lng": -58.14,
    "address": "Ruta 135 km 3", "town": "Colón", "country": "AR",
    "status": "operational", "restricted": false, "usage_cost": "ARS 450/kWh", "verified_at": "2026-10-01T10:00:00Z",
    "connectors": [{ "type": "ccs2", "type_id": 33, "kw": 120, "qty": 2, "current": "DC" }],
    "max_kw": 120, "provider_id": 1, "url": "https://openchargemap.org/site/poi/details/123456"
  }],
  "complete": true, "truncated": false, "retry_after": null,
  "tiles": { "requested": 4, "served": 4, "stale": 0, "missing": 0 },
  "bbox": [-32.5, -58.5, -32.0, -58.0], "tile_deg": 0.5, "oldest_fetch": "2026-11-20T10:00:00.000Z",
  "attribution": "Datos de Open Charge Map (CC BY 4.0)",
  "providers": [{ "id": 1, "title": "Open Charge Map Contributors", "license": "CC BY 4.0" }]
}
```
- `status`: `available | operational | in_use | partly | temp_unavailable | out_of_service | planned | removed | unknown`
  (OCM StatusTypeID 10/50/20/75/30/100/150/200+210/other; a POI without status takes its best connector status).
  Removed and planned POIs are kept so clients can forget them; both clients hide them.
- `restricted`: OCM usage type 2, 3 or 6 (private / notice required / customers only).
- connector `type`: `ccs2 | type2 | type2_socket | ccs1 | chademo | type1 | gbt | tesla | schuko | other`; `kw` from
  `PowerKW`, else amps x volts (three-phase rule of the car app), else `null`.
- `operator` is `null` for OCM's placeholder operators (ids 1, 44, 45 or a title starting with "(").
- `complete = false` when a tile could not be served (budget, a fetch in flight elsewhere, an OCM failure without stale data)
  or the station cap cut the answer; `retry_after` (seconds) then says when to ask again. Clients may show partial data.
- At most **2000 stations** per answer, tiles nearest the area centre first (`truncated: true` when cut).
- `attribution`: always "Datos de Open Charge Map (CC BY 4.0)", plus "; <title>: <licence>" for every other data provider
  present. Clients must show it whenever OCM stations are on screen.
- `Cache-Control: public, max-age=600` when complete, `no-store` otherwise.

**Errors** (JSON `{"ok": false, "error": <code>}`, stable codes):

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | missing/invalid area or filter |
| 400 | `area_too_large` | more than 20 tiles |
| 403 | `origin` | browser `Origin` not in the allow-list |
| 405 | `method` | not GET/OPTIONS |
| 429 | `rate_limited` | per-client request cap; `Retry-After` header + `retry_after` field |
| 502 | `upstream` | nothing could be served and an OCM fetch failed |
| 503 | `not_configured` | nothing could be served and `OCM_API_KEY` is not set |
| 500 | `server` | database failure (details only in the function log) |

`OPTIONS` answers the CORS preflight (204). The key is never echoed, logged or put in a URL; upstream errors are logged as
"OCM HTTP 403" / "OCM timeout", never with the response body.

**Upstream behaviour:** at most 12 tile fetches per request, 3 at a time, 10 s timeout each; `User-Agent: WikiVigo/1 (ocm-stations)`
plus `client=wikivigo`; key in `X-API-Key`. OCM 401/403/429 blocks all upstream calls for 15 minutes (`ocm_upstream_state`).

### R2. Migration `0047_ocm_tile_cache.sql`

- `ocm_tile_cache(tile_key text pk check '^v1:-?\d{1,3}:-?\d{1,3}$', payload jsonb (object: {v, stations, providers}) null until
  first fetch, station_count, truncated, fetched_at, expires_at, lease_until, failed_at, updated_at)`. **No user data**: tile
  keys and OCM data only.
- `ocm_rate_counters(bucket text, window_start timestamptz, hits int, pk (bucket, window_start))`: buckets `req:<hmac>`
  (10 min), `fetch:<hmac>` (1 h), `fetch:all` (1 h).
- `ocm_upstream_state(id = 1, blocked_until, last_error, updated_at)`.
- RLS enabled on all three with **no policies**; all privileges revoked from `anon` and `authenticated`.
- Functions, `security definer`, `search_path = public`, execute **revoked from public/anon/authenticated, granted to
  service_role only**:
  - `ocm_tiles_begin(p_client text, p_tiles text[], p_can_fetch boolean) -> jsonb`: validates (32-hex client, 1-20 distinct
    valid keys); serialises on an advisory lock; housekeeping (counters older than 1 day, tiles not fetched for 30 days); counts
    the request (**60 per client per 10 min**, else `{error: 'rate_limited', retry_after}`); picks the tiles that need a fetch
    (missing or expired, no live lease, no failure in the last 10 min) in the caller's order; grants
    `min(12, 120 - client fetches this hour, 600 - all fetches this hour, wanted)` of them unless upstream is blocked or
    `p_can_fetch` is false, leasing them for 60 s; returns `{tiles: [{key, payload, fetched_at, fresh}], fetch: [keys],
    throttled, linked_ocm_ids}`.
  - `ocm_tiles_store(p_tiles jsonb) -> integer`: up to 20 `{key, payload, count, truncated}`; payload must be an object of at most
    2 MB; sets `fetched_at = now()`, `expires_at = now() + 24 h`, clears lease and failure.
  - `ocm_tiles_fail(p_keys text[], p_reason text) -> void`: marks failure (10 min cooldown), clears the lease; reason `auth` or
    `rate_limited` blocks upstream for 15 min.
- Cleanup policy: opportunistic inside `ocm_tiles_begin` (no cron needed); the whole cache can be dropped at any time
  (`truncate ocm_tile_cache`), it refills on demand.

### R3. Web: OCM layer on the stations map

- `src/lib/ocmStations.ts`: tile maths (same grid), `ocmRequestFor(bounds, filter)` (tile-aligned bbox so the URL is stable
  while panning inside the same tiles, `null` above 20 tiles or across the antimeridian), `fetchOcmStations(url, signal)`
  (plain `fetch` GET without custom headers: no CORS preflight; Spanish error messages per code), `hideNearWiki(ocm, wiki, 50 m)`,
  `ocmFilterFor(connector, minPower)` (WikiVigo connector -> OCM ids: CCS2 -> 33, Tipo 2 -> 1036, Sin cable -> 25; Tipo 1 /
  CCS1 / GB/T -> no OCM layer), labels for connectors and statuses.
- `StationsMap` gains an optional `ocm` prop (`{ connectiontypeid?, minKw? } | null`); when set, an `OcmLayer` inside the map:
  - evaluates the view on mount and on every `moveend`, **debounced 600 ms**, aborting the previous request; skips a request
    whose URL equals the last complete one;
  - renders OCM stations (minus removed/planned, minus D4 duplicates) with a **hollow ring marker** (`ringIcon`, card colour
    inside, secondary-text ring), visibly different from WikiVigo's filled amber dot;
  - popup: name, **"Open Charge Map" badge** (new `external` Badge variant: dashed outline, secondary text; distinct from
    "Oficial" (curated) and community), operator, town/country, connectors with kW and quantity, status when not plainly
    operational, "Acceso restringido", usage cost, "Verificado en OCM el {fecha}", link "Ver en Open Charge Map" (new tab);
  - adds the attribution string to Leaflet's attribution control while mounted (linking openchargemap.org);
  - a status line under the map: legend ("● WikiVigo · ○ Open Charge Map"), "Acercá el mapa para ver también estaciones de
    Open Charge Map.", "Buscando estaciones de Open Charge Map…", "{n} estaciones de Open Charge Map en esta zona.", partial
    ("Faltan algunas zonas; reintentando…", retried after `retry_after`, at most 3 times), and the error messages.
- `CommunityStations` passes `ocm` only for the toolbar's "Ver en mapa" and only without a network/city filter.
- Disabled (no layer, no request) when `VITE_SUPABASE_URL` is unset.

### R4. Car (companion repo `vigo-hack/chargers`, same change, no commit there)

- `Config`: `ocmSource()` = `DIRECT` with `ocm_key`, else `WIKIVIGO` when the WikiVigo lines are set, else `NONE`.
- `Ocm.proxyUrl(wikiBase, lat, lon, radiusKm)` = `<base>/functions/v1/ocm-stations?lat=<0.01°>&lng=<0.01°>&radius_km=<r+1>&connectiontypeid=33,25,1036`
  (GET; anon key in the `apikey` header like the table reads; never in the URL); `Ocm.parseProxy` maps the v1 JSON to `Station`
  (source OCM, key `ocm:<id>`, same status/plug enums).
- `Refresh`: same staleness rules (15 min, 3 km, larger radius, "Actualizar"); keeps only proxy stations within radius + 2 km
  (whole tiles come back); an incomplete answer is stored and retried after 1 minute (`Cache.ocmPartial`); proxy 404/503
  (function not deployed or no server key) -> new quiet problem "Open Charge Map no disponible" (WikiVigo data still shown).
- Footer: "Open Charge Map: vía WikiVigo" instead of "clave no configurada".
- Tests with a fake server; `chargers/build.sh` (unit tests, lint 0, APK) passes.

## Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| **Key leak** | Key only in the function secret `OCM_API_KEY`; sent to OCM in `X-API-Key` over HTTPS; never in a URL, a response, a log line or the repo; tests assert it. | Anyone with Supabase project admin access can read it (same as the service key). |
| **Upstream abuse / OCM ban** (a script sweeping the world through us) | Tile cache (one call per tile per 24 h); per request <= 12 fetches; per client <= 120 fetches/h and 60 requests/10 min; **global <= 600 OCM calls/h**; 10 min cooldown per failed tile; 15 min global stop after OCM 401/403/429; leases stop concurrent duplicate fetches. | A determined attacker can exhaust the global hourly budget: availability only (cached tiles keep being served). |
| **Database growth** | Max 20 tiles per request, payload <= 2 MB per tile, 30-day purge, counters purged after 1 day. Worst case bounded by the global budget (600 tiles/h). | None significant. |
| **Location privacy** | Only tile keys are stored; counters hold keyed hashes of IPs for <= 1 day; the car sends 0.01°-rounded points and the web a tile-aligned box; OCM sees only tile boxes and WikiVigo's key/IP, never the user's. | Supabase function logs may keep request URLs (coarse coordinates) for the plan's log retention. |
| **Spoofed client IP** | Global budget is the real cap (D7). | Per-client limits are best effort. |
| **Data poisoning / XSS** via OCM fields | Strings trimmed and length-capped server-side; React escapes text; the only link is built from the numeric id; no HTML from OCM is rendered. | OCM contributor data quality (wrong pins, stale status): shown with an "Open Charge Map" badge and the verification date. |
| **Cross-site embedding** of the endpoint | CORS allow-list; foreign browser origins get 403. | Non-browser clients are not stopped by CORS (by design). |
| **Licence non-compliance** | `opendata=true`; attribution string (plus per-provider licences) returned with every answer and shown on the map and in the car footer; link back to each POI. | OCM may change its licence terms; re-check before large changes. |
| **Function becomes an anon oracle for WikiVigo data** | It reveals only that an OCM id is linked (by omitting it); everything else it returns is OCM data. | Accepted. |

## Files

- New `specs/ocm-proxy.md` (this file).
- New `supabase/migrations/0047_ocm_tile_cache.sql`.
- New `supabase/functions/_shared/ocmStations.ts` + `ocmStations.test.ts`; new `supabase/functions/ocm-stations/index.ts`.
- `supabase/config.toml`: `[functions.ocm-stations] verify_jwt = false`.
- New `src/lib/ocmStations.ts` + test; `src/lib/mapMarkerIcon.ts` (`ringIcon`).
- `src/components/StationsMap.tsx` (+ `OcmLayer.tsx`, `StationsMap.module.css`) + tests; `src/components/CommunityStations.tsx` + test.
- `src/components/UI.tsx` / `UI.module.css`: `external` badge.
- `CLAUDE.md` (anon surface: the function), `THIRD-PARTY-NOTICES.md` (OCM data licence), `specs/CONTENT-MIGRATION.md` (note).
- No `database.types.ts` change: the web never queries the new tables (they are service-role only); `npm run gen:types` after
  the push will simply list them.

## Test plan

Vitest (`npm test`):

- `supabase/functions/_shared/ocmStations.test.ts` (node environment, fake `rpc` + fake `fetch`, fixed clock):
  - tile maths: key of a point, negative coordinates, exact tile edges, bbox -> tiles, radius -> box, > 20 tiles rejected,
    antimeridian / inverted / out-of-range boxes rejected, centre-first order;
  - query parsing: bbox vs lat/lng/radius, both or neither -> 400, radius > 60 -> 400, filter subset validation, `min_kw` range;
  - OCM normalisation from a fixture: ids, names fallback, placeholder operators, statuses (POI and connector fallback),
    connector types and kW (PowerKW, three-phase, single-phase, unknown), restricted usage, cost, verification date, country,
    provider; invalid coordinates and ids skipped; strings capped;
  - filters (`connectiontypeid`, `min_kw`), linked-id exclusion, duplicate POIs on tile edges merged, 2000 cap with centre-first
    tiles, attribution with an extra provider;
  - handler: cache hit -> no OCM call; cold tile -> one OCM call per granted tile with `X-API-Key`, `boundingbox`, `opendata=true`,
    `maxresults=1000`, `connectiontypeid=33,25,1036`, then `ocm_tiles_store`; the key never appears in URLs, responses or logs;
    OCM failure with stale data -> stale served, `complete: true` and stale count; without -> 502 `upstream`; OCM 403 ->
    `ocm_tiles_fail(.., 'auth')`; timeout -> `timeout`; non-array body -> `bad_data`; throttled tiles -> `complete: false`
    + `retry_after`; no key -> cached tiles served, `p_can_fetch = false`, 503 `not_configured` when nothing is cached;
    `rate_limited` -> 429 + `Retry-After`; database error -> 500 without details; 405 for POST; OPTIONS 204; foreign Origin
    403; allowed Origin echoed with `Vary: Origin`; no Origin allowed without CORS headers; client id is a 32-hex HMAC, never the IP.
- `src/lib/ocmStations.test.ts`: tile-aligned request URLs, the 20-tile limit, filter mapping, error messages per status/code,
  network failure, 50 m de-duplication, labels.
- `src/components/StationsMap.test.tsx` (react-leaflet mocked, `fetch` mocked): without `ocm` no request; with `ocm` and a small
  view, one request and OCM markers with the badge, the link and the attribution; a too-large view shows the zoom hint and
  makes no request; WikiVigo duplicates within 50 m are hidden; removed POIs hidden; errors shown in Spanish.
- `src/components/CommunityStations.test.tsx`: the toolbar map gets `ocm` (with the connector filter mapped), a single station's
  map and a network/city filter get `ocm = null`.

SQL review checklist (no SQL harness in the repo):
- [ ] `anon`/`authenticated` cannot select/insert any of the three tables, nor execute the three functions; `service_role` can execute them.
- [ ] `ocm_tiles_begin`: the 61st request of a client in a 10-minute window returns `rate_limited`; grants never exceed 12 per call,
      120 per client-hour, 600 per hour overall; a leased tile is not granted again within 60 s; a failed tile not within 10 min;
      a blocked upstream grants nothing; `p_can_fetch = false` grants nothing; order follows the input.
- [ ] `ocm_tiles_store` rejects a bad key, a non-object payload, more than 20 tiles, more than 2 MB.
- [ ] Housekeeping deletes counters older than 1 day and tiles not fetched for 30 days.

Car (`vigo-hack/chargers/core/run_tests.sh`, part of `build.sh`): config source selection; proxy URL (rounded, Spanish locale
still prints '.', no key); `parseProxy` (statuses, plugs, unknown kW, complete flag, error documents); refresh uses the proxy
without a key (apikey header, no `X-API-Key`) and direct OCM with one; radius pre-filter; 404 -> "Open Charge Map no disponible"
with WikiVigo still updated; 429 -> rate limit; partial answer retried after a minute; cache round trip of the partial flag.

Manual (owner, after deploy):
- `curl "https://<ref>.supabase.co/functions/v1/ocm-stations?lat=-32.22&lng=-58.14&radius_km=25"` twice: the second answer is
  served from the cache (function log: no OCM call).
- Carga -> "Ver en mapa", zoom into Colón (AR) / Porto Alegre (BR): ring markers, badge, OCM link, credits, both themes.
- Car at the next visit: reinstall the chargers app, open the list near the border or with a 50 km radius.

## Implementation notes

- The migration was executed during development against PGlite 0.3.14 (Postgres 17 in WASM) with Supabase-like roles
  (`anon`, `authenticated`, `service_role` with BYPASSRLS), Supabase's default privileges and a minimal `charging_stations`:
  **47 assertions covering every SQL checklist item passed**. The harness is not part of the repo (no new dev dependency).
- The web sends a plain `GET` with no custom header (a CORS "simple request": no preflight); the car sends `apikey` like its
  table reads. Neither needs it: `verify_jwt = false`.

## Owner steps

1. Get a free OCM API key (openchargemap.org -> sign in -> My profile -> API keys).
2. `npx supabase secrets set OCM_API_KEY=<key>` (optional: `OCM_ALLOWED_ORIGINS=https://fedeazzato.github.io,http://localhost:5173`).
3. Review `0047_ocm_tile_cache.sql` and `supabase/functions/`, then `npx supabase db push`.
4. `npx supabase functions deploy ocm-stations --no-verify-jwt`.
5. `npm run gen:types` -> `npm run type-check`.
6. Merge `ocm-proxy` into `main`, `npm run deploy`.
7. Car: rebuild and reinstall the chargers app at the next visit (no config change: it uses `wikivigo_url` / `wikivigo_anon_key`).

## Rollback

Web: revert the merge and redeploy. Function: `npx supabase functions delete ocm-stations` (the car shows "Open Charge Map no
disponible" and keeps WikiVigo). Data: `drop` the three tables and functions in a new migration; nothing else depends on them.

## Acceptance criteria

- `npm run type-check`, `npm run lint`, `npm test`, `npm run build` pass on the branch.
- Nothing new is anon-readable in the database; the function never returns or logs the key.
- With the key set: a foreign area returns OCM stations with the attribution; the same area again does not call OCM.
- The stations map shows OCM stations distinguishable from WikiVigo ones, with the "Open Charge Map" badge, link and credits.
- The car app lists OCM stations through WikiVigo without its own key.
