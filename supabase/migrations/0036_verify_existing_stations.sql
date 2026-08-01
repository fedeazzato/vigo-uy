-- The two charging_stations rows that predate the 0034 OpenChargeMap seed
-- ("Ancap Rocha", backfilled with ocm_id 260138 in 0034; "Terminal Punta
-- del Diablo", no OCM match found) were left unverified — they didn't wear
-- the "Oficial" badge (0020) while all 209 seeded stations did, even
-- though every row (seeded and these two) is attributed to the same
-- account. Verify both for consistency.
-- Apply with `npx supabase db push`.

update public.charging_stations
set verified = true
where name in ('Ancap Rocha', 'Terminal Punta del Diablo')
  and network = 'ute'
  and verified = false;
