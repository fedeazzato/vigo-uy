import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useUserPrefs,
  MODELS,
  COLORS,
  COLOR_HEX,
  COLOR_DARK_TEXT,
  COLOR_BORDER,
} from '../context/UserPrefsContext'
import type { Model, TripLog } from '../types'
import { PageHeader, Card, CardTitle, Alert, SectionDivider } from '../components/UI'
import { CarPreview } from '../components/CarPreview'
import ProfileCard from '../components/ProfileCard'
import VehicleCard from '../components/VehicleCard'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/format'
import styles from './MyVigoPage.module.css'

const MODEL_INFO: Record<Model, { battery: string; extra: string }> = {
  E2: { battery: '44,94 kWh', extra: 'Autonomía estándar' },
  'E2+': { battery: '51,87 kWh', extra: 'Mayor autonomía · Pack ADAS' },
}

// Default display names assigned by handle_new_user (migration 0018) look
// like "Miembro 1234" — prompt those users to pick a real public name.
const PLACEHOLDER_NAME = /^Miembro \d{4}$/

export default function MyVigoPage() {
  const { model, color, setModel, setColor, clear } = useUserPrefs()
  const { status, profile } = useAuth()
  const [namePromptDismissed, setNamePromptDismissed] = useState(false)
  const showNamePrompt =
    !namePromptDismissed && profile != null && PLACEHOLDER_NAME.test(profile.display_name)

  // Personal touch instead of the community-wide leaderboard (that lives on
  // /comunidad): the three longest trips logged for the user's own vehicle.
  // RLS returns exactly the caller's vehicle; vehicle-mates' trips show up
  // only if public and not hidden.
  const [topTrips, setTopTrips] = useState<TripLog[]>([])

  useEffect(() => {
    const client = supabase
    if (!client || status !== 'signedIn') return
    let cancelled = false

    async function load() {
      const { data: vehicle } = await client!.from('vehicles').select('id').maybeSingle()
      if (!vehicle || cancelled) return
      const { data: trips } = await client!
        .from('trip_logs')
        .select('*')
        .eq('vehicle_id', vehicle.id)
        .not('distance_km', 'is', null)
        .order('distance_km', { ascending: false })
        .limit(3)
      if (!cancelled) setTopTrips((trips ?? []) as TripLog[])
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <div>
      <PageHeader
        title="🚗 Mi Vigo"
        subtitle={
          <>
            Configurá tu modelo y color para personalizar la información. ¿Buscás tus viajes y costos? Están
            en <Link to="/mi-actividad">Mi actividad</Link>.
          </>
        }
      />

      {(model || color) && (
        <div className={styles.currentSelection}>
          {color && (
            <span
              className={styles.colorDot}
              aria-hidden="true"
              style={{
                background: COLOR_HEX[color],
                border: COLOR_BORDER[color] ? `1.5px solid ${COLOR_BORDER[color]}` : undefined,
              }}
            />
          )}
          <span>
            {model && color ? (
              <>
                Tu Vigo es{' '}
                <strong>
                  {model} {color}
                </strong>
              </>
            ) : model ? (
              <>
                Modelo seleccionado: <strong>{model}</strong>
              </>
            ) : (
              <>
                Color seleccionado: <strong>{color}</strong>
              </>
            )}
          </span>
          <button className={styles.clearBtn} onClick={clear}>
            Limpiar
          </button>
        </div>
      )}

      {/* Desktop: the two pickers sit side by side (plan phase 2, item 5). */}
      <div className={styles.pickersRow}>
        <Card>
          <CardTitle icon="⚙️">Modelo</CardTitle>
          <div className={styles.modelGrid}>
            {MODELS.map((m) => (
              <button
                key={m}
                className={`${styles.modelCard} ${model === m ? styles.selected : ''}`}
                onClick={() => setModel(m)}
                aria-pressed={model === m}
              >
                <div className={styles.modelName}>{m}</div>
                <div className={styles.modelBattery}>{MODEL_INFO[m].battery}</div>
                <div className={styles.modelExtra}>{MODEL_INFO[m].extra}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CarPreview color={color} />
          <CardTitle icon="🎨">Color</CardTitle>
          <div className={styles.colorGrid}>
            {COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.swatchBtn} ${color === c ? styles.selected : ''}`}
                onClick={() => setColor(c)}
                aria-pressed={color === c}
              >
                <span
                  className={styles.swatch}
                  aria-hidden="true"
                  style={{
                    background: COLOR_HEX[c],
                    borderColor: COLOR_BORDER[c] ?? 'transparent',
                    color: COLOR_DARK_TEXT[c] ? '#1a1a18' : '#fff',
                  }}
                />
                <span className={styles.colorLabel}>{c}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {status === 'signedIn' && (
        <>
          <SectionDivider label="Mi cuenta" />
          {profile?.banned_at && (
            <Alert type="danger">Tu cuenta está suspendida: no podés publicar contenido nuevo.</Alert>
          )}
          {showNamePrompt && (
            <Alert type="info">
              Elegí cómo querés aparecer en la comunidad — ahora te mostramos como{' '}
              <strong>{profile.display_name}</strong>. Podés cambiar tu nombre acá abajo.{' '}
              <button className={styles.dismissBtn} onClick={() => setNamePromptDismissed(true)}>
                Ocultar
              </button>
            </Alert>
          )}
          <ProfileCard />
          <VehicleCard />
        </>
      )}

      {topTrips.length > 0 && (
        <>
          <SectionDivider label="Mi vehículo en ruta" />
          <Card>
            <CardTitle icon="🏁">Los viajes más largos de tu vehículo</CardTitle>
            <ol className={styles.topTrips}>
              {topTrips.map((trip, i) => (
                <li key={trip.id} className={styles.topTripRow}>
                  <span className={styles.topTripMedal} aria-hidden="true">
                    {['🥇', '🥈', '🥉'][i]}
                  </span>
                  <span className={styles.topTripInfo}>
                    <span className={styles.topTripTitle}>{trip.title}</span>
                    <span className={styles.topTripMeta}>
                      {trip.origin} → {trip.destination} · {formatDate(trip.trip_date)}
                    </span>
                  </span>
                  <span className={styles.topTripKm}>{trip.distance_km!.toLocaleString('es-UY')} km</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  )
}
