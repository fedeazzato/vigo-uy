import { useState } from 'react'
import rawData from '../data/charging.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, StatGrid, SectionDivider } from '../components/UI'
import { useUserPrefs } from '../context/UserPrefsContext'
import styles from './Pages.module.css'
import type { ChargingData, AutonomyStandard } from '../types'

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
                onClick={() => setStandard(s as AutonomyStandard)}
              >
                {STANDARD_LABELS[s as AutonomyStandard]}
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

        <p className={styles.autonomyDisclaimer}>⚠️ {autonomy.disclaimer}</p>
      </Card>

      <Card>
        <CardTitle icon="🏠">{homeCharging.title}</CardTitle>
        <TipList items={homeCharging.tips} />
      </Card>

      <SectionDivider label="Cargadores públicos" />

      <Alert type="warning">{publicCharging.alert}</Alert>

      {publicCharging.chargers.map((c, i) => (
        <Card key={i}>
          <div className={styles.chargerHeader}>
            <span className={styles.chargerName}>{c.name}</span>
            <Badge color={c.badgeColor}>{c.badge}</Badge>
          </div>
          <p className={styles.chargerDetails}>{c.details}</p>
          {c.tips && <p className={styles.chargerTip}>💡 {c.tips}</p>}
        </Card>
      ))}

      <SectionDivider label="Advertencias importantes" />

      {publicCharging.alerts.map((a, i) => (
        <Alert key={i} type={i === 0 ? 'danger' : 'warning'}>{a}</Alert>
      ))}
    </div>
  )
}
