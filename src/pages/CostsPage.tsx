import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import rawData from '../data/costs.json'
import { PageHeader, Card, CardTitle, Alert, Badge, SectionDivider, StatGrid } from '../components/UI'
import { useUserPrefs } from '../context/UserPrefsContext'
import { supabase } from '../lib/supabaseClient'
import { fetchCommunityStats, useCommunityContent } from '../lib/communityData'
import styles from './Pages.module.css'
import type { CityCostStat, CostsData, Model, StatItem, TripLog } from '../types'

const data = rawData as CostsData

// Estimated real-world consumption from community trips: only trips with no
// intermediate charging stops are computable (start% - end% maps directly to
// energy drawn from the pack). Skipped below a minimum sample size.
const MIN_CONSUMPTION_SAMPLES = 3

function estimateConsumption(trips: TripLog[], model: Model, batteryKwh: number): StatItem | null {
  const qualifying = trips.filter(
    (t) =>
      t.model === model &&
      t.charging_stops.length === 0 &&
      t.distance_km != null &&
      t.distance_km > 0 &&
      t.starting_charge_percentage != null &&
      t.ending_charge_percentage != null &&
      t.starting_charge_percentage > t.ending_charge_percentage
  )
  if (qualifying.length < MIN_CONSUMPTION_SAMPLES) return null

  const perTrip = qualifying.map(
    (t) =>
      (((t.starting_charge_percentage! - t.ending_charge_percentage!) / 100) * batteryKwh / t.distance_km!) * 100
  )
  const avg = perTrip.reduce((a, b) => a + b, 0) / perTrip.length
  return {
    value: `${avg.toLocaleString('es-UY', { maximumFractionDigits: 1 })} kWh/100km`,
    label: `Consumo estimado ${model} (${qualifying.length} viajes)`,
  }
}

export default function CostsPage() {
  const { model } = useUserPrefs()
  const { perKm, fullCharge, realCases, patent, insurance } = data

  const activeModel = model ?? 'E2+'
  const activeFullCharge = fullCharge[activeModel]

  // Curated JSON renders immediately; community blocks fill in async.
  const { trips, entries, names } = useCommunityContent({ limit: 50 })
  const [cityStats, setCityStats] = useState<CityCostStat[]>([])

  useEffect(() => {
    if (!supabase) return
    fetchCommunityStats().then(({ cityStats: cs }) => setCityStats(cs))
  }, [])

  const communityStats: StatItem[] = [
    ...cityStats.map((s) => ({
      value: `$${Math.round(s.avg_cost_uyu).toLocaleString('es-UY')}`,
      label: `Costo medio de service en ${s.city} (${s.entry_count})`,
    })),
    ...(['E2', 'E2+'] as Model[])
      .map((m) => estimateConsumption(trips, m, fullCharge[m].battery))
      .filter((s): s is StatItem => s !== null),
  ]

  const communityEntries = entries.slice(0, 10)

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

      {communityStats.length > 0 && (
        <>
          <SectionDivider label="Datos de la comunidad" />
          <Card>
            <CardTitle icon="🌐">Números reales aportados por la comunidad</CardTitle>
            <StatGrid stats={communityStats} />
          </Card>
        </>
      )}

      <SectionDivider label="Casos reales del grupo" />

      <Card>
        <p className={styles.realCaseConditions}>
          Los casos marcados como oficiales son verificados por el grupo; los de la comunidad
          vienen directo de otros usuarios. <Link to="/comunidad">Mirá la comunidad</Link> para
          ver el listado completo.
          {supabase && communityEntries.length === 0 && (
            <> Todavía no hay services compartidos — <Link to="/costos/nuevo">registrá el tuyo</Link>.</>
          )}
        </p>
      </Card>

      {realCases.map((c, i) => (
        <Card key={i}>
          <div className={styles.realCaseHeader}>
            <span className={styles.realCaseTitle}>
              {c.title} <Badge color="blue">Oficial</Badge>
            </span>
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

      {communityEntries.map((entry) => (
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
