// The map of "Dónde está tu auto" (specs/car-location.md R5): the site's own map (OpenFreeMap through FittedMapContainer, no new
// provider), an accent dot for the car and ring markers for the parking spots of the last 7 days. Lazy-loaded by CarLocationCard
// so Leaflet / MapLibre stay out of Mi Vigo's first load.
import { useEffect, useRef } from 'react'
import type { Marker as LeafletMarker } from 'leaflet'
import { Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { dotIcon, ringIcon } from '../lib/mapMarkerIcon'
import { formatSpotTime, type CarLocationPoint, type CarParkingSpot } from '../lib/carLocation'
import FittedMapContainer from './FittedMapContainer'

const carIcon = dotIcon('var(--accent)')
const spotIcon = ringIcon('var(--chart-2)')
// The spot picked in the list (or on the map): a bigger accent dot, above the others.
const selectedIcon = dotIcon('var(--accent-text)', 24)
const FOCUS_ZOOM = 15

/** One parking spot: when picked, the map moves to it and opens its popup. */
function Spot({
  spot,
  selected,
  onSelect,
}: {
  spot: CarParkingSpot
  selected: boolean
  onSelect: (id: string) => void
}) {
  const map = useMap()
  const marker = useRef<LeafletMarker>(null)
  useEffect(() => {
    if (!selected) return
    map.setView([spot.lat, spot.lon], Math.max(map.getZoom(), FOCUS_ZOOM))
    marker.current?.openPopup()
  }, [selected, map, spot.lat, spot.lon])
  return (
    <Marker
      ref={marker}
      position={[spot.lat, spot.lon]}
      icon={selected ? selectedIcon : spotIcon}
      zIndexOffset={selected ? 2000 : 0}
      eventHandlers={{ click: () => onSelect(spot.observedAt) }}
    >
      <Popup>Estacionado: {formatSpotTime(spot.observedAt)}</Popup>
    </Marker>
  )
}

export default function CarLocationMap({
  last,
  spots,
  selected,
  onSelect,
}: {
  last: CarLocationPoint | null
  spots: CarParkingSpot[]
  /** observedAt of the highlighted spot. */
  selected: string | null
  onSelect: (id: string) => void
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
        <Spot key={s.observedAt} spot={s} selected={s.observedAt === selected} onSelect={onSelect} />
      ))}
      {last && (
        <Marker position={[last.lat, last.lon]} icon={carIcon} zIndexOffset={1000}>
          <Popup>{last.kind === 'parked' ? 'Tu auto está acá' : 'Tu auto pasó por acá'}</Popup>
        </Marker>
      )}
    </FittedMapContainer>
  )
}
