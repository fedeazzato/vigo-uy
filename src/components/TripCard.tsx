import { Card, Badge } from './UI'
import { formatDate } from '../lib/format'
import type { Stop, StopType, TripLog } from '../types'
import styles from './TripCard.module.css'

const STOP_TYPE_STYLES: Record<StopType, { dot: string; label: string }> = {
  origin:      { dot: '#1D9E75', label: 'Origen' },
  destination: { dot: '#185FA5', label: 'Destino' },
  charge:      { dot: '#BA7517', label: 'Cargar aquí' },
  warning:     { dot: '#E24B4A', label: 'Cuidado' },
}

interface RouteMapProps {
  stops: Stop[]
}

// Vertical stop timeline shared by curated routes and community trips.
export function RouteMap({ stops }: RouteMapProps) {
  return (
    <div className={styles.routeMap}>
      {stops.map((stop, i) => {
        const s = STOP_TYPE_STYLES[stop.type]
        return (
          <div key={i} className={styles.routeStopGroup}>
            <div className={styles.routeStopRow}>
              {i > 0 && <div className={styles.routeLine} />}
              <div className={styles.routeDot} style={{ background: s.dot }} aria-hidden="true" />
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

// Sum of the recorded charge costs, or null when no stop has one.
function tripChargeTotal(trip: TripLog): number | null {
  const costs = trip.charging_stops
    .map((cs) => cs.cost_uyu)
    .filter((c): c is number => c != null)
  if (costs.length === 0) return null
  return costs.reduce((sum, c) => sum + c, 0)
}

interface TripCardProps {
  trip: TripLog
  authorName?: string
}

// Full-detail community trip card: stop timeline with battery/charge data,
// total charge cost, notes and author. The one place a shared trip is shown
// with everything the author logged.
export default function TripCard({ trip, authorName }: TripCardProps) {
  const chargeTotal = tripChargeTotal(trip)
  return (
    <Card className={styles.routeCard}>
      <div className={styles.routeCardHeader}>
        <div>
          <div className={styles.routeTitle}>{trip.title}</div>
          <div className={styles.routeMeta}>
            {trip.distance_km != null && (
              <span className={styles.routeDistance}>
                <span aria-hidden="true">📍</span> {trip.distance_km.toLocaleString('es-UY')} km
              </span>
            )}
            {/* "Privado" only ever shows on the owner's Mi actividad view:
                community surfaces fetch public trips exclusively. */}
            <Badge color={trip.verified ? 'blue' : 'gray'}>
              {trip.verified ? 'Oficial' : trip.is_public ? 'Comunidad' : 'Privado'}
            </Badge>
            {trip.model && <Badge color="blue">{trip.model}</Badge>}
            {trip.rating != null && (
              <span className={styles.routeDistance} aria-label={`${trip.rating} de 5 estrellas`}>
                {'★'.repeat(trip.rating)}
              </span>
            )}
          </div>
        </div>
      </div>

      <RouteMap stops={tripToStops(trip)} />

      {chargeTotal != null && (
        <p className={styles.routeChargeTotal}>
          <span aria-hidden="true">⚡</span> Total en cargas: $
          {chargeTotal.toLocaleString('es-UY', { maximumFractionDigits: 2 })}
        </p>
      )}

      {trip.notes && (
        <div className={styles.routeTips}>
          <p className={styles.routeTip}><span aria-hidden="true">💡</span> {trip.notes}</p>
        </div>
      )}

      <p className={styles.routeStopNote}>
        {formatDate(trip.trip_date)}
        {authorName && ` · por ${authorName}`}
      </p>
    </Card>
  )
}
