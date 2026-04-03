import rawData from '../data/charging.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, StatGrid, SectionDivider } from '../components/UI'
import { useUserPrefs } from '../context/UserPrefsContext'
import styles from './Pages.module.css'
import type { ChargingData } from '../types'

const data = rawData as ChargingData

export default function ChargingPage() {
  const { model } = useUserPrefs()
  const { stats, homeCharging, publicCharging } = data

  const visibleStats = model
    ? stats.filter(s => !s.model || s.model === model)
    : stats

  return (
    <div>
      <PageHeader
        title="⚡ Carga"
        subtitle="Todo lo que necesitás saber sobre cargar la Vigo — en casa y en la calle."
      />

      <StatGrid stats={visibleStats} />

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
