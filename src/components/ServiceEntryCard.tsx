import { Card, Badge } from './UI'
import ContentReactions from './ContentReactions'
import { formatCurrency } from '../lib/format'
import type { ServiceEntry } from '../types'
// The realCase* classes live in Pages.module.css because CostsPage's curated
// "real case" cards share the exact same presentation.
import styles from '../pages/Pages.module.css'

interface ServiceEntryCardProps {
  entry: ServiceEntry
  authorName?: string
}

// A community service entry rendered as a "real case" card, shared by
// Costos and Mantenimiento.
export default function ServiceEntryCard({ entry, authorName }: ServiceEntryCardProps) {
  return (
    <Card>
      <div className={styles.realCaseHeader}>
        <span className={styles.realCaseTitle}>
          {entry.service_type}{' '}
          <Badge color={entry.verified ? 'blue' : 'gray'}>{entry.verified ? 'Oficial' : 'Comunidad'}</Badge>
        </span>
        <span className={styles.realCaseCost}>{formatCurrency(entry.cost_uyu)}</span>
      </div>
      <p className={styles.realCaseConditions}>
        ⚙️ {entry.service_date} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
        {entry.city && ` · ${entry.city}`} · por {authorName ?? 'un usuario'}
      </p>
      {entry.notes && <p className={styles.realCaseConditions}>💬 {entry.notes}</p>}
      <ContentReactions content={{ kind: 'service_entry', id: entry.id }} />
    </Card>
  )
}
