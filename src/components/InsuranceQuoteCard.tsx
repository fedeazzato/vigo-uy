import { Card, Badge } from './UI'
import { formatCurrency, formatDate } from '../lib/format'
import { addonBadgeText } from '../lib/communityData'
import { INSURANCE_COVERAGE_LABELS, INSURANCE_ZONE_LABELS } from '../types'
import type { InsuranceAddonDisplay } from '../lib/communityData'
import type { InsuranceQuote } from '../types'
// The realCase* classes live in Pages.module.css because CostsPage's curated
// "real case" cards share the exact same presentation.
import styles from '../pages/Pages.module.css'

interface InsuranceQuoteCardProps {
  quote: InsuranceQuote
  providerName: string
  addons: InsuranceAddonDisplay[]
}

// A community insurance quote rendered as a "real case" card, mirroring
// ServiceEntryCard. Deductible/addon lines are omitted entirely when not
// applicable rather than showing a "no aplica" placeholder.
export default function InsuranceQuoteCard({ quote, providerName, addons }: InsuranceQuoteCardProps) {
  return (
    <Card>
      <div className={styles.realCaseHeader}>
        <span className={styles.realCaseTitle}>
          {providerName}{' '}
          <Badge color={quote.verified ? 'blue' : 'gray'}>{quote.verified ? 'Oficial' : 'Comunidad'}</Badge>
        </span>
        <span className={styles.realCaseCost}>
          {formatCurrency(quote.total_cost_uyu, 2)}
          <span className={styles.realCasePeriod}>
            {' '}
            ({quote.period_years} año{quote.period_years === 1 ? '' : 's'}) → {formatCurrency(
              quote.cost_per_year_uyu,
              2
            )}
            /año
          </span>
        </span>
      </div>
      <p className={styles.realCaseConditions}>
        📄 {INSURANCE_COVERAGE_LABELS[quote.coverage_level]} · 👥 {quote.driver_count} conductor
        {quote.driver_count === 1 ? '' : 'es'} · 🎂 {quote.average_driver_age} años promedio · 📍{' '}
        {INSURANCE_ZONE_LABELS[quote.zone]} · 📅 {formatDate(quote.hire_date)}
      </p>
      {quote.deductible_uyu != null && (
        <p className={styles.realCaseConditions}>💸 Deducible {formatCurrency(quote.deductible_uyu, 2)}</p>
      )}
      {addons.length > 0 && (
        <p className={styles.realCaseConditions}>
          {addons.map((addon, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {addonBadgeText(addon)}
            </span>
          ))}
        </p>
      )}
      {quote.notes && <p className={styles.realCaseConditions}>💬 {quote.notes}</p>}
    </Card>
  )
}
