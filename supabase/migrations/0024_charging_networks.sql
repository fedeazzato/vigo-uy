-- D4 follow-up: providers become a table.
-- Usage instructions (which app, how billing works) are per-provider, not
-- per-station — every UTE post has the same instructions. And "all popular
-- providers of three countries" is data, not a CHECK constraint: moderators
-- extend the list with an INSERT, no migration needed.
-- charging_stations.access_notes stays for location-specific quirks
-- ("QR dañado en este poste"), the network row carries the how-to.
-- Apply with `npx supabase db push`.

create table public.charging_networks (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  country text not null check (country in ('UY', 'AR', 'BR', 'otro')),
  -- Per-provider usage instructions: app, cards, billing model.
  instructions text check (char_length(instructions) <= 2000),
  -- Display order: UY networks first, then neighbors, 'otro' last.
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);

alter table public.charging_networks enable row level security;

create policy "networks are readable by everyone"
  on public.charging_networks for select
  to anon, authenticated
  using (true);

create policy "moderators manage networks"
  on public.charging_networks for insert
  to authenticated
  with check (public.is_active_moderator(auth.uid()));

create policy "moderators update networks"
  on public.charging_networks for update
  to authenticated
  using (public.is_active_moderator(auth.uid()))
  with check (public.is_active_moderator(auth.uid()));

-- Seed: Uruguay (instructions from the group's accumulated knowledge in
-- charging.json), then Argentina and Brazil's popular public networks.

insert into public.charging_networks (slug, name, country, instructions, sort_order) values
  ('ute',       'UTE',             'UY', 'Usar tarjeta UTE (se saca en una sucursal) — los QR suelen estar dañados o robados.', 10),
  ('eone',      'EONE',            'UY', 'App EONE. Si la Vigo no aparece en la lista, seleccionar "Dongfeng Forthing" o "Yuan Pro".', 11),
  ('dmc',       'DMC',             'UY', 'Red privada en expansión; considerada más confiable que UTE por el grupo.', 12),
  ('evergo',    'EverGo',          'UY', 'Red privada de carga rápida; buena alternativa en zonas donde UTE falla.', 13),
  ('eosvolt',   'EOSVOLT',         'UY', 'App EOSVOLT. Sin cargo fijo de inicio.', 14),
  ('ypf',       'YPF Punto Eléctrico', 'AR', 'App YPF. Ofrece membresía mensual para uso ilimitado de la red.', 30),
  ('shell-ar',  'Shell Recharge (AR)', 'AR', 'App Shell Recharge. Cobra por tiempo de conexión.', 31),
  ('axion',     'Axion',           'AR', 'Junto a Enel X. Cobra por tiempo de conexión.', 32),
  ('scame',     'Scame',           'AR', 'Operador especializado con presencia en zonas urbanas.', 33),
  ('chargebox', 'Chargebox',       'AR', 'Operador especializado con presencia en zonas urbanas.', 34),
  ('epec',      'EPEC',            'AR', 'Red de la eléctrica provincial de Córdoba.', 35),
  ('tupinamba', 'Tupinambá',       'BR', 'App Tupi Charging.', 50),
  ('zletric',   'Zletric',         'BR', 'App Zletric. Red interoperable con VoltBras (más de 2.500 puntos).', 51),
  ('voltbras',  'VoltBras',        'BR', 'Plataforma interoperable — se usa vía la app del operador local (p. ej. Zletric).', 52),
  ('edp',       'EDP Charge',      'BR', 'App EDP Eletroposto.', 53),
  ('shell-br',  'Shell Recharge (BR)', 'BR', 'App Shell Recharge.', 54),
  ('otro',      'Otros',           'otro', null, 999);

-- Stations now reference the table instead of a hardcoded list.
alter table public.charging_stations
  drop constraint charging_stations_network_check;

alter table public.charging_stations
  add constraint charging_stations_network_fkey
  foreign key (network) references public.charging_networks (slug);
