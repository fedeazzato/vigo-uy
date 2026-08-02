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
import type { TripMapPoint, TripMapPointType } from '../lib/tripMap'
import { fetchRoute } from '../lib/osrmRouting'
import { geocodeCity } from '../lib/nominatimGeocoding'
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

// Match the marker dot colors (green/amber/blue) instead of a formal
// "Origen:"/"Destino:" text label.
const POINT_EMOJI: Record<TripMapPointType, string> = {
  origin: '🟢',
  charge: '🟠',
  destination: '🔵',
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

  const { points, unresolvedStopCount, unresolvedOrigin, unresolvedDestination } = useMemo(
    () => resolveTripMapPoints(trip, stations),
    [trip, stations]
  )

  // A place name outside the curated cityCoordinates.json lookup (a
  // Uruguayan town the list missed, or a trip into Argentina/Brazil) gets
  // a live geocoding attempt instead of just being dropped. Best-effort:
  // any failure just leaves that endpoint without a pin, same as before.
  const [geocodedOrigin, setGeocodedOrigin] = useState<TripMapPoint | null>(null)
  const [geocodedDestination, setGeocodedDestination] = useState<TripMapPoint | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  useEffect(() => {
    // Gated on `open`: TripMap stays mounted whenever its trip's detail is
    // expanded (not just while the map modal itself is visible), so
    // without this every expanded trip with an unresolved place would
    // fire a background geocoding request whether or not anyone ever
    // opens its map.
    if (!open) return
    if (!unresolvedOrigin && !unresolvedDestination) return
    let cancelled = false
    setGeocoding(true)
    void Promise.all([
      unresolvedOrigin ? geocodeCity(unresolvedOrigin) : Promise.resolve(null),
      unresolvedDestination ? geocodeCity(unresolvedDestination) : Promise.resolve(null),
    ]).then(([originResult, destinationResult]) => {
      if (cancelled) return
      if (originResult && unresolvedOrigin) {
        setGeocodedOrigin({ type: 'origin', lat: originResult.lat, lng: originResult.lng, label: unresolvedOrigin })
      }
      if (destinationResult && unresolvedDestination) {
        setGeocodedDestination({
          type: 'destination',
          lat: destinationResult.lat,
          lng: destinationResult.lng,
          label: unresolvedDestination,
        })
      }
      setGeocoding(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, unresolvedOrigin, unresolvedDestination])

  // points never already has an origin/destination when geocodedOrigin/
  // geocodedDestination end up set -- resolveTripMapPoints only reports
  // unresolvedOrigin/unresolvedDestination when it *didn't* add one.
  const allPoints = useMemo(() => {
    const merged = [...points]
    if (geocodedOrigin) merged.unshift(geocodedOrigin)
    if (geocodedDestination) merged.push(geocodedDestination)
    return merged
  }, [points, geocodedOrigin, geocodedDestination])

  const positions = useMemo<[number, number][]>(() => allPoints.map((p) => [p.lat, p.lng]), [allPoints])

  // Straight lines between stops cut across the map regardless of roads;
  // OSRM gives the actual driving route. No line renders until either one
  // arrives -- drawing the straight line first and swapping it a moment
  // later reads as a glitch, not a placeholder. The straight line only
  // ever appears as a genuine fallback, once the request has actually
  // failed (see osrmRouting.ts).
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null)
  const [routeFailed, setRouteFailed] = useState(false)
  useEffect(() => {
    // Same reasoning as the geocoding effect: don't fire in the
    // background just because the trip's detail is expanded.
    if (!open) return
    setRoadRoute(null)
    setRouteFailed(false)
    // Wait for geocoding to settle first -- otherwise a trip with an
    // unresolved endpoint would route on an incomplete point set, then
    // re-route again once that endpoint's pin arrives.
    if (geocoding) return
    if (positions.length < 2) return
    let cancelled = false
    void fetchRoute(positions).then((route) => {
      if (cancelled) return
      if (route) setRoadRoute(route)
      else setRouteFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [open, positions, geocoding])

  const routeLine = roadRoute ?? (routeFailed ? positions : null)

  // While geocoding is still resolving a trip with nothing placed yet,
  // "couldn't find this" would be a lie told a moment too early -- say
  // what's actually happening instead.
  const emptyMessage =
    geocoding && positions.length === 0
      ? 'Buscando ubicaciones…'
      : 'No pudimos ubicar este viaje en el mapa todavía.'

  return (
    <MapModal open={open} onClose={onClose} title={trip.title} ariaLabel={`Mapa de ${trip.title}`}>
      <FittedMapContainer positions={positions} effectiveTheme={effectiveTheme} emptyMessage={emptyMessage}>
        {routeLine && <Polyline positions={routeLine} pathOptions={{ color: ROUTE_LINE_COLOR, weight: 3 }} />}
        {allPoints.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={dotIcon(POINT_COLOR[p.type])}>
            <Popup>
              {POINT_EMOJI[p.type]} {p.label}
              {p.type === 'charge' && p.durationMinutes != null && (
                <div>⏱️ {p.durationMinutes} min de carga</div>
              )}
            </Popup>
          </Marker>
        ))}
      </FittedMapContainer>
      {unresolvedStopCount > 0 && (
        <p className={styles.note}>
          {unresolvedStopCount} {unresolvedStopCount === 1 ? 'parada' : 'paradas'} sin ubicación registrada
        </p>
      )}
      {!geocoding && unresolvedOrigin && !geocodedOrigin && (
        <p className={styles.note}>No encontramos "{unresolvedOrigin}" para ubicarlo en el mapa.</p>
      )}
      {!geocoding && unresolvedDestination && !geocodedDestination && (
        <p className={styles.note}>No encontramos "{unresolvedDestination}" para ubicarlo en el mapa.</p>
      )}
    </MapModal>
  )
}
