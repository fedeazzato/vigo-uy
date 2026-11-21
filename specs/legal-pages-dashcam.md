# Legal pages for the Vigo Dashcam Google client (home, privacy policy, terms)

**Status:** Implemented; deploy on the owner's request (`npm run deploy`).

## Context

The car's dashcam app (companion repo `vigo-hack/dashcam`) uploads clips to each driver's own Google Drive through ONE shared Google
OAuth client owned by the site owner (`vigo-hack/dashcam/uploader/OAUTH_SETUP.md`, decision 2026-11-21: the improvements must reach
non-technical Vigo owners). To publish that client ("In production"), Google's consent-screen Branding asks for an application home
page, a privacy policy link and a terms of service link, all on an authorized domain. The site is a HashRouter SPA on GitHub Pages
(`https://fedeazzato.github.io/vigo-uy/`): the pages must be readable without JavaScript and without a `#` fragment, so a reviewer or
crawler gets the text from plain HTML.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Where | Static files in `public/legal/dashcam/` (`index.html`, `privacidad.html`, `terminos.html`), copied as-is by Vite to `/vigo-uy/legal/dashcam/...`. No React route. |
| D2 | Language | Latin American Spanish (site language rule), plain wording for non-technical owners. |
| D3 | Contact | The repository's public GitHub issues page; the owner may add the consent screen's support e-mail later (one line in each page). |
| D4 | Jurisdiction | Uruguay (the community is "Amantes de la Vigo Uruguay"); owner may change it. |
| D5 | Service worker | `/legal/` is excluded from the PWA navigation fallback so these URLs never get the SPA shell. |

## Requirements

- R1. `index.html` (application home page): what the app does, what it accesses at Google (scope `drive.file` only), links to the
  privacy policy and the terms, the developer, and that it is a community project not affiliated with Dongfeng or Google.
- R2. `privacidad.html`: data accessed (only files the app creates in the driver's Drive), where data lives (the car and the driver's
  own Drive; nothing sent to the developer or to WikiVigo), the GPS track (encrypted on the car, never uploaded), burned-in date/time/speed,
  OpenStreetMap tiles for the map search, the stored sign-in (refresh token, encrypted on the car), no analytics/ads,
  no sale or transfer, how to revoke (car + myaccount.google.com/permissions), retention (unlocked copies removed after 7 days, locked
  kept), and Google's "Limited Use" disclosure: "El uso y la transferencia a cualquier otra aplicación de la información recibida de las
  API de Google se ajustará a la Política de Datos de Usuario de los Servicios de API de Google, incluidos los requisitos de Uso Limitado."
  with a link to https://developers.google.com/terms/api-services-user-data-policy.
- R3. `terminos.html`: free community software "as is", no warranty, the driver is responsible for recording laws and other people's
  privacy, never operate it while driving, Drive storage is the driver's own (space and cost), the service can change or stop,
  limitation of liability, governing law (D4), contact (D3).
- R4. The SPA's service worker does not serve `index.html` for `/vigo-uy/legal/*` navigations (D5).

## Files

- `public/legal/dashcam/index.html`, `privacidad.html`, `terminos.html` (new)
- `vite.config.ts` (`workbox.navigateFallbackDenylist`)
- `src/legalPages.test.ts` (new)

## Test plan

`src/legalPages.test.ts` (Vitest, reads the files from disk):
- the three files exist, declare `lang="es"`, a `<title>` and a viewport meta;
- the home page links to `privacidad.html` and `terminos.html`;
- the privacy policy names the `drive.file` scope, contains the Limited Use sentence and the Google policy link, and the revoke URL;
- the terms mention "sin garantía" and the governing law;
- no page loads a script (`<script` absent), so the text is readable without JavaScript;
- `vite.config.ts` contains the `/legal/` navigation denylist.

## Owner steps

1. `npm run deploy` (or ask Claude to). Check the three URLs open on a phone.
2. Google Auth Platform > Branding: Application home page `https://fedeazzato.github.io/vigo-uy/legal/dashcam/`, Privacy policy
   `https://fedeazzato.github.io/vigo-uy/legal/dashcam/privacidad.html`, Terms of service
   `https://fedeazzato.github.io/vigo-uy/legal/dashcam/terminos.html`; Authorized domains: `fedeazzato.github.io`.
3. Publish the app (Audience > Publish app).
