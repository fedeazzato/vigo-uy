// The map of "Dónde está tu auto" (specs/car-location.md R5): the site's own map (OpenFreeMap through FittedMapContainer, no new
// provider), an accent dot for the car and ring markers for the parking spots of the last 7 days. Lazy-loaded by CarLocationCard
// so Leaflet / MapLibre stay out of Mi Vigo's first load.
import { Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { dotIcon, ringIcon } from '../lib/mapMarkerIcon'
import { formatSpotTime, type CarLocationPoint, type CarParkingSpot } from '../lib/carLocation'
import FittedMapContainer from './FittedMapContainer'

const carIcon = dotIcon('var(--accent)')
const spotIcon = ringIcon('var(--chart-2)')

export default function CarLocationMap({
  last,
  spots,
}: {
  last: CarLocationPoint | null
  spots: CarParkingSpot[]
}) {
  const { effectiveTheme } = useUserPrefs()
  // Fit the car and the spots; the car alone is centred at street zoom.
  const positions: [number, number][] = [
    ...(last ? [[last.lat, last.lon] as [number, number]] : []),
    ...spots.map((s) => [s.lat, s.lon] as [number, number]),
  ]
  return (
    <FittedMapContainer
      positions={positions}
      effectiveTheme={effectiveTheme}
      emptyMessage="Todavía no hay una ubicación del auto."
    >
      {spots.map((s) => (
        <Marker key={s.observedAt} position={[s.lat, s.lon]} icon={spotIcon}>
          <Popup>Estacionado: {formatSpotTime(s.observedAt)}</Popup>
        </Marker>
      ))}
      {last && (
        <Marker position={[last.lat, last.lon]} icon={carIcon} zIndexOffset={1000}>
          <Popup>{last.kind === 'parked' ? 'Tu auto está acá' : 'Tu auto pasó por acá'}</Popup>
        </Marker>
      )}
    </FittedMapContainer>
  )
}
