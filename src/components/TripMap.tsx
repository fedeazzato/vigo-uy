// Geographic map for a single trip: origin, destination and any charging
// stops that resolve to real coordinates (see resolveTripMapPoints in
// src/lib/tripMap.ts). Opened as a modal from TripCard. See
// specs/trip-map.md.
import { useEffect, useMemo, useState } from 'react'
import { Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { fetchChargingStations } from '../lib/communityData'
import { resolveTripMapPoints } from '../lib/tripMap'
import type { TripMapPointType } from '../lib/tripMap'
import { fetchRoute } from '../lib/osrmRouting'
import { dotIcon } from '../lib/mapMarkerIcon'
import MapModal from './MapModal'
import FittedMapContainer from './FittedMapContainer'
import type { ChargingStation, TripLog } from '../types'
import styles from './TripMap.module.css'

const POINT_COLOR: Record<TripMapPointType, string> = {
  origin: '#1D9E75',
  charge: '#BA7517',
  destination: '#185FA5',
}

const POINT_LABEL: Record<TripMapPointType, string> = {
  origin: 'Origen',
  charge: 'Carga',
  destination: 'Destino',
}

const ROUTE_LINE_COLOR = '#64748B'

interface TripMapProps {
  trip: TripLog
  open: boolean
  onClose: () => void
}

export default function TripMap({ trip, open, onClose }: TripMapProps) {
  const { effectiveTheme } = useUserPrefs()
  const [stations, setStations] = useState<ChargingStation[]>([])

  useEffect(() => {
    if (!open) return
    void fetchChargingStations().then(({ stations }) => setStations(stations))
  }, [open])

  const { points, unresolvedStopCount } = useMemo(
    () => resolveTripMapPoints(trip, stations),
    [trip, stations]
  )

  const positions = useMemo<[number, number][]>(() => points.map((p) => [p.lat, p.lng]), [points])

  // Straight lines between stops cut across the map regardless of roads;
  // OSRM gives the actual driving route. `positions` renders immediately
  // as a placeholder so the line doesn't pop in from nothing, then gets
  // replaced once the real route arrives (or stays as-is if the request
  // fails -- best-effort, see osrmRouting.ts).
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null)
  useEffect(() => {
    setRoadRoute(null)
    if (positions.length < 2) return
    let cancelled = false
    void fetchRoute(positions).then((route) => {
      if (!cancelled) setRoadRoute(route)
    })
    return () => {
      cancelled = true
    }
  }, [positions])

  const routeLine = roadRoute ?? positions

  return (
    <MapModal open={open} onClose={onClose} title={trip.title} ariaLabel={`Mapa de ${trip.title}`}>
      <FittedMapContainer
        positions={positions}
        effectiveTheme={effectiveTheme}
        emptyMessage="No pudimos ubicar este viaje en el mapa todavía."
      >
        {positions.length > 1 && (
          <Polyline positions={routeLine} pathOptions={{ color: ROUTE_LINE_COLOR, weight: 3 }} />
        )}
        {points.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={dotIcon(POINT_COLOR[p.type])}>
            <Popup>
              <strong>{POINT_LABEL[p.type]}</strong>: {p.label}
            </Popup>
          </Marker>
        ))}
      </FittedMapContainer>
      {unresolvedStopCount > 0 && (
        <p className={styles.note}>
          {unresolvedStopCount} {unresolvedStopCount === 1 ? 'parada' : 'paradas'} sin ubicación registrada
        </p>
      )}
    </MapModal>
  )
}
