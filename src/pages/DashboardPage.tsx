import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import type { ServiceEntry, TripLog } from '../types'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !user) return
    supabase
      .from('service_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('service_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setEntries((data ?? []) as ServiceEntry[])
        setLoadingEntries(false)
      })

    supabase
      .from('trip_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('trip_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setTrips((data ?? []) as TripLog[])
        setLoadingTrips(false)
      })
  }, [user])

  async function handleDeleteEntry(entryId: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar esta entrada?')) return

    const { error } = await supabase.from('service_entries').delete().eq('id', entryId)
    if (error) {
      setError(error.message)
      return
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  async function handleDeleteTrip(tripId: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar este viaje?')) return

    const { error } = await supabase.from('trip_logs').delete().eq('id', tripId)
    if (error) {
      setError(error.message)
      return
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId))
  }

  return (
    <div>
      <PageHeader title="📋 Mi actividad" subtitle="Tus costos y viajes registrados." />

      {error && <Alert type="danger">{error}</Alert>}

      <Card>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Costos de service</h2>
          <Link to="/costos/nuevo" className={styles.addLink}>+ Nueva entrada</Link>
        </div>

        {loadingEntries ? (
          <p className={styles.empty}>Cargando…</p>
        ) : entries.length === 0 ? (
          <p className={styles.empty}>Todavía no registraste ningún service.</p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.item}>
                <div>
                  <div className={styles.itemTitle}>{entry.service_type}</div>
                  <div className={styles.itemMeta}>
                    {entry.service_date} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
                  </div>
                </div>
                <div className={styles.itemCost}>
                  ${entry.cost_uyu.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={styles.itemActions}>
                  <Link to={`/costos/${entry.id}/editar`} className={styles.actionLink}>Editar</Link>
                  <button className={styles.actionLink} onClick={() => handleDeleteEntry(entry.id)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Viajes</h2>
          <Link to="/viajes/nuevo" className={styles.addLink}>+ Nuevo viaje</Link>
        </div>

        {loadingTrips ? (
          <p className={styles.empty}>Cargando…</p>
        ) : trips.length === 0 ? (
          <p className={styles.empty}>Todavía no registraste ningún viaje.</p>
        ) : (
          <ul className={styles.list}>
            {trips.map((trip) => (
              <li key={trip.id} className={`${styles.item} ${styles.itemTwoCol}`}>
                <div>
                  <div className={styles.itemTitle}>{trip.title}{trip.model && ` (${trip.model})`}</div>
                  <div className={styles.itemMeta}>
                    {trip.trip_date} · {trip.origin} → {trip.destination}
                    {trip.distance_km != null && ` · ${trip.distance_km.toLocaleString('es-UY')} km`}
                    {trip.rating != null && ` · ${'★'.repeat(trip.rating)}`}
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <Link to={`/viajes/${trip.id}/editar`} className={styles.actionLink}>Editar</Link>
                  <button className={styles.actionLink} onClick={() => handleDeleteTrip(trip.id)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
