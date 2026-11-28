# «Qué agrega el instalador a tu Vigo»

**Status:** Live 2026-11-26 for beta testers and moderators only (gate below). Screenshots from the owner's car (2026-11-27) sit on nine cards (`shots` in the data, files in `public/installer/`, places, distances and the odometer painted over; Spotify as is, owner OK); the other cards keep the placeholder until their screen can be captured (Gallery and Radio after their redesign).

## Context

Owner request 2026-11-26: before installing, owners must see what the installer adds, so they know what to expect afterwards. Audience:
non-technical Vigo owners; Rioplatense Spanish (voseo, «auto»), short and visual. Companion repo sources (read-only): `vigo-hack`
`installer/README.md` + `installer/build_kit.sh` (what a PUBLIC kit carries), `accounts_proxy/MIVIGO.md` (Mi Vigo 2.22 tabs),
`voice_es/DECISIONS.md` (Copiloto), `chargers/STUDY.md`, `charge_app/ENERGY_MERGE.md`, the bundle decisions of 2026-11-21..25.

## Requirements

- Route `#/mi-vigo/preparar/que-agrega`, outside `RequireAuth` (signed-out visitors get «Muy pronto», not a login detour).
- **Gate (owner 2026-11-26, no migration):** the feature list shows only to a signed-in user whose car is in beta (`my_car_beta()`,
  migration 0084: `allowed && beta`) or a moderator (`profiles.is_moderator`, as Moderación). Everyone else, signed out included, sees
  a short «Muy pronto» card with no feature list, and the links to the page (Preparar mi Vigo top card + step 4, Mi Vigo «Mejoras de
  la comunidad») are not rendered. `useInstallerFeaturesAccess()` in `src/lib/installerFeaturesAccess.ts`. The content is public
  information, so this is a UX gate, not security. Drop the gate when the launch installer ships.
- Linked from the top of «Preparar mi Vigo» (a card before the disclaimer: «Antes de empezar, mirá qué vas a tener»), from its step 4
  (where the installer is downloaded) and from Mi Vigo's «Mejoras de la comunidad» card.
- **Benefits, not internals (owner feedback 2026-11-26):** every card states something the owner perceives, in plain Rioplatense
  Spanish, with a picture that makes sense; no internal names (Carga, Open Headunit, Wi-Fi Direct, Google Play services). Fewer,
  stronger cards: 15 in 4 groups — Tu auto y tus cosas, a salvo (Modo invitado, Dashcam, Dónde está tu auto) / Al volante
  (Copiloto: le hablás en español, Waze, Android Auto sin cable, Centro de Energía inteligente) / Música, fotos y pantalla (Radio
  mejorada, Tus fotos en el auto y de fondo, YouTube y Chrome, Spotify, Todo en buen español) / Conectado con WikiVigo (Mi Vigo,
  Actualizaciones remotas, Avisos que no se pierden). Merged: Copiloto + Voz en español (+ the wheel voice key as one phrase);
  Carga + Cargadores cercanos → Centro de Energía inteligente; Galería + Fondo; Avisos de software de Google + Actualizaciones
  automáticas → Actualizaciones remotas; Privacidad into Mi Vigo. Removed: Servicios de Google Play (only «con tu cuenta de Google»
  in Waze and the 3 Google files in «Qué necesitás»), Pantalla de inicio ordenada, Enviar diagnóstico.
- **Modo invitado** (`docs/GUEST_MODE.md` in vigo-hack, `specs/guest-mode.md` here) is the headline: first card, `highlight: true`
  (accent edge, full width). Exactly one highlighted card.
- Each card: name, one-sentence benefit, «Dónde lo encontrás», optional «Necesitás» (phone, account, internet), photo slot
  (`PhotoPlaceholder`, now a shared component).
- The page describes the **first public (launch) installer** (owner decisions 2026-11-26): Waze + Google Play services (mandatory),
  Carga inside Energía (with «Dónde está tu auto»), the Radio, Gallery and Home kits, Dashcam, Android Auto over Wi-Fi Direct
  (Open Headunit) and the virtual T-Box (owner change 2026-11-26), besides Copiloto, Voz, Cargadores,
  Mi Vigo, the Spanish overlays, the tiles and the updater. Each launch item goes in only after passing on a second stock Vigo: a
  process note, not a page badge.
- Every card carries a status (`InstallerFeatureStatus`): `incluido` (no badge), `opcional` (YouTube/Chrome),
  `deFabrica` (Spotify). There is no «Se están probando» section any more (Android Auto joined the launch set). The owner-only V8/Mustang AVAS sound is never listed.
- Sections «Qué no cambia y qué podés deshacer» (Quitar todo, Antes/Después del service, settings copy, driving untouched) and «Qué
  necesitás» (Windows PC, a **USB-A to USB-C** cable to the left port — said plainly that USB-C to USB-C does not work, the owner lost hours on it; same in Preparar mi Vigo's requirements and step 4 —, car on and in P, ~20 minutes, the 3 Google files + Google account, YouTube/Chrome files optional) + a link to Preparar mi Vigo.
- Curated content: `src/data/installerFeatures.json`, typed by `InstallerFeaturesData` in `src/types.ts`. A card whose kit status could
  not be confirmed has a `verify` field (not shown) = the «[verificar]» note.

## Files

`src/data/installerFeatures.json`, `src/lib/installerFeatures.ts`, `src/pages/InstallerFeaturesPage.tsx` (+ `.module.css`, `.test.tsx`),
`src/components/PhotoPlaceholder.tsx` (+ `.module.css`, moved out of PrepareCarPage), `src/pages/PrepareCarPage.tsx` (+ test),
`src/pages/MyVigoPage.tsx`, `src/App.tsx`, `src/types.ts`, `specs/installer-features-photos.md`.

## Acceptance criteria / test plan

- `InstallerFeaturesPage.test.tsx`: every group renders as a region with one card per feature (benefit, «Dónde lo encontrás», photo
  caption); the merged/renamed cards exist and the removed ones do not (no Open Headunit / Wi-Fi Direct text); Modo invitado is
  the first, only highlighted card (PIN, WikiVigo on the phone); badges only on YouTube y Chrome («Opcional») and Spotify; no «Se
  están probando» section; the USB-C to USB-C warning; no AVAS/Mustang/V8 text; ids unique,
  required fields non-empty; undo / needs sections and the
  Preparar mi Vigo link.
- Gate: list for a beta tester and for a moderator (no beta call); «Muy pronto» only for a non-beta user, a view-only member
  (`allowed:false`), a failed call, and signed out (no database call).
- `PrepareCarPage.test.tsx`: the features link sits before the disclaimer (visible without accepting) and again at step 4; links for a
  beta tester, none for a non-beta user or signed out. `MyVigoPage.test.tsx`: the button only for a moderator.
- `npm test`, `npm run type-check`, `npm run build` pass.

## Keep current

If a launch item fails its second-car check and is held back, change its card in the JSON before
the page goes live; drop a `verify` note once it is confirmed. Preparar mi Vigo (Antes del service) and Mi Vigo's «Mejoras de la
comunidad» card name the same set. Outside this repo: vigo-hack `installer/windows/LEEME.txt` still describes Waze/Carga as possibly
missing from the kit.
