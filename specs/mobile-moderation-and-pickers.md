# Phone moderation access, Mi Vigo pickers, no suggestion form (owner 2026-11-27)

## Requirements
1. Phone view: a moderator reaches Moderación in one tap (header button, shield icon).
2. The Google form «Sugerir info» is removed (sidebar link and header button).
3. Mi Vigo: the six colour circles are always on one row.
4. Mi Vigo desktop (>= 900 px): E2 and E2+ stacked in a narrow column that fills the card height; the colour card with the car
   picture takes most of the width.

## Files
`src/components/Layout.tsx`, `src/pages/MyVigoPage.module.css`, `src/components/Layout.test.tsx`.

## Test plan
Layout test (moderator / not, no form). Pickers: checked by eye at 360 px and desktop width.
