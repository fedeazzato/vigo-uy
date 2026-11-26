import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Layer } from 'leaflet'
import { MAP_ATTRIBUTION, MAP_STYLE } from '../lib/mapTiles'

// The OpenFreeMap vector basemap as a Leaflet layer (MapLibre GL through @maplibre/maplibre-gl-leaflet). MapLibre and the bridge
// are loaded on demand, so they stay out of the main bundle and only download when a map is shown. Switching the theme swaps the
// layer for the other style.
export function BaseMap({ theme }: { theme: 'light' | 'dark' }) {
  const map = useMap()

  useEffect(() => {
    let layer: Layer | null = null
    let cancelled = false
    void (async () => {
      const [{ setWorkerUrl }, { default: workerUrl }] = await Promise.all([
        import('maplibre-gl'),
        // MapLibre 6 is ESM-only and looks for its worker next to its own module (import.meta.url), which bundling breaks:
        // Vite emits the worker as its own file and MapLibre is pointed at it (MapLibre's documented Vite setup).
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ])
      setWorkerUrl(workerUrl)
      await import('@maplibre/maplibre-gl-leaflet')   // adds L.maplibreGL
      if (cancelled) return
      // The bridge shows attributionControl.customAttribution in Leaflet's own attribution control.
      layer = L.maplibreGL({
        style: MAP_STYLE[theme],
        attributionControl: { customAttribution: MAP_ATTRIBUTION },
      }).addTo(map)
    })()
    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map, theme])

  return null
}
