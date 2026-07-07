import { useEffect, useState } from 'react'
import { PageHeader, Card, Alert, Badge } from '../components/UI'
import { supabase } from '../lib/supabaseClient'
import type { ServiceEntry, TripLog } from '../types'
import styles from './ModerationPage.module.css'

export default function ModerationPage() {
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    if (!supabase) return
    setLoading(true)

    const [entriesRes, tripsRes] = await Promise.all([
      supabase.from('service_entries').select('*').eq('is_public', true).order('created_at', { ascending: false }),
      supabase.from('trip_logs').select('*').eq('is_public', true).order('created_at', { ascending: false }),
    ])

    if (entriesRes.error || tripsRes.error) {
      setError(entriesRes.error?.message ?? tripsRes.error?.message ?? 'Error desconocido')
      setLoading(false)
      return
    }

    const entriesData = (entriesRes.data ?? []) as ServiceEntry[]
    const tripsData = (tripsRes.data ?? []) as TripLog[]
    setEntries(entriesData)
    setTrips(tripsData)

    const userIds = [...new Set([...entriesData.map((e) => e.user_id), ...tripsData.map((t) => t.user_id)])]
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
      const map: Record<string, string> = {}
      for (const p of profilesData ?? []) map[p.id] = p.display_name
      setNames(map)
    }

    setLoading(false)
  }

  async function toggleHidden(table: 'service_entries' | 'trip_logs', id: string, currentHidden: boolean) {
    if (!supabase) return
    const { error } = await supabase.from(table).update({ hidden: !currentHidden }).eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    if (table === 'service_entries') {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, hidden: !currentHidden } : e)))
    } else {
      setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, hidden: !currentHidden } : t)))
    }
  }

  async function deleteItem(table: 'service_entries' | 'trip_logs', id: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar definitivamente esta entrada?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    if (table === 'service_entries') setEntries((prev) => prev.filter((e) => e.id !== id))
    else setTrips((prev) => prev.filter((t) => t.id !== id))
  }

  if (loading) return null

  return (
    <div>
      <PageHeader
        title="🛡️ Moderación"
        subtitle="Contenido público compartido por la comunidad."
      />

      {error && <Alert type="danger">{error}</Alert>}

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
    </div>
  )
}
