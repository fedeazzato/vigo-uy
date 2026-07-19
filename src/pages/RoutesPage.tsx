import { Link } from 'react-router-dom'
import rawData from '../data/routes.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, SectionDivider } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { preferCommunity, useCommunityContent, verifiedFirst } from '../lib/communityData'
import styles from './Pages.module.css'
import type { RoutesData, Stop, StopType, TripLog } from '../types'

const data = rawData as RoutesData

const DIFFICULTY_COLOR: Record<string, string> = {
  'Muy fácil': 'green',
  'Fácil': 'green',
  'Media': 'amber',
  'Avanzada': 'red',
}

const STOP_TYPE_STYLES: Record<StopType, { dot: string; label: string }> = {
  origin:      { dot: '#1D9E75', label: 'Origen' },
  destination: { dot: '#185FA5', label: 'Destino' },
  charge:      { dot: '#BA7517', label: 'Cargar aquí' },
  warning:     { dot: '#E24B4A', label: 'Cuidado' },
}

interface RouteMapProps {
  stops: Stop[]
}

function RouteMap({ stops }: RouteMapProps) {
  return (
    <div className={styles.routeMap}>
      {stops.map((stop, i) => {
        const s = STOP_TYPE_STYLES[stop.type]
        return (
          <div key={i} className={styles.routeStopGroup}>
            <div className={styles.routeStopRow}>
              {i > 0 && <div className={styles.routeLine} />}
              <div className={styles.routeDot} style={{ background: s.dot }} />
            </div>
            <div className={styles.routeStopInfo}>
              <span className={styles.routeStopName}>{stop.name}</span>
              {stop.arrivalNote && <p className={styles.routeStopNote}>{stop.arrivalNote}</p>}
              {stop.type !== 'origin' && stop.type !== 'destination' && (
                <div className={styles.routeStopBadgeRow}>
                  <Badge color={stop.type === 'charge' ? 'amber' : 'red'}>
                    {s.label}
                  </Badge>
                  {stop.chargeDetail && (
                    <span className={styles.routeStopNote}>{stop.chargeDetail}</span>
                  )}
                </div>
              )}
              {stop.departureNote && <p className={styles.routeStopNote}>{stop.departureNote}</p>}
              {stop.note && <p className={styles.routeStopNote}>{stop.note}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Maps a community trip log onto the same Stop timeline the curated routes
// use, so both render through RouteMap.
function tripToStops(trip: TripLog): Stop[] {
  const stops: Stop[] = [
    {
      type: 'origin',
      name: trip.origin,
      note:
        trip.starting_charge_percentage != null
          ? `Salió con ${trip.starting_charge_percentage}%`
          : undefined,
    },
  ]
  for (const cs of trip.charging_stops) {
    const detailParts: string[] = []
    if (cs.duration_minutes != null) detailParts.push(`${cs.duration_minutes} min`)
    if (cs.energy_kwh != null) detailParts.push(`${cs.energy_kwh.toLocaleString('es-UY')} kWh`)
    if (cs.cost_uyu != null) detailParts.push(`$${cs.cost_uyu.toLocaleString('es-UY')}`)
    stops.push({
      type: 'charge',
      name: cs.name,
      arrivalNote:
        cs.arrival_percentage != null ? `Llegó con ${cs.arrival_percentage}%` : undefined,
      chargeDetail: detailParts.join(' · ') || undefined,
      departureNote:
        cs.departure_percentage != null ? `Salió con ${cs.departure_percentage}%` : undefined,
      note: cs.note || undefined,
    })
  }
  stops.push({
    type: 'destination',
    name: trip.destination,
    note:
      trip.ending_charge_percentage != null
        ? `Llegó con ${trip.ending_charge_percentage}%`
        : undefined,
  })
  return stops
}

export default function RoutesPage() {
  const { status } = useAuth()
  // Curated JSON renders immediately; the community section below fills in
  // when this resolves (no page-level loading gate).
  const { trips, names, loading, error } = useCommunityContent({ entries: false, limit: 10 })

  const orderedTrips = verifiedFirst(trips)

  // D1 gate: with enough real community trips, they lead the page and the
  // curated routes move below (see specs/CONTENT-MIGRATION.md).
  const communityFirst =
    preferCommunity({ curated: data.routes, community: trips, minSamples: 5 }).source === 'comunidad'

  const curatedBlock = data.routes.map((route) => (
    <Card key={route.id} className={styles.routeCard}>
      <div className={styles.routeCardHeader}>
        <div>
          <div className={styles.routeTitle}>{route.title}</div>
          <div className={styles.routeMeta}>
            <span className={styles.routeDistance}>📍 {route.distance}</span>
            <Badge color="blue">Oficial</Badge>
            <Badge color={DIFFICULTY_COLOR[route.difficulty]}>{route.difficulty}</Badge>
          </div>
        </div>
      </div>

      <RouteMap stops={route.stops} />

      {route.tips && route.tips.length > 0 && (
        <div className={styles.routeTips}>
          <div className={styles.routeTipsTitle}>Consejos del grupo</div>
          {route.tips.map((tip, i) => (
            <p key={i} className={styles.routeTip}>💡 {tip}</p>
          ))}
        </div>
      )}
    </Card>
  ))

  const communityBlock = supabase && (
    <>
      <SectionDivider label="Viajes de la comunidad" />

      {error && <Alert type="danger">{error}</Alert>}

      {!loading && trips.length === 0 && (
        <Card>
          <p className={styles.routeStopNote}>
            Todavía no hay viajes compartidos por la comunidad.{' '}
            {status === 'signedIn' ? (
              <>
                <Link to="/viajes/nuevo">Registrá el primero</Link> y ayudá al resto a planificar.
              </>
            ) : (
              <>
                <Link to="/login">Iniciá sesión</Link> y registrá el primero para ayudar al resto a
                planificar.
              </>
            )}
          </p>
        </Card>
      )}

      {/* Trip cards are short (few stops, often no notes) — on wide desktop
          they pack two-up instead of stacking as half-empty full-width cards. */}
      <div className={styles.tripCardsGrid}>
      {orderedTrips.map((trip) => (
        <Card key={trip.id} className={styles.routeCard}>
          <div className={styles.routeCardHeader}>
            <div>
              <div className={styles.routeTitle}>{trip.title}</div>
              <div className={styles.routeMeta}>
                {trip.distance_km != null && (
                  <span className={styles.routeDistance}>
                    📍 {trip.distance_km.toLocaleString('es-UY')} km
                  </span>
                )}
                <Badge color={trip.verified ? 'blue' : 'gray'}>
                  {trip.verified ? 'Oficial' : 'Comunidad'}
                </Badge>
                {trip.model && <Badge color="blue">{trip.model}</Badge>}
                {trip.rating != null && (
                  <span className={styles.routeDistance}>{'★'.repeat(trip.rating)}</span>
                )}
              </div>
            </div>
          </div>

          <RouteMap stops={tripToStops(trip)} />

          {trip.notes && (
            <div className={styles.routeTips}>
              <p className={styles.routeTip}>💡 {trip.notes}</p>
            </div>
          )}

          <p className={styles.routeStopNote}>
            {trip.trip_date} · por {names[trip.user_id] ?? 'un usuario'}
          </p>
        </Card>
      ))}
      </div>
    </>
  )

  return (
    <div>
      <PageHeader
        title="🗺️ Rutas"
        subtitle="Guía de viajes con paradas de carga verificadas por el grupo."
      />

      {communityFirst ? (
        <>
          {communityBlock}
          <SectionDivider label="Guía de rutas del grupo" />
          {curatedBlock}
        </>
      ) : (
        <>
          {curatedBlock}
          {communityBlock}
        </>
      )}

      <SectionDivider label="Consejos generales en ruta" />

      <Card>
        <CardTitle icon="🧠">Tips para optimizar la autonomía</CardTitle>
        <TipList items={data.generalTips} />
      </Card>

      <Card>
        <p className={styles.routeStopNote}>
          Las rutas marcadas como oficiales son verificadas por el grupo. <Link to="/comunidad">Mirá
          la comunidad</Link> para ver todos los viajes compartidos por otros usuarios, con sus
          paradas de carga.
        </p>
      </Card>
    </div>
  )
}
