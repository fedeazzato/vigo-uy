# Seed known Uruguayan EV charging stations

## Context

`charging_stations` (`0022_charging_stations.sql`, extended by
`0024_charging_networks.sql` and `0025_connector_rules.sql`) is fully wired
up in the UI (`CommunityStations.tsx`, rendered on `ChargingPage`) but is
user-submission-only — it was empty or sparse for a new member until they
typed stations in themselves. The curated `charging.json` only has
network-level cards ("UTE AC", "EONE", ...), no addresses or coordinates.

This seeds real, publicly known charging locations in Uruguay directly into
the table so the community list has a useful baseline from day one. Source:
[OpenChargeMap](https://openchargemap.org)'s public API
(`api.openchargemap.io/v3/poi?countrycode=UY`, CC BY 4.0), which is
explicitly built for third-party reuse — chosen over scraping a commercial
competitor's (electromaps.com) crowd-sourced dataset, and over guessing
connector/power specs from government/news sources that only had addresses.

Every row keeps its OpenChargeMap POI id (`ocm_id`) so a future re-sync can
`UPDATE` existing rows instead of re-inserting duplicates, and stores
`ocm_last_synced_at` so staleness is visible later.

This does not change the `preferCommunity` gate for charging data in
`specs/CONTENT-MIGRATION.md` (curated network cards stay permanent,
per that spec's existing row) — it only adds baseline *station* rows a
member could have submitted themselves, pre-filled from open data instead
of starting from zero.

## Requirements

1. `charging_stations` gains two nullable columns: `ocm_id integer` and
   `ocm_last_synced_at timestamptz`, with a partial unique index on
   `(ocm_id, connector, max_power_kw) where ocm_id is not null` — a single
   OCM POI can list several connector variants at one physical location
   (e.g. a CCS2 post and a separate Tipo 2 post), so uniqueness has to be
   per connector variant, not per POI alone. A station with no OCM match
   has `ocm_id is null`, so it's excluded from the check rather than
   colliding on `null`.
2. `charging_networks` gains three rows for operators OCM knows about that
   aren't in the existing `ute`/`eone`/`dmc`/`evergo`/`eosvolt`/`otro` set:
   `eve-move` (Eve Move, 16 stations), `nes` (NES Charge, 1 station), `umt`
   (UMT EV Charge, 2 stations). `instructions` left `null` (unknown) like
   `otro` already has.
3. Seed rows are inserted with `verified = true` and
   `user_id = (select id from auth.users where email = 'fedeazzato@gmail.com')`
   resolved inline in the migration (no hardcoded UUID) — verified rows
   render the "Oficial" badge per D2 (`0020_verified_content.sql`).
4. The `limit_charging_stations_per_day` trigger (`0009`) is disabled for
   the duration of the bulk insert and re-enabled immediately after —
   unlike `prevent_unauthorized_verify` (`0020`), which already
   special-cases the no-JWT migration/bootstrap path, the daily-limit
   trigger fires unconditionally and would reject rows past #20 within the
   same seeding transaction.
5. One already-live community-submitted station ("Ancap Rocha", Rocha,
   `ute`, CCS2/DC) matches OCM POI #260138 by name/network/connector — it is
   **not** duplicated. Instead, that existing row is `UPDATE`d to backfill
   `ocm_id` and any of `address`/`lat`/`lng`/`max_power_kw` it left blank,
   via `coalesce()` so nothing the member actually entered is overwritten.
6. Data cleanup applied before seeding (all in the generation script, not
   hand-edited):
   - `city` normalized to `UY_CITIES` canonical casing
     (`src/lib/cities.ts`'s `normalizeCityCasing` logic, reimplemented in
     the one-off generation script since it's not run from a migration).
   - Cities OCM left blank, or that disagreed with OCM's own `Town` field,
     were resolved by reverse-geocoding each station's coordinates and
     manually reviewing every mismatch — see the migration's row data for
     the result; no city was guessed from address text alone.
   - Six OCM POIs identified as duplicate submissions of a physical
     station already covered by another POI in the same batch (identical
     or near-identical name/coordinates/connector) were dropped, keeping
     the more complete or more recently verified entry.
   - Connections OCM lists as CHAdeMO (11 stations) are not seeded — the
     Vigo doesn't support that connector, and the schema's `connector`
     check constraint doesn't include it.
7. Migrations run once (tracked by the Supabase CLI), so this is
   inherently a one-shot seed. A future top-up (new stations, or a refresh
   of existing `ocm_id` rows from a new OCM query) is a new migration file
   that reads existing `ocm_id`s to diff against, not an edit to this one.

## Files to touch

- `supabase/migrations/0034_seed_known_charging_stations.sql` (new —
  schema columns + index, 3 network rows, the Ancap Rocha backfill update,
  and the 209-row seed insert)
- `src/lib/database.types.ts` (regenerated via `npm run gen:types` — the
  two new nullable columns need to show up in `ChargingStation`)
- `specs/CONTENT-MIGRATION.md` (one-line note under the existing D4 row:
  this seed doesn't change the gate, only the baseline row count)

No other frontend/TypeScript files change — `CommunityStations.tsx` already
renders `verified` stations with the "Oficial" badge and tolerates stations
with zero `station_reports`/`charging_cost_stats` rows (brand new to the
table), which every seeded row starts as.

## Test plan

No new unit tests — this is a data migration with no new application code
path (the two new nullable columns flow through the existing generated
`ChargingStation` type and existing render logic unchanged). Verification
is migration-level and manual instead:

- `npx supabase db push` applies cleanly against the linked project.
- `npx supabase migration list` shows `0034` applied on both local and
  remote.
- A `select count(*) from charging_stations where ocm_id is not null`
  matches 210 (209 seeded + the Ancap Rocha backfill) once applied.
- Existing colocated tests for `CommunityStations.tsx` and
  `communityData.ts` continue to pass unchanged (no behavior they assert on
  changed).

## Acceptance criteria

- [x] `0034_seed_known_charging_stations.sql` written, reviewed against the
      full station list, applied via `npx supabase db push`.
- [x] `npm run gen:types` run after applying, `database.types.ts` updated.
- [x] `npm run type-check`, `npm run lint`, and `npm test` all pass.
- [x] `specs/CONTENT-MIGRATION.md` D4 row/notes updated.
- [x] Manual check on `/carga` (per the `verify` skill): seeded stations
      appear under the correct network card with the "Oficial" badge,
      grouped correctly by the three new networks, and the existing
      "Ancap Rocha" entry now shows its backfilled address without a
      duplicate appearing alongside it.

## Follow-up data-quality fixes (2026-08-01)

Three small migrations, same explicit-per-row-update approach as
`0035_clean_station_names.sql`:

- `0036_verify_existing_stations.sql`: the two rows that predate this seed
  ("Ancap Rocha", "Terminal Punta del Diablo") were left `verified = false`
  by the 0034 backfill, even though every row — seeded and these two — is
  attributed to the same account. Set both to `verified = true` so they
  don't stand out as un-badged among 209 "Oficial" stations.
- `0037_normalize_tata_names.sql`: "Ta-Ta" (the supermarket chain hosting
  several stations) appeared as `Ta-Ta`/`TaTa`/`Tata` depending on which
  OCM contributor typed it. Normalized to `Ta-Ta`, the brand's actual
  spelling — also fixed a missing accent (`Paysandu` → `Paysandú`) on the
  one row it happened to share a name with.
- `0038_normalize_ancap_names.sql`: same casing problem for `ANCAP`
  (Uruguay's state fuel-station brand, an acronym — 27 rows said "Ancap",
  7 said "ANCAP"). Normalized to the all-caps acronym form.

Not touched: other embedded typos spotted in passing (`Guichon` for
`Guichón`, `Jose Enrique Rodo` for `José Enrique Rodó`, `SanLuis` for
`San Luis`) — those are a broader, unrequested cleanup pass, not a
brand-name casing inconsistency like Ta-Ta/ANCAP.

- `0039_name_tata_rivera.sql`: one Ta-Ta row (Rivera, Avenida Sarandí 950)
  had no city qualifier at all — just `"Ta-Ta"`, unlike every sibling row
  (`Ta-Ta Durazno`, `Ta-Ta Florida`, ...). Renamed to `Ta-Ta Rivera`.
