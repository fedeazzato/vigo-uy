# Bóveda onboarding: say where the dashcam words are, and a guided flow after pairing the car

**Status:** Phase A implemented. Phase B implemented and deployed (owner 2026-11-21: "do as much as you can now"). Phase C: see its section.

## Context

At the car on 2026-11-21 the owner scanned the car's pairing QR (Mi Vigo, `#/mi-vigo/vincular?c=CODE`), got "Vinculado", and then
found the Bóveda empty: "no 24 words yet" and "no saved passphrase". Two confusions:
1. The dashcam card did not say WHERE the 24 words come from (they are shown by the car's Dashcam app, not by the pairing QR), so a
   user cannot find them. Owner: the card must say "Dashcam > Ajustes > Frase de recuperación: escanea el QR que muestra el auto".
2. Pairing, the passkey, the backup passphrase and the dashcam words are four separate steps in three places. Owner: "can any of these
   be made simpler just when scanning the first QR code?"

The project's end goal is to reach non-technical Vigo owners (`vigo-hack/wikivigo/DISTRIBUTION.md`), so fewer, guided steps matter.

## Phase A (implemented): say where the words are

- R-A1. The dashcam card's description names the place: app **Dashcam › Ajustes › Frase de recuperación** (after the PIN), "escanea el
  QR que muestra el auto"; the first-run screen of the Dashcam also shows it.
- R-A2. The empty state ("Todavía no guardaste la frase.") carries the same hint, so the next step is visible without reading the card.
- R-A3. The hint mentions that the Dashcam app must be installed on the car (until then there are no words).
- Files: `src/pages/VaultPage.tsx`, `src/pages/VaultPage.test.tsx`, `specs/secret-vault.md` (R6 line).
- Test plan: the empty dashcam card shows "Dashcam › Ajustes › Frase de recuperación" and "escanea el QR que muestra el auto".

## Phase B (implemented): guided flow right after "Vinculado"

After `claim_car_pairing` succeeds, `LinkCarPage` shows a short checklist instead of a dead end:
1. **Llave de acceso** (if the user has none): "Activar con huella o rostro" inline (the Bóveda's enrolment), with the nudge to add a
   second device later.
2. **Clave de respaldo de ajustes**: "Generar una clave fuerte" inline (same component as the Bóveda card), saved with the passkey
   prompt already open in step 1 when possible (one UV prompt per operation stays: R1 "no caching").
3. **Frase de la dashcam**: if the paired car reports the Dashcam app (car-link device info), "En el auto: Dashcam › Ajustes › Frase de
   recuperación → escanea el QR"; the scanner opens here. If not installed: "Cuando instales la Dashcam".
Each step can be skipped ("Más tarde") and is then shown in the Bóveda. Nothing new is stored; it only re-arranges existing actions.

As built (2026-11-21): `src/components/VaultChecklist.tsx` rendered by `LinkCarPage` after a successful claim. The car does not report
whether the Dashcam is installed (no such device info today), so step 3 always shows the hint with "Todavía no tengo la Dashcam" as
its skip. Steps 2 and 3 need step 1 (the passkey) first. A generated passphrase is shown once (2 min, cleared on hide/pagehide).
"Guardar una que ya tengo" stays in the Bóveda (linked). Tests: `src/components/VaultChecklist.test.tsx` (order and real state,
already-saved items, skipping, bad QR saves nothing, no-PRF browser, passphrase hidden on visibilitychange); `LinkCarPage.test.tsx`
checks the checklist appears after "Vinculado".

## Phase C (design): no second QR at all: the car sends the words into the vault, still end-to-end

Why not just put the words in the pairing QR: **rejected**.
- The pairing QR is shown on the car WITHOUT the Dashcam PIN; the words are PIN-gated in the Dashcam app today. Putting them in the
  pairing QR would show the recordings' key to anyone at the screen.
- The pairing QR opens a WikiVigo URL; anything in it lands in the phone browser's history (and synced history, e.g. Chrome sync),
  even in the `#` fragment that the server never sees.

Proposed instead, a **vault inbox** with asymmetric encryption, keeping the server blind:
- C1. When the first passkey is enrolled, the browser also creates an ECDH P-256 key pair; the private key is stored wrapped by the
  vault's data key (DK) like any item; the public key is published in a new `vault_inbox_keys` row (readable by the user's linked
  car devices only).
- C2. The paired car (Dashcam app, after the owner enters the PIN and taps "Guardar en WikiVigo") fetches that public key through the
  car-link API (device-signed calls, `car-link-phase0.md`), encrypts the words with ECIES (ephemeral ECDH + HKDF + AES-256-GCM, AAD
  = user id + kind) and uploads the ciphertext to `vault_inbox` (insert-only for the device, readable by the user).
- C3. Next time the user opens the Bóveda (passkey prompt), the browser unwraps the inbox private key, decrypts the inbox item,
  re-encrypts it as a normal `dashcam_recovery` item with the DK, and deletes the inbox row.
- Security: WikiVigo/Supabase only ever hold ciphertext (unchanged property); the car never sees the DK; a stolen session token cannot
  read the inbox (needs the private key, wrapped by the DK, which needs the passkey); a malicious server could swap the public key
  (same trust as serving the page's JavaScript today: documented in the threat model of `secret-vault.md`); the words still require
  the Dashcam PIN on the car to be sent.
- Cost: a migration (`vault_inbox_keys`, `vault_inbox`, RLS, car-link RPC), browser crypto (ECIES in WebCrypto), Dashcam app UI +
  car-link client. Medium.

## Decisions for the owner
- Phase B: built (owner 2026-11-21).
- Phase C: worth the migration and car-side work, or is one QR scan in the Dashcam app (Phase A wording) enough?
