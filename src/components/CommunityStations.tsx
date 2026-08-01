import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle, Alert, Badge } from './UI'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toFriendlyError } from '../lib/errors'
import { parseLocaleNumber } from '../lib/format'
import { foldAccents } from '../lib/cities'
import {
  createChargingStation,
  fetchChargingNetworks,
  fetchChargingStations,
  fetchChargingCostStats,
  fetchStationReliability,
  invalidateCommunityCache,
  pickCostStat,
  reliabilityLevel,
} from '../lib/communityData'
import type {
  ChargingCostStat,
  ChargingNetwork,
  ChargingStation,
  StationConnector,
  StationCurrentType,
  StationReliability,
  StationReportStatus,
} from '../types'
import styles from './CommunityStations.module.css'
import formStyles from '../styles/formControls.module.css'
import CityCombobox from './CityCombobox'
import {
  CONNECTORS_BY_CURRENT,
  COUNTRIES,
  COUNTRY_LABELS,
  CURRENT_TYPES,
  DEFAULT_CONNECTOR,
} from '../lib/stations'

// Every connector value the schema allows, in a fixed sensible display
// order (AC pair, DC pair, then the two current-agnostic ones) — the
// filter narrows this down to whichever are actually present in the data.
const ALL_CONNECTORS: StationConnector[] = ['Tipo 2', 'Tipo 1', 'CCS2', 'CCS1', 'GB/T', 'Sin cable']

// Fixed round tiers rather than every distinct max_power_kw in the data —
// exact values like 43 kW aren't a threshold anyone filters by; these three
// cover the AC/DC power classes members actually care about.
const POWER_TIERS = [30, 60, 80]

// Shared <option> list for both the add-station network picker and the
// filter toolbar's network picker — grouped by country (UY first, 'otro'
// last, per COUNTRIES' order).
function NetworkOptions({ networks }: { networks: ChargingNetwork[] }) {
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

// Community-maintained charging stations (D4): locations submitted by
// members, reliability from one-tap reports, and cost per kWh COMPUTED from
// what members actually paid on their trips — never stored as a field.
export default function CommunityStations() {
  const { user, status } = useAuth()

  const [networks, setNetworks] = useState<ChargingNetwork[]>([])
  const [stations, setStations] = useState<ChargingStation[]>([])
  const [costStats, setCostStats] = useState<ChargingCostStat[]>([])
  const [reliability, setReliability] = useState<StationReliability[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [network, setNetwork] = useState('ute')
  const [city, setCity] = useState('')
  const [currentType, setCurrentType] = useState<StationCurrentType>('DC')
  const [connector, setConnector] = useState<StationConnector>(DEFAULT_CONNECTOR.DC)

  // Connector depends on the current type: switching AC/DC resets the
  // connector when the current pick doesn't exist on that side.
  function changeCurrentType(next: StationCurrentType) {
    setCurrentType(next)
    if (!CONNECTORS_BY_CURRENT[next].includes(connector)) {
      setConnector(DEFAULT_CONNECTOR[next])
    }
  }
  const [maxPowerKw, setMaxPowerKw] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const [providerFilter, setProviderFilter] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [connectorFilter, setConnectorFilter] = useState('')
  const [minPowerFilter, setMinPowerFilter] = useState('')
  const hasActiveFilter =
    providerFilter !== '' || cityQuery.trim() !== '' || connectorFilter !== '' || minPowerFilter !== ''

  // Connector options are derived from what's actually in the data (not
  // the full schema enum) so the filter never offers a choice that would
  // always return zero results. Power tiers stay fixed (POWER_TIERS).
  const availableConnectors = useMemo(() => {
    const present = new Set(stations.map((s) => s.connector))
    return ALL_CONNECTORS.filter((c) => present.has(c))
  }, [stations])

  const filteredStations = useMemo(() => {
    const q = foldAccents(cityQuery.trim())
    const minPower = minPowerFilter ? Number(minPowerFilter) : null
    return stations.filter((s) => {
      if (providerFilter && s.network !== providerFilter) return false
      if (q && !foldAccents(s.city ?? '').includes(q)) return false
      if (connectorFilter && s.connector !== connectorFilter) return false
      if (minPower != null && (s.max_power_kw == null || s.max_power_kw < minPower)) return false
      return true
    })
  }, [stations, providerFilter, cityQuery, connectorFilter, minPowerFilter])

  const load = useCallback(async () => {
    const [networksRes, stationsRes, statsRes, reliabilityRes] = await Promise.all([
      fetchChargingNetworks(),
      fetchChargingStations(),
      fetchChargingCostStats(),
      fetchStationReliability(),
    ])
    setNetworks(networksRes.networks)
    setStations(stationsRes.stations)
    setCostStats(statsRes.stats)
    setReliability(reliabilityRes.rows)
    setError(networksRes.error ?? stationsRes.error ?? statsRes.error ?? reliabilityRes.error)
  }, [])

  useEffect(() => {
    if (!supabase) return
    void load()
  }, [load])

  async function addStation(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    if (!name.trim()) {
      setError('Poné un nombre que identifique la estación.')
      return
    }
    const power = parseLocaleNumber(maxPowerKw) ?? null
    if (power != null && (!Number.isFinite(power) || power < 0)) {
      setError('La potencia debe ser un número válido.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: insertError } = await createChargingStation({
      userId: user.id,
      name: name.trim(),
      network,
      city: city.trim() || null,
      connector,
      currentType,
      maxPowerKw: power,
      accessNotes: accessNotes.trim() || null,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError)
      return
    }
    setMessage('Estación agregada. ¡Gracias por aportar!')
    setName('')
    setCity('')
    setMaxPowerKw('')
    setAccessNotes('')
    setShowForm(false)
    void load()
  }

  async function report(stationId: string, reportStatus: StationReportStatus) {
    if (!supabase || !user) return
    setError(null)
    setMessage(null)
    const { error: reportError } = await supabase.from('station_reports').insert({
      station_id: stationId,
      user_id: user.id,
      status: reportStatus,
    })
    if (reportError) {
      setError(toFriendlyError(reportError))
      return
    }
    invalidateCommunityCache()
    setMessage('Reporte registrado. ¡Gracias!')
    void load()
  }

  if (!supabase) return null

  // Networks arrive sorted (UY first, 'otro' last); only non-empty groups
  // render.
  const byNetwork = networks
    .map((net) => ({
      network: net,
      stations: filteredStations.filter((s) => s.network === net.slug),
    }))
    .filter((group) => group.stations.length > 0)
  const noResultsFromFilter = hasActiveFilter && byNetwork.length === 0

  return (
    <>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}

      <Card>
        <CardTitle icon="📍">Estaciones aportadas por la comunidad</CardTitle>
        <p className={styles.intro}>
          Los precios por kWh se calculan con lo que realmente pagaron otros miembros durante el último año —
          no son tarifas oficiales. La confiabilidad sale de los reportes de uso.
        </p>

        {status === 'signedIn' ? (
          <button type="button" className={styles.addBtn} onClick={() => setShowForm((o) => !o)}>
            {showForm ? 'Cancelar' : '+ Agregar estación'}
          </button>
        ) : (
          <p className={styles.intro}>
            <Link to="/login">Iniciá sesión</Link> para agregar estaciones o reportar su estado.
          </p>
        )}

        <div className={styles.filterToolbar}>
          <div className={styles.filterFields}>
            <div className={styles.stationField}>
              <label className={styles.stationLabel} htmlFor="station-filter-network">
                🌐 Red
              </label>
              <select
                id="station-filter-network"
                className={formStyles.input}
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <option value="">Todas las redes</option>
                <NetworkOptions networks={networks} />
              </select>
            </div>
            <div className={styles.stationField}>
              <label className={styles.stationLabel} htmlFor="station-filter-city">
                📍 Ciudad
              </label>
              <input
                id="station-filter-city"
                type="search"
                className={formStyles.input}
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Rocha"
              />
            </div>
            <div className={styles.stationField}>
              <label className={styles.stationLabel} htmlFor="station-filter-connector">
                🔌 Conector
              </label>
              <select
                id="station-filter-connector"
                className={formStyles.input}
                value={connectorFilter}
                onChange={(e) => setConnectorFilter(e.target.value)}
              >
                <option value="">Cualquiera</option>
                {availableConnectors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.stationField}>
              <label className={styles.stationLabel} htmlFor="station-filter-power">
                ⚡ Potencia mínima
              </label>
              <select
                id="station-filter-power"
                className={formStyles.input}
                value={minPowerFilter}
                onChange={(e) => setMinPowerFilter(e.target.value)}
              >
                <option value="">Cualquiera</option>
                {POWER_TIERS.map((kw) => (
                  <option key={kw} value={kw}>
                    {kw} kW o más
                  </option>
                ))}
              </select>
            </div>
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              className={styles.clearFiltersBtn}
              onClick={() => {
                setProviderFilter('')
                setCityQuery('')
                setConnectorFilter('')
                setMinPowerFilter('')
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {noResultsFromFilter && <Alert type="info">No hay estaciones que coincidan con el filtro.</Alert>}

        {showForm && (
          <form className={styles.stationForm} onSubmit={addStation}>
            <div className={styles.formRow}>
              <div className={styles.stationField}>
                <label className={styles.stationLabel} htmlFor="station-network">
                  🌐 Red
                </label>
                <select
                  id="station-network"
                  className={formStyles.input}
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                >
                  <NetworkOptions networks={networks} />
                </select>
              </div>
              <div className={styles.stationField}>
                <label className={styles.stationLabel} htmlFor="station-city">
                  📍 Ciudad
                </label>
                <CityCombobox id="station-city" value={city} onChange={setCity} placeholder="Rocha" />
              </div>
            </div>

            <div className={styles.stationField}>
              <label className={styles.stationLabel} htmlFor="station-name">
                📝 Nombre / ubicación
              </label>
              <input
                id="station-name"
                required
                type="text"
                className={formStyles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: UTE Rocha centro"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.stationField}>
                <label className={styles.stationLabel} htmlFor="station-current">
                  ⚡ Corriente
                </label>
                <select
                  id="station-current"
                  className={formStyles.input}
                  value={currentType}
                  onChange={(e) => changeCurrentType(e.target.value as StationCurrentType)}
                >
                  {CURRENT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'AC' ? 'AC (lenta)' : 'DC (rápida)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.stationField}>
                <label className={styles.stationLabel} htmlFor="station-connector">
                  🔌 Conector
                </label>
                <select
                  id="station-connector"
                  className={formStyles.input}
                  value={connector}
                  onChange={(e) => setConnector(e.target.value as StationConnector)}
                >
                  {CONNECTORS_BY_CURRENT[currentType].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.stationField}>
                <label className={styles.stationLabel} htmlFor="station-power">
                  Potencia máx. (kW)
                </label>
                <input
                  id="station-power"
                  type="text"
                  inputMode="numeric"
                  className={formStyles.input}
                  value={maxPowerKw}
                  onChange={(e) => setMaxPowerKw(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>

            <div className={styles.stationField}>
              <label className={styles.stationLabel} htmlFor="station-notes">
                💬 Notas del lugar
              </label>
              <textarea
                id="station-notes"
                rows={2}
                className={`${formStyles.input} ${formStyles.textarea}`}
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                placeholder="QR dañado, horarios del estacionamiento, etc. (las instrucciones de la red van aparte)"
              />
            </div>

            <div>
              <button type="submit" className={styles.stationSubmitBtn} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar estación'}
              </button>
            </div>
          </form>
        )}
      </Card>

      {byNetwork.map(({ network: net, stations: netStations }) => (
        <Card key={net.slug}>
          <CardTitle icon="🔌">
            {net.name}
            {net.country !== 'UY' && net.country !== 'otro' && (
              <>
                {' '}
                <Badge color="gray">{COUNTRY_LABELS[net.country]}</Badge>
              </>
            )}
          </CardTitle>
          {/* Usage instructions are per-provider (charging_networks), not
              per-station — every post of the network works the same way. */}
          {net.instructions && <p className={styles.intro}>📱 {net.instructions}</p>}
          <ul className={styles.stationList}>
            {netStations.map((station, index) => {
              const price = pickCostStat(costStats, station.network, station.id)
              const rel = reliability.find((r) => r.station_id === station.id)
              const level = reliabilityLevel(rel)
              // Two-column desktop grid: the last row (last 1-2 items) drops
              // its divider instead of just the last DOM item (see the
              // ".lastRow" min-width:700px rule in the CSS module).
              const inLastRow = index >= netStations.length - (netStations.length % 2 === 0 ? 2 : 1)
              return (
                <li
                  key={station.id}
                  className={`${styles.stationItem} ${inLastRow ? styles.lastRow : ''}`}
                >
                  <div className={styles.stationHeader}>
                    <span className={styles.stationName}>
                      {station.name}
                      {station.verified && <Badge color="blue">Oficial</Badge>}
                      {level === 'flaky' && <Badge color="amber">Fallas reportadas</Badge>}
                    </span>
                    {price && (
                      <span className={styles.stationPrice}>
                        ≈ ${price.avg_cost_per_kwh.toLocaleString('es-UY', { maximumFractionDigits: 1 })}/kWh
                      </span>
                    )}
                  </div>
                  <div className={styles.stationMeta}>
                    {[
                      station.city,
                      station.connector,
                      station.current_type,
                      station.max_power_kw != null ? `${station.max_power_kw} kW` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {price && (
                    <div className={styles.stationPriceNote}>
                      Promedio último año ({price.sample_count}{' '}
                      {price.sample_count === 1 ? 'carga' : 'cargas'}
                      {price.station_id === null ? ' en la red' : ''})
                    </div>
                  )}
                  {station.access_notes && (
                    <div className={styles.stationNotes}>💡 {station.access_notes}</div>
                  )}
                  {status === 'signedIn' && (
                    <div className={styles.reportRow}>
                      <span className={styles.reportLabel}>¿Pasaste por acá?</span>
                      <button
                        type="button"
                        className={styles.reportBtn}
                        onClick={() => report(station.id, 'funciono')}
                      >
                        ✅ Funcionó
                      </button>
                      <button
                        type="button"
                        className={styles.reportBtn}
                        onClick={() => report(station.id, 'fallo')}
                      >
                        ❌ Falló
                      </button>
                      <button
                        type="button"
                        className={styles.reportBtn}
                        onClick={() => report(station.id, 'ocupado')}
                      >
                        ⏳ Ocupado
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </>
  )
}
