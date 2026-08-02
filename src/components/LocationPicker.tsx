// Click/drag map field for picking a lat/lng, used by the add-station form
// (CommunityStations). Controlled: `value`/`onChange` own the picked point,
// this component only ever reads/writes through them. See
// specs/charging-stations-map.md.
import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapTiles'
import { dotIcon } from '../lib/mapMarkerIcon'
import { Alert } from './UI'
import styles from './LocationPicker.module.css'

export interface LatLng {
  lat: number
  lng: number
}

// Uruguay-wide default view (not a specific city) -- a submitted station
// could be anywhere in the country.
const DEFAULT_CENTER: [number, number] = [-32.8, -56.0]
const DEFAULT_ZOOM = 7
const PICKED_ZOOM = 14

const markerIcon = dotIcon('#1D9E75')

function ClickHandler({ onPick }: { onPick: (next: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Pans/zooms to a newly picked point without fighting the user's own pan/
// zoom afterward -- only runs again when `value` itself changes.
function Recenter({ value }: { value: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), PICKED_ZOOM))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.lat, value.lng])
  return null
}

interface LocationPickerProps {
  value: LatLng | null
  onChange: (next: LatLng) => void
}

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const { effectiveTheme } = useUserPrefs()
  const [geoError, setGeoError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Este navegador no puede compartir tu ubicación.')
      return
    }
    setGeoError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setLocating(false)
        setGeoError('No pudimos acceder a tu ubicación. Marcá el punto directamente en el mapa.')
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  return (
    <div>
      <div className={styles.mapWrap}>
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className={styles.map}>
          <TileLayer url={TILE_URL[effectiveTheme]} attribution={TILE_ATTRIBUTION} />
          <ClickHandler onPick={onChange} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const pos = (e.target as L.Marker).getLatLng()
                  onChange({ lat: pos.lat, lng: pos.lng })
                },
              }}
            />
          )}
          {value && <Recenter value={value} />}
        </MapContainer>
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.locateBtn} onClick={useMyLocation} disabled={locating}>
          📍 {locating ? 'Buscando…' : 'Usar mi ubicación'}
        </button>
        {value && (
          <span className={styles.coords}>
            {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
          </span>
        )}
      </div>
      {geoError && <Alert type="warning">{geoError}</Alert>}
    </div>
  )
}
