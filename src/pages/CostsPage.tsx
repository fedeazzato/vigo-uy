import rawData from '../data/costs.json'
import { PageHeader, Card, CardTitle, Alert, SectionDivider } from '../components/UI'
import { useUserPrefs } from '../context/UserPrefsContext'
import styles from './Pages.module.css'
import type { CostsData } from '../types'

const data = rawData as CostsData

export default function CostsPage() {
  const { model } = useUserPrefs()
  const { perKm, fullCharge, realCases, patent, insurance } = data

  const activeModel = model ?? 'E2+'
  const activeFullCharge = fullCharge[activeModel]

  return (
    <div>
      <PageHeader
        title="💰 Costos"
        subtitle="Comparativa de costos de carga y ahorro real vs combustible."
      />

      <Card>
        <CardTitle icon="📏">Costo por kilómetro</CardTitle>
        <div className={styles.priceTable}>
          {perKm.map((row, i) => (
            <div key={i} className={styles.priceRow}>
              <div className={styles.priceLabel}>
                {row.label}
                {row.badge && (
                  <span className={`${styles.inlineBadge} ${styles[`badge_${row.badgeColor}`]}`}>
                    {row.badge}
                  </span>
                )}
              </div>
              <div className={styles.priceValue}>{row.value}<span className={styles.priceUnit}>/km</span></div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle icon="🔋">
          Carga completa 0→100% — {activeModel} ({activeFullCharge.battery.toLocaleString('es-UY')} kWh)
        </CardTitle>
        <div className={styles.chargeCompare}>
          {activeFullCharge.options.map((opt, i) => (
            <div key={i} className={`${styles.chargeOption} ${i === 0 ? styles.chargeOptionBest : ''}`}>
              <div className={styles.chargeOptionName}>{opt.label}</div>
              <div className={styles.chargeOptionTotal}>
                ${opt.total.toLocaleString('es-UY')}
                {i === 0 && <span className={styles.bestTag}>Más barato</span>}
              </div>
              <div className={styles.chargeOptionNote}>{opt.note}</div>
              {opt.base > 0 && (
                <div className={styles.chargeBreakdown}>
                  Energía ${opt.energy} + cargo base ${opt.base}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <SectionDivider label="Casos reales del grupo" />

      {realCases.map((c, i) => (
        <Card key={i}>
          <div className={styles.realCaseHeader}>
            <span className={styles.realCaseTitle}>{c.title}</span>
            <span className={styles.realCaseCost}>{c.cost}<span className={styles.realCasePeriod}>/{c.period}</span></span>
          </div>
          <div className={styles.realCaseStats}>
            <div className={styles.realCaseStat}>
              <div className={styles.realCaseStatVal}>{c.km.toLocaleString('es-UY')} km</div>
              <div className={styles.realCaseStatLbl}>recorridos</div>
            </div>
            <div className={styles.realCaseStat}>
              <div className={styles.realCaseStatVal}>{c.costPerKm}</div>
              <div className={styles.realCaseStatLbl}>por km</div>
            </div>
          </div>
          <p className={styles.realCaseConditions}>⚙️ {c.conditions}</p>
          <div className={styles.realCaseComparison}>
            <span>🔥</span> {c.comparison}
          </div>
        </Card>
      ))}

      <SectionDivider label="Patente 2026" />

      <Card>
        <CardTitle icon="📋">Patente anual</CardTitle>
        <div className={styles.patentTable}>
          {(!model || model === 'E2') && (
            <div className={styles.patentRow}>
              <span className={styles.patentModel}>Vigo E2</span>
              <span className={styles.patentVal}>Aforo: {patent.e2.valuation}</span>
              <span className={styles.patentCost}>{patent.e2.patent}</span>
            </div>
          )}
          {(!model || model === 'E2+') && (
            <div className={styles.patentRow}>
              <span className={styles.patentModel}>Vigo E2+</span>
              <span className={styles.patentVal}>Aforo: {patent.e2plus.valuation}</span>
              <span className={styles.patentCost}>{patent.e2plus.patent}</span>
            </div>
          )}
        </div>
        <Alert type="info">{patent.note}</Alert>
        {patent.policyNotes.map((note, i) => (
          <Alert key={i} type="warning">{note}</Alert>
        ))}
      </Card>

      <SectionDivider label="Seguro" />

      <Card>
        <CardTitle icon="🛡️">Rango de precios reportado</CardTitle>
        <div className={styles.realCaseHeader}>
          <span className={styles.realCaseCost}>{insurance.range}</span>
        </div>
        <Alert type="warning">{insurance.disclaimer}</Alert>
        <p className={styles.realCaseConditions}>
          Aseguradoras mencionadas por el grupo: {insurance.insurers.join(', ')}.
        </p>
      </Card>
    </div>
  )
}
