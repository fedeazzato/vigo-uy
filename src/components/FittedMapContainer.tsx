// Bounds-fitted Leaflet map body shared by TripMap and StationsMap: same
// theme-aware tile layer, same "fit all markers, or center on the one
// point" logic, same empty state when there's nothing to place.
import { ReactNode, useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapTiles'
import type { EffectiveTheme } from '../context/UserPrefsContext'
import styles from './FittedMapContainer.module.css'

// Uruguay-wide fallback view MapContainer is created with, immediately
// corrected by FitBounds once it mounts.
const FALLBACK_CENTER: [number, number] = [-32.8, -56.0]
const FALLBACK_ZOOM = 7
const SINGLE_POINT_ZOOM = 13

// Re-fits the view whenever `positions` changes, including the very first
// render. MapContainer's own bounds/center/zoom props only ever apply
// once, at creation -- a pin that resolves asynchronously after that (e.g.
// TripMap's live geocoding fallback for a place outside the curated list)
// would otherwise never come into view, leaving the map looking zoomed
// into the wrong spot with no indication anything is missing.
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  const key = positions.map((p) => p.join(',')).join(';')
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [32, 32] })
    } else if (positions.length === 1) {
      map.setView(positions[0], SINGLE_POINT_ZOOM)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

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
      <MapContainer center={FALLBACK_CENTER} zoom={FALLBACK_ZOOM} className={styles.map}>
        <TileLayer url={TILE_URL[effectiveTheme]} attribution={TILE_ATTRIBUTION} />
        <FitBounds positions={positions} />
        {children}
      </MapContainer>
    </div>
  )
}
