# Licences and sources page

## Context
Before the car bundle is given to other Vigo owners (vigo-hack `wikivigo/DISTRIBUTION.md` section 5), every third-party part the car
apps and the installer ship or download must be listed with its licence and source. espeak-ng (GPL-3.0-or-later, linked into
sherpa-onnx in "Voz en español") requires an offer of the corresponding source; the Supertonic voice weights (BigScience Open RAIL-M)
require the use restrictions and the licence to travel with the voice. Inventory sources: vigo-hack `tts_es/SOURCES.txt`,
`voice_es/tools/vosk/SOURCES.txt`, `installer/README.md`, `installer/GMS_PLAN.md`, Carga's `TrackMapView.java` (OSM tiles),
Cargadores (Open Charge Map).

## Requirements
- Route `#/licencias` ("Licencias y código fuente"), public, linked from the sidebar footer and from "Preparar mi Vigo"'s disclaimer.
- Curated data in `src/data/licences.json` (`LicencesData` in `src/types.ts`): groups of components, each with name, version,
  licence, licence link, source link, what we changed, flags `gpl` / `restrictions`.
- GPL source offer (links + a no-cost copy on request), Open RAIL-M use-restrictions summary with the full licence link.
- Our own code: the site is MIT; the car apps' and installer's licence is shown as pending (the owner has not chosen one).
- Not listed: build-only tools that are never shipped (r8, apktool, android.jar platform 29, the laptop bench jars).

## Files
`src/data/licences.json`, `src/types.ts`, `src/pages/LicencesPage.tsx` (+ `.module.css`, `.test.tsx`), `src/App.tsx`,
`src/components/Layout.tsx`, `src/pages/PrepareCarPage.tsx`.

## Acceptance / test plan
- `LicencesPage.test.tsx`: every component has non-empty fields and https links; eSpeak NG (gpl), sherpa-onnx v1.13.8 source,
  Supertonic 2 (restrictions), Vosk, JNA, Open Charge Map, OpenStreetMap, Platform-Tools and Waze are present; the page renders the
  source offer, the restrictions card, the pending own-code licence and one licence link per component.
- Re-check this page whenever `SOURCES.txt` files, the default voice or the installer's downloads change.
