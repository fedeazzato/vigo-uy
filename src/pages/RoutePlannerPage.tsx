// Route planner with charging stops (specs/route-plans.md, PLAN.md B3):
// origin/destination -> OSRM road route (same free server as the trip map)
// -> WikiVigo stations near the road -> greedy plan using the community's
// real consumption. Share = a link with the inputs; signed-in users can
// also keep plans in "Mis planes" (route_plans).
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Marker, Polyline, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, CardTitle, Alert, Badge, Segmented, StatGrid } from '../components/UI'
import CityCombobox from '../components/CityCombobox'
import FittedMapContainer from '../components/FittedMapContainer'
import { useAuth } from '../context/AuthContext'
import { useUserPrefs } from '../context/UserPrefsContext'
import { fetchChargingStations, fetchStationReliability, reliabilityLevel } from '../lib/communityData'
import { fetchStationAlerts } from '../lib/stationAlerts'
import { fetchRoute } from '../lib/osrmRouting'
import { geocodeCity } from '../lib/nominatimGeocoding'
import { lookupCityCoords } from '../lib/tripMap'
import { dotIcon } from '../lib/mapMarkerIcon'
import { parseLocaleNumber } from '../lib/format'
import {
  BATTERY_KWH,
  CHARGE_TO_SOC,
  MAX_DETOUR_KM,
  buildRouteGeometry,
  communityConsumption,
  parsePlanQuery,
  planCharging,
  planQueryToSearch,
  projectOntoRoute,
  rangeKm,
  totalKm,
} from '../lib/routePlan'
import type { ConsumptionEstimate, Plan, PlanQuery, StopCandidate } from '../lib/routePlan'
import {
  deleteRoutePlan,
  fetchConsumptionTrips,
  fetchMyRoutePlans,
  planSnapshot,
  saveRoutePlan,
} from '../lib/routePlanData'
import type { SavedRoutePlan } from '../lib/routePlanData'
import type { Model } from '../types'
import formStyles from '../styles/formControls.module.css'
import styles from './RoutePlannerPage.module.css'

const MODEL_OPTIONS = [
  { value: 'E2', label: 'E2' },
  { value: 'E2+', label: 'E2+' },
] as const

interface Result {
  query: PlanQuery
  kwhPer100: number
  route: [number, number][]
  distanceKm: number
  plan: Plan
  endpoints: { origin: [number, number]; destination: [number, number] }
}

async function resolvePlace(name: string): Promise<[number, number] | null> {
  const curated = lookupCityCoords(name)
  if (curated) return curated
  const geo = await geocodeCity(name)
  return geo ? [geo.lat, geo.lng] : null
}

const pct = (v: number) => `${Math.max(0, Math.round(v))}%`

export default function RoutePlannerPage() {
  const { status } = useAuth()
  const { model: prefModel, effectiveTheme } = useUserPrefs()
  const [searchParams, setSearchParams] = useSearchParams()

  const initial = useMemo(
    () => parsePlanQuery(searchParams.toString(), prefModel ?? 'E2'),
    [searchParams, prefModel]
  )
  const [origin, setOrigin] = useState(initial?.origin ?? 'Montevideo')
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [model, setModel] = useState<Model>(initial?.model ?? prefModel ?? 'E2')
  const [startSoc, setStartSoc] = useState(String(initial?.startSoc ?? 100))
  const [minSoc, setMinSoc] = useState(String(initial?.minArrivalSoc ?? 15))
  const [consumptionText, setConsumptionText] = useState(
    initial?.kwhPer100 != null ? String(initial.kwhPer100) : ''
  )

  const [estimate, setEstimate] = useState<ConsumptionEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [plans, setPlans] = useState<SavedRoutePlan[]>([])

  useEffect(() => {
    let cancelled = false
    void fetchConsumptionTrips().then((trips) => {
      if (!cancelled) setEstimate(communityConsumption(trips, model))
    })
    return () => {
      cancelled = true
    }
  }, [model])

  useEffect(() => {
    if (status !== 'signedIn') return
    void fetchMyRoutePlans().then((r) => setPlans(r.plans))
  }, [status])

  // A shared link plans on arrival.
  const searchKey = searchParams.toString()
  useEffect(() => {
    if (initial) void run(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per shared query
  }, [searchKey])

  async function run(query: PlanQuery) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const [o, d] = await Promise.all([resolvePlace(query.origin), resolvePlace(query.destination)])
      if (!o || !d) {
        setError(
          `No encontramos "${!o ? query.origin : query.destination}". Probá con el nombre de la ciudad.`
        )
        setResult(null)
        return
      }
      const route = await fetchRoute([o, d])
      if (!route) {
        setError('No pudimos calcular la ruta: el servicio de mapas no respondió. Probá de nuevo en un rato.')
        setResult(null)
        return
      }
      const [{ stations }, { rows: reliability }, alerts, trips] = await Promise.all([
        fetchChargingStations(),
        fetchStationReliability(),
        fetchStationAlerts(),
        fetchConsumptionTrips(),
      ])
      const geometry = buildRouteGeometry(route)
      const candidates: StopCandidate[] = []
      for (const s of stations) {
        if (s.hidden) continue
        const { alongKm, offKm } = projectOntoRoute(geometry, s.lat, s.lng)
        if (offKm > MAX_DETOUR_KM) continue
        candidates.push({
          id: s.id,
          name: s.name,
          network: s.network,
          lat: s.lat,
          lng: s.lng,
          alongKm,
          offKm,
          dc: s.current_type === 'DC',
          maxPowerKw: s.max_power_kw,
          flaky: reliabilityLevel(reliability.find((r) => r.station_id === s.id)) === 'flaky',
          failing: alerts.has(s.id),
        })
      }
      const kwhPer100 = query.kwhPer100 ?? communityConsumption(trips, query.model).kwhPer100
      const distanceKm = totalKm(geometry)
      const plan = planCharging(candidates, {
        totalKm: distanceKm,
        batteryKwh: BATTERY_KWH[query.model],
        kwhPer100,
        startSoc: query.startSoc,
        minArrivalSoc: query.minArrivalSoc,
      })
      setResult({ query, kwhPer100, route, distanceKm, plan, endpoints: { origin: o, destination: d } })
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const c = parseLocaleNumber(consumptionText)
    const query: PlanQuery = {
      origin: origin.trim(),
      destination: destination.trim(),
      model,
      startSoc: Math.min(100, Math.max(5, Math.round(Number(startSoc) || 100))),
      minArrivalSoc: Math.min(50, Math.max(0, Math.round(Number(minSoc) || 0))),
      kwhPer100: c != null && c >= 5 && c <= 40 ? c : undefined,
    }
    if (!query.origin || !query.destination) {
      setError('Escribí de dónde salís y a dónde vas.')
      return
    }
    // The URL is the share link; changing it triggers the plan.
    if (planQueryToSearch(query) === searchKey) void run(query)
    else setSearchParams(planQueryToSearch(query))
  }

  async function handleShare() {
    if (!result) return
    const url = `${window.location.origin}${window.location.pathname}#/rutas/planificar?${planQueryToSearch(result.query)}`
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Enlace copiado. Quien lo abra ve este mismo plan.')
    } catch {
      setMessage(url)
    }
  }

  async function handleSave() {
    if (!result) return
    const res = await saveRoutePlan(
      result.query,
      result.kwhPer100,
      planSnapshot(result.plan, result.distanceKm)
    )
    if (res.error) {
      setError(res.error)
      return
    }
    setMessage('Plan guardado en «Mis planes».')
    void fetchMyRoutePlans().then((r) => setPlans(r.plans))
  }

  async function handleDelete(id: string) {
    const res = await deleteRoutePlan(id)
    if (res.error) setError(res.error)
    else setPlans((p) => p.filter((x) => x.id !== id))
  }

  const battery = BATTERY_KWH[model]
  const shownConsumption = parseLocaleNumber(consumptionText) ?? estimate?.kwhPer100

  return (
    <>
      <PageHeader
        title="🧭 Planificar un viaje"
        subtitle="Te decimos dónde cargar en el camino, con el consumo real de otros dueños."
      />
      <p className={styles.back}>
        <Link to="/rutas">← Rutas</Link>
      </p>

      <Card>
        <form className={formStyles.form} onSubmit={handleSubmit}>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="plan-origin">
                Origen
              </label>
              <CityCombobox id="plan-origin" value={origin} onChange={setOrigin} required />
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="plan-destination">
                Destino
              </label>
              <CityCombobox id="plan-destination" value={destination} onChange={setDestination} required />
            </div>
          </div>
          <div className={formStyles.field}>
            <span className={formStyles.label}>Modelo</span>
            <Segmented label="Modelo" options={MODEL_OPTIONS} value={model} onChange={setModel} />
          </div>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="plan-soc">
                Batería al salir (%)
              </label>
              <input
                id="plan-soc"
                className={formStyles.input}
                type="number"
                inputMode="numeric"
                min={5}
                max={100}
                value={startSoc}
                onChange={(e) => setStartSoc(e.target.value)}
              />
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label} htmlFor="plan-min">
                Llegar con al menos (%)
              </label>
              <input
                id="plan-min"
                className={formStyles.input}
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                value={minSoc}
                onChange={(e) => setMinSoc(e.target.value)}
              />
            </div>
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="plan-consumption">
              Consumo (kWh/100 km)
            </label>
            <input
              id="plan-consumption"
              className={formStyles.input}
              inputMode="decimal"
              placeholder={estimate ? String(estimate.kwhPer100).replace('.', ',') : ''}
              value={consumptionText}
              onChange={(e) => setConsumptionText(e.target.value)}
            />
            <span className={formStyles.hint}>
              {estimate?.source === 'comunidad'
                ? `Mediana de ${estimate.samples} viajes reales de la comunidad. Dejalo vacío para usarla.`
                : 'Todavía hay pocos viajes de la comunidad: usamos 15 kWh/100 km (ruta con aire). kWh/100 km es la energía que gasta cada 100 km; menos es mejor.'}
              {shownConsumption
                ? ` Autonomía estimada: ${Math.round(rangeKm(100, 0, battery, shownConsumption))} km al 100%.`
                : ''}
            </span>
          </div>
          <button type="submit" className={formStyles.submitBtn} disabled={busy}>
            {busy ? 'Calculando…' : 'Planificar'}
          </button>
        </form>
      </Card>

      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}

      {result && (
        <Card>
          <CardTitle icon="🗺️">
            {result.query.origin} → {result.query.destination}
          </CardTitle>
          <StatGrid
            stats={[
              { value: `${Math.round(result.distanceKm)} km`, label: 'Distancia por ruta' },
              { value: String(result.plan.stops.length), label: 'Paradas de carga' },
              { value: `${String(result.kwhPer100).replace('.', ',')} kWh`, label: 'Consumo (por 100 km)' },
              {
                value: result.plan.feasible ? pct(result.plan.arrivalSoc) : '—',
                label: 'Batería al llegar',
              },
            ]}
          />
          {!result.plan.feasible && (
            <Alert type="warning">
              Con las estaciones de WikiVigo no alcanza para completar el viaje con{' '}
              {result.query.minArrivalSoc}% de reserva. Revisá el mapa de <Link to="/carga">Carga</Link>{' '}
              (incluye Open Charge Map) o bajá la reserva.
            </Alert>
          )}
          {result.plan.skippedFailing.length > 0 && (
            <Alert type="warning">
              No sugerimos {result.plan.skippedFailing.map((s) => s.name).join(', ')}: la reportaron fuera de
              servicio hace poco.
            </Alert>
          )}

          <ol className={styles.legs}>
            <li>
              <span className={styles.legPlace}>🟣 {result.query.origin}</span>
              <span className={styles.legMeta}>Salís con {pct(result.query.startSoc)}</span>
            </li>
            {result.plan.stops.map((s) => (
              <li key={s.candidate.id}>
                <span className={styles.legPlace}>
                  🟠 {s.candidate.name}{' '}
                  {s.candidate.dc ? <Badge color="green">DC</Badge> : <Badge color="gray">AC</Badge>}
                  {s.candidate.flaky && <Badge color="amber">Fallas reportadas</Badge>}
                </span>
                <span className={styles.legMeta}>
                  km {Math.round(s.candidate.alongKm)}
                  {s.candidate.offKm >= 1 ? ` (a ${Math.round(s.candidate.offKm)} km de la ruta)` : ''} ·
                  llegás con {pct(s.arrivalSoc)}, cargás hasta {pct(s.departureSoc)}
                  {s.candidate.maxPowerKw ? ` · ${s.candidate.maxPowerKw} kW` : ''}
                </span>
              </li>
            ))}
            <li>
              <span className={styles.legPlace}>🔵 {result.query.destination}</span>
              <span className={styles.legMeta}>
                {result.plan.feasible
                  ? `Llegás con ${pct(result.plan.arrivalSoc)}`
                  : 'No alcanza con este plan'}
              </span>
            </li>
          </ol>

          <div className={styles.map}>
            <FittedMapContainer
              positions={[result.endpoints.origin, result.endpoints.destination]}
              effectiveTheme={effectiveTheme}
              emptyMessage=""
            >
              <Polyline positions={result.route} pathOptions={{ className: styles.routeLine, weight: 3 }} />
              <Marker position={result.endpoints.origin} icon={dotIcon('var(--chart-1)')}>
                <Popup>🟣 {result.query.origin}</Popup>
              </Marker>
              {result.plan.stops.map((s) => (
                <Marker
                  key={s.candidate.id}
                  position={[s.candidate.lat, s.candidate.lng]}
                  icon={dotIcon('var(--accent)')}
                >
                  <Popup>🟠 {s.candidate.name}</Popup>
                </Marker>
              ))}
              <Marker position={result.endpoints.destination} icon={dotIcon('var(--chart-2)')}>
                <Popup>🔵 {result.query.destination}</Popup>
              </Marker>
            </FittedMapContainer>
          </div>

          <p className={styles.note}>
            Estimación: cargamos hasta {CHARGE_TO_SOC}% en cada parada (después la carga se vuelve muy lenta).
            El consumo real cambia con la velocidad, el viento, la temperatura y el aire.
          </p>

          <div className={styles.actions}>
            <button type="button" className={formStyles.submitBtnCompact} onClick={() => void handleShare()}>
              🔗 Copiar enlace
            </button>
            {status === 'signedIn' && (
              <button type="button" className={formStyles.submitBtnCompact} onClick={() => void handleSave()}>
                💾 Guardar plan
              </button>
            )}
          </div>
        </Card>
      )}

      {status === 'signedIn' && plans.length > 0 && (
        <Card>
          <CardTitle icon="📌">Mis planes</CardTitle>
          <ul className={styles.plans}>
            {plans.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/rutas/planificar?${planQueryToSearch({
                    origin: p.origin,
                    destination: p.destination,
                    model: p.model === 'E2+' ? 'E2+' : 'E2',
                    startSoc: p.start_soc,
                    minArrivalSoc: p.min_arrival_soc,
                    kwhPer100: Number(p.consumption_kwh_100km),
                  })}`}
                >
                  {p.title}
                </Link>
                <button type="button" className={styles.linkBtn} onClick={() => void handleDelete(p.id)}>
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
