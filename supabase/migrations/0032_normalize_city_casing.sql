-- One-time cleanup: city/origin/destination free text typed before
-- CityCombobox (specs/city-combobox.md) existed may be in any casing
-- ("montevideo", "MONTEVIDEO", "punta del este"). Snap existing rows to the
-- same canonical casing the new UI now applies on blur via
-- src/lib/cities.ts's normalizeCityCasing: exact UY_CITIES casing when a
-- value matches one accent/case-insensitively, otherwise Spanish-aware
-- title case (connectors de/del/la/las/los/y stay lowercase, e.g.
-- "Punta del Este", "San José de Mayo").
--
-- Re-run note: safe to re-run — `create extension if not exists`, `create
-- or replace function`, and the UPDATEs (guarded by an inequality check)
-- are all idempotent; a second run simply updates nothing.

create extension if not exists unaccent;

create or replace function pg_temp.normalize_city(input text)
returns text
language plpgsql
as $$
declare
  trimmed text;
  folded text;
  canonical text;
  connectors text[] := array['de', 'del', 'la', 'las', 'los', 'y'];
  canonical_cities text[] := array[
    'Aiguá', 'Artigas', 'Atlántida', 'Barra de Valizas', 'Barros Blancos', 'Bella Unión',
    'Canelones', 'Cardona', 'Carmelo', 'Castillos', 'Chuy', 'Ciudad de la Costa',
    'Ciudad del Plata', 'Colonia del Sacramento', 'Colonia Valdense', 'Dolores', 'Durazno',
    'Ecilda Paullier', 'Florida', 'Fray Bentos', 'Fray Marcos', 'Guichón', 'José Ignacio',
    'José Pedro Varela', 'Juan Lacaze', 'La Barra', 'La Floresta', 'La Paloma', 'La Paz',
    'La Pedrera', 'Las Piedras', 'Lascano', 'Libertad', 'Maldonado', 'Melo', 'Mercedes',
    'Minas', 'Montevideo', 'Nueva Helvecia', 'Nueva Palmira', 'Nuevo Berlín',
    'Ombúes de Lavalle', 'Pan de Azúcar', 'Pando', 'Parque del Plata', 'Paso de los Toros',
    'Paysandú', 'Piriápolis', 'Progreso', 'Punta del Diablo', 'Punta del Este', 'Quebracho',
    'Río Branco', 'Rivera', 'Rocha', 'Rosario', 'Salinas', 'Salto', 'San Carlos',
    'San Gregorio de Polanco', 'San Jacinto', 'San José de Mayo', 'San Javier', 'San Ramón',
    'Santa Clara de Olimar', 'Santa Lucía', 'Santa Rosa', 'Sarandí del Yí', 'Sarandí Grande',
    'Sauce', 'Solís de Mataojo', 'Tacuarembó', 'Tala', 'Tarariras', 'Toledo', 'Tranqueras',
    'Treinta y Tres', 'Trinidad', 'Vergara', 'Vichadero', 'Young'
  ];
  words text[];
  out_words text[] := array[]::text[];
  w text;
  lw text;
  i int;
begin
  if input is null then
    return null;
  end if;

  trimmed := btrim(input);
  if trimmed = '' then
    return trimmed;
  end if;

  folded := lower(unaccent(trimmed));
  foreach canonical in array canonical_cities loop
    if lower(unaccent(canonical)) = folded then
      return canonical;
    end if;
  end loop;

  words := regexp_split_to_array(trimmed, '\s+');
  for i in 1 .. array_length(words, 1) loop
    w := words[i];
    lw := lower(w);
    if i > 1 and lw = any(connectors) then
      out_words := array_append(out_words, lw);
    else
      out_words := array_append(out_words, upper(substring(lw from 1 for 1)) || substring(lw from 2));
    end if;
  end loop;

  return array_to_string(out_words, ' ');
end;
$$;

update public.profiles
  set city = pg_temp.normalize_city(city)
  where city is not null and city <> pg_temp.normalize_city(city);

update public.service_entries
  set city = pg_temp.normalize_city(city)
  where city is not null and city <> pg_temp.normalize_city(city);

update public.part_purchases
  set city = pg_temp.normalize_city(city)
  where city is not null and city <> pg_temp.normalize_city(city);

update public.charging_stations
  set city = pg_temp.normalize_city(city)
  where city is not null and city <> pg_temp.normalize_city(city);

update public.trip_logs
  set origin = pg_temp.normalize_city(origin)
  where origin is not null and origin <> pg_temp.normalize_city(origin);

update public.trip_logs
  set destination = pg_temp.normalize_city(destination)
  where destination is not null and destination <> pg_temp.normalize_city(destination);
