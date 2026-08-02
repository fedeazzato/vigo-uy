// All-stations map: shows exactly the charging stations passed in (the
// caller is expected to have already applied its own filters), one marker
// each. See specs/charging-stations-map.md.
import { Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { dotIcon } from '../lib/mapMarkerIcon'
import MapModal from './MapModal'
import FittedMapContainer from './FittedMapContainer'
import { Badge } from './UI'
import type { ChargingStation } from '../types'

const MARKER_COLOR = '#1D9E75'
const markerIcon = dotIcon(MARKER_COLOR)

interface StationsMapProps {
  stations: ChargingStation[]
  open: boolean
  onClose: () => void
}

export default function StationsMap({ stations, open, onClose }: StationsMapProps) {
  const { effectiveTheme } = useUserPrefs()

  const positions: [number, number][] = stations.map((s) => [s.lat, s.lng])

  return (
    <MapModal
      open={open}
      onClose={onClose}
      title={`Estaciones de carga${stations.length > 0 ? ` (${stations.length})` : ''}`}
      ariaLabel="Mapa de estaciones de carga"
    >
      <FittedMapContainer
        positions={positions}
        effectiveTheme={effectiveTheme}
        emptyMessage="No hay estaciones para mostrar con los filtros actuales."
      >
        {stations.map((station) => (
          <Marker key={station.id} position={[station.lat, station.lng]} icon={markerIcon}>
            <Popup>
              <strong>{station.name}</strong>
              {station.verified && (
                <>
                  {' '}
                  <Badge color="blue">Oficial</Badge>
                </>
              )}
              <div>
                {[
                  station.city,
                  station.connector,
                  station.current_type,
                  station.max_power_kw != null ? `${station.max_power_kw} kW` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </Popup>
          </Marker>
        ))}
      </FittedMapContainer>
    </MapModal>
  )
}
