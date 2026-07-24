-- Optional link to the store listing (mostly MercadoLibre) a purchase came
-- from. Nullable; the http(s) check is defense in depth alongside the
-- client-side validation in NewPartPurchasePage.
-- Apply with `npx supabase db push`.

alter table public.part_purchases
  add column link text check (link is null or link ~* '^https?://');
