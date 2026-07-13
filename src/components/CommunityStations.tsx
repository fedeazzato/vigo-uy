import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle, Alert, Badge } from './UI'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toFriendlyError } from '../lib/errors'
import {
  fetchChargingStations,
  fetchChargingCostStats,
  fetchStationReliability,
  invalidateCommunityCache,
  pickCostStat,
  reliabilityLevel,
} from '../lib/communityData'
import type {
  ChargingCostStat,
  ChargingStation,
  StationConnector,
  StationCurrentType,
  StationNetwork,
  StationReliability,
  StationReportStatus,
} from '../types'
import styles from './CommunityStations.module.css'
import formStyles from '../styles/formControls.module.css'

import {
  CONNECTORS_BY_CURRENT,
  CURRENT_TYPES,
  DEFAULT_CONNECTOR,
  NETWORK_LABELS,
  NETWORKS,
} from '../lib/stations'

// Community-maintained charging stations (D4): locations submitted by
// members, reliability from one-tap reports, and cost per kWh COMPUTED from
// what members actually paid on their trips — never stored as a field.
export default function CommunityStations() {
  const { user, status } = useAuth()

  const [stations, setStations] = useState<ChargingStation[]>([])
  const [costStats, setCostStats] = useState<ChargingCostStat[]>([])
  const [reliability, setReliability] = useState<StationReliability[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [network, setNetwork] = useState<StationNetwork>('ute')
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

  const load = useCallback(async () => {
    const [stationsRes, statsRes, reliabilityRes] = await Promise.all([
      fetchChargingStations(),
      fetchChargingCostStats(),
      fetchStationReliability(),
    ])
    setStations(stationsRes.stations)
    setCostStats(statsRes.stats)
    setReliability(reliabilityRes.rows)
    setError(stationsRes.error ?? statsRes.error ?? reliabilityRes.error)
  }, [])

  useEffect(() => {
    if (!supabase) return
    load()
  }, [load])

  async function addStation(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    if (!name.trim()) {
      setError('Poné un nombre que identifique la estación.')
      return
    }
    const power = maxPowerKw.trim() ? Number(maxPowerKw) : null
    if (power != null && (!Number.isFinite(power) || power < 0)) {
      setError('La potencia debe ser un número válido.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: insertError } = await supabase.from('charging_stations').insert({
      user_id: user.id,
      name: name.trim(),
      network,
      city: city.trim() || null,
      connector,
      current_type: currentType,
      max_power_kw: power,
      access_notes: accessNotes.trim() || null,
    })
    setBusy(false)
    if (insertError) {
      setError(toFriendlyError(insertError))
      return
    }
    invalidateCommunityCache()
    setMessage('Estación agregada. ¡Gracias por aportar!')
    setName('')
    setCity('')
    setMaxPowerKw('')
    setAccessNotes('')
    setShowForm(false)
    load()
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
    load()
  }

  if (!supabase) return null

  const byNetwork = NETWORKS.map((net) => ({
    network: net,
    stations: stations.filter((s) => s.network === net),
  })).filter((group) => group.stations.length > 0)

  return (
    <>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}

      <Card>
        <CardTitle icon="📍">Estaciones aportadas por la comunidad</CardTitle>
        <p className={styles.intro}>
          Los precios por kWh se calculan con lo que realmente pagaron otros miembros durante el
          último año — no son tarifas oficiales. La confiabilidad sale de los reportes de uso.
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

        {showForm && (
          <form className={styles.form} onSubmit={addStation}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="station-name">Nombre / ubicación</label>
                <input
                  id="station-name"
                  type="text"
                  className={formStyles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: UTE Rocha centro"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="station-city">Ciudad</label>
                <input
                  id="station-city"
                  type="text"
                  className={formStyles.input}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Rocha"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="station-network">Red</label>
                <select
                  id="station-network"
                  className={formStyles.input}
                  value={network}
                  onChange={(e) => setNetwork(e.target.value as StationNetwork)}
                >
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>{NETWORK_LABELS[n]}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="station-current">Corriente</label>
                <select
                  id="station-current"
                  className={formStyles.input}
                  value={currentType}
                  onChange={(e) => changeCurrentType(e.target.value as StationCurrentType)}
                >
                  {CURRENT_TYPES.map((c) => (
                    <option key={c} value={c}>{c === 'AC' ? 'AC (lenta)' : 'DC (rápida)'}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="station-connector">Conector</label>
                <select
                  id="station-connector"
                  className={formStyles.input}
                  value={connector}
                  onChange={(e) => setConnector(e.target.value as StationConnector)}
                >
                  {CONNECTORS_BY_CURRENT[currentType].map((c) => (
                    <option key={c} value={c}>{c === 'otro' ? 'Otro' : c}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="station-power">Potencia máx. (kW, opcional)</label>
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

            <div className={styles.field}>
              <label className={styles.label} htmlFor="station-notes">Cómo se usa (opcional)</label>
              <textarea
                id="station-notes"
                rows={2}
                className={`${formStyles.input} ${formStyles.textarea}`}
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                placeholder="App necesaria, tarjeta UTE, horarios, etc."
              />
            </div>

            <div>
              <button type="submit" className={styles.submitBtn} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar estación'}
              </button>
            </div>
          </form>
        )}
      </Card>

      {byNetwork.map(({ network: net, stations: netStations }) => (
        <Card key={net}>
          <CardTitle icon="🔌">{NETWORK_LABELS[net]}</CardTitle>
          <ul className={styles.stationList}>
            {netStations.map((station) => {
              const price = pickCostStat(costStats, station.network, station.id)
              const rel = reliability.find((r) => r.station_id === station.id)
              const level = reliabilityLevel(rel)
              return (
                <li key={station.id} className={styles.stationItem}>
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
                      station.connector === 'otro' ? 'conector no estándar' : station.connector,
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
                      <button type="button" className={styles.reportBtn} onClick={() => report(station.id, 'funciono')}>
                        ✅ Funcionó
                      </button>
                      <button type="button" className={styles.reportBtn} onClick={() => report(station.id, 'fallo')}>
                        ❌ Falló
                      </button>
                      <button type="button" className={styles.reportBtn} onClick={() => report(station.id, 'ocupado')}>
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
