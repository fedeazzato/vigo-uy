import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import rawData from '../data/mantenimiento.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, StatGrid, SectionDivider } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchCommunityStats, useCommunityContent } from '../lib/communityData'
import styles from './Pages.module.css'
import type { CityCostStat, MantenimientoData, StatItem } from '../types'

const data = rawData as MantenimientoData

export default function MantenimientoPage() {
  const { status } = useAuth()
  // Curated JSON renders immediately; the community section fills in async.
  const { entries, names, loading, error } = useCommunityContent({ trips: false, limit: 10 })
  const [cityStats, setCityStats] = useState<CityCostStat[]>([])

  useEffect(() => {
    if (!supabase) return
    fetchCommunityStats().then(({ cityStats: cs }) => setCityStats(cs))
  }, [])

  const communityStats: StatItem[] = cityStats.map((s) => ({
    value: `$${Math.round(s.avg_cost_uyu).toLocaleString('es-UY')}`,
    label: `Costo medio de service en ${s.city} (${s.entry_count})`,
  }))

  return (
    <div>
      <PageHeader
        title="🛠️ Mantenimiento"
        subtitle="Service oficial, precios por concesionario y problemas conocidos."
      />

      <Alert type="info">{data.officialNote}</Alert>

      {data.schedule.map((item, i) => (
        <Card key={i}>
          <CardTitle icon="🗓️">{item.interval}</CardTitle>
          <ul className={styles.scheduleTasks}>
            {item.tasks.map((task, j) => (
              <li key={j} className={styles.scheduleTask}>{task}</li>
            ))}
          </ul>
        </Card>
      ))}

      <Card>
        <CardTitle icon="🌡️">Uso en condiciones severas</CardTitle>
        <TipList items={data.severeConditions} />
      </Card>

      <SectionDivider label="Precio del service por concesionario" />

      <Card>
        <div className={styles.patentTable}>
          {data.dealerPrices.map((row, i) => (
            <div key={i} className={styles.patentRow}>
              <span className={styles.patentModel}>{row.dealer}</span>
              <span className={styles.patentVal}>{row.service}{row.note ? ` — ${row.note}` : ''}</span>
              <span className={styles.patentCost}>{row.price}</span>
            </div>
          ))}
        </div>
      </Card>

      {supabase && (
        <>
          <SectionDivider label="Services reales de la comunidad" />

          {error && <Alert type="danger">{error}</Alert>}

          {communityStats.length > 0 && (
            <Card>
              <CardTitle icon="🌐">Costos reales por ciudad</CardTitle>
              <StatGrid stats={communityStats} />
            </Card>
          )}

          {!loading && entries.length === 0 && (
            <Card>
              <p className={styles.realCaseConditions}>
                Todavía no hay services compartidos por la comunidad.{' '}
                {status === 'signedIn' ? (
                  <>
                    <Link to="/costos/nuevo">Registrá el tuyo</Link> para que otros sepan cuánto cuesta.
                  </>
                ) : (
                  <>
                    <Link to="/login">Iniciá sesión</Link> y registrá el tuyo para que otros sepan
                    cuánto cuesta.
                  </>
                )}
              </p>
            </Card>
          )}

          {entries.map((entry) => (
            <Card key={entry.id}>
              <div className={styles.realCaseHeader}>
                <span className={styles.realCaseTitle}>
                  {entry.service_type} <Badge color="gray">Comunidad</Badge>
                </span>
                <span className={styles.realCaseCost}>
                  ${entry.cost_uyu.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <p className={styles.realCaseConditions}>
                ⚙️ {entry.service_date} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
                {entry.city && ` · ${entry.city}`} · por {names[entry.user_id] ?? 'un usuario'}
              </p>
              {entry.notes && <p className={styles.realCaseConditions}>💬 {entry.notes}</p>}
            </Card>
          ))}
        </>
      )}

      <SectionDivider label="Problemas conocidos reportados por la comunidad" />

      {data.knownIssues.map((cat) => (
        <Card key={cat.id}>
          <CardTitle icon={cat.icon}>{cat.title}</CardTitle>
          <TipList items={cat.items} />
        </Card>
      ))}

      <SectionDivider label="Seguridad y emergencias" />

      <Card>
        <TipList items={data.safety} />
      </Card>

      <Alert type="info">{data.warrantyNote}</Alert>
    </div>
  )
}
