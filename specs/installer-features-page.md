# «Qué agrega el instalador a tu Vigo»

**Status:** Implemented (2026-11-26). Photos are placeholders until the screenshots in `specs/installer-features-photos.md` are taken.

## Context

Owner request 2026-11-26: before installing, owners must see what the installer adds, so they know what to expect afterwards. Audience:
non-technical Vigo owners; Rioplatense Spanish (voseo, «auto»), short and visual. Companion repo sources (read-only): `vigo-hack`
`installer/README.md` + `installer/build_kit.sh` (what a PUBLIC kit carries), `accounts_proxy/MIVIGO.md` (Mi Vigo 2.22 tabs),
`voice_es/DECISIONS.md` (Copiloto), `chargers/STUDY.md`, `charge_app/ENERGY_MERGE.md`, the bundle decisions of 2026-11-21..25.

## Requirements

- Route `#/mi-vigo/preparar/que-agrega`, **public** (outside `RequireAuth`): it holds no secret and owners read it before deciding.
- Linked from the top of «Preparar mi Vigo» (a card before the disclaimer: «Antes de empezar, mirá qué vas a tener»), from its step 4
  (where the installer is downloaded) and from Mi Vigo's «Mejoras de la comunidad» card.
- One card per feature, grouped: Manejo y voz / Energía y carga / Apps que se suman (third-party apps) / Pantalla de inicio y Mi Vigo /
  Privacidad y avisos / Actualizaciones y ayuda. Each card: name, one-sentence benefit, «Dónde lo encontrás», optional «Necesitás»
  (phone, account, internet), photo slot (`PhotoPlaceholder`, now a shared component).
- Every card carries the status of the **public** kit (`InstallerFeatureStatus`): `incluido` (no badge), `opcional`, `pronto`
  («Todavía no en el instalador»: decided for every owner but assisted kits only until a second car passed: Waze, Google Play services,
  Carga, car location), `deFabrica` (Spotify). Features only on the test car (`enPrueba`: Android Auto, Radio, Galería, Dashcam) go to a
  folded «Se están probando» list. The owner-only V8/Mustang AVAS sound is never listed.
- Sections «Qué no cambia y qué podés deshacer» (Quitar todo, Antes/Después del service, settings copy, driving untouched) and «Qué
  necesitás» (Windows PC, USB-C to the left port, car on and in P, ~20 minutes, optional Google files) + a link to Preparar mi Vigo.
- Curated content: `src/data/installerFeatures.json`, typed by `InstallerFeaturesData` in `src/types.ts`. A card whose kit status could
  not be confirmed has a `verify` field (not shown) = the «[verificar]» note.

## Files

`src/data/installerFeatures.json`, `src/lib/installerFeatures.ts`, `src/pages/InstallerFeaturesPage.tsx` (+ `.module.css`, `.test.tsx`),
`src/components/PhotoPlaceholder.tsx` (+ `.module.css`, moved out of PrepareCarPage), `src/pages/PrepareCarPage.tsx` (+ test),
`src/pages/MyVigoPage.tsx`, `src/App.tsx`, `src/types.ts`, `specs/installer-features-photos.md`.

## Acceptance criteria / test plan

- `InstallerFeaturesPage.test.tsx`: every group renders as a region with one card per feature (benefit, «Dónde lo encontrás», photo
  caption); the «Apps que se suman» group has Waze (badged «Todavía no en el instalador»), YouTube y Chrome, Spotify; the testing list
  exists; no AVAS/Mustang/V8 text; ids unique, required fields non-empty, testing entries are `enPrueba`; undo / needs sections and the
  Preparar mi Vigo link.
- `PrepareCarPage.test.tsx`: the features link sits before the disclaimer (visible without accepting) and again at step 4.
- `npm test`, `npm run type-check`, `npm run build` pass.

## Keep current

When a kit gate opens (second car passed for Waze / Carga) or a test-car feature joins the installer, change its `status` in the JSON and
drop its `verify` note.
