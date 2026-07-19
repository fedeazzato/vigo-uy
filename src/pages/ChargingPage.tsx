import { useEffect, useState } from 'react'
import rawData from '../data/charging.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, StatGrid, SectionDivider } from '../components/UI'
import CommunityStations from '../components/CommunityStations'
import { useUserPrefs } from '../context/UserPrefsContext'
import { supabase } from '../lib/supabaseClient'
import { fetchChargingCostStats, MIN_COST_SAMPLES } from '../lib/communityData'
import styles from './Pages.module.css'
import type { ChargingCostStat, ChargingData, AutonomyStandard } from '../types'

const data = rawData as ChargingData

const STANDARD_LABELS: Record<AutonomyStandard, string> = {
  CLTC: 'CLTC',
  NEDC: 'NEDC',
  WLTP: 'WLTP',
}

export default function ChargingPage() {
  const { model } = useUserPrefs()
  const { stats, autonomy, homeCharging, publicCharging } = data
  const [standard, setStandard] = useState<AutonomyStandard>('WLTP')
  const [costStats, setCostStats] = useState<ChargingCostStat[]>([])

  useEffect(() => {
    if (!supabase) return
    void fetchChargingCostStats().then(({ stats: cs }) => setCostStats(cs))
  }, [])

  // Rolling-year network average from real charges (D4). When present, it
  // takes visual precedence over the hardcoded price text in the card.
  function networkAverage(network?: string): ChargingCostStat | null {
    if (!network) return null
    return (
      costStats.find(
        (s) => s.network === network && s.station_id === null && s.sample_count >= MIN_COST_SAMPLES
      ) ?? null
    )
  }

  const visibleStats = model
    ? stats.filter(s => !s.model || s.model === model)
    : stats

  const modelsToShow = (model ? [model] : (['E2', 'E2+'] as const))

  return (
    <div>
      <PageHeader
        title="⚡ Carga"
        subtitle="Todo lo que necesitás saber sobre cargar la Vigo — en casa y en la calle."
      />

      <StatGrid stats={visibleStats} />

      <Card>
        <div className={styles.autonomyHeader}>
          <CardTitle icon="🔋">Autonomía</CardTitle>
          <div className={styles.standardPicker}>
            {autonomy.standards.map((s) => (
              <button
                key={s}
                className={`${styles.standardBtn} ${standard === s ? styles.standardBtnActive : ''}`}
                onClick={() => setStandard(s)}
              >
                {STANDARD_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.autonomyGrid}>
          {modelsToShow.map((m) => {
            const entry = autonomy.models[m][standard]
            return (
              <div key={m} className={styles.autonomyModelCard}>
                <div className={styles.autonomyModelLabel}>{m}</div>
                <div className={styles.autonomyKm}>{entry.km} <span className={styles.autonomyKmUnit}>km</span></div>
                <div className={styles.autonomyNote}>{entry.note}</div>
              </div>
            )
          })}
        </div>

        <StatGrid stats={autonomy.realConsumption} />

        <p className={styles.autonomyDisclaimer}>⚠️ {autonomy.disclaimer}</p>
      </Card>

      <Card>
        <CardTitle icon="🏠">{homeCharging.title}</CardTitle>
        <TipList items={homeCharging.tips} />
      </Card>

      <Card>
        <CardTitle icon="🔌">{data.v2l.title}</CardTitle>
        <TipList items={data.v2l.tips} />
      </Card>

      <SectionDivider label="Cargadores públicos" />

      <Alert type="warning">{publicCharging.alert}</Alert>

      {publicCharging.chargers.map((c, i) => {
        const avg = networkAverage(c.network)
        return (
          <Card key={i}>
            <div className={styles.chargerHeader}>
              <span className={styles.chargerName}>{c.name}</span>
              <div>
                {c.source && (
                  <Badge color={c.source === 'manual' ? 'blue' : 'gray'}>
                    {c.source === 'manual' ? 'Oficial' : 'Comunidad'}
                  </Badge>
                )}{' '}
                <Badge color={c.badgeColor}>{c.badge}</Badge>
              </div>
            </div>
            <p className={styles.chargerDetails}>{c.details}</p>
            {avg && (
              <p className={styles.chargerDetails}>
                💰 Promedio real pagado por la comunidad:{' '}
                <strong>
                  ${avg.avg_cost_per_kwh.toLocaleString('es-UY', { maximumFractionDigits: 1 })}/kWh
                </strong>{' '}
                ({avg.sample_count} {avg.sample_count === 1 ? 'carga' : 'cargas'}, último año)
              </p>
            )}
            {c.tips && <p className={styles.chargerTip}>💡 {c.tips}</p>}
          </Card>
        )
      })}

      {supabase && (
        <>
          <SectionDivider label="Estaciones de la comunidad" />
          <CommunityStations />
        </>
      )}

      <SectionDivider label="Advertencias importantes" />

      {publicCharging.alerts.map((a, i) => (
        <Alert key={i} type={i === 0 ? 'danger' : 'warning'}>{a}</Alert>
      ))}

      <SectionDivider label={data.troubleshooting.title} />

      <Card>
        <TipList items={data.troubleshooting.tips} />
      </Card>
    </div>
  )
}
