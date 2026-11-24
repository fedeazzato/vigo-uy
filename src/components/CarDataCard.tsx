import { useEffect, useState } from 'react'
import { Card, CardTitle, Switch, FormError } from './UI'
import {
  capacityEstimate,
  capacityPoints,
  deleteMyCarData,
  faultLabel,
  fetchFaultCounts,
  fetchMyCarData,
  fmt,
  monthLabel,
  monthlyDrives,
  setSharing,
  verifiedSummary,
  SHARING_KEYS,
  SHARING_TEXT,
  type CapacityPoint,
  type DataKind,
  type FaultCountRow,
  type MyCarData,
  type SharingKey,
} from '../lib/carData'
import styles from './CarDataCard.module.css'
import { confirmDialog } from '../lib/confirmDialog'
import GlossaryLink from './GlossaryLink'

// Mi Vigo "Datos del auto" (specs/car-data-a3-a9.md): the member's private view of what Carga sent (verified km, battery
// health, monthly consumption and regeneration, dashboard warnings) plus the sharing switches (all off by default) and the
// delete buttons. Hidden until the vehicle has some car data (and before migration 0061).
export default function CarDataCard() {
  const [data, setData] = useState<MyCarData | null>(null)
  const [counts, setCounts] = useState<FaultCountRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    void fetchMyCarData().then(setData)
    void fetchFaultCounts().then(setCounts)
  }
  useEffect(load, [])

  if (!data) return null
  const { sharing, odometer, battery, drives, faults } = data
  if (odometer.length + battery.length + drives.length + faults.length === 0) return null

  const km = verifiedSummary(odometer)
  const points = capacityPoints(battery)
  const estimate = capacityEstimate(points)
  const months = monthlyDrives(drives).slice(0, 6)

  const toggle = async (key: SharingKey, on: boolean) => {
    setBusy(true)
    setError(await setSharing(key, on))
    setBusy(false)
    load()
  }
  const remove = async (kind: DataKind, what: string) => {
    if (!(await confirmDialog(`¿Eliminar ${what}? No se puede deshacer.`))) return
    setBusy(true)
    if (!(await deleteMyCarData(kind))) setError('No se pudo eliminar. Probá de nuevo.')
    setBusy(false)
    load()
  }

  return (
    <Card>
      <CardTitle icon="📊">Datos del auto</CardTitle>
      <p className={styles.lead}>
        Lo que tu auto fue juntando: kilómetros, batería y consumo. Abajo elegís qué compartir.
      </p>

      {km && (
        <section className={styles.section}>
          <h3 className={styles.h}>Kilómetros verificados</h3>
          <p className={styles.big}>{km.odometer.toLocaleString('es-UY')} km</p>
          <p className={styles.small}>
            Odómetro informado por el auto (firmado por el dispositivo).{' '}
            {km.kmVerified.toLocaleString('es-UY')} km recorridos desde el{' '}
            {new Date(km.since + 'T12:00:00').toLocaleDateString('es-UY')}.
          </p>
          {km.anomaly && (
            <p className={styles.warn}>
              El odómetro bajó en algún momento (¿cambio de tablero?): no aparece como verificado hasta que
              borres el historial.
            </p>
          )}
        </section>
      )}

      {battery.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.h}>Salud de la batería</h3>
          {estimate != null ? (
            <p className={styles.big}>≈ {fmt(estimate)} kWh útiles</p>
          ) : (
            <p className={styles.small}>
              Hace falta una carga de al menos 20 puntos de batería para estimar la capacidad.
            </p>
          )}
          {points.length >= 2 && <CapacityChart points={points} />}
          <p className={styles.small}>
            Estimación: kWh cargados por cada 100 % de batería, en cargas de 20 puntos o más ({battery.length}{' '}
            {battery.length === 1 ? 'carga' : 'cargas'}). Las cargas con menos de 10 °C se marcan aparte: el
            frío baja la cifra sin que la batería esté peor. Necesita varios meses de datos para mostrar una
            tendencia.
          </p>
        </section>
      )}

      {months.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.h}>Consumo y frenadas</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mes</th>
                <th>km</th>
                <th>kWh/100 km</th>
                <th>Recuperado al frenar</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  <td>{m.km.toLocaleString('es-UY')}</td>
                  <td>{m.kwhPer100 != null ? fmt(m.kwhPer100) : '—'}</td>
                  <td>{m.regenPct != null ? `${fmt(m.regenPct)} %` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.small}>
            <GlossaryLink term="kwh-100">kWh/100 km</GlossaryLink>: el consumo, más bajo es mejor.
          </p>
        </section>
      )}

      {faults.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.h}>Avisos del tablero</h3>
          <ul className={styles.list}>
            {faults.slice(0, 20).map((f) => {
              const others = counts.find((c) => c.source === f.source && c.code === f.code)
              return (
                <li key={f.id}>
                  <strong>{faultLabel(f.code)}</strong> ·{' '}
                  {new Date(f.observed_at).toLocaleString('es-UY', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {f.odometer_km != null && ` · ${f.odometer_km.toLocaleString('es-UY')} km`}
                  {others && (
                    <span className={styles.small}> · otros {others.vehicles} dueños vieron este aviso</span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className={styles.small}>
            Los avisos se leen sin tocar nada del auto. El significado exacto de cada código todavía se está
            verificando.
          </p>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.h}>Compartir con la comunidad</h3>
        {SHARING_KEYS.map((key) => (
          <Switch
            key={key}
            checked={sharing?.[key] ?? false}
            disabled={busy}
            onChange={(on) => void toggle(key, on)}
            hint={SHARING_TEXT[key].hint}
          >
            {SHARING_TEXT[key].title}
          </Switch>
        ))}
        <p className={styles.small}>Apagar una opción te saca al instante de los rankings y promedios.</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.h}>Eliminar mis datos</h3>
        <div className={styles.buttons}>
          <button disabled={busy} onClick={() => void remove('battery', 'las cargas registradas')}>
            Cargas
          </button>
          <button disabled={busy} onClick={() => void remove('drive', 'los viajes registrados')}>
            Viajes
          </button>
          <button disabled={busy} onClick={() => void remove('fault', 'los avisos del tablero')}>
            Avisos
          </button>
          <button disabled={busy} onClick={() => void remove('odometer', 'el historial del odómetro')}>
            Odómetro
          </button>
        </div>
      </section>
      {error && <FormError>{error}</FormError>}
    </Card>
  )
}

// Inline SVG line of the capacity estimates; cold charges as hollow dots.
function CapacityChart({ points }: { points: CapacityPoint[] }) {
  const W = 300
  const H = 90
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const lo = Math.min(...points.map((p) => p.kwh)) - 1
  const hi = Math.max(...points.map((p) => p.kwh)) + 1
  const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * (W - 10) + 5)
  const y = (k: number) => H - 5 - ((k - lo) / (hi - lo)) * (H - 10)
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Capacidad estimada entre ${fmt(lo + 1)} y ${fmt(hi - 1)} kWh`}
    >
      <polyline
        className={styles.line}
        points={points
          .filter((p) => !p.cold)
          .map((p) => `${x(p.t)},${y(p.kwh)}`)
          .join(' ')}
      />
      {points.map((p) => (
        <circle key={p.t} cx={x(p.t)} cy={y(p.kwh)} r={3} className={p.cold ? styles.cold : styles.dot} />
      ))}
    </svg>
  )
}
