# "Preparar mi Vigo": engineering-menu codes and installer download

**Status:** Implemented (2026-11-21); updated 2026-11-23 for the mandatory Waze + Google Play services step (D7, D8). The installer download link is a placeholder until the zip is hosted.

## Context

The first community bundle (companion repo `vigo-hack`, `wikivigo/DISTRIBUTION.md` sections 3.1 and 3.2, owner decisions of 2026-11-21) is
installed from a Windows PC over USB (`vigo-hack/installer/windows`). Before the installer can reach the car, the owner has to turn on ADB
from the head unit's engineering menu. That menu asks for two codes:

- **Factory**, derived from the car's PDSN serial;
- **Master**, a fixed code for the platform.

Each prompt locks after about 5 wrong tries. A third code (SU, from `persist.radio.sn`) is computed by the installer itself and is never
shown to the owner. This page guides the owner through the menu and computes the Factory code for their PDSN.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Where | Route `#/mi-vigo/preparar`, behind `RequireAuth` (owner request: behind sign-in), with a link card on Mi Vigo (signed-in part). |
| D2 | Where the calculation runs | In the browser (`crypto.subtle` SHA-256). The PDSN is never sent anywhere and never stored: no Supabase call, no `localStorage`, component state only. |
| D3 | Input normalization | Remove all whitespace; keep the case as typed (the algorithm hashes the exact characters). Letters and digits only. A hint appears if the PDSN has lowercase letters. The page echoes the PDSN it used so the owner can compare it with the screen before spending a try. |
| D4 | Disclaimer | The "Bajo tu propio riesgo" text (`vigo-hack/wikivigo/DISCLAIMER_draft.md`) comes first. The steps, the codes and the download only show after the owner ticks "Leí y acepto". The acceptance is not stored. |
| D5 | Photos | Placeholders (dashed box + caption) until the owner takes the photos. |
| D6 | Download | Disabled "Próximamente" button until the zip is hosted. The URL is one constant (`INSTALLER_URL`, `null` for now). |
| D7 | Google files (2026-11-23) | Waze + Google Play services are a mandatory part of the install (vigo-hack `installer/README.md` "Waze y Google Play services"). New page `#/mi-vigo/preparar/archivos-google` ("Archivos de Google para el instalador", `GoogleFilesPage`) tells the owner which APKMirror variants to pick, mirroring the installer checks: Waze 5.28.x `.apkm`, arm64-v8a, minSdk <= Android 10, xxhdpi density split; Google Play services >= 26.45 `.apkm`, "arm64-v8a + arm-v7a", "Android 10+", a dpi range that includes the mdpi split; Google Services Framework, the Android 10 `.apk`. Links are APKMirror search pages only (no file URLs, no exact version numbers we cannot confirm). It says the installer verifies Waze/Google signatures, so a wrong file is refused. |
| D8 | Current flow on Preparar mi Vigo (2026-11-23) | "Qué necesitás" lists the 3 Google files (link to D7) and the Google account; step 4 says the installer asks for the files; disclaimer gains the installer text "Waze y la cuenta de Google"; step 5 = Google sign-in on the car screen ("Probar otra manera" if asked for a passkey); a card explains "Quitar todo", "Antes del service" (with "¿Ocultar también las apps?" = Sí removing everything incl. Waze and Google) and "Después del service". |

## Security note

The calculator helps only an owner who is physically in their car: the PDSN is read on the car's own screen, and the codes are typed on that
same screen. The algorithm is public knowledge (`github.com/akokarev/vigo_pass_root`, "VIGO / Qualcomm Password Calculator"). The page adds
no capability that a person sitting in the car does not already have. The sign-in requirement is only a product choice (it keeps the page
for registered owners); it is not a security boundary. The SU code is deliberately not offered: the installer reads the radio serial over ADB
and keeps that code out of every screen and log.

## Requirements

- R1. `src/lib/vigoPass.ts`:
  - `normalizePdsn(raw)`: whitespace removed;
  - `isValidPdsn(s)`: 6 to 40 letters or digits;
  - `factoryCode(pdsn)`: async; `"DfCs" + sha256hex(sha256hex(interleave(pdsn, "E13S31NMP5DfCs24"))).slice(0, 8) + "#!"`, the same as `vigo-hack/vigo_pass.ts`;
  - `MASTER_CODE = "DfCs0715#!"`.
- R2. The page `PrepareCarPage` shows, in order:
  1. the header;
  2. the disclaimer with an "acepto" checkbox;
  3. once accepted: what you need (the car on and in P, a Windows PC, a USB-C cable to the LEFT console port);
  4. step 1, find the PDSN (Ajustes > Información del vehículo > Acerca del IVI > "Número de serie PDSN"), with the input and a photo placeholder;
  5. step 2, open the engineering menu (Ajustes > Sistema, tap the software-version line about 7 times), with the Factory code and a photo placeholder;
  6. step 3, turn on the hidden `adb开启` switch, with the Master code and a photo placeholder;
  7. step 4, download and run the installer;
  8. a note that ADB turns off by itself at the next restart, as from the factory.
- R3. The "~5 tries" warning sits next to the codes. Codes show in a large monospace font with a hint on letter case (`DfCs` + lowercase letters and digits + `#!`).
- R4. No network request and no storage write with the PDSN.
- R5. A Mi Vigo card (signed-in part) links to the page.

## Files

- `src/lib/vigoPass.ts`, `src/lib/vigoPass.test.ts` (new)
- `src/pages/PrepareCarPage.tsx`, `PrepareCarPage.module.css`, `PrepareCarPage.test.tsx` (new)
- `src/App.tsx` (route), `src/pages/MyVigoPage.tsx` + `MyVigoPage.test.tsx` (link card)

## Test plan

- `vigoPass.test.ts`:
  - the made-up PDSN `TESTPDSN0000000001` → `DfCs250d52d0#!`; `ABC` → `DfCs15423203#!`. Both vectors were computed with `vigo-hack/vigo_pass.ts`.
  - Whitespace is ignored after `normalizePdsn`.
  - `isValidPdsn` rejects symbols and too-short input.
  - `MASTER_CODE` is the fixed value.
- `PrepareCarPage.test.tsx`:
  - The codes and steps are hidden until the disclaimer box is ticked.
  - Typing the test PDSN shows `DfCs250d52d0#!` and the echoed PDSN.
  - The Master code is shown.
  - The lowercase hint appears for a lowercase PDSN.
  - An invalid PDSN shows no Factory code.
  - `fetch` is never called, and `localStorage.setItem` never receives the PDSN.
  - The download button is disabled ("Próximamente") while `INSTALLER_URL` is null.

### D7/D8 additions (2026-11-23)

- `src/pages/GoogleFilesPage.tsx` + `GoogleFilesPage.test.tsx` (new), route in `src/App.tsx`.
- `GoogleFilesPage.test.tsx`: every external link is an APKMirror URL, three are search pages; the 26.45 rule, the signature text and the
  back link are shown.
- `PrepareCarPage.test.tsx` (now in a `MemoryRouter`): both links to the Google files page; "Probar otra manera", "Ocultar también las
  apps" and "Después del service" are shown after accepting.
