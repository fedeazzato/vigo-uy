import type { VehicleLeaderboardEntry } from '../types'
import styles from './VehicleLeaderboard.module.css'
import listStyles from '../styles/listPatterns.module.css'

const MEDALS = ['🥇', '🥈', '🥉']

// Vehicles have no public name; label them by their members.
function memberLabel(names: string[]): string {
  if (names.length === 0) return 'Vigo'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

interface VehicleLeaderboardProps {
  rows: VehicleLeaderboardEntry[]
  compact?: boolean
  /** A3: vehicles whose km the car verified (opted in), vehicle_id -> odometer km. */
  verified?: Map<string, number>
}

// CSS-only horizontal bar ranking of vehicles by total public km.
// Rows arrive already ordered by total_km desc (vehicle_km_leaderboard view).
export default function VehicleLeaderboard({ rows, compact = false, verified }: VehicleLeaderboardProps) {
  const withKm = rows.filter((r) => r.total_km > 0)
  const shown = compact ? withKm : [...withKm, ...rows.filter((r) => r.total_km === 0)]
  const maxKm = withKm[0]?.total_km ?? 0

  if (shown.length === 0) {
    return <p className={listStyles.empty}>Todavía no hay kilómetros registrados por la comunidad.</p>
  }

  return (
    <ol className={styles.board}>
      {shown.map((row, i) => (
        <li key={row.vehicle_id} className={styles.row}>
          {/* The <ol> already conveys the position; medals are decoration. */}
          <span className={styles.rank} aria-hidden="true">
            {i < MEDALS.length ? MEDALS[i] : i + 1}
          </span>
          <div className={styles.info}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{memberLabel(row.member_names)}</span>
              {verified?.has(row.vehicle_id) && (
                <span
                  className={styles.verified}
                  title={`Odómetro informado por el auto: ${verified.get(row.vehicle_id)?.toLocaleString('es-UY')} km`}
                >
                  ✓ km verificados por el auto
                </span>
              )}
            </div>
            <div className={styles.barTrack} aria-hidden="true">
              <div
                className={styles.bar}
                style={{ width: maxKm > 0 ? `${Math.max((row.total_km / maxKm) * 100, 2)}%` : '2%' }}
              />
            </div>
          </div>
          <span className={styles.km}>
            {row.total_km.toLocaleString('es-UY')} km
            {!compact && <span className={styles.tripCount}>{row.trip_count} viajes</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
