import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { useRegisterSheet } from '../context/RegisterSheetContext'
import { supabase } from '../lib/supabaseClient'
import { toFriendlyError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { invalidateCommunityCache } from '../lib/communityData'
import { toCsv, downloadCsv } from '../lib/csvExport'
import { partCategoryTitle } from '../lib/partsCatalog'
import type { PartPurchase, ServiceEntry, TripLog } from '../types'
import styles from './DashboardPage.module.css'

// Once the user registers a passkey (or says "not now"), stop showing the
// prompt card on every visit.
const PASSKEY_PROMPT_KEY = 'vigo-passkey-prompt-dismissed'

// What the forms put in location.state.saved → the toast text.
const SAVED_MESSAGES: Record<string, string> = {
  viaje: 'Viaje guardado ✓',
  service: 'Service guardado ✓',
  compra: 'Repuesto guardado ✓',
}

const SAVED_TOAST_MS = 2200

export default function DashboardPage() {
  const { user, passkeysSupported, registerPasskey } = useAuth()
  const { openRegisterSheet } = useRegisterSheet()
  const location = useLocation()
  const navigate = useNavigate()

  // Save confirmation carried over from the submit forms. Cleared from
  // history state right away so a refresh doesn't re-announce it.
  const [savedMessage, setSavedMessage] = useState<string | null>(() => {
    const saved = (location.state as { saved?: string } | null)?.saved
    return saved ? SAVED_MESSAGES[saved] ?? null : null
  })
  useEffect(() => {
    if ((location.state as { saved?: string } | null)?.saved) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])
  // Shown as a toast that dismisses itself (mobile redesign).
  useEffect(() => {
    if (!savedMessage) return
    const id = setTimeout(() => setSavedMessage(null), SAVED_TOAST_MS)
    return () => clearTimeout(id)
  }, [savedMessage])
  const [entries, setEntries] = useState<ServiceEntry[]>([])
  const [trips, setTrips] = useState<TripLog[]>([])
  const [purchases, setPurchases] = useState<PartPurchase[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [loadingPurchases, setLoadingPurchases] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null)
  const [registeringPasskey, setRegisteringPasskey] = useState(false)
  const [passkeyDismissed, setPasskeyDismissed] = useState(
    () => localStorage.getItem(PASSKEY_PROMPT_KEY) === '1'
  )

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
    // Registered: the prompt did its job, don't show it on future visits.
    if (!error) localStorage.setItem(PASSKEY_PROMPT_KEY, '1')
  }

  function dismissPasskeyPrompt() {
    localStorage.setItem(PASSKEY_PROMPT_KEY, '1')
    setPasskeyDismissed(true)
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

  // Nothing registered at all: show one friendly empty state instead of
  // three empty section cards (mobile redesign).
  const nothingYet =
    !loadingEntries && !loadingTrips && !loadingPurchases && !error &&
    entries.length === 0 && trips.length === 0 && purchases.length === 0

  return (
    <div>
      <PageHeader
        title="🗒️ Mi actividad"
        subtitle={
          <>
            Tus costos, repuestos y viajes registrados. Tu perfil y vehículo están en{' '}
            <Link to="/mi-vigo">Mi Vigo</Link>.
          </>
        }
      />

      {savedMessage && (
        <div className={styles.saveToast} role="status">{savedMessage}</div>
      )}
      {error && <Alert type="danger">{error}</Alert>}

      {passkeysSupported && (!passkeyDismissed || passkeyMessage) && (
        <Card>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Acceso rápido</h2>
            {!passkeyMessage && (
              <button className={styles.addLink} onClick={dismissPasskeyPrompt}>
                Ahora no
              </button>
            )}
          </div>
          {passkeyMessage && <p className={styles.empty}>{passkeyMessage}</p>}
          <button className={styles.addLink} onClick={handleRegisterPasskey} disabled={registeringPasskey}>
            {registeringPasskey ? 'Registrando…' : '🔑 Registrar llave de acceso (Face ID / huella / Windows Hello)'}
          </button>
        </Card>
      )}

      {nothingYet && (
        <Card className={styles.emptyState}>
          <div className={styles.emptyStateIcon} aria-hidden="true">📭</div>
          <div className={styles.emptyStateTitle}>Todavía no registraste nada</div>
          <p className={styles.emptyStateText}>
            Sumá tu primer viaje, service o repuesto para llevar la cuenta acá.
          </p>
          <button type="button" className={styles.emptyStateBtn} onClick={openRegisterSheet}>
            Registrar algo
          </button>
        </Card>
      )}

      {!nothingYet && (
      <>
      <Card>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Costos de service</h2>
          <div className={styles.sectionActions}>
            {entries.length > 0 && (
              <button className={styles.addLink} onClick={exportEntriesCsv}>Descargar planilla (CSV)</button>
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
                    {formatDate(entry.service_date)} · {entry.odometer_km.toLocaleString('es-UY')} km · {entry.dealer}
                  </div>
                </div>
                <div className={styles.itemCost}>
                  ${entry.cost_uyu.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={styles.itemActions}>
                  <Link
                    to={`/costos/${entry.id}/editar`}
                    className={styles.actionLink}
                    aria-label={`Editar ${entry.service_type}`}
                  >
                    Editar
                  </Link>
                  <button
                    className={styles.actionLink}
                    onClick={() => handleDeleteEntry(entry.id)}
                    aria-label={`Eliminar ${entry.service_type}`}
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
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Repuestos y consumibles</h2>
          <div className={styles.sectionActions}>
            {purchases.length > 0 && (
              <button className={styles.addLink} onClick={exportPurchasesCsv}>Descargar planilla (CSV)</button>
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
                    {formatDate(purchase.purchase_date)} · {partCategoryTitle(purchase.category)} · {purchase.store}
                    {purchase.rating != null && ` · ${'★'.repeat(purchase.rating)}`}
                  </div>
                </div>
                <div className={styles.itemCost}>
                  ${purchase.price_uyu.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={styles.itemActions}>
                  <Link
                    to={`/repuestos/${purchase.id}/editar`}
                    className={styles.actionLink}
                    aria-label={`Editar ${purchase.item}`}
                  >
                    Editar
                  </Link>
                  <button
                    className={styles.actionLink}
                    onClick={() => handleDeletePurchase(purchase.id)}
                    aria-label={`Eliminar ${purchase.item}`}
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
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Viajes</h2>
          <div className={styles.sectionActions}>
            {trips.length > 0 && (
              <button className={styles.addLink} onClick={exportTripsCsv}>Descargar planilla (CSV)</button>
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
                    {formatDate(trip.trip_date)} · {trip.origin} → {trip.destination}
                    {trip.distance_km != null && ` · ${trip.distance_km.toLocaleString('es-UY')} km`}
                    {trip.rating != null && ` · ${'★'.repeat(trip.rating)}`}
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <Link
                    to={`/viajes/${trip.id}/editar`}
                    className={styles.actionLink}
                    aria-label={`Editar ${trip.title}`}
                  >
                    Editar
                  </Link>
                  <button
                    className={styles.actionLink}
                    onClick={() => handleDeleteTrip(trip.id)}
                    aria-label={`Eliminar ${trip.title}`}
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
      )}
    </div>
  )
}
