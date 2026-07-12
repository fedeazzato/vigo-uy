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
| parts.json prices | part_purchases | per-category ≥3 | pending — parts.json carries no prices yet (`TODO(D1)` in PartsPage) |
| charging.json | needs a `charging_stations` community table | — | future work |
| mantenimiento.json (dealerPrices) | service_entries by type | — | future work |
| ficha-tecnica.json, tech-faq.json, accessories.json | permanently curated | n/a | keep |

Notes:

- `CostsPage.estimateConsumption` keeps its own ≥3-samples gate (the original
  instance of this pattern) — deliberately not routed through
  `preferCommunity`, which returns one source or the other, while the
  consumption stat is additive.
- Verified rows (D2, "Oficial" badge) may later become the only rows that
  count toward thresholds — hook noted on `preferCommunity`.
