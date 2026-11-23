import { useEffect, useState } from 'react'
import { Card } from './UI'
import {
  ATLAS_DIMENSIONS,
  atlasRows,
  bucketLabel,
  fetchBatteryCommunity,
  fetchConsumptionAtlas,
  fetchEcoLeague,
  fmt,
  type AtlasRow,
  type BatteryCommunityRow,
  type EcoRow,
} from '../lib/carData'
import listStyles from '../styles/listPatterns.module.css'
import styles from './CarDataCard.module.css'

function memberLabel(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'Vigo'
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// Community view of the car data (specs/car-data-a3-a9.md): consumption atlas (A6), eco league (A7) and the battery curve
// (A5). Only vehicles whose members opted in; aggregates need at least 5 cars per group. Renders nothing while all are empty.
export default function CommunityCarData() {
  const [atlas, setAtlas] = useState<AtlasRow[]>([])
  const [eco, setEco] = useState<EcoRow[]>([])
  const [battery, setBattery] = useState<BatteryCommunityRow[]>([])

  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchConsumptionAtlas(), fetchEcoLeague(), fetchBatteryCommunity()]).then(
      ([a, e, b]) => {
        if (cancelled) return
        setAtlas(a)
        setEco(e)
        setBattery(b)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (atlas.length + eco.length + battery.length === 0) return null
  return (
    <>
      {atlas.length > 0 && (
        <Card>
          <h2 className={listStyles.sectionTitle}>⚡ Consumo real de la comunidad</h2>
          <p className={styles.small}>
            Promedios anónimos de los autos que eligieron sumarse (al menos 5 autos por grupo), medidos por el
            auto.
          </p>
          {ATLAS_DIMENSIONS.map((d) => {
            const rows = atlasRows(atlas, d.key)
            if (rows.length === 0) return null
            return (
              <section key={d.key} className={styles.section}>
                <h3 className={styles.h}>{d.title}</h3>
                <table className={styles.table}>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.bucket}>
                        <td>{bucketLabel(r.bucket)}</td>
                        <td>{fmt(r.kwh_per_100km)} kWh/100 km</td>
                        <td>{r.vehicles} autos</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
        </Card>
      )}
      {eco.length > 0 && (
        <Card>
          <h2 className={listStyles.sectionTitle}>🍃 Liga de manejo eficiente del mes</h2>
          <p className={styles.small}>
            % de la energía de frenado que el auto recuperó. Solo autos que se anotaron.
          </p>
          <ol className={styles.list}>
            {eco.map((r) => (
              <li key={r.vehicle_id}>
                <strong>{memberLabel(r.member_names)}</strong> · {fmt(r.regen_pct)} % · {fmt(r.km, 0)} km en{' '}
                {r.trips} viajes
              </li>
            ))}
          </ol>
        </Card>
      )}
      {battery.length > 0 && (
        <Card>
          <h2 className={listStyles.sectionTitle}>🔋 Salud de batería de la comunidad</h2>
          <p className={styles.small}>
            Capacidad útil estimada (mediana), anónima, con al menos 5 autos por tramo.
          </p>
          <table className={styles.table}>
            <tbody>
              {battery.map((r) => (
                <tr key={`${r.model}-${r.km_band}`}>
                  <td>{r.model === 'sin_modelo' ? 'Vigo' : `Vigo ${r.model}`}</td>
                  <td>
                    {r.km_band.toLocaleString('es-UY')}–{(r.km_band + 20000).toLocaleString('es-UY')} km
                  </td>
                  <td>{fmt(r.median_capacity_kwh)} kWh</td>
                  <td>{r.vehicles} autos</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
