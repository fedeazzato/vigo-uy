import { useEffect, useState } from 'react'
import { PageHeader, Card, Alert, StatGrid } from '../components/UI'
import { supabase } from '../lib/supabaseClient'
import type { ServiceEntry, TripLog, StatItem } from '../types'
import styles from './CommunityFeedPage.module.css'

interface CityCostStat {
  city: string
  entry_count: number
  avg_cost_uyu: number
}

interface ModelTripStat {
  model: string
  trip_count: number
  avg_distance_km: number | null
  avg_speed_kmh: number | null
}

export default function CommunityFeedPage() {
  const [stats, setStats] = useState<StatItem[]>([])
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return

    async function load() {
      const [cityStats, modelStats, entriesRes, tripsRes] = await Promise.all([
        supabase!.from('service_cost_stats_by_city').select('*'),
        supabase!.from('trip_stats_by_model').select('*'),
        supabase!
          .from('service_entries')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase!
          .from('trip_logs')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(30),
      ])

      if (cityStats.error || modelStats.error || entriesRes.error || tripsRes.error) {
        setError(
          cityStats.error?.message ??
            modelStats.error?.message ??
            entriesRes.error?.message ??
            tripsRes.error?.message ??
            'Error desconocido'
        )
        setLoading(false)
        return
      }

      const statItems: StatItem[] = [
        ...(cityStats.data as CityCostStat[]).map((s) => ({
          value: `$${Math.round(s.avg_cost_uyu).toLocaleString('es-UY')}`,
          label: `Costo medio de service en ${s.city} (${s.entry_count})`,
        })),
        ...(modelStats.data as ModelTripStat[])
          .filter((s) => s.avg_speed_kmh != null)
          .map((s) => ({
            value: `${Math.round(s.avg_speed_kmh!)} km/h`,
            label: `Velocidad media ${s.model} (${s.trip_count} viajes)`,
          })),
      ]
      setStats(statItems)

      const entriesData = (entriesRes.data ?? []) as ServiceEntry[]
      const tripsData = (tripsRes.data ?? []) as TripLog[]
      setEntries(entriesData)
      setTrips(tripsData)

      const userIds = [...new Set([...entriesData.map((e) => e.user_id), ...tripsData.map((t) => t.user_id)])]
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase!.from('profiles').select('id, display_name').in('id', userIds)
        const map: Record<string, string> = {}
        for (const p of profilesData ?? []) map[p.id] = p.display_name
        setNames(map)
      }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) return null

  return (
    <div>
      <PageHeader
        title="🌐 Comunidad"
        subtitle="Costos y viajes compartidos por otros dueños de Vigo."
      />

      {error && <Alert type="danger">{error}</Alert>}

      {stats.length > 0 && (
        <Card>
          <h2 className={styles.sectionTitle}>Estadísticas</h2>
          <StatGrid stats={stats} />
        </Card>
      )}

      <Card>
        <h2 className={styles.sectionTitle}>Costos de service</h2>
        {entries.length === 0 ? (
          <p className={styles.empty}>Todavía no hay costos compartidos por la comunidad.</p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.item}>
                <div>
                  <div className={styles.itemTitle}>{entry.service_type}</div>
                  <div className={styles.itemMeta}>
                    {entry.service_date} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
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

      <Card>
        <h2 className={styles.sectionTitle}>Viajes</h2>
        {trips.length === 0 ? (
          <p className={styles.empty}>Todavía no hay viajes compartidos por la comunidad.</p>
        ) : (
          <ul className={styles.list}>
            {trips.map((trip) => (
              <li key={trip.id} className={styles.item}>
                <div>
                  <div className={styles.itemTitle}>{trip.title}{trip.model && ` (${trip.model})`}</div>
                  <div className={styles.itemMeta}>
                    {trip.trip_date} · {trip.origin} → {trip.destination}
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
    </div>
  )
}
