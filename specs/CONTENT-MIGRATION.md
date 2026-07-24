# Static-content retirement tracker (D1)

The curated JSON under `src/data/` is transcribed from the WhatsApp group and
is placeholder filler: community data progressively replaces it. Each section
flips to community-first via `preferCommunity()` in `src/lib/communityData.ts`
once it crosses its sample threshold — no code change needed at flip time.

Update this table whenever a gate is added, a threshold changes, or a curated
file is finally deleted.

| Curated file | Dynamic source | Gate | Status |
|---|---|---|---|
| costs.json (realCases) | service_entries | ≥5 public entries | gated (D1) |
| routes.json (route cards) | trip_logs | ≥5 public trips | gated (D1) |
| parts.json prices | part_purchases (repuestos categories) | per-category ≥3 | pending — parts.json carries no prices yet (`TODO(D1)` in PartsPage) |
| accessories.json prices | part_purchases (accessory categories, added when the purchase form was broadened to cover both) | per-category ≥3 | pending — same situation as parts.json prices, no curated prices to gate yet (`TODO(D1)` in AccessoriesPage) |
| charging.json (chargers + alerts) | `charging_stations` + `station_reports` + computed `charging_cost_stats` | per-network ≥3 charges with cost+kWh | gated (D4) |
| charging.json (home/V2L/troubleshooting/autonomy) | permanently curated | n/a | keep |
| mantenimiento.json (dealerPrices) | service_entries by type | — | future work |
| ficha-tecnica.json, tech-faq.json | permanently curated | n/a | keep |
| accessories.json (category descriptions/tips) | permanently curated | n/a | keep — only the descriptive text; purchase prices/recommendations now come from part_purchases, see row above |

Notes:

- Site search (`src/lib/siteSearch.ts`, specs/site-search.md) indexes curated
  JSON text directly, independent of `preferCommunity()`. When a row above
  flips a page's stats/lists to `comunidad`, that page's curated prose (tips,
  troubleshooting, disclaimers) stays in the search index regardless —
  search coverage of a page shouldn't quietly shrink just because its data
  view went community-first.
- `CostsPage.estimateConsumption` keeps its own ≥3-samples gate (the original
  instance of this pattern) — deliberately not routed through
  `preferCommunity`, which returns one source or the other, while the
  consumption stat is additive.
- Verified rows (D2, "Oficial" badge) may later become the only rows that
  count toward thresholds — hook noted on `preferCommunity`.
