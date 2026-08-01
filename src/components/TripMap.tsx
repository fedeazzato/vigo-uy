// Geographic map for a single trip: origin, destination and any charging
// stops that resolve to real coordinates (see resolveTripMapPoints in
// src/lib/tripMap.ts). Opened as a modal from TripCard, same backdrop/panel
// pattern as SiteSearch. See specs/trip-map.md.
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { fetchChargingStations } from '../lib/communityData'
import { resolveTripMapPoints } from '../lib/tripMap'
import type { TripMapPointType } from '../lib/tripMap'
import { useEscapeToClose } from '../lib/useEscapeToClose'
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

function pointIcon(type: TripMapPointType): L.DivIcon {
  return L.divIcon({
    className: styles.markerIcon,
    html: `<span style="background:${POINT_COLOR[type]}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

const TILE_URL: Record<'light' | 'dark', string> = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

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

  useEscapeToClose(open, onClose)

  const { points, unresolvedStopCount } = useMemo(
    () => resolveTripMapPoints(trip, stations),
    [trip, stations]
  )

  if (!open) return null

  const positions: [number, number][] = points.map((p) => [p.lat, p.lng])

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-label={`Mapa de ${trip.title}`}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>{trip.title}</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Cerrar mapa">
            ✕
          </button>
        </div>

        {points.length === 0 ? (
          <div className={styles.empty}>No pudimos ubicar este viaje en el mapa todavía.</div>
        ) : (
          <>
            <div className={styles.mapWrap}>
              <MapContainer
                bounds={positions.length > 1 ? positions : undefined}
                center={positions.length === 1 ? positions[0] : undefined}
                zoom={positions.length === 1 ? 13 : undefined}
                boundsOptions={{ padding: [32, 32] }}
                className={styles.map}
              >
                <TileLayer url={TILE_URL[effectiveTheme]} attribution={TILE_ATTRIBUTION} />
                {positions.length > 1 && (
                  <Polyline positions={positions} pathOptions={{ color: ROUTE_LINE_COLOR, weight: 3 }} />
                )}
                {points.map((p, i) => (
                  <Marker key={i} position={[p.lat, p.lng]} icon={pointIcon(p.type)}>
                    <Popup>
                      <strong>{POINT_LABEL[p.type]}</strong>: {p.label}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            {unresolvedStopCount > 0 && (
              <p className={styles.note}>
                {unresolvedStopCount} {unresolvedStopCount === 1 ? 'parada' : 'paradas'} sin ubicación registrada
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}
