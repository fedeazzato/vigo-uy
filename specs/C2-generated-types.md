# C2 — Generated database types

**Status:** TODO · **Phase:** C · **Depends on:** C1 (linked project)

## Context

`src/types.ts` hand-maintains interfaces for every Supabase table/view, and
every read is a blind cast (`data as TripLog[]`). Schema drift is invisible
until runtime. Supabase can generate exact types from the live schema,
turning drift into compile errors.

## Requirements

1. Generate `src/lib/database.types.ts` via
   `supabase gen types typescript --linked > src/lib/database.types.ts`.
   Add an npm script: `"gen:types": "supabase gen types typescript --linked > src/lib/database.types.ts"`.
2. Type the client in `src/lib/supabaseClient.ts`:
   `createClient<Database>(...)`, exported type becomes
   `SupabaseClient<Database> | null`. This makes `.from('trip_logs')`
   returns/inserts fully typed and flags invalid column names at compile
   time.
3. Reconcile `src/types.ts`:
   - Keep all **curated JSON** interfaces (ChargingData, CostsData, …) —
     they are not DB shapes.
   - For DB rows, re-export aliases from the generated types, e.g.
     `export type TripLog = Database['public']['Tables']['trip_logs']['Row']`
     so page imports don't change. Views:
     `Database['public']['Views']['vehicle_km_leaderboard']['Row']`, etc.
   - `TripChargingStop` stays hand-written (jsonb has no generated shape);
     keep the cast at that boundary only.
   - RPC return types (`admin_list_users`) come from
     `Database['public']['Functions']`.
4. Remove now-redundant `as X[]` casts where the typed client already infers
   the row type; keep casts only at jsonb boundaries. Fix any mismatches the
   compiler reveals (that's the point — document each in the PR).
5. CLAUDE.md: note the `gen:types` script and that `database.types.ts` must
   be regenerated after every migration.

## Files

- `src/lib/database.types.ts` (new, committed)
- `src/lib/supabaseClient.ts`, `src/types.ts`, `package.json`, `CLAUDE.md`
- Any page whose casts the typed client makes redundant or reveals as wrong

## Acceptance criteria

- `npm run type-check` passes with the typed client.
- Deliberately misspelling a column in a `.select()` fails type-check.
- No behavior change; curated JSON typing untouched.
