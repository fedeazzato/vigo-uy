import { UY_CITIES } from '../lib/cities'

export const UY_CITIES_LIST_ID = 'uy-cities'

// Render once per form; point city inputs at it with list={UY_CITIES_LIST_ID}.
// Native <datalist>: suggests Uruguayan cities/towns while typing but never
// restricts input (trips abroad, missing towns).
export default function CityDatalist() {
  return (
    <datalist id={UY_CITIES_LIST_ID}>
      {UY_CITIES.map((city) => (
        <option key={city} value={city} />
      ))}
    </datalist>
  )
}
