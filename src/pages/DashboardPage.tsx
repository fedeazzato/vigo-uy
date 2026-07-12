import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { invalidateCommunityCache } from '../lib/communityData'
import { toCsv, downloadCsv } from '../lib/csvExport'
import { partCategoryTitle } from '../lib/partsCatalog'
import type { PartPurchase, ServiceEntry, TripLog } from '../types'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const { user, passkeysSupported, registerPasskey } = useAuth()
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [purchases, setPurchases] = useState<PartPurchase[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [loadingPurchases, setLoadingPurchases] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null)
  const [registeringPasskey, setRegisteringPasskey] = useState(false)

  useEffect(() => {
    if (!supabase || !user) return
    supabase
      .from('service_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('service_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(toFriendlyError(error))
        else setEntries(data ?? [])
        setLoadingEntries(false)
      })

    supabase
      .from('trip_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('trip_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(toFriendlyError(error))
        else setTrips((data ?? []) as TripLog[])
        setLoadingTrips(false)
      })

    supabase
      .from('part_purchases')
      .select('*')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(toFriendlyError(error))
        else setPurchases(data ?? [])
        setLoadingPurchases(false)
      })
  }, [user])

  async function handleDeleteEntry(entryId: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar esta entrada?')) return

    const { error } = await supabase.from('service_entries').delete().eq('id', entryId)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  async function handleDeleteTrip(tripId: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar este viaje?')) return

    const { error } = await supabase.from('trip_logs').delete().eq('id', tripId)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    setTrips((prev) => prev.filter((t) => t.id !== tripId))
  }

  async function handleDeletePurchase(purchaseId: string) {
    if (!supabase) return
    if (!confirm('¿Eliminar esta compra?')) return

    const { error } = await supabase.from('part_purchases').delete().eq('id', purchaseId)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    setPurchases((prev) => prev.filter((p) => p.id !== purchaseId))
  }

  async function handleRegisterPasskey() {
    setRegisteringPasskey(true)
    setPasskeyMessage(null)
    const { error } = await registerPasskey()
    setRegisteringPasskey(false)
    setPasskeyMessage(
      error ? 'No se pudo registrar la llave de acceso.' : 'Llave de acceso registrada. La próxima vez podés entrar sin código.'
    )
  }

  function exportEntriesCsv() {
    const headers = ['Fecha', 'Kilometraje', 'Taller', 'Tipo de service', 'Costo (UYU)', 'Ciudad', 'Notas', 'Público']
    const rows = entries.map((e) => [
      e.service_date, e.odometer_km, e.dealer, e.service_type, e.cost_uyu, e.city, e.notes, e.is_public ? 'Sí' : 'No',
    ])
    downloadCsv('costos-de-service.csv', toCsv(headers, rows))
  }

  function exportTripsCsv() {
    const headers = [
      'Fecha', 'Título', 'Origen', 'Destino', 'Distancia (km)', 'Modelo',
      'Batería al salir (%)', 'Batería al llegar (%)', 'Velocidad media (km/h)',
      'Calificación', 'Paradas de carga', 'Notas', 'Público',
    ]
    const rows = trips.map((t) => [
      t.trip_date, t.title, t.origin, t.destination, t.distance_km, t.model,
      t.starting_charge_percentage, t.ending_charge_percentage, t.average_speed_kmh,
      t.rating, JSON.stringify(t.charging_stops), t.notes, t.is_public ? 'Sí' : 'No',
    ])
    downloadCsv('viajes.csv', toCsv(headers, rows))
  }

  function exportPurchasesCsv() {
    const headers = ['Fecha', 'Categoría', 'Artículo', 'Comercio', 'Precio (UYU)', 'Kilometraje', 'Ciudad', 'Calificación', 'Notas', 'Público']
    const rows = purchases.map((p) => [
      p.purchase_date, partCategoryTitle(p.category), p.item, p.store, p.price_uyu,
      p.odometer_km, p.city, p.rating, p.notes, p.is_public ? 'Sí' : 'No',
    ])
    downloadCsv('repuestos.csv', toCsv(headers, rows))
  }

  return (
    <div>
      <PageHeader title="🗒️ Mi actividad" subtitle="Tus costos, repuestos y viajes registrados." />

      {error && <Alert type="danger">{error}</Alert>}

      {passkeysSupported && (
        <Card>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Acceso rápido</h2>
          </div>
          {passkeyMessage && <p className={styles.empty}>{passkeyMessage}</p>}
          <button className={styles.addLink} onClick={handleRegisterPasskey} disabled={registeringPasskey}>
            {registeringPasskey ? 'Registrando…' : '🔑 Registrar llave de acceso (Face ID / huella / Windows Hello)'}
          </button>
        </Card>
      )}

      <Card>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Costos de service</h2>
          <div className={styles.sectionActions}>
            {entries.length > 0 && (
              <button className={styles.addLink} onClick={exportEntriesCsv}>Exportar CSV</button>
            )}
            <Link to="/costos/nuevo" className={styles.addLink}>+ Nueva entrada</Link>
          </div>
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
          <h2 className={styles.sectionTitle}>Repuestos y consumibles</h2>
          <div className={styles.sectionActions}>
            {purchases.length > 0 && (
              <button className={styles.addLink} onClick={exportPurchasesCsv}>Exportar CSV</button>
            )}
            <Link to="/repuestos/nuevo" className={styles.addLink}>+ Nueva compra</Link>
          </div>
        </div>

        {loadingPurchases ? (
          <p className={styles.empty}>Cargando…</p>
        ) : purchases.length === 0 ? (
          <p className={styles.empty}>Todavía no registraste ninguna compra de repuestos.</p>
        ) : (
          <ul className={styles.list}>
            {purchases.map((purchase) => (
              <li key={purchase.id} className={styles.item}>
                <div>
                  <div className={styles.itemTitle}>{purchase.item}</div>
                  <div className={styles.itemMeta}>
                    {purchase.purchase_date} · {partCategoryTitle(purchase.category)} · {purchase.store}
                    {purchase.rating != null && ` · ${'★'.repeat(purchase.rating)}`}
                  </div>
                </div>
                <div className={styles.itemCost}>
                  ${purchase.price_uyu.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={styles.itemActions}>
                  <Link to={`/repuestos/${purchase.id}/editar`} className={styles.actionLink}>Editar</Link>
                  <button className={styles.actionLink} onClick={() => handleDeletePurchase(purchase.id)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Viajes</h2>
          <div className={styles.sectionActions}>
            {trips.length > 0 && (
              <button className={styles.addLink} onClick={exportTripsCsv}>Exportar CSV</button>
            )}
            <Link to="/viajes/nuevo" className={styles.addLink}>+ Nuevo viaje</Link>
          </div>
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
