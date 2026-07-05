import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import type { ServiceEntry } from '../types'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [loading, setLoading] = useState(true)
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
        setLoading(false)
      })
  }, [user])

  async function handleDelete(entryId: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar esta entrada?')) return

    const { error } = await supabase.from('service_entries').delete().eq('id', entryId)
    if (error) {
      setError(error.message)
      return
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
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

        {loading ? (
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
                  <button className={styles.actionLink} onClick={() => handleDelete(entry.id)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
