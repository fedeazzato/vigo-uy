# Head-unit look: WikiVigo styled like the Vigo's own screens

Status: **approved by the owner 2026-11-19** (decisions D1-D4 below). Not deployed until the owner reviews the result (`npm run deploy` is manual).

## Context

The owner wants WikiVigo to feel like part of the car: someone who moves between the Vigo's screen (Energy, Settings, our own Carga/Copiloto apps, which already reuse the stock design) and WikiVigo on the phone should recognise the same visual language.

The car's design system was extracted from the head unit's stock apps and is documented in the companion repo: `C:\Projects\vigo-hack\design\STOCK_DESIGN_SYSTEM.md` (colour tokens day/night, typography, shapes, components, states). Its character in one line: **flat, low-contrast layered greys at night (black window, `#1a1a1a` cards, `#242424` tracks/secondary buttons, `#3d3d3d` selected pills/primary buttons), warm brown/beige by day, one warm amber accent (`#e0a876` night) for "on" and the selected-tab line, Roboto, 4 px corners, no pill buttons, no shadows, no blue.**

WikiVigo today (`src/index.css`): neutral light theme by default plus a dark theme (`data-theme`, following the system unless the user picked one in Mi Vigo, `UserPrefsContext`), green brand colour (`--green-*`, also used for links), blue/amber/red semantic scales, Inter + Space Grotesk, radii 6-20 px, a 220 px sidebar on desktop and the mobile navigation of `B1-mobile-navigation.md`. Colour tokens are referenced in 19 files (`--green-600` 47 times, `--green-400` 24, `--green-50` 18), so most of the change is a token remap rather than per-component rewrites.

The car is used in night mode almost always; phones switch between light and dark. So the site keeps both themes and maps them to the car's two themes: **dark = car night, light = car day**.

## Requirements

### R1. Tokens (src/index.css)
Replace the palette with the car's tokens, keeping the existing variable roles so components keep working:

| Role | Dark (car night) | Light (car day) | Car source |
|---|---|---|---|
| page background (`--surface-secondary`) | `#000000` | `#f7f7f7` | window `bg` |
| card (`--surface`) | `#1a1a1a` | `#ffffff` | `color_dialog` |
| raised/selected fill | `#3d3d3d` | `#f1efec` / tan `#c39f84` for primary | `df_color_dialog_confirm_btn_nor`, `rg_background_color` |
| secondary fill (inputs, tracks, secondary buttons) | `#242424` | `#f1efec` | `rg_background_color`, `color_limit_back` |
| text primary | `#dbdbdb` (titles `#ffffff`) | `#614d40` (titles `#47382f`) | `color_black`, `text_title_color` |
| text secondary | `#8a8a8a` (car: `#666666`, lifted for WCAG AA on black) | `#897267` | `color_gray`, `select_false` |
| accent (links, selected line, switches on, focus ring) | `#e0a876` | `#af7d5f` (text) / `#c39f84` (fills) | `system_text_color`, `color_tab_underline`, DFSwitch |
| warning | `#ffa800` | `#f29913` | `carcenter_main_tab_btn_slted_error` |
| error | `#ff3e3e` | `#ca6d36` | `alert_color` |
| dividers | `#1a1a1a` on black / `#3d3d3d` in cards | `#ece8e3` | `bottom_line_color`, `text_color_5per` |
| chart series | `#bb81c8`, `#6a98fb`, `#ded8e7` | same | Energy 7-day chart |

The `--green-*` brand scale disappears; its uses move to the accent tokens (see decision D1 for "success").

### R2. Typography
Roboto (Apache-2.0, self-hosted via `@fontsource/roboto` like Inter today) for everything; remove Inter and Space Grotesk. Weights 400/500/700. Titles use weight and size, not a display font. Sizes are scaled for the web (R4), not copied 1:1.

### R3. Shapes and depth
- Radius 4 px for cards, buttons, inputs, dialogs, pills (`--radius-sm/md/lg/xl` all collapse to 4 px; the stock Settings card's ~16 px is the only exception and is not used).
- No shadows, no gradients (except where the car itself has one), no pill-shaped buttons.
- Depth comes from the layered greys of R1.

### R4. Sizing for the web
The car's sizes are for a 1920x970 landscape screen read at arm's length (labels 28-30 sp, rows 90-120 dp). WikiVigo keeps phone-friendly sizes, with a fixed **car-to-web scale of about 0.5**: e.g. car rail item 90 dp → 48 px, label 30 sp → 16 px, card padding 40 dp → 20 px, primary button 240x88 → 120x44 px minimum (44 px touch target). One table of these mappings lives in `index.css` comments.

### R5. Components (src/components/UI.tsx, UI.module.css, Layout)
- **Navigation (desktop):** the sidebar becomes the car's left tab rail: full-width rows, selected row = 10 % white fill (day: `#99f5e4cb` cream) + a 3 px accent line on the RIGHT edge, unselected label in text secondary, line icons grey → white when selected. A 2 px divider right of the rail.
- **Navigation (mobile):** keep the `B1` structure; restyle the bar with the same selected treatment (accent line under the active item instead of a filled chip).
- **Card / CardTitle:** flat card colour, 4 px radius, generous padding, title in text primary weight 500; no border in dark (layered greys), 1 px `#ece8e3` border in light.
- **Buttons:** primary = car confirm (`#3d3d3d` night / `#c39f84` day, white text), secondary = car cancel (`#242424` / `#dad1ca`), pressed = 60 % alpha (car pressed state), disabled = 30 %.
- **Switch:** a CSS replica of DFSwitch (track 40x17 radius 2, knob 14x14 radius 1 white, off `#393939`/`#e0d3ca`, on accent), 200 ms.
- **Segmented control / radio groups:** the car's "pill" group: `#242424` track, the selected segment `#3d3d3d` (day tan) sliding under the label.
- **Badges** (`manual`/`comunidad`, verified): flat 4 px chips; curated = secondary fill with text primary, community = accent outline. Keep the two visually distinct (CLAUDE.md rule).
- **Dialogs/modals** (`MapModal`, `StationPickerModal`): car dialog: card colour, 4 px, dim `#cc000000` night / `#99000000` day, close icon at top-left like the car.
- **Alerts/banners** (`Alert`, `OfflineBanner`): card colour with a 3 px left bar in warning/error/accent; no tinted backgrounds.
- **Charts** (stats, costs): the Energy chart look: 2 px line in `#bb81c8`, filled dots with the value above, thin `#e0dbe8` axes, no grid.
- **Maps:** keep the per-theme tiles; check the dark tiles sit well on `#000` and pick a warmer light tile style if the current one clashes with beige.

### R6. Assets and copyright
Nothing is copied from the head unit's firmware (no stock PNGs, 9-patches, icons or Lottie files): WikiVigo is public, and those are Dongfeng's. Every element is recreated with CSS/SVG from the documented tokens and measurements. Icons stay our own line icons, drawn in the car's style (2 px strokes, rounded caps, grey/white).

### R7. "Car screen" layout (decision D3: in scope)
When WikiVigo is opened on a 1920-wide landscape screen (a future "Mi Vigo" view on the head unit, or a tablet), a media query (`(min-width: 1900px) and (orientation: landscape)`) switches to 1:1 car sizes (rail 320 px wide, 90 px rows, 28-30 px labels, 88 px buttons, 40 px card padding), the mobile bar hidden, content laid out for 1920x970.

### Explicit non-goals
- No content or route changes, no new pages, no data model changes.
- No pixel-copy of any stock screen; the goal is the same visual language, not an imitation of Dongfeng branding (no Dongfeng logos or names in the UI).

## Decisions (owner, 2026-11-19)
- **D1. Success colour.** The car has no green: "ok" is the accent. WikiVigo needs a positive state distinct from warning (e.g. station check-in "funcionó" vs "ocupado"). Options: (a) accent amber for ok, `#ffa800` warning, red error (closest to the car, but amber vs orange is close); (b) keep one muted green `#7fb58a` only for success states. **Chosen: (b).** Tune the exact value for contrast in both themes.
- **D2. Light theme = car day (beige/brown).** It changes the site's light look the most. Alternative: keep a neutral light theme and only restyle dark. **Chosen: light = car day, dark = car night.**
- **D3. Car-screen layout (R7): chosen NOW**, part of this change (1:1 car sizes at >= 1900 px wide landscape).
- **D4. Order:** tokens + typography + shapes first (one change, most of the effect), then components, then charts/maps.

## Files to touch
- `src/index.css` (tokens, fonts, radii, the scale table), `package.json` (`@fontsource/roboto` in, Inter/Space Grotesk out), `src/main.tsx` (font imports).
- `src/components/UI.tsx`, `UI.module.css` (Card, Badge, Alert, StatGrid, buttons, new Switch/Segmented primitives if not present), `Layout.tsx`, `Layout.module.css` (rail, mobile bar).
- The 19 files using `--green-*`/`--blue-*` (move to role tokens), components with hard-coded radii/shadows (`*.module.css`), `MapModal`, `StationPickerModal`, `OfflineBanner`, `TripCard`, chart code on `CostsPage`/`DashboardPage`.
- `CLAUDE.md`: a short "Design system" section pointing here (tokens are role-based; no firmware assets).

## Test plan
- Unit: a test that `index.css` defines every role token for both themes (parse the CSS, compare the two `:root`/`[data-theme='dark']` sets) and that no `--green-` token remains referenced in `src/` (grep-style test), so the remap cannot regress.
- Contrast: a test computing WCAG contrast for the text/background pairs of R1 in both themes (≥ 4.5:1 for body text, ≥ 3:1 for large text and UI marks).
- Component tests: Switch and Segmented primitives (keyboard and aria states); existing component tests keep passing.
- Visual review: screenshots of Home, Mi Vigo, Trip form, Stations map, Costs in both themes at 390 px and 1280 px, side by side with the car photos/uiautomator references in `vigo-hack\design\`; owner review.
- `npm run type-check`, `npm run lint`, `npm test` all green.

## Implementation notes (2026-11-19)

Step 1 — tokens, Roboto, shapes:
- Tokens are role-based in `src/index.css` (`:root, [data-theme='light']` = car day, `[data-theme='dark']` = car night; theme-independent radii/font/sidebar width in a plain `:root`). Roles added beyond the R1 table because components need them: `--fill-hover` (row hover; night = the car's `#303030`), `--selected-bg` (rail selected tab, `#1affffff` / `#99f5e4cb`), `--text-on-fill-selected`, `--accent-text` / `--accent-fill` (the R1 "text / fills" split), `--btn-*`, `--switch-off`, `--divider-page` / `--card-border`, `--scrim`, `--chart-axis` / `--chart-value`, and a `-text` variant per status colour.
- `--text-tertiary` was retired: the car has two text levels, and anything dimmer than the secondary grey fails AA on the card colour. All its uses moved to `--text-secondary`.
- WCAG tuning (car value -> web value, both checked by `src/designTokens.test.ts`): night secondary text `#666666` -> `#8c8c8c` (R1 said `#8a8a8a`, which is 4.497:1 on `#242424`); night error text `#ff3e3e` -> `#ff4d4d` (AA on `#242424`; bars keep `#ff3e3e`); day secondary text `#897267` -> `#7d685e`; day accent text/links `#af7d5f` -> `#906348` (the line/focus/switch accent stays `#af7d5f`, 3.1-3.6:1 as a UI mark); day warning `#f29913` -> `#c2790b` for bars/dots and `#995f08` for text; day error `#ca6d36` stays for bars, `#a4582b` for text; success (D1) `#7fb58a` at night, `#589865` (marks) / `#45774f` (text) by day; day chart series `#bb81c8`/`#6a98fb` -> `#b678c4`/`#568afa` (3:1 on white).
- Day primary button: the car's tan `#c39f84` with **white** text is 2.4:1; the web keeps the tan fill and uses the day title brown `#47382f` as text (4.6:1). Same for any text on the selected fill (`--text-on-fill-selected`).
- `@fontsource/roboto` 5.x is licensed **OFL-1.1** (not Apache-2.0 as R2 assumed: Roboto moved to OFL); `THIRD-PARTY-NOTICES.md` and the README were updated. Font weight 600 does not exist in the set any more: every `600` became `500` (the car's medium).
- Buttons compose `src/styles/buttons.module.css` (primary = car confirm, secondary = car cancel, danger = error text on the secondary fill); pressed = 60 % opacity, disabled = 30 % fill with grey text (a `color-mix`), hover = 85 % (web only).
- The browser `theme-color` follows the page background of the active theme (`UserPrefsContext`), and the PWA manifest colours are the car night black. The app icon (`public/favicon.svg` and the generated PNGs, still green) was left alone: see open questions.

Step 2 — components:
- `src/components/Icon.tsx`: our own line icons (24 grid, 2 px round strokes, `currentColor`) for the rail, the bottom bar, the header buttons, the Registrar sheet, the guide grid and alerts. `NavItem.icon` / `GuideLinkItem.icon` are now icon names instead of emoji (nothing else consumed the emoji). Page titles and card titles keep their emoji: replacing those is content, not chrome.
- Rail (desktop sidebar): sits on the page background with a 2 px `--divider-page` line, 48 px rows (42 px for the Guía sub-items), selected = `--selected-bg` 3 px inset + 3 px accent line on the right edge, animated in (300 ms scale / 200 ms fade, off with `prefers-reduced-motion`); by day the selected icon sits on a tan square. The nav list scrolls when the window is shorter than the rail. The rail is 240 px wide, not 160 (0.5 x 320): Spanish labels such as "Mantenimiento" need it.
- Theme: the rail footer's toggle became a Claro / Oscuro `Segmented` (same two explicit states; the system default still applies until one is picked). The mobile header keeps its one-tap icon toggle (sun / moon).
- Mobile: header buttons are car secondary buttons with line icons (the Mi Vigo button keeps the car-colour tint); the bottom bar keeps the B1 structure with grey items and an accent line under the active one; Registrar is a plus on the primary fill.
- New primitives in `UI.tsx`: `Switch` (native checkbox with `role="switch"`, DFSwitch replica 40 x 17 / 14 px knob, 200 ms) and `Segmented` (WAI-ARIA radio group with roving tab stop, arrow keys / Home / End, sliding selected fill). Adopted by: the share toggle of every entry form and the insurance add-ons (Switch); trip-form model, station-picker list/map, Comunidad type filter, Carga autonomy cycle, theme (Segmented). Tests that clicked those as `button`/`checkbox` now use `radio`/`switch`.
- Dialogs (`MapModal`, used by the stations and trip maps and the station picker; the Registrar sheet) follow the car dialog: card colour, 4 px, `--scrim` dim, no border/shadow, the close icon at the top-left before the title. Site search keeps its close button at the end of the search field (a field affordance, not a dialog title bar).
- Alerts: card colour, 3 px status bar, a line icon in the status colour. Offline banner and the save toast use the same treatment.

Step 3 — charts and maps:
- There is no line chart in the app today (Costos and Mi actividad show tables, stat cells and lists; R5 assumed "chart code on CostsPage/DashboardPage"). The only chart is the vehicle km ranking (`VehicleLeaderboard`, on Inicio and Comunidad): it now follows the car's distribution bar (thin round bar in `--chart-1` #bb81c8 on the secondary fill, no gradient). `--chart-2/3`, `--chart-axis` and `--chart-value` are defined for both themes so an Energy-style curve (2-3 px `--chart-1` line, filled dots with the value above in `--chart-value`, `--chart-axis` axes, no grid) can be added without new tokens; no new chart was added (non-goal: no content changes).
- Map markers use tokens (the marker markup lives in the page, so `var()` follows the theme): stations and the location picker in the accent, "me" in `--chart-2`; trip maps and the TripCard timeline share origin = `--chart-1`, destination = `--chart-2`, charge = accent, warning = `--danger` (the popups' colour emoji moved from 🟢 to 🟣 for the origin). The route polyline gets its stroke from CSS (`--text-secondary`), since Leaflet's colour option takes only literal colours. Markers lost their shadow (flat ring + hairline outline).
- Leaflet chrome (zoom buttons, popups, attribution) restyled globally in `index.css`: card colour, 4 px, hairline border, no shadow.
- Tiles: still CARTO `light_all` / `dark_all` per theme; the dark softening filter stays (it now sits between the `#000` window and the `#1a1a1a` dialog). **Found while reviewing: CARTO's basemaps currently answer every request with an "API KEY REQUIRED" watermark tile** (checked 2026-11-19 with and without the production Referer; also `rastertiles/voyager`), so the maps are degraded in production too, independently of this change. The "warmer light tile" question (R5) cannot be judged until the tile source is settled — see open questions.

## Acceptance criteria
- Both themes use only role tokens mapped to the car's values (R1); no `--green-*` left; Roboto everywhere; 4 px corners; no shadows.
- Navigation, cards, buttons, badges, dialogs, alerts and charts follow R5 in both themes on phone and desktop.
- No firmware asset in the repo (R6).
- Contrast tests pass; the owner signs off on the side-by-side review.
