import { useEffect, useState } from 'react'
import { PageHeader, Card, Alert, Badge, Skeleton } from '../components/UI'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { partCategoryTitle } from '../lib/partsCatalog'
import type { AdminUserRow, PartPurchase, ServiceEntry, TripLog } from '../types'
import styles from './ModerationPage.module.css'

type Tab = 'contenido' | 'usuarios'
type ContentTable = 'service_entries' | 'trip_logs' | 'part_purchases'

export default function ModerationPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('contenido')
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [purchases, setPurchases] = useState<PartPurchase[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    if (!supabase) return
    setLoading(true)

    const [entriesRes, tripsRes, purchasesRes, usersRes] = await Promise.all([
      supabase.from('service_entries').select('*').eq('is_public', true).order('created_at', { ascending: false }),
      supabase.from('trip_logs').select('*').eq('is_public', true).order('created_at', { ascending: false }),
      supabase.from('part_purchases').select('*').eq('is_public', true).order('created_at', { ascending: false }),
      supabase.rpc('admin_list_users'),
    ])

    if (entriesRes.error || tripsRes.error || purchasesRes.error || usersRes.error) {
      setError(
        toFriendlyError(entriesRes.error ?? tripsRes.error ?? purchasesRes.error ?? usersRes.error)
      )
      setLoading(false)
      return
    }

    const entriesData = (entriesRes.data ?? []) as ServiceEntry[]
    const tripsData = (tripsRes.data ?? []) as TripLog[]
    const purchasesData = (purchasesRes.data ?? []) as PartPurchase[]
    setEntries(entriesData)
    setTrips(tripsData)
    setPurchases(purchasesData)
    setUsers((usersRes.data ?? []) as AdminUserRow[])

    const userIds = [
      ...new Set([
        ...entriesData.map((e) => e.user_id),
        ...tripsData.map((t) => t.user_id),
        ...purchasesData.map((p) => p.user_id),
      ]),
    ]
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
      const map: Record<string, string> = {}
      for (const p of profilesData ?? []) map[p.id] = p.display_name
      setNames(map)
    }

    setLoading(false)
  }

  async function toggleHidden(table: ContentTable, id: string, currentHidden: boolean) {
    if (!supabase) return
    const { error } = await supabase.from(table).update({ hidden: !currentHidden }).eq('id', id)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    if (table === 'service_entries') {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, hidden: !currentHidden } : e)))
    } else if (table === 'trip_logs') {
      setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, hidden: !currentHidden } : t)))
    } else {
      setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, hidden: !currentHidden } : p)))
    }
  }

  async function deleteItem(table: ContentTable, id: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar definitivamente esta entrada?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    if (table === 'service_entries') setEntries((prev) => prev.filter((e) => e.id !== id))
    else if (table === 'trip_logs') setTrips((prev) => prev.filter((t) => t.id !== id))
    else setPurchases((prev) => prev.filter((p) => p.id !== id))
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
    setUsers((prev) =>
      prev.map((u) => (u.id === target.id ? { ...u, banned_at: banned ? new Date().toISOString() : null } : u))
    )
  }

  return (
    <div>
      <PageHeader
        title="🛡️ Moderación"
        subtitle="Contenido público y usuarios de la comunidad."
      />

      {error && <Alert type="danger">{error}</Alert>}

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'contenido' ? styles.tabActive : ''}`}
          onClick={() => setTab('contenido')}
        >
          Contenido
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'usuarios' ? styles.tabActive : ''}`}
          onClick={() => setTab('usuarios')}
        >
          Usuarios ({users.length})
        </button>
      </div>

      {tab === 'contenido' && (loading ? (
        <div aria-busy="true">
          <Skeleton lines={4} />
          <Skeleton lines={4} />
          <Skeleton lines={4} />
        </div>
      ) : (
        <>
          <Card>
            <h2 className={styles.sectionTitle}>Costos de service</h2>
            {entries.length === 0 ? (
              <p className={styles.empty}>No hay costos públicos.</p>
            ) : (
              <ul className={styles.list}>
                {entries.map((entry) => (
                  <li key={entry.id} className={`${styles.item} ${entry.hidden ? styles.hidden : ''}`}>
                    <div>
                      <div className={styles.itemTitle}>
                        {entry.service_type}
                        {entry.hidden && <Badge color="gray">Oculto</Badge>}
                      </div>
                      <div className={styles.itemMeta}>
                        {entry.service_date} · {entry.dealer} · por {names[entry.user_id] ?? 'un usuario'}
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.actionLink}
                        onClick={() => toggleHidden('service_entries', entry.id, entry.hidden)}
                      >
                        {entry.hidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                      <button className={styles.actionLink} onClick={() => deleteItem('service_entries', entry.id)}>
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className={styles.sectionTitle}>Repuestos y consumibles</h2>
            {purchases.length === 0 ? (
              <p className={styles.empty}>No hay compras públicas.</p>
            ) : (
              <ul className={styles.list}>
                {purchases.map((purchase) => (
                  <li key={purchase.id} className={`${styles.item} ${purchase.hidden ? styles.hidden : ''}`}>
                    <div>
                      <div className={styles.itemTitle}>
                        {purchase.item}
                        {purchase.hidden && <Badge color="gray">Oculto</Badge>}
                      </div>
                      <div className={styles.itemMeta}>
                        {purchase.purchase_date} · {partCategoryTitle(purchase.category)} · {purchase.store} · por{' '}
                        {names[purchase.user_id] ?? 'un usuario'}
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.actionLink}
                        onClick={() => toggleHidden('part_purchases', purchase.id, purchase.hidden)}
                      >
                        {purchase.hidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                      <button className={styles.actionLink} onClick={() => deleteItem('part_purchases', purchase.id)}>
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className={styles.sectionTitle}>Viajes</h2>
            {trips.length === 0 ? (
              <p className={styles.empty}>No hay viajes públicos.</p>
            ) : (
              <ul className={styles.list}>
                {trips.map((trip) => (
                  <li key={trip.id} className={`${styles.item} ${trip.hidden ? styles.hidden : ''}`}>
                    <div>
                      <div className={styles.itemTitle}>
                        {trip.title}
                        {trip.hidden && <Badge color="gray">Oculto</Badge>}
                      </div>
                      <div className={styles.itemMeta}>
                        {trip.trip_date} · {trip.origin} → {trip.destination} · por {names[trip.user_id] ?? 'un usuario'}
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className={styles.actionLink}
                        onClick={() => toggleHidden('trip_logs', trip.id, trip.hidden)}
                      >
                        {trip.hidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                      <button className={styles.actionLink} onClick={() => deleteItem('trip_logs', trip.id)}>
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

      {tab === 'usuarios' && (loading ? (
        <Skeleton lines={5} />
      ) : (
        <Card>
          <h2 className={styles.sectionTitle}>Usuarios</h2>
          {users.length === 0 ? (
            <p className={styles.empty}>No hay usuarios registrados.</p>
          ) : (
            <ul className={styles.list}>
              {users.map((u) => {
                const isSelf = u.id === user?.id
                return (
                  <li key={u.id} className={`${styles.item} ${u.banned_at ? styles.hidden : ''}`}>
                    <div>
                      <div className={styles.itemTitle}>
                        {u.display_name}
                        {u.is_moderator && <Badge color="blue">Moderador</Badge>}
                        {u.banned_at && <Badge color="red">Baneado</Badge>}
                        {isSelf && <Badge color="gray">Vos</Badge>}
                      </div>
                      <div className={styles.itemMeta}>
                        {[
                          u.city,
                          u.model,
                          u.vehicle_member_count > 1 && `🚗 comparte vehículo (${u.vehicle_member_count})`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {(u.city || u.model || u.vehicle_member_count > 1) && ' · '}
                        {u.service_count} services · {u.trip_count} viajes · {u.purchase_count} repuestos · desde{' '}
                        {new Date(u.created_at).toLocaleDateString('es-UY')}
                      </div>
                    </div>
                    {!isSelf && (
                      <div className={styles.itemActions}>
                        <button className={styles.actionLink} onClick={() => setModerator(u, !u.is_moderator)}>
                          {u.is_moderator ? 'Quitar moderación' : 'Hacer moderador'}
                        </button>
                        <button className={styles.actionLink} onClick={() => setBanned(u, !u.banned_at)}>
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
