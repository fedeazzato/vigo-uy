-- Optional product picture: a direct image URL the user pastes themselves
-- (most listing pages support right-click -> "copy image address" on the
-- product photo). No auto-fetch from the store listing -- see
-- specs/purchase-image-url.md for why that was ruled out. Same shape as
-- `link` (migration 0026): nullable, http(s) check as defense in depth
-- alongside client-side validation in NewPartPurchasePage.
-- Apply with `npx supabase db push`.

alter table public.part_purchases
  add column image_url text check (image_url is null or image_url ~* '^https?://');
