// Bounds-fitted Leaflet map body shared by TripMap and StationsMap: same
// theme-aware tile layer, same "fit all markers, or center on the one
// point" logic, same empty state when there's nothing to place.
import { ReactNode } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapTiles'
import type { EffectiveTheme } from '../context/UserPrefsContext'
import styles from './FittedMapContainer.module.css'

interface FittedMapContainerProps {
  positions: [number, number][]
  effectiveTheme: EffectiveTheme
  emptyMessage: string
  children: ReactNode
}

export default function FittedMapContainer({
  positions,
  effectiveTheme,
  emptyMessage,
  children,
}: FittedMapContainerProps) {
  if (positions.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>
  }

  return (
    <div className={styles.mapWrap}>
      <MapContainer
        bounds={positions.length > 1 ? positions : undefined}
        center={positions.length === 1 ? positions[0] : undefined}
        zoom={positions.length === 1 ? 13 : undefined}
        boundsOptions={{ padding: [32, 32] }}
        className={styles.map}
      >
        <TileLayer url={TILE_URL[effectiveTheme]} attribution={TILE_ATTRIBUTION} />
        {children}
      </MapContainer>
    </div>
  )
}
