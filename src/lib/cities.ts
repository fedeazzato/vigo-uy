// Uruguayan cities and towns offered as suggestions (via CityCombobox) on
// every city input — free text still allowed, so places abroad or missing
// towns can simply be typed. Ordered alphabetically.
export const UY_CITIES: string[] = [
  'Aiguá',
  'Artigas',
  'Atlántida',
  'Barra de Valizas',
  'Barros Blancos',
  'Bella Unión',
  'Canelones',
  'Cardona',
  'Carmelo',
  'Castillos',
  'Chuy',
  'Ciudad de la Costa',
  'Ciudad del Plata',
  'Colonia del Sacramento',
  'Colonia Valdense',
  'Dolores',
  'Durazno',
  'Ecilda Paullier',
  'Florida',
  'Fray Bentos',
  'Fray Marcos',
  'Guichón',
  'José Ignacio',
  'José Pedro Varela',
  'Juan Lacaze',
  'La Barra',
  'La Floresta',
  'La Paloma',
  'La Paz',
  'La Pedrera',
  'Las Piedras',
  'Lascano',
  'Libertad',
  'Maldonado',
  'Melo',
  'Mercedes',
  'Minas',
  'Montevideo',
  'Nueva Helvecia',
  'Nueva Palmira',
  'Nuevo Berlín',
  'Ombúes de Lavalle',
  'Pan de Azúcar',
  'Pando',
  'Parque del Plata',
  'Paso de los Toros',
  'Paysandú',
  'Piriápolis',
  'Progreso',
  'Punta del Diablo',
  'Punta del Este',
  'Quebracho',
  'Río Branco',
  'Rivera',
  'Rocha',
  'Rosario',
  'Salinas',
  'Salto',
  'San Carlos',
  'San Gregorio de Polanco',
  'San Jacinto',
  'San José de Mayo',
  'San Javier',
  'San Ramón',
  'Santa Clara de Olimar',
  'Santa Lucía',
  'Santa Rosa',
  'Sarandí del Yí',
  'Sarandí Grande',
  'Sauce',
  'Solís de Mataojo',
  'Tacuarembó',
  'Tala',
  'Tarariras',
  'Toledo',
  'Tranqueras',
  'Treinta y Tres',
  'Trinidad',
  'Vergara',
  'Vichadero',
  'Young',
]

// Strips accents and lowercases, for accent/case-insensitive comparisons.
const COMBINING_DIACRITICS = /[̀-ͯ]/g
function foldAccents(s: string): string {
  return s.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase()
}

// Spanish connector words kept lowercase in title-casing (except as the
// first word) — mirrors how UY_CITIES itself is written: "Punta del Este",
// "San José de Mayo", "Ciudad de la Costa".
const LOWERCASE_CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'y'])

function titleCaseCity(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

// UY_CITIES entries whose folded form contains the folded query, capped to
// `limit`. Used to populate CityCombobox's dropdown as the user types.
export function matchCities(query: string, limit = 6): string[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const folded = foldAccents(trimmed)
  return UY_CITIES.filter((city) => foldAccents(city).includes(folded)).slice(0, limit)
}

// Snaps free text to canonical casing so it visually matches the curated
// list: exact UY_CITIES casing when the value matches one accent/case
// -insensitively, otherwise a Spanish-aware title-case fallback (for
// places not in the list, e.g. trips abroad). Called on blur, not on every
// keystroke, so it never fights the user mid-typing.
export function normalizeCityCasing(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  const folded = foldAccents(trimmed)
  const canonical = UY_CITIES.find((city) => foldAccents(city) === folded)
  return canonical ?? titleCaseCity(trimmed)
}
