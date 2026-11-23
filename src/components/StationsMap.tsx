// All-stations map: shows exactly the charging stations passed in (the
// caller is expected to have already applied its own filters), one marker
// each. See specs/charging-stations-map.md. With `ocm`, Open Charge Map
// stations of the visible area are drawn too, with their own marker and
// badge (specs/ocm-proxy.md).
import { useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { dotIcon } from '../lib/mapMarkerIcon'
import type { OcmFilter } from '../lib/ocmStations'
import MapModal from './MapModal'
import FittedMapContainer from './FittedMapContainer'
import OcmLayer, { type OcmLayerState } from './OcmLayer'
import { Badge } from './UI'
import SendToCarButton from './SendToCarButton'
import type { ChargingStation } from '../types'
import styles from './StationsMap.module.css'

const MARKER_COLOR = 'var(--accent)'
const markerIcon = dotIcon(MARKER_COLOR)

interface StationsMapProps {
  stations: ChargingStation[]
  open: boolean
  onClose: () => void
  /** Also show Open Charge Map stations of the visible area, with these filters; null/absent = WikiVigo only. */
  ocm?: OcmFilter | null
}

function ocmStatusText(s: OcmLayerState): string | null {
  switch (s.phase) {
    case 'off':
      return null
    case 'loading':
      return 'Buscando estaciones de Open Charge Map…'
    case 'zoom':
      return 'Acercá el mapa para ver también estaciones de Open Charge Map.'
    case 'error':
      return s.message
    case 'ready': {
      const base =
        s.count === 0
          ? 'No hay otras estaciones de Open Charge Map en esta zona.'
          : `${s.count} ${s.count === 1 ? 'estación' : 'estaciones'} de Open Charge Map en esta zona.`
      return s.complete ? base : `${base} Faltan algunas zonas; reintentando…`
    }
  }
}

export default function StationsMap({ stations, open, onClose, ocm = null }: StationsMapProps) {
  const { effectiveTheme } = useUserPrefs()
  const [ocmState, setOcmState] = useState<OcmLayerState | null>(null)

  const positions: [number, number][] = stations.map((s) => [s.lat, s.lng])

  // A single station (its own "Ver en mapa" link) gets its name as the
  // title instead of a redundant "(1)" count.
  const title =
    stations.length === 1
      ? stations[0].name
      : `Estaciones de carga${stations.length > 0 ? ` (${stations.length})` : ''}`

  const showOcm = ocm !== null && positions.length > 0
  const close = () => {
    setOcmState(null)
    onClose()
  }
  const statusText = showOcm && ocmState ? ocmStatusText(ocmState) : null

  return (
    <MapModal open={open} onClose={close} title={title} ariaLabel="Mapa de estaciones de carga">
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
              <SendToCarButton destination={{ lat: station.lat, lon: station.lng, label: station.name }} />
            </Popup>
          </Marker>
        ))}
        {showOcm && ocm && <OcmLayer filter={ocm} wikiStations={stations} onState={setOcmState} />}
      </FittedMapContainer>
      {showOcm && ocmState && ocmState.phase !== 'off' && (
        <div className={styles.ocmBar}>
          <span className={styles.legend}>
            <span className={styles.legendWiki} aria-hidden="true" /> WikiVigo
            <span className={styles.legendOcm} aria-hidden="true" /> Open Charge Map
          </span>
          {statusText && <span role="status">{statusText}</span>}
          {ocmState.attribution && <span className={styles.credit}>{ocmState.attribution}</span>}
        </div>
      )}
    </MapModal>
  )
}
