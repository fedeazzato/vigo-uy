import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Marker, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PageHeader, Card, CardTitle, Alert, StatGrid, Skeleton } from '../components/UI'
import MapModal from '../components/MapModal'
import FittedMapContainer from '../components/FittedMapContainer'
import { useUserPrefs } from '../context/UserPrefsContext'
import { fetchChargingStations } from '../lib/communityData'
import {
  chargeNote,
  describeDraft,
  draftCharges,
  draftRoute,
  draftToTripState,
  fetchPendingDrafts,
  markDraft,
  nearestStation,
} from '../lib/carTripDrafts'
import { loadDraft, saveDraft } from '../lib/tripDraftStore'
import { dotIcon } from '../lib/mapMarkerIcon'
import type { CarTripDraftRow, ChargingStation } from '../types'
import styles from './CarDraftsPage.module.css'
import formStyles from '../styles/formControls.module.css'

// "Borradores del auto" (specs/car-trip-drafts.md R3): trips the driver shared from the car land here as drafts, visible
// only to the vehicle's members. Nothing is published from here: "Usar para registrar el viaje" fills the normal new-trip
// form (D6), where the owner completes and saves it as any other trip. Before migration 0050 the fetch fails and the page
// only says there is nothing to review.

function DraftMap({
  row,
  stations,
  onClose,
}: {
  row: CarTripDraftRow
  stations: ChargingStation[]
  onClose: () => void
}) {
  const { effectiveTheme } = useUserPrefs()
  const route = useMemo(() => draftRoute(row), [row])
  const charges = useMemo(() => draftCharges(row).filter((c) => c.lat != null && c.lon != null), [row])
  const positions = useMemo<[number, number][]>(
    () => (route.length > 0 ? route : charges.map((c) => [c.lat as number, c.lon as number])),
    [route, charges]
  )
  const title = describeDraft(row).title
  return (
    <MapModal open onClose={onClose} title={title} ariaLabel={`Recorrido de ${title}`}>
      <FittedMapContainer
        positions={positions}
        effectiveTheme={effectiveTheme}
        emptyMessage="El auto no envió el recorrido."
      >
        {route.length > 1 && (
          <Polyline positions={route} pathOptions={{ className: styles.routeLine, weight: 3 }} />
        )}
        {route.length > 0 && <Marker position={route[0]} icon={dotIcon('var(--chart-1)')} />}
        {route.length > 1 && <Marker position={route[route.length - 1]} icon={dotIcon('var(--chart-2)')} />}
        {charges.map((c, i) => {
          const station = nearestStation(c.lat, c.lon, stations)
          return (
            <Marker key={i} position={[c.lat as number, c.lon as number]} icon={dotIcon('var(--accent)')}>
              <Popup>
                🟠 {station?.name ?? 'Carga'}
                <div>{chargeNote(c)}</div>
              </Popup>
            </Marker>
          )
        })}
      </FittedMapContainer>
    </MapModal>
  )
}

export default function CarDraftsPage() {
  const navigate = useNavigate()
  const { model: preferredModel } = useUserPrefs()
  const [drafts, setDrafts] = useState<CarTripDraftRow[] | null | undefined>(undefined)
  const [stations, setStations] = useState<ChargingStation[]>([])
  const [mapFor, setMapFor] = useState<CarTripDraftRow | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPendingDrafts().then((d) => {
      if (!cancelled) setDrafts(d)
    })
    void fetchChargingStations().then(({ stations: s }) => {
      if (!cancelled) setStations(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleUse(row: CarTripDraftRow) {
    // The trip form keeps one local draft; don't overwrite an unfinished trip without a second tap.
    if (confirmReplace !== row.id && loadDraft() !== null) {
      setConfirmReplace(row.id)
      return
    }
    setBusy(row.id)
    setError(null)
    saveDraft(draftToTripState(row, stations, preferredModel ?? ''))
    // Marking is best-effort: if it fails the draft simply stays in the list.
    await markDraft(row.id, 'used')
    navigate('/viajes/nuevo')
  }

  async function discard(row: CarTripDraftRow) {
    setBusy(row.id)
    setError(null)
    const ok = await markDraft(row.id, 'discarded')
    setBusy(null)
    if (ok) setDrafts((prev) => (prev ?? []).filter((d) => d.id !== row.id))
    else setError('No pudimos descartar el borrador. Probá de nuevo.')
  }

  return (
    <div>
      <PageHeader
        title="🚗 Borradores del auto"
        subtitle="Viajes que compartiste desde el auto. Solo los ves vos; nada se publica hasta que lo registres."
      />
      <Link to="/mi-vigo" className={styles.back}>
        ← Mi Vigo
      </Link>
      {error && <Alert type="danger">{error}</Alert>}
      {drafts === undefined && <Skeleton lines={4} />}
      {drafts !== undefined && (drafts === null || drafts.length === 0) && (
        <Card>
          <p className={styles.empty}>
            No hay borradores. En el auto: Carga › un viaje (o varios seleccionados) › «Compartir en
            WikiVigo».
          </p>
        </Card>
      )}
      {drafts?.map((row) => {
        const summary = describeDraft(row)
        const charges = draftCharges(row)
        return (
          <Card key={row.id}>
            <CardTitle icon="🛣️">{summary.title}</CardTitle>
            <StatGrid stats={summary.stats} />
            {charges.length > 0 && (
              <ul className={styles.charges}>
                {charges.map((c, i) => {
                  const station = nearestStation(c.lat, c.lon, stations)
                  const minutes = Math.round((c.ended_at - c.started_at) / 60000)
                  const soc =
                    c.start_soc != null && c.end_soc != null ? `${c.start_soc} → ${c.end_soc} %` : null
                  return (
                    <li key={i}>
                      <strong>{station?.name ?? 'Carga sin cargador identificado'}</strong>
                      {[soc, minutes > 0 ? `${minutes} min` : null, chargeNote(c) || null]
                        .filter(Boolean)
                        .map((t) => ` · ${t}`)
                        .join('')}
                    </li>
                  )
                })}
              </ul>
            )}
            {confirmReplace === row.id && (
              <Alert type="warning">
                Tenés un viaje sin terminar en el formulario. Si seguís, se reemplaza por este borrador.
              </Alert>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={formStyles.submitBtnCompact}
                disabled={busy !== null}
                onClick={() => void handleUse(row)}
              >
                {confirmReplace === row.id ? 'Reemplazar y registrar' : 'Usar para registrar el viaje'}
              </button>
              <button type="button" className={formStyles.backBtn} onClick={() => setMapFor(row)}>
                Ver recorrido
              </button>
              <button
                type="button"
                className={formStyles.backBtn}
                disabled={busy !== null}
                onClick={() => void discard(row)}
              >
                Descartar
              </button>
            </div>
          </Card>
        )
      })}
      {mapFor && <DraftMap row={mapFor} stations={stations} onClose={() => setMapFor(null)} />}
    </div>
  )
}
