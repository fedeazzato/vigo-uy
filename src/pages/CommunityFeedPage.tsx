import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Alert, Badge, StatGrid, SectionDivider, Skeleton } from '../components/UI'
import { TripDetail, TripSummaryButton } from '../components/TripCard'
import VehicleLeaderboard from '../components/VehicleLeaderboard'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useRegisterSheet } from '../context/RegisterSheetContext'
import { formatCurrency, formatDate } from '../lib/format'
import { cityCostStatItems, fetchCommunityStats, fetchLeaderboard, useCommunityContent, verifiedFirst } from '../lib/communityData'
import { useToggleSet } from '../lib/useToggleSet'
import { partCategoryTitle } from '../lib/partsCatalog'
import type { PartPurchase, ServiceEntry, StatItem, TripLog, VehicleLeaderboardEntry } from '../types'
import styles from './CommunityFeedPage.module.css'
import listStyles from '../styles/listPatterns.module.css'
import formStyles from '../styles/formControls.module.css'

type TypeFilter = 'todos' | 'viajes' | 'services' | 'repuestos'
type ModelFilter = 'todos' | 'E2' | 'E2+'
type SortOrder = 'recientes' | 'puntuacion'

const TYPE_CHIPS: { key: TypeFilter; label: string }[] = [
  { key: 'todos', label: 'Todo' },
  { key: 'viajes', label: 'Viajes' },
  { key: 'services', label: 'Services' },
  { key: 'repuestos', label: 'Repuestos' },
]

// One mixed feed instead of per-type columns: with few entries of some
// types, separate columns grow unevenly. Each card carries its type.
type FeedItem =
  | { kind: 'viaje'; date: string; rating: number | null; verified: boolean; trip: TripLog }
  | { kind: 'service'; date: string; rating: number | null; verified: boolean; entry: ServiceEntry }
  | { kind: 'repuesto'; date: string; rating: number | null; verified: boolean; purchase: PartPurchase }

const KIND_META: Record<FeedItem['kind'], { icon: string; label: string }> = {
  viaje:    { icon: '🗺️', label: 'Viaje' },
  service:  { icon: '🛠️', label: 'Service' },
  repuesto: { icon: '🔩', label: 'Repuesto' },
}

// Shared ordering for the filter memos: "puntuación" sorts by rating first,
// then both orders float verified rows to the top.
function rankRows<T extends { rating: number | null; verified: boolean }>(rows: T[], sort: SortOrder): T[] {
  if (sort === 'puntuacion') {
    return verifiedFirst([...rows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)))
  }
  return verifiedFirst(rows)
}

export default function CommunityFeedPage() {
  const { status } = useAuth()
  const { openRegisterSheet } = useRegisterSheet()
  // 100 rows is plenty at current community size; paginate when it grows.
  const { trips, entries, purchases, names, loading, error } = useCommunityContent({
    purchases: true,
    limit: 100,
  })
  const [stats, setStats] = useState<StatItem[]>([])
  const [leaderboard, setLeaderboard] = useState<VehicleLeaderboardEntry[]>([])

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos')
  const [modelFilter, setModelFilter] = useState<ModelFilter>('todos')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOrder>('recientes')

  // Trip rows expand in place to the full TripCard (stops, battery, costs).
  const [expandedTrips, toggleTrip] = useToggleSet()

  useEffect(() => {
    if (!supabase) return

    void fetchCommunityStats().then(({ cityStats, modelStats }) => {
      setStats([
        ...cityCostStatItems(cityStats),
        ...modelStats
          .filter((s) => s.avg_speed_kmh != null)
          .map((s) => ({
            value: `${Math.round(s.avg_speed_kmh!)} km/h`,
            label: `Velocidad media ${s.model} (${s.trip_count} viajes)`,
          })),
      ])
    })

    void fetchLeaderboard().then(({ rows }) => setLeaderboard(rows))
  }, [])

  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = trips.filter((trip) => {
      if (modelFilter !== 'todos' && trip.model !== modelFilter) return false
      if (q && ![trip.title, trip.origin, trip.destination].some((f) => f.toLowerCase().includes(q))) return false
      return true
    })
    return rankRows(result, sort)
  }, [trips, modelFilter, query, sort])

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return verifiedFirst(entries)
    return verifiedFirst(
      entries.filter((entry) =>
        [entry.service_type, entry.dealer, entry.city ?? ''].some((f) => f.toLowerCase().includes(q))
      )
    )
  }, [entries, query])

  const filteredPurchases = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = q
      ? purchases.filter((p) =>
          [p.item, p.store, partCategoryTitle(p.category), p.city ?? ''].some((f) =>
            f.toLowerCase().includes(q)
          )
        )
      : purchases
    return rankRows(result, sort)
  }, [purchases, query, sort])

  const showTrips = typeFilter === 'todos' || typeFilter === 'viajes'
  const showEntries = typeFilter === 'todos' || typeFilter === 'services'
  const showPurchases = typeFilter === 'todos' || typeFilter === 'repuestos'

  const feedItems = useMemo(() => {
    const items: FeedItem[] = []
    if (showTrips) {
      for (const trip of filteredTrips) {
        items.push({ kind: 'viaje', date: trip.trip_date, rating: trip.rating, verified: trip.verified, trip })
      }
    }
    if (showEntries) {
      for (const entry of filteredEntries) {
        items.push({ kind: 'service', date: entry.service_date, rating: null, verified: entry.verified, entry })
      }
    }
    if (showPurchases) {
      for (const purchase of filteredPurchases) {
        items.push({ kind: 'repuesto', date: purchase.purchase_date, rating: purchase.rating, verified: purchase.verified, purchase })
      }
    }
    const byDate = (a: FeedItem, b: FeedItem) => b.date.localeCompare(a.date)
    items.sort(
      sort === 'puntuacion'
        ? (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byDate(a, b)
        : byDate
    )
    return verifiedFirst(items)
  }, [filteredTrips, filteredEntries, filteredPurchases, showTrips, showEntries, showPurchases, sort])

  return (
    <div>
      <PageHeader
        title="🌐 Comunidad"
        subtitle="Costos y viajes compartidos por otros dueños de Vigo."
      />

      {!supabase && <Alert type="info">La sección de comunidad no está disponible en esta instalación.</Alert>}
      {error && <Alert type="danger">{error}</Alert>}

      {supabase && (
        <Card className={listStyles.ctaCard}>
          {status === 'signedIn' ? (
            <>
              <span>¿Hiciste un viaje o un service? Compartilo con la comunidad.</span>
              <div className={styles.ctaActions}>
                <button type="button" className={listStyles.ctaBtn} onClick={openRegisterSheet}>
                  + Compartir
                </button>
              </div>
            </>
          ) : (
            <>
              <span>Iniciá sesión para compartir tus viajes y costos con la comunidad.</span>
              <div className={styles.ctaActions}>
                <Link to="/login" className={listStyles.ctaBtn}>Iniciar sesión</Link>
              </div>
            </>
          )}
        </Card>
      )}

      {stats.length > 0 && (
        <Card>
          <h2 className={listStyles.sectionTitle}>Estadísticas</h2>
          <StatGrid stats={stats} />
        </Card>
      )}

      {leaderboard.length > 0 && (
        <>
          <SectionDivider label="Ranking de kilómetros" />
          <Card>
            <h2 className={listStyles.sectionTitle}>🏁 Vehículos con más km compartidos</h2>
            <VehicleLeaderboard rows={leaderboard} />
          </Card>
        </>
      )}

      <SectionDivider label="Aportes de la comunidad" />

      {/* Type filter as chips (mobile redesign): one tap, no dropdown.
          On desktop the chips and search share one row. */}
      <div className={styles.feedControls}>
        <div className={styles.chipsRow} role="group" aria-label="Mostrar">
          {TYPE_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${typeFilter === key ? styles.chipActive : ''}`}
              onClick={() => setTypeFilter(key)}
              aria-pressed={typeFilter === key}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.searchRow}>
          <input
            id="feed-search"
            type="search"
            aria-label="Buscar en los aportes"
            className={formStyles.input}
            placeholder="Buscar título, lugar, taller…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarField}>
          <label className={styles.toolbarLabel} htmlFor="feed-model">Modelo</label>
          <select
            id="feed-model"
            className={formStyles.input}
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value as ModelFilter)}
          >
            <option value="todos">Ambos</option>
            <option value="E2">E2</option>
            <option value="E2+">E2+</option>
          </select>
        </div>
        {/* Services have no rating, so sorting makes no sense there. */}
        {typeFilter !== 'services' && (
          <div className={styles.toolbarField}>
            <label className={styles.toolbarLabel} htmlFor="feed-sort">Ordenar por</label>
            <select
              id="feed-sort"
              className={formStyles.input}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
            >
              <option value="recientes">Más recientes</option>
              <option value="puntuacion">Mejor puntuados</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton lines={6} />
      ) : feedItems.length === 0 ? (
        <Card>
          <p className={listStyles.empty}>
            {trips.length + entries.length + purchases.length === 0
              ? 'Todavía no hay aportes compartidos por la comunidad.'
              : 'No hay aportes que coincidan con los filtros.'}
          </p>
        </Card>
      ) : (
        <div className={styles.feedGrid}>
          {feedItems.map((item) => {
            const meta = KIND_META[item.kind]
            if (item.kind === 'viaje') {
              const { trip } = item
              const expanded = expandedTrips.has(trip.id)
              const author = names[trip.user_id] ?? 'un usuario'
              return (
                <Card key={`viaje-${trip.id}`} className={`${styles.feedCard} ${styles.feedCard_viaje}`}>
                  <div className={styles.feedCardHead}>
                    <span className={`${styles.typeChip} ${styles.typeChip_viaje}`}>
                      <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    </span>
                    {trip.verified && <Badge color="blue">Oficial</Badge>}
                  </div>
                  <TripSummaryButton trip={trip} expanded={expanded} onToggle={() => toggleTrip(trip.id)} />
                  {expanded && (
                    <div className={styles.tripDetail}>
                      <TripDetail trip={trip} />
                    </div>
                  )}
                  <div className={styles.feedCardFoot}>
                    <span className={listStyles.author}>por {author}</span>
                  </div>
                </Card>
              )
            }
            if (item.kind === 'repuesto') {
              const { purchase } = item
              return (
                <Card key={`repuesto-${purchase.id}`} className={`${styles.feedCard} ${styles.feedCard_repuesto}`}>
                  <div className={styles.feedCardHead}>
                    <span className={`${styles.typeChip} ${styles.typeChip_repuesto}`}>
                      <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    </span>
                    {purchase.verified && <Badge color="blue">Oficial</Badge>}
                  </div>
                  <div className={listStyles.itemTitle}>{purchase.item}</div>
                  <div className={listStyles.itemMeta}>
                    {formatDate(purchase.purchase_date)} · {partCategoryTitle(purchase.category)} · {purchase.store}
                    {purchase.city && ` · ${purchase.city}`}
                    {purchase.rating != null && ` · ${'★'.repeat(purchase.rating)}`}
                  </div>
                  <div className={styles.feedCardFoot}>
                    <span className={listStyles.itemCost}>
                      {formatCurrency(purchase.price_uyu)}
                    </span>
                    <span className={listStyles.author}>por {names[purchase.user_id] ?? 'un usuario'}</span>
                  </div>
                </Card>
              )
            }
            const { entry } = item
            return (
              <Card key={`service-${entry.id}`} className={`${styles.feedCard} ${styles.feedCard_service}`}>
                <div className={styles.feedCardHead}>
                  <span className={`${styles.typeChip} ${styles.typeChip_service}`}>
                    <span aria-hidden="true">{meta.icon}</span> {meta.label}
                  </span>
                  {entry.verified && <Badge color="blue">Oficial</Badge>}
                </div>
                <div className={listStyles.itemTitle}>{entry.service_type}</div>
                <div className={listStyles.itemMeta}>
                  {formatDate(entry.service_date)} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
                  {entry.city && ` · ${entry.city}`}
                </div>
                <div className={styles.feedCardFoot}>
                  <span className={listStyles.itemCost}>
                    {formatCurrency(entry.cost_uyu, 2)}
                  </span>
                  <span className={listStyles.author}>por {names[entry.user_id] ?? 'un usuario'}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
