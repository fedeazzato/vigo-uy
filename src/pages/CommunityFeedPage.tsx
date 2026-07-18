import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Alert, Badge, StatGrid, SectionDivider, Skeleton } from '../components/UI'
import VehicleLeaderboard from '../components/VehicleLeaderboard'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useRegisterSheet } from '../context/RegisterSheetContext'
import { formatDate } from '../lib/format'
import { fetchCommunityStats, fetchLeaderboard, useCommunityContent, verifiedFirst } from '../lib/communityData'
import { partCategoryTitle } from '../lib/partsCatalog'
import type { StatItem, VehicleLeaderboardEntry } from '../types'
import styles from './CommunityFeedPage.module.css'
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

  useEffect(() => {
    if (!supabase) return

    fetchCommunityStats().then(({ cityStats, modelStats }) => {
      setStats([
        ...cityStats.map((s) => ({
          value: `$${Math.round(s.avg_cost_uyu).toLocaleString('es-UY')}`,
          label: `Costo medio de service en ${s.city} (${s.entry_count})`,
        })),
        ...modelStats
          .filter((s) => s.avg_speed_kmh != null)
          .map((s) => ({
            value: `${Math.round(s.avg_speed_kmh!)} km/h`,
            label: `Velocidad media ${s.model} (${s.trip_count} viajes)`,
          })),
      ])
    })

    fetchLeaderboard().then(({ rows }) => setLeaderboard(rows))
  }, [])

  const filteredTrips = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = trips.filter((trip) => {
      if (modelFilter !== 'todos' && trip.model !== modelFilter) return false
      if (q && ![trip.title, trip.origin, trip.destination].some((f) => f.toLowerCase().includes(q))) return false
      return true
    })
    if (sort === 'puntuacion') {
      return verifiedFirst([...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)))
    }
    return verifiedFirst(result)
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
    if (sort === 'puntuacion') {
      return verifiedFirst([...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)))
    }
    return verifiedFirst(result)
  }, [purchases, query, sort])

  const showTrips = typeFilter === 'todos' || typeFilter === 'viajes'
  const showEntries = typeFilter === 'todos' || typeFilter === 'services'
  const showPurchases = typeFilter === 'todos' || typeFilter === 'repuestos'

  return (
    <div>
      <PageHeader
        title="🌐 Comunidad"
        subtitle="Costos y viajes compartidos por otros dueños de Vigo."
      />

      {!supabase && <Alert type="info">La sección de comunidad no está disponible en esta instalación.</Alert>}
      {error && <Alert type="danger">{error}</Alert>}

      {supabase && (
        <Card className={styles.ctaCard}>
          {status === 'signedIn' ? (
            <>
              <span>¿Hiciste un viaje o un service? Compartilo con la comunidad.</span>
              <div className={styles.ctaActions}>
                <button type="button" className={styles.ctaBtn} onClick={openRegisterSheet}>
                  + Compartir
                </button>
              </div>
            </>
          ) : (
            <>
              <span>Iniciá sesión para compartir tus viajes y costos con la comunidad.</span>
              <div className={styles.ctaActions}>
                <Link to="/login" className={styles.ctaBtn}>Iniciar sesión</Link>
              </div>
            </>
          )}
        </Card>
      )}

      {stats.length > 0 && (
        <Card>
          <h2 className={styles.sectionTitle}>Estadísticas</h2>
          <StatGrid stats={stats} />
        </Card>
      )}

      {leaderboard.length > 0 && (
        <>
          <SectionDivider label="Ranking de kilómetros" />
          <Card>
            <h2 className={styles.sectionTitle}>🏁 Vehículos con más km compartidos</h2>
            <VehicleLeaderboard rows={leaderboard} />
          </Card>
        </>
      )}

      <SectionDivider label="Aportes de la comunidad" />

      {/* Type filter as chips (mobile redesign): one tap, no dropdown. */}
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

      {showTrips && (loading ? (
        <Skeleton lines={4} />
      ) : (
        <Card>
          <h2 className={styles.groupTitle}>Viajes</h2>
          {filteredTrips.length === 0 ? (
            <p className={styles.empty}>
              {trips.length === 0
                ? 'Todavía no hay viajes compartidos por la comunidad.'
                : 'No hay viajes que coincidan con los filtros.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {filteredTrips.map((trip) => (
                <li key={trip.id} className={styles.item}>
                  <div>
                    <div className={styles.itemTitle}>
                      {trip.title}{trip.model && ` (${trip.model})`}
                      {trip.verified && <Badge color="blue">Oficial</Badge>}
                    </div>
                    <div className={styles.itemMeta}>
                      {formatDate(trip.trip_date)} · {trip.origin} → {trip.destination}
                      {trip.distance_km != null && ` · ${trip.distance_km.toLocaleString('es-UY')} km`}
                      {trip.rating != null && ` · ${'★'.repeat(trip.rating)}`}
                    </div>
                  </div>
                  <div className={styles.author}>por {names[trip.user_id] ?? 'un usuario'}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      {showPurchases && (loading ? (
        <Skeleton lines={4} />
      ) : (
        <Card>
          <h2 className={styles.groupTitle}>Repuestos</h2>
          {filteredPurchases.length === 0 ? (
            <p className={styles.empty}>
              {purchases.length === 0
                ? 'Todavía no hay compras compartidas por la comunidad.'
                : 'No hay compras que coincidan con los filtros.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {filteredPurchases.map((purchase) => (
                <li key={purchase.id} className={styles.item}>
                  <div>
                    <div className={styles.itemTitle}>
                      {purchase.item}
                      {purchase.verified && <Badge color="blue">Oficial</Badge>}
                    </div>
                    <div className={styles.itemMeta}>
                      {formatDate(purchase.purchase_date)} · {partCategoryTitle(purchase.category)} · {purchase.store}
                      {purchase.city && ` · ${purchase.city}`}
                      {purchase.rating != null && ` · ${'★'.repeat(purchase.rating)}`}
                    </div>
                  </div>
                  <div>
                    <div className={styles.itemCost}>
                      ${purchase.price_uyu.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                    </div>
                    <div className={styles.author}>por {names[purchase.user_id] ?? 'un usuario'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      {showEntries && (loading ? (
        <Skeleton lines={4} />
      ) : (
        <Card>
          <h2 className={styles.groupTitle}>Services</h2>
          {filteredEntries.length === 0 ? (
            <p className={styles.empty}>
              {entries.length === 0
                ? 'Todavía no hay costos compartidos por la comunidad.'
                : 'No hay services que coincidan con los filtros.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {filteredEntries.map((entry) => (
                <li key={entry.id} className={styles.item}>
                  <div>
                    <div className={styles.itemTitle}>
                      {entry.service_type}
                      {entry.verified && <Badge color="blue">Oficial</Badge>}
                    </div>
                    <div className={styles.itemMeta}>
                      {formatDate(entry.service_date)} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
                      {entry.city && ` · ${entry.city}`}
                    </div>
                  </div>
                  <div>
                    <div className={styles.itemCost}>
                      ${entry.cost_uyu.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={styles.author}>por {names[entry.user_id] ?? 'un usuario'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}
