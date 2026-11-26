import { Link } from 'react-router'
import { Alert } from './UI'
import { GOOGLE_APP_NAMES, phaseLabel } from '../lib/carReleases'
import type { CarUpdateInfoState } from '../lib/useCarUpdateInfo'
import styles from './CarStatusCard.module.css'

// "Estado del auto" › Actualizaciones (specs/car-updates.md R8, owner O6): what the car's updater last said, and the
// Google software the car cannot update by itself (no Play Store: only the cable installer can).
export default function CarUpdateInfo({ update, notices }: CarUpdateInfoState) {
  if (!update) return null
  const when = update.reported_at ?? update.checked_at
  const rollback =
    update.phase === 'ROLLING_BACK' || (update.last_line ?? '').toUpperCase().startsWith('ROLLBACK')
  return (
    <div className={styles.live}>
      <p className={styles.liveLine}>
        Actualizaciones: {phaseLabel(update.phase)}
        {update.serial != null && ` (versión ${update.serial})`}
        {when && ` · ${new Date(when).toLocaleDateString('es-UY')}`}
      </p>
      {rollback && (update.last_line ?? '').includes('FAILED') && (
        <Alert type="danger">
          La actualización no se pudo deshacer sola. Conectá el instalador con el cable.
        </Alert>
      )}
      {notices.map((n) => (
        <Alert key={n.package} type="info">
          Actualización de Google disponible: {GOOGLE_APP_NAMES[n.package] ?? n.label} ({n.label}). El auto no
          la instala solo; usá el instalador con el cable (
          <Link to="/mi-vigo/preparar">Preparar mi Vigo</Link>).
        </Alert>
      ))}
    </div>
  )
}
