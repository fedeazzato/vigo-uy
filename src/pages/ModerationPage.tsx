import { useEffect, useState } from 'react'
import { PageHeader, Card, Alert, Badge, Skeleton } from '../components/UI'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { deleteComment, invalidateCommunityCache } from '../lib/communityData'
import { useAuth } from '../context/AuthContext'
import { purchaseCategoryTitle } from '../lib/purchaseCatalog'
import PurchaseThumbnail from '../components/PurchaseThumbnail'
import ChargingNetworksAdmin from '../components/ChargingNetworksAdmin'
import InsuranceProvidersAdmin from '../components/InsuranceProvidersAdmin'
import InsuranceAddonsAdmin from '../components/InsuranceAddonsAdmin'
import { INSURANCE_COVERAGE_LABELS } from '../types'
import type {
  AdminUserRow,
  ChargingStation,
  ContentComment,
  InsuranceQuote,
  PartPurchase,
  ServiceEntry,
  TripLog,
} from '../types'
import styles from './ModerationPage.module.css'
import listStyles from '../styles/listPatterns.module.css'

type Tab = 'contenido' | 'catalogos' | 'usuarios'
type ContentTable = 'service_entries' | 'trip_logs' | 'part_purchases' | 'charging_stations' | 'insurance_quotes'

export default function ModerationPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('contenido')
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [purchases, setPurchases] = useState<PartPurchase[]>([])
  const [stations, setStations] = useState<ChargingStation[]>([])
  const [quotes, setQuotes] = useState<InsuranceQuote[]>([])
  const [comments, setComments] = useState<ContentComment[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    if (!supabase) return
    setLoading(true)

    const [entriesRes, tripsRes, purchasesRes, stationsRes, quotesRes, commentsRes, usersRes] = await Promise.all([
      supabase
        .from('service_entries')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false }),
      supabase.from('trip_logs').select('*').eq('is_public', true).order('created_at', { ascending: false }),
      supabase
        .from('part_purchases')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false }),
      // No is_public column -- charging_stations is public data by nature
      // (D4 spec), so every row is in scope for moderation.
      supabase.from('charging_stations').select('*').order('created_at', { ascending: false }),
      supabase
        .from('insurance_quotes')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false }),
      // RLS already restricts this to comments on public content (plus the
      // moderator's own) -- no extra filter needed.
      supabase.from('content_comments').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_list_users'),
    ])

    if (
      entriesRes.error ||
      tripsRes.error ||
      purchasesRes.error ||
      stationsRes.error ||
      quotesRes.error ||
      commentsRes.error ||
      usersRes.error
    ) {
      setError(
        toFriendlyError(
          entriesRes.error ??
            tripsRes.error ??
            purchasesRes.error ??
            stationsRes.error ??
            quotesRes.error ??
            commentsRes.error ??
            usersRes.error
        )
      )
      setLoading(false)
      return
    }

    setEntries(entriesRes.data ?? [])
    setTrips((tripsRes.data ?? []) as TripLog[])
    setPurchases(purchasesRes.data ?? [])
    setStations((stationsRes.data ?? []) as ChargingStation[])
    setQuotes((quotesRes.data ?? []) as InsuranceQuote[])
    setComments(commentsRes.data ?? [])

    const usersData = (usersRes.data ?? []) as AdminUserRow[]
    setUsers(usersData)

    // Author names come from admin_list_users: it covers every user
    // (including banned ones, whom public_profiles excludes), and the
    // profiles table is own-row readable only since migration 0021.
    const map: Record<string, string> = {}
    for (const u of usersData) map[u.id] = u.display_name
    setNames(map)

    setLoading(false)
  }

  // Human-readable label for whichever content row a comment targets, from
  // the lists already loaded above.
  function commentTargetLabel(comment: ContentComment): string {
    if (comment.service_entry_id) {
      return entries.find((e) => e.id === comment.service_entry_id)?.service_type ?? 'un service'
    }
    if (comment.trip_log_id) {
      return trips.find((t) => t.id === comment.trip_log_id)?.title ?? 'un viaje'
    }
    return purchases.find((p) => p.id === comment.part_purchase_id)?.item ?? 'una compra'
  }

  async function handleDeleteComment(id: string) {
    if (!confirm('¿Eliminar este comentario?')) return
    const { error } = await deleteComment(id)
    if (error) {
      setError(error)
      return
    }
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  function patchRows(table: ContentTable, id: string, patch: { hidden?: boolean; verified?: boolean }) {
    if (table === 'service_entries') {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    } else if (table === 'trip_logs') {
      setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    } else if (table === 'part_purchases') {
      setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    } else if (table === 'charging_stations') {
      setStations((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    } else {
      setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    }
  }

  async function toggleFlag(table: ContentTable, id: string, field: 'hidden' | 'verified', current: boolean) {
    if (!supabase) return
    // Normal UPDATE: the moderator RLS policy allows it, and (for `verified`)
    // the prevent_unauthorized_verify trigger reverts it for anyone else.
    const patch = field === 'hidden' ? { hidden: !current } : { verified: !current }
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    patchRows(table, id, patch)
  }

  async function deleteItem(table: ContentTable, id: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar definitivamente esta entrada?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    if (table === 'service_entries') setEntries((prev) => prev.filter((e) => e.id !== id))
    else if (table === 'trip_logs') setTrips((prev) => prev.filter((t) => t.id !== id))
    else if (table === 'part_purchases') setPurchases((prev) => prev.filter((p) => p.id !== id))
    else if (table === 'charging_stations') setStations((prev) => prev.filter((s) => s.id !== id))
    else setQuotes((prev) => prev.filter((q) => q.id !== id))
  }

  async function setModerator(target: AdminUserRow, makeModerator: boolean) {
    if (!supabase) return
    const action = makeModerator ? 'dar moderación a' : 'quitar la moderación a'
    if (!confirm(`¿Seguro que querés ${action} ${target.display_name}?`)) return
    setError(null)
    const { error } = await supabase.rpc('admin_set_user_moderator', {
      target_user: target.id,
      make_moderator: makeModerator,
    })
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, is_moderator: makeModerator } : u)))
  }

  async function setBanned(target: AdminUserRow, banned: boolean) {
    if (!supabase) return
    const action = banned ? 'banear a' : 'desbanear a'
    if (!confirm(`¿Seguro que querés ${action} ${target.display_name}?`)) return
    setError(null)
    const { error } = await supabase.rpc('admin_set_user_banned', {
      target_user: target.id,
      banned,
    })
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    // Banning/unbanning changes which public content is visible.
    invalidateCommunityCache()
    setUsers((prev) =>
      prev.map((u) =>
        u.id === target.id ? { ...u, banned_at: banned ? new Date().toISOString() : null } : u
      )
    )
  }

  return (
    <div>
      <PageHeader title="🛡️ Moderación" subtitle="Contenido público y usuarios de la comunidad." />

      {error && <Alert type="danger">{error}</Alert>}

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'contenido' ? styles.tabActive : ''}`}
          onClick={() => setTab('contenido')}
        >
          Contenido
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'catalogos' ? styles.tabActive : ''}`}
          onClick={() => setTab('catalogos')}
        >
          Catálogos
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'usuarios' ? styles.tabActive : ''}`}
          onClick={() => setTab('usuarios')}
        >
          Usuarios ({users.length})
        </button>
      </div>

      {tab === 'contenido' &&
        (loading ? (
          <div aria-busy="true">
            <Skeleton lines={4} />
            <Skeleton lines={4} />
            <Skeleton lines={4} />
          </div>
        ) : (
          <>
            <Card>
              <h2 className={listStyles.sectionTitle}>Costos de service</h2>
              {entries.length === 0 ? (
                <p className={listStyles.empty}>No hay costos públicos.</p>
              ) : (
                <ul className={listStyles.list}>
                  {entries.map((entry) => (
                    <li key={entry.id} className={`${listStyles.item} ${entry.hidden ? styles.hidden : ''}`}>
                      <div>
                        <div className={`${listStyles.itemTitle} ${styles.itemTitleBadges}`}>
                          {entry.service_type}
                          {entry.verified && <Badge color="blue">Verificado</Badge>}
                          {entry.hidden && <Badge color="gray">Oculto</Badge>}
                        </div>
                        <div className={listStyles.itemMeta}>
                          {entry.service_date} · {entry.dealer} · por {names[entry.user_id] ?? 'un usuario'}
                        </div>
                      </div>
                      <div className={listStyles.itemActions}>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('service_entries', entry.id, 'verified', entry.verified)}
                        >
                          {entry.verified ? 'Quitar verificación' : 'Verificar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('service_entries', entry.id, 'hidden', entry.hidden)}
                        >
                          {entry.hidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => deleteItem('service_entries', entry.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className={listStyles.sectionTitle}>Repuestos y consumibles</h2>
              {purchases.length === 0 ? (
                <p className={listStyles.empty}>No hay compras públicas.</p>
              ) : (
                <ul className={listStyles.list}>
                  {purchases.map((purchase) => (
                    <li
                      key={purchase.id}
                      className={`${listStyles.item} ${purchase.hidden ? styles.hidden : ''}`}
                    >
                      <div>
                        <div className={`${listStyles.itemTitle} ${styles.itemTitleBadges}`}>
                          {purchase.item}
                          {purchase.verified && <Badge color="blue">Verificado</Badge>}
                          {purchase.hidden && <Badge color="gray">Oculto</Badge>}
                        </div>
                        <div className={listStyles.itemMeta}>
                          {purchase.purchase_date} · {purchaseCategoryTitle(purchase.category)} ·{' '}
                          {purchase.store} · por {names[purchase.user_id] ?? 'un usuario'}
                          {purchase.link && (
                            <>
                              {' · '}
                              <a href={purchase.link} target="_blank" rel="noopener noreferrer nofollow ugc">
                                Ver publicación ↗
                              </a>
                            </>
                          )}
                        </div>
                        <PurchaseThumbnail src={purchase.image_url} alt={purchase.item} link={purchase.link} />
                      </div>
                      <div className={listStyles.itemActions}>
                        <button
                          className={listStyles.actionLink}
                          onClick={() =>
                            toggleFlag('part_purchases', purchase.id, 'verified', purchase.verified)
                          }
                        >
                          {purchase.verified ? 'Quitar verificación' : 'Verificar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('part_purchases', purchase.id, 'hidden', purchase.hidden)}
                        >
                          {purchase.hidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => deleteItem('part_purchases', purchase.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className={listStyles.sectionTitle}>Viajes</h2>
              {trips.length === 0 ? (
                <p className={listStyles.empty}>No hay viajes públicos.</p>
              ) : (
                <ul className={listStyles.list}>
                  {trips.map((trip) => (
                    <li key={trip.id} className={`${listStyles.item} ${trip.hidden ? styles.hidden : ''}`}>
                      <div>
                        <div className={`${listStyles.itemTitle} ${styles.itemTitleBadges}`}>
                          {trip.title}
                          {trip.verified && <Badge color="blue">Verificado</Badge>}
                          {trip.hidden && <Badge color="gray">Oculto</Badge>}
                        </div>
                        <div className={listStyles.itemMeta}>
                          {trip.trip_date} · {trip.origin} → {trip.destination} · por{' '}
                          {names[trip.user_id] ?? 'un usuario'}
                        </div>
                      </div>
                      <div className={listStyles.itemActions}>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('trip_logs', trip.id, 'verified', trip.verified)}
                        >
                          {trip.verified ? 'Quitar verificación' : 'Verificar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('trip_logs', trip.id, 'hidden', trip.hidden)}
                        >
                          {trip.hidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => deleteItem('trip_logs', trip.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className={listStyles.sectionTitle}>Estaciones de carga</h2>
              {stations.length === 0 ? (
                <p className={listStyles.empty}>No hay estaciones de la comunidad.</p>
              ) : (
                <ul className={listStyles.list}>
                  {stations.map((station) => (
                    <li key={station.id} className={`${listStyles.item} ${station.hidden ? styles.hidden : ''}`}>
                      <div>
                        <div className={`${listStyles.itemTitle} ${styles.itemTitleBadges}`}>
                          {station.name}
                          {station.verified && <Badge color="blue">Verificado</Badge>}
                          {station.hidden && <Badge color="gray">Oculto</Badge>}
                        </div>
                        <div className={listStyles.itemMeta}>
                          {station.network}
                          {station.city && ` · ${station.city}`} · por {names[station.user_id] ?? 'un usuario'}
                        </div>
                      </div>
                      <div className={listStyles.itemActions}>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('charging_stations', station.id, 'verified', station.verified)}
                        >
                          {station.verified ? 'Quitar verificación' : 'Verificar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('charging_stations', station.id, 'hidden', station.hidden)}
                        >
                          {station.hidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => deleteItem('charging_stations', station.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className={listStyles.sectionTitle}>Seguros</h2>
              {quotes.length === 0 ? (
                <p className={listStyles.empty}>No hay seguros públicos.</p>
              ) : (
                <ul className={listStyles.list}>
                  {quotes.map((quote) => (
                    <li key={quote.id} className={`${listStyles.item} ${quote.hidden ? styles.hidden : ''}`}>
                      <div>
                        <div className={`${listStyles.itemTitle} ${styles.itemTitleBadges}`}>
                          {quote.provider} · {INSURANCE_COVERAGE_LABELS[quote.coverage_level]}
                          {quote.verified && <Badge color="blue">Verificado</Badge>}
                          {quote.hidden && <Badge color="gray">Oculto</Badge>}
                        </div>
                        <div className={listStyles.itemMeta}>
                          {quote.hire_date} · {quote.cost_per_year_uyu}/año · por{' '}
                          {names[quote.user_id] ?? 'un usuario'}
                        </div>
                      </div>
                      <div className={listStyles.itemActions}>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('insurance_quotes', quote.id, 'verified', quote.verified)}
                        >
                          {quote.verified ? 'Quitar verificación' : 'Verificar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => toggleFlag('insurance_quotes', quote.id, 'hidden', quote.hidden)}
                        >
                          {quote.hidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => deleteItem('insurance_quotes', quote.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className={listStyles.sectionTitle}>Comentarios</h2>
              {comments.length === 0 ? (
                <p className={listStyles.empty}>No hay comentarios públicos.</p>
              ) : (
                <ul className={listStyles.list}>
                  {comments.map((comment) => (
                    <li key={comment.id} className={listStyles.item}>
                      <div>
                        <div className={listStyles.itemTitle}>{comment.body}</div>
                        <div className={listStyles.itemMeta}>
                          en {commentTargetLabel(comment)} · por {names[comment.user_id] ?? 'un usuario'}
                        </div>
                      </div>
                      <div className={listStyles.itemActions}>
                        <button
                          className={listStyles.actionLink}
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ))}

      {tab === 'catalogos' && (
        <>
          <p className={listStyles.empty}>
            Los adicionales sin límite ("granizo") no piden un valor extra al tildarlos; los de límite en $ o de
            usos por año revelan un campo opcional al tildarlos, igual que en el formulario de seguros.
          </p>
          <InsuranceProvidersAdmin />
          <InsuranceAddonsAdmin />
          <ChargingNetworksAdmin />
        </>
      )}

      {tab === 'usuarios' &&
        (loading ? (
          <Skeleton lines={5} />
        ) : (
          <Card>
            <h2 className={listStyles.sectionTitle}>Usuarios</h2>
            {users.length === 0 ? (
              <p className={listStyles.empty}>No hay usuarios registrados.</p>
            ) : (
              <ul className={listStyles.list}>
                {users.map((u) => {
                  const isSelf = u.id === user?.id
                  return (
                    <li key={u.id} className={`${listStyles.item} ${u.banned_at ? styles.hidden : ''}`}>
                      <div>
                        <div className={`${listStyles.itemTitle} ${styles.itemTitleBadges}`}>
                          {u.display_name}
                          {u.is_moderator && <Badge color="blue">Moderador</Badge>}
                          {u.banned_at && <Badge color="red">Baneado</Badge>}
                          {isSelf && <Badge color="gray">Vos</Badge>}
                        </div>
                        <div className={listStyles.itemMeta}>
                          {[
                            u.city,
                            u.model,
                            u.vehicle_member_count > 1 && `🚗 comparte vehículo (${u.vehicle_member_count})`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          {(u.city || u.model || u.vehicle_member_count > 1) && ' · '}
                          {u.service_count} services · {u.trip_count} viajes · {u.purchase_count} repuestos ·
                          desde {new Date(u.created_at).toLocaleDateString('es-UY')}
                        </div>
                      </div>
                      {!isSelf && (
                        <div className={listStyles.itemActions}>
                          <button
                            className={listStyles.actionLink}
                            onClick={() => setModerator(u, !u.is_moderator)}
                          >
                            {u.is_moderator ? 'Quitar moderación' : 'Hacer moderador'}
                          </button>
                          <button
                            className={listStyles.actionLink}
                            onClick={() => setBanned(u, !u.banned_at)}
                          >
                            {u.banned_at ? 'Desbanear' : 'Banear'}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        ))}
    </div>
  )
}
