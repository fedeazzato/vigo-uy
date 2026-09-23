-- Makes the insurance quote form's "included at no extra cost" checkboxes
-- (hail repair, glass repair) extensible without a schema change: moderators
-- add a row to insurance_addons and it appears in the form and on quote
-- cards automatically. Mirrors charging_networks (0024) for the reference
-- table; insurance_quote_addons is a new pattern (many-to-many selection)
-- for the junction. See specs/insurance-quotes.md.
-- Apply with `npx supabase db push`.

-- 1. Addon catalog ----------------------------------------------------------

create table public.insurance_addons (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
  icon text not null check (char_length(icon) between 1 and 8),
  -- Full checkbox label suffix, rendered as "Incluye {checkbox_label}" --
  -- e.g. "reparación de granizo sin cargo". Free text (not a template) so
  -- wording like "sin cargo" can be baked in per-addon where it fits.
  checkbox_label text not null check (char_length(checkbox_label) between 1 and 100),
  -- Short name for the quote-card badge, rendered as
  -- "{icon} {badge_label} sin cargo" / "hasta $X" / "hasta Nx/año"
  -- (per limit_kind) -- e.g. "Granizo" / "Cristales".
  badge_label text not null check (char_length(badge_label) between 1 and 40),
  -- What kind of cap this addon can carry, if any: 'none' (flatly included,
  -- like hail), 'cost' (free up to $X/year, like glass today), 'count'
  -- (free up to N uses/year -- e.g. a future "asistencia mecánica" addon).
  -- Drives which single input (if any) the form shows for this addon.
  limit_kind text not null default 'none' check (limit_kind in ('none', 'count', 'cost')),
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);

alter table public.insurance_addons enable row level security;

create policy "insurance addons are readable by everyone"
  on public.insurance_addons for select
  to anon, authenticated
  using (true);

create policy "moderators insert insurance addons"
  on public.insurance_addons for insert
  to authenticated
  with check (public.is_active_moderator(auth.uid()));

create policy "moderators update insurance addons"
  on public.insurance_addons for update
  to authenticated
  using (public.is_active_moderator(auth.uid()))
  with check (public.is_active_moderator(auth.uid()));

-- Seed: granizo/cristales are the two addons the form previously hardcoded
-- as hail_coverage/glass_coverage, worded to render identically to before.
-- auxilio-ruta/chofer-designado are two more addons common enough in the
-- Uruguayan market to seed from day one (owner-provided, this conversation)
-- -- both 'count' (free up to N times/year), the kind this migration's
-- extensibility work was motivated by.
insert into public.insurance_addons (slug, icon, checkbox_label, badge_label, limit_kind, sort_order) values
  ('granizo', '🧊', 'reparación de granizo sin cargo', 'Granizo', 'none', 10),
  ('cristales', '🪟', 'reparación de cristales (parabrisas, etc.)', 'Cristales', 'cost', 20),
  ('auxilio-ruta', '🆘', 'auxilio en ruta (batería, pinchazos, remolque)', 'Auxilio en ruta', 'count', 30),
  ('chofer-designado', '🚕', 'servicio de chofer designado para fiestas (te llevan de vuelta con tu auto)', 'Chofer designado', 'count', 40);

-- 2. Per-quote addon selection ----------------------------------------------
-- One row per addon a quote includes. No update policy -- a quote's addon
-- set is edited by replacing it wholesale (delete then insert), not by
-- updating individual rows, so there's nothing to update in place.
-- No dedicated daily-insert-limit trigger: writes are bounded by the
-- already-limited parent insurance_quotes insert (enforce_daily_insert_limit)
-- and by the addon catalog's own small size (the primary key caps a single
-- quote at one row per distinct addon).

create table public.insurance_quote_addons (
  quote_id uuid not null references public.insurance_quotes (id) on delete cascade,
  addon text not null references public.insurance_addons (slug),
  -- Populated only when the addon's catalog limit_kind is 'cost' / 'count'
  -- respectively -- enforced below by a trigger, not a CHECK (the kind
  -- lives on the other table, out of a same-table CHECK's reach).
  limit_uyu numeric check (limit_uyu between 0 and 1000000),
  limit_count integer check (limit_count between 1 and 365),
  primary key (quote_id, addon)
);

alter table public.insurance_quote_addons enable row level security;

-- Nulls out whichever limit column doesn't match this addon's catalog
-- limit_kind, so the stored row is always internally consistent regardless
-- of what a client sent -- same self-correcting shape as
-- set_vehicle_id_on_write/prevent_unauthorized_verify elsewhere in this
-- schema, rather than rejecting the write outright.
create function public.enforce_insurance_quote_addon_limit_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
begin
  select limit_kind into kind from public.insurance_addons where slug = new.addon;
  if kind is distinct from 'cost' then
    new.limit_uyu := null;
  end if;
  if kind is distinct from 'count' then
    new.limit_count := null;
  end if;
  return new;
end;
$$;

create trigger set_insurance_quote_addon_limit_kind
  before insert or update on public.insurance_quote_addons
  for each row execute function public.enforce_insurance_quote_addon_limit_kind();

create policy "anon selects addons of public insurance quotes"
  on public.insurance_quote_addons for select
  to anon
  using (
    exists (
      select 1 from public.insurance_quotes q
      where q.id = quote_id and q.is_public and not q.hidden and not public.is_user_banned(q.user_id)
    )
  );

create policy "select addons of own, public, or any as moderator"
  on public.insurance_quote_addons for select
  to authenticated
  using (
    exists (
      select 1 from public.insurance_quotes q
      where q.id = quote_id
        and (
          auth.uid() = q.user_id
          or (q.is_public and not q.hidden and not public.is_user_banned(q.user_id))
          or public.is_active_moderator(auth.uid())
        )
    )
  );

create policy "users can insert addons for their own insurance quotes"
  on public.insurance_quote_addons for insert
  to authenticated
  with check (
    exists (
      select 1 from public.insurance_quotes q
      where q.id = quote_id and auth.uid() = q.user_id and not public.is_user_banned(auth.uid())
    )
  );

create policy "users can delete addons of their own insurance quotes, moderators any"
  on public.insurance_quote_addons for delete
  to authenticated
  using (
    exists (
      select 1 from public.insurance_quotes q
      where q.id = quote_id and (auth.uid() = q.user_id or public.is_active_moderator(auth.uid()))
    )
  );

-- 3. Backfill + drop the old boolean/limit columns --------------------------

insert into public.insurance_quote_addons (quote_id, addon, limit_uyu)
select id, 'granizo', null from public.insurance_quotes where hail_coverage;

insert into public.insurance_quote_addons (quote_id, addon, limit_uyu)
select id, 'cristales', glass_coverage_limit_uyu from public.insurance_quotes where glass_coverage;

alter table public.insurance_quotes
  drop constraint glass_limit_requires_coverage,
  drop column hail_coverage,
  drop column glass_coverage,
  drop column glass_coverage_limit_uyu;
