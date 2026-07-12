# A1 — DB sanity constraints, indexes, and outlier-robust stats

**Status:** Done (2026-07-12) · **Phase:** A · **Depends on:** nothing

## Context

All validation of community-submitted numbers happens client-side only. RLS
controls *who* can write, not *what* they write: any authenticated user can
POST `distance_km: 999999999` directly to PostgREST, bypassing the React form
entirely. One such row would top `vehicle_km_leaderboard`, distort
`community_totals.total_km`, and poison the consumption estimate that
`CostsPage.tsx` (`estimateConsumption`) renders **next to curated data** on a
public page. There are also no indexes beyond PKs/unique constraints, and no
server-side limits on text length or the `charging_stops` jsonb payload.

Already constrained (do NOT duplicate): `trip_logs.starting_charge_percentage`
and `ending_charge_percentage` (0–100), `average_speed_kmh >= 0`, `rating`
(1–5 on trip_logs and part_purchases), `model in ('E2','E2+')`.

## Requirements

Create `supabase/migrations/0017_data_sanity.sql` with the standard
"paste into SQL Editor" header comment.

### 1. CHECK constraints

Before adding each constraint the migration must clamp/fix existing violating
rows (e.g. `update ... set distance_km = null where distance_km > 5000`), so
the `alter table` never fails on legacy data. Constraints to add:

- `trip_logs`: `distance_km between 0 and 5000` (nullable stays allowed);
  `average_speed_kmh <= 250` (lower bound exists);
  `jsonb_array_length(charging_stops) <= 20`;
  `char_length(title) <= 200`, `char_length(origin) <= 120`,
  `char_length(destination) <= 120`, `char_length(notes) <= 2000`;
  `pg_column_size(charging_stops) <= 20000` (guards huge strings inside stops).
- `service_entries`: `odometer_km between 0 and 1000000`;
  `cost_uyu between 0 and 10000000`;
  `char_length(dealer) <= 120`, `char_length(service_type) <= 120`,
  `char_length(city) <= 80`, `char_length(notes) <= 2000`.
- `part_purchases`: `price_uyu between 0 and 10000000`;
  `odometer_km between 0 and 1000000`;
  `char_length(item) <= 160`, `char_length(store) <= 120`,
  `char_length(category) <= 40`, `char_length(city) <= 80`,
  `char_length(notes) <= 2000`.
- `profiles`: `char_length(display_name) between 1 and 60`,
  `char_length(city) <= 80`.
- `vehicles`: `char_length(plate) <= 16`.

### 2. Indexes

- Each content table (`service_entries`, `trip_logs`, `part_purchases`):
  - `(user_id)` — dashboard queries and FK lookups
  - partial index `(created_at desc) where is_public and not hidden` — feed
    queries
- `trip_logs (vehicle_id)` — leaderboard view join
- `vehicle_members (vehicle_id)` is already covered by the composite PK's
  leading column; `(user_id)` is covered by its unique constraint. Skip both.

### 3. Outlier-robust aggregation

Replace `avg()` with `percentile_cont(0.5) within group (order by ...)`
(median) in both stats views — `create or replace view` works since column
names/types stay the same:

- `service_cost_stats_by_city.avg_cost_uyu` → median (keep the column name to
  avoid frontend changes, but update the comment).
- `trip_stats_by_model.avg_distance_km` and `avg_speed_kmh` → medians.

Frontend: in `src/pages/CostsPage.tsx`, change `estimateConsumption` to use
the **median** of per-trip consumption instead of the mean (sort the
`perTrip` array, take middle element / average of two middles). Update the
labels only if they claim "medio" inaccurately — "mediana" is fine to use, or
keep "medio" as colloquial; prefer keeping current Spanish labels unchanged.

## Files

- `supabase/migrations/0017_data_sanity.sql` (new)
- `src/pages/CostsPage.tsx` (median in `estimateConsumption`)

## Acceptance criteria

- Migration pastes cleanly twice into a DB that already ran it once **or**
  clearly documents which statements are not re-runnable (constraint adds are
  fine to fail loudly on re-run; state this in the header).
- Inserting a trip with `distance_km = 999999` via PostgREST fails with a
  constraint violation.
- Stats views still return the same column names; `npm run type-check` passes.
- No change to any RLS policy or to the anon exposure surface.

## Out of scope

Rate-limiting UPDATEs, the `verified` flag (D2), Supabase CLI workflow (C1).
