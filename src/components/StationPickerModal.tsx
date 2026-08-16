// Picker for linking a trip's charging stop to a community station: the
// single big grouped <select> was unusable once the list grew past a
// couple hundred stations. Replaces it with network/city filters, a
// distance-sorted "Cerca mío" list, and a map view -- see
// specs/trip-charger-stop-picker.md.
import { useEffect, useMemo, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useUserPrefs } from '../context/UserPrefsContext'
import { foldAccents } from '../lib/cities'
import { haversineKm, type GeoPoint } from '../lib/geo'
import { dotIcon } from '../lib/mapMarkerIcon'
import { COUNTRIES, COUNTRY_LABELS } from '../lib/stations'
import { Alert, Badge } from './UI'
import MapModal from './MapModal'
import FittedMapContainer from './FittedMapContainer'
import type { ChargingNetwork, ChargingStation } from '../types'
import styles from './StationPickerModal.module.css'
import formStyles from '../styles/formControls.module.css'

const STATION_COLOR = '#1D9E75'
const ME_COLOR = '#2A6EF3'
const stationIcon = dotIcon(STATION_COLOR)
const meIcon = dotIcon(ME_COLOR)

// Same grouped-by-country layout as CommunityStations' own network filter
// (kept local here -- CommunityStations isn't touched by this change).
function NetworkFilterOptions({ networks }: { networks: ChargingNetwork[] }) {
  return (
    <>
      {COUNTRIES.map((country) => {
        const options = networks.filter((n) => n.country === country)
        if (options.length === 0) return null
        return (
          <optgroup key={country} label={COUNTRY_LABELS[country]}>
            {options.map((n) => (
              <option key={n.slug} value={n.slug}>
                {n.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}

function stationMeta(station: ChargingStation, networkName: string): string {
  return [
    networkName,
    station.city,
    station.connector,
    station.current_type,
    station.max_power_kw != null ? `${station.max_power_kw} kW` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

interface StationPickerModalProps {
  open: boolean
  onClose: () => void
  stations: ChargingStation[]
  networks: ChargingNetwork[]
  onSelect: (station: ChargingStation) => void
}

export default function StationPickerModal({
  open,
  onClose,
  stations,
  networks,
  onSelect,
}: StationPickerModalProps) {
  const { effectiveTheme } = useUserPrefs()
  const [providerFilter, setProviderFilter] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [view, setView] = useState<'list' | 'map'>('list')
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  // Each stop gets a fresh picker: filters and the geolocated point don't
  // carry over from the last time this shared modal instance was opened.
  useEffect(() => {
    if (open) return
    setProviderFilter('')
    setCityQuery('')
    setView('list')
    setUserLocation(null)
    setGeoError(null)
    setLocating(false)
  }, [open])

  const filtered = useMemo(() => {
    const q = foldAccents(cityQuery.trim())
    return stations.filter((s) => {
      if (providerFilter && s.network !== providerFilter) return false
      if (q && !foldAccents(s.city ?? '').includes(q)) return false
      return true
    })
  }, [stations, providerFilter, cityQuery])

  // Distance-sorted once geolocated; alphabetical otherwise so the order
  // stays predictable while typing a city filter.
  const entries = useMemo(() => {
    const withDistance = filtered.map((station) => ({
      station,
      distanceKm: userLocation ? haversineKm(userLocation, station) : null,
    }))
    withDistance.sort((a, b) =>
      a.distanceKm != null && b.distanceKm != null
        ? a.distanceKm - b.distanceKm
        : a.station.name.localeCompare(b.station.name)
    )
    return withDistance
  }, [filtered, userLocation])

  function networkName(slug: string): string {
    return networks.find((n) => n.slug === slug)?.name ?? slug
  }

  function pick(station: ChargingStation) {
    onSelect(station)
    onClose()
  }

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
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setLocating(false)
        setGeoError('No pudimos acceder a tu ubicación. Probá buscar por red o ciudad.')
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  const mapPositions: [number, number][] = [
    ...entries.map(({ station }) => [station.lat, station.lng] as [number, number]),
    ...(userLocation ? [[userLocation.lat, userLocation.lng] as [number, number]] : []),
  ]

  return (
    <MapModal open={open} onClose={onClose} title="Elegir cargador" ariaLabel="Elegir cargador">
      <div className={styles.body}>
        <div className={styles.filterRow}>
          <div className={`${formStyles.field} ${styles.filterField}`}>
            <label className={styles.filterLabel} htmlFor="station-picker-network">
              🌐 Red
            </label>
            <select
              id="station-picker-network"
              className={formStyles.input}
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
            >
              <option value="">Todas las redes</option>
              <NetworkFilterOptions networks={networks} />
            </select>
          </div>
          <div className={`${formStyles.field} ${styles.filterField}`}>
            <label className={styles.filterLabel} htmlFor="station-picker-city">
              📍 Ciudad
            </label>
            <input
              id="station-picker-city"
              type="search"
              className={formStyles.input}
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Rocha"
            />
          </div>
          <button type="button" className={styles.nearMeBtn} onClick={useMyLocation} disabled={locating}>
            📍 {locating ? 'Buscando…' : 'Cerca mío'}
          </button>
        </div>

        {geoError && <Alert type="warning">{geoError}</Alert>}

        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnSelected : ''}`}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            Lista
          </button>
          <button
            type="button"
            className={`${styles.viewBtn} ${view === 'map' ? styles.viewBtnSelected : ''}`}
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            🗺️ Mapa
          </button>
        </div>

        {entries.length === 0 ? (
          <p className={styles.empty}>No hay estaciones que coincidan con el filtro.</p>
        ) : view === 'list' ? (
          <ul className={styles.list}>
            {entries.map(({ station, distanceKm }) => (
              <li key={station.id}>
                <button type="button" className={styles.stationRow} onClick={() => pick(station)}>
                  <span className={styles.stationName}>
                    {station.name}
                    {station.verified && <Badge color="blue">Oficial</Badge>}
                  </span>
                  <span className={styles.stationMeta}>{stationMeta(station, networkName(station.network))}</span>
                  {distanceKm != null && (
                    <span className={styles.distance}>≈ {distanceKm.toFixed(1)} km</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <FittedMapContainer
            positions={mapPositions}
            effectiveTheme={effectiveTheme}
            emptyMessage="No hay estaciones para mostrar con los filtros actuales."
          >
            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]} icon={meIcon}>
                <Popup>Tu ubicación aproximada</Popup>
              </Marker>
            )}
            {entries.map(({ station }) => (
              <Marker key={station.id} position={[station.lat, station.lng]} icon={stationIcon}>
                <Popup>
                  <strong>{station.name}</strong>
                  {station.verified && (
                    <>
                      {' '}
                      <Badge color="blue">Oficial</Badge>
                    </>
                  )}
                  <div>{stationMeta(station, networkName(station.network))}</div>
                  <button type="button" className={styles.pickBtn} onClick={() => pick(station)}>
                    ✅ Elegir esta estación
                  </button>
                </Popup>
              </Marker>
            ))}
          </FittedMapContainer>
        )}
      </div>
    </MapModal>
  )
}
