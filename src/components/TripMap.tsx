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

  const positions: [number, number][] = points.map((p) => [p.lat, p.lng])

  return (
    <MapModal open={open} onClose={onClose} title={trip.title} ariaLabel={`Mapa de ${trip.title}`}>
      <FittedMapContainer
        positions={positions}
        effectiveTheme={effectiveTheme}
        emptyMessage="No pudimos ubicar este viaje en el mapa todavía."
      >
        {positions.length > 1 && (
          <Polyline positions={positions} pathOptions={{ color: ROUTE_LINE_COLOR, weight: 3 }} />
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
