import { ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import rawData from '../data/costs.json'
import { PageHeader, Card, CardTitle, Alert, Badge, SectionDivider, StatGrid } from '../components/UI'
import { useUserPrefs } from '../context/UserPrefsContext'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../lib/format'
import ServiceEntryCard from '../components/ServiceEntryCard'
import InsuranceQuoteCard from '../components/InsuranceQuoteCard'
import {
  cityCostStatItems,
  fetchInsuranceAddons,
  fetchInsuranceCostStats,
  fetchInsuranceProviders,
  fetchInsuranceQuoteAddons,
  fetchInsuranceQuotes,
  insuranceCostStatsByProvider,
  insuranceCostStatsByProviderAndCoverage,
  insuranceQuoteAddonDisplays,
  preferCommunity,
  useCityCostStats,
  useCommunityContent,
  verifiedFirst,
} from '../lib/communityData'
import styles from './Pages.module.css'
import listStyles from '../styles/listPatterns.module.css'
import { INSURANCE_COVERAGE_LABELS } from '../types'
import type {
  CostsData,
  InsuranceAddon,
  InsuranceCostStat,
  InsuranceProvider,
  InsuranceQuote,
  InsuranceQuoteAddon,
  Model,
  StatItem,
  TripLog,
} from '../types'

// A provider-averages row (name + optional badge + price + sample note),
// shared by the per-provider and per-provider-per-coverage tables below.
function ProviderPriceRow({
  name,
  badge,
  valueLabel,
  note,
}: {
  name: string
  badge?: ReactNode
  valueLabel: string
  note: string
}) {
  return (
    <li className={styles.providerItem}>
      <span className={styles.providerName}>
        {name}
        {badge}
      </span>
      <span className={styles.providerPrice}>
        <span className={styles.providerPriceValue}>{valueLabel}</span>
        <br />
        <span className={styles.providerPriceNote}>{note}</span>
      </span>
    </li>
  )
}

const data = rawData as CostsData

// Estimated real-world consumption from community trips: only trips with no
// intermediate charging stops are computable (start% - end% maps directly to
// energy drawn from the pack). Skipped below a minimum sample size.
const MIN_CONSUMPTION_SAMPLES = 3

// Exported for tests.
export function estimateConsumption(trips: TripLog[], model: Model, batteryKwh: number): StatItem | null {
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
      ((((t.starting_charge_percentage! - t.ending_charge_percentage!) / 100) * batteryKwh) /
        t.distance_km!) *
      100
  )
  // Median, not mean: a single absurd trip shouldn't drag the estimate.
  const sorted = [...perTrip].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return {
    value: `${median.toLocaleString('es-UY', { maximumFractionDigits: 1 })} kWh/100km`,
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
  const cityStats = useCityCostStats()

  const [insuranceProviders, setInsuranceProviders] = useState<InsuranceProvider[]>([])
  const [insuranceAddons, setInsuranceAddons] = useState<InsuranceAddon[]>([])
  const [insuranceQuotes, setInsuranceQuotes] = useState<InsuranceQuote[]>([])
  const [insuranceQuoteAddonsByQuote, setInsuranceQuoteAddonsByQuote] = useState<Map<string, InsuranceQuoteAddon[]>>(
    new Map()
  )
  const [insuranceCostStats, setInsuranceCostStats] = useState<InsuranceCostStat[]>([])
  useEffect(() => {
    if (!supabase) return
    void fetchInsuranceProviders().then(({ providers }) => setInsuranceProviders(providers))
    void fetchInsuranceAddons().then(({ addons }) => setInsuranceAddons(addons))
    void fetchInsuranceCostStats().then(({ stats }) => setInsuranceCostStats(stats))
    void fetchInsuranceQuotes(50).then(({ quotes }) => {
      setInsuranceQuotes(quotes)
      void fetchInsuranceQuoteAddons(quotes.map((q) => q.id)).then(({ addonsByQuote }) =>
        setInsuranceQuoteAddonsByQuote(addonsByQuote)
      )
    })
  }, [])
  const insuranceProviderNames = new Map(insuranceProviders.map((p) => [p.slug, p.name]))
  const providerCostStats = insuranceCostStatsByProvider(insuranceCostStats, insuranceProviders)
  const providerCoverageCostStats = insuranceCostStatsByProviderAndCoverage(insuranceCostStats, insuranceProviders)
  const communityInsuranceQuotes = verifiedFirst(insuranceQuotes).slice(0, 10)
  // D1 gate, same pattern as realCases/service_entries above.
  const communityInsuranceFirst =
    preferCommunity({ curated: insurance, community: insuranceQuotes, minSamples: 5 }).source === 'comunidad'

  const communityStats: StatItem[] = [
    ...cityCostStatItems(cityStats),
    ...(['E2', 'E2+'] as Model[])
      .map((m) => estimateConsumption(trips, m, fullCharge[m].battery))
      .filter((s): s is StatItem => s !== null),
  ]

  const communityEntries = verifiedFirst(entries).slice(0, 10)

  // D1 gate: with enough real service entries, the transcribed-from-WhatsApp
  // cases retire and the section becomes community-only (see
  // specs/CONTENT-MIGRATION.md).
  const communityFirst =
    preferCommunity({ curated: realCases, community: entries, minSamples: 5 }).source === 'comunidad'

  return (
    <div>
      <PageHeader title="💰 Costos" subtitle="Comparativa de costos de carga y ahorro real vs combustible." />

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
              <div className={styles.priceValue}>
                {row.value}
                <span className={styles.priceUnit}>/km</span>
              </div>
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
          {communityFirst ? (
            <>
              Estos datos vienen de la comunidad: services reales registrados por otros dueños. Los marcados
              como oficiales fueron verificados por moderadores.{' '}
            </>
          ) : (
            <>
              Los casos marcados como oficiales son verificados por el grupo; los de la comunidad vienen
              directo de otros usuarios.{' '}
            </>
          )}
          <Link to="/comunidad">Mirá la comunidad</Link> para ver el listado completo.
          {supabase && communityEntries.length === 0 && (
            <>
              {' '}
              Todavía no hay services compartidos — <Link to="/costos/nuevo">registrá el tuyo</Link>.
            </>
          )}
        </p>
      </Card>

      {!communityFirst &&
        realCases.map((c, i) => (
          <Card key={i}>
            <div className={styles.realCaseHeader}>
              <span className={styles.realCaseTitle}>
                {c.title} <Badge color="blue">Oficial</Badge>
              </span>
              <span className={styles.realCaseCost}>
                {c.cost}
                <span className={styles.realCasePeriod}>/{c.period}</span>
              </span>
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
        <ServiceEntryCard key={entry.id} entry={entry} authorName={names[entry.user_id]} />
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
          <Alert key={i} type="warning">
            {note}
          </Alert>
        ))}
      </Card>

      <SectionDivider label="Seguro" />

      {!communityInsuranceFirst && (
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
      )}

      {communityInsuranceFirst && (
        <>
          {providerCostStats.length > 0 && (
            <Card>
              <CardTitle icon="📊">Promedio por aseguradora</CardTitle>
              <p className={styles.chargerTip}>
                Lo que realmente pagó la comunidad por año en cada aseguradora, de la más barata a la más cara.
              </p>
              <ul className={styles.providerList}>
                {providerCostStats.map(({ provider, stat }) => (
                  <ProviderPriceRow
                    key={provider.slug}
                    name={provider.name}
                    valueLabel={`${formatCurrency(stat.avg_cost_per_year_uyu)}/año`}
                    note={`${stat.sample_count} ${stat.sample_count === 1 ? 'seguro' : 'seguros'}, últimos 2 años`}
                  />
                ))}
              </ul>
            </Card>
          )}

          {providerCoverageCostStats.length > 0 && (
            <Card>
              <CardTitle icon="📄">Promedio por cobertura</CardTitle>
              <ul className={styles.providerList}>
                {providerCoverageCostStats.map(({ provider, coverageLevel, stat }) => (
                  <ProviderPriceRow
                    key={`${provider.slug}:${coverageLevel}`}
                    name={provider.name}
                    badge={<Badge color="gray">{INSURANCE_COVERAGE_LABELS[coverageLevel]}</Badge>}
                    valueLabel={`${formatCurrency(stat.avg_cost_per_year_uyu)}/año`}
                    note={`${stat.sample_count} ${stat.sample_count === 1 ? 'seguro' : 'seguros'}`}
                  />
                ))}
              </ul>
            </Card>
          )}

          {communityInsuranceQuotes.map((quote) => (
            <InsuranceQuoteCard
              key={quote.id}
              quote={quote}
              providerName={insuranceProviderNames.get(quote.provider) ?? quote.provider}
              addons={insuranceQuoteAddonDisplays(
                insuranceQuoteAddonsByQuote.get(quote.id) ?? [],
                insuranceAddons
              )}
            />
          ))}
        </>
      )}

      {supabase && (
        <Card className={listStyles.ctaCard}>
          <span>
            {communityInsuranceFirst
              ? 'Sumá tu seguro para seguir mejorando el promedio de la comunidad.'
              : 'Todavía no hay seguros compartidos — registrá el tuyo y ayudá a armar el promedio real.'}
          </span>
          <Link to="/costos/seguro/nuevo" className={listStyles.ctaBtn}>
            + Registrar mi seguro
          </Link>
        </Card>
      )}
    </div>
  )
}
