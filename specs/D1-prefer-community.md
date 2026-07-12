# D1 — `preferCommunity` gate + static-content retirement tracker

**Status:** Done (2026-07-12) · **Phase:** D · **Depends on:** nothing

## Context

Strategic direction (owner decision): the curated JSON under `src/data/` is
transcribed from the WhatsApp group and is **placeholder filler** — community
data should progressively replace it, and both must coexist until each
section has enough real data. The codebase already contains the right
pattern once: `CostsPage.tsx`'s `estimateConsumption` only renders when
`MIN_CONSUMPTION_SAMPLES = 3` qualifying trips exist. This spec generalizes
that pattern and creates the tracking checklist for the phase-out.

## Requirements

### 1. Helper in `src/lib/communityData.ts`

```ts
export function preferCommunity<T, U>(options: {
  curated: T
  community: U[]
  minSamples: number
}): { source: 'comunidad'; data: U[] } | { source: 'grupo'; data: T }
```

Returns the community data when `community.length >= minSamples`, otherwise
the curated fallback. Trivial on purpose — the value is the uniform
convention, the per-section constants living in one place, and the tagged
`source` forcing callers to render provenance.

### 2. Apply per section (initial rollout)

- **CostsPage "Casos reales"**: when ≥ 5 public community service entries
  exist, show only community entries + a note "estos datos vienen de la
  comunidad"; below the threshold show curated `realCases` first (current
  behavior). Curated cases keep the "Oficial" badge, community keep
  "Comunidad" (existing badge pattern).
- **RoutesPage community trips section**: same gate with `minSamples: 5` —
  above it, curated route cards collapse to a shorter "Guía de rutas" intro
  or move below the community section (community-first ordering).
- **PartsPage**: if it renders curated price references from
  `src/data/parts.json`, gate them against `part_purchases` counts per
  category where feasible; otherwise leave a `TODO(D1)` comment with the
  intended gate.
- Keep `estimateConsumption`'s existing gate; optionally refactor it to
  route through the helper only if it stays readable.

### 3. Provenance labeling audit

Every curated block on pages that also show community data must carry the
"Oficial"/"Del grupo" badge, and every community block the "Comunidad" badge.
Audit ChargingPage, CostsPage, RoutesPage, PartsPage, MantenimientoPage and
add missing badges (reuse `Badge` from `UI.tsx`).

### 4. Retirement tracker — `specs/CONTENT-MIGRATION.md` (new)

A table: each `src/data/*.json` file → its dynamic replacement, gate
threshold, current status. Initial contents:

| Curated file | Dynamic source | Gate | Status |
|---|---|---|---|
| costs.json (realCases) | service_entries | ≥5 | gated (this spec) |
| routes.json (trip section) | trip_logs | ≥5 | gated (this spec) |
| parts.json prices | part_purchases | per-category ≥3 | pending |
| charging.json | needs a `charging_stations` community table | — | future work |
| mantenimiento.json | service_entries by type | — | future work |
| ficha-tecnica.json, tech-faq.json, accessories.json | permanently curated | n/a | keep |

Link this tracker from `CLAUDE.md`'s curated-content section.

## Files

- `src/lib/communityData.ts`
- `src/pages/CostsPage.tsx`, `RoutesPage.tsx`, `PartsPage.tsx` (+ others per
  the badge audit)
- `specs/CONTENT-MIGRATION.md` (new), `CLAUDE.md`

## Acceptance criteria

- With an empty/near-empty database, every page renders the curated content
  exactly as today (fallback path).
- Seeding ≥ threshold rows flips the gated sections to community-first
  without code changes.
- Every mixed page visibly distinguishes provenance via badges.
- Tracker exists and is linked from CLAUDE.md; Spanish UI text;
  `npm run type-check` passes.
