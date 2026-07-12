import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserPrefs, MODELS, COLORS, COLOR_HEX, COLOR_DARK_TEXT, COLOR_BORDER } from '../context/UserPrefsContext'
import type { CommunityTotals, Model, VehicleLeaderboardEntry } from '../types'
import { PageHeader, Card, CardTitle, Alert, StatGrid, SectionDivider } from '../components/UI'
import { CarPreview } from '../components/CarPreview'
import VehicleLeaderboard from '../components/VehicleLeaderboard'
import ProfileCard from '../components/ProfileCard'
import VehicleCard from '../components/VehicleCard'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchCommunityTotals, fetchLeaderboard, useCommunityContent } from '../lib/communityData'
import styles from './MyVigoPage.module.css'

const MODEL_INFO: Record<Model, { battery: string; extra: string }> = {
  'E2':  { battery: '44,94 kWh', extra: 'Autonomía estándar' },
  'E2+': { battery: '51,87 kWh', extra: 'Mayor autonomía · Pack ADAS' },
}

export default function MyVigoPage() {
  const { model, color, setModel, setColor, clear } = useUserPrefs()
  const { status, profile } = useAuth()

  const { trips, names } = useCommunityContent({ entries: false, limit: 3 })
  const [totals, setTotals] = useState<CommunityTotals | null>(null)
  const [leaderboard, setLeaderboard] = useState<VehicleLeaderboardEntry[]>([])

  useEffect(() => {
    if (!supabase) return
    fetchCommunityTotals().then(({ totals: t }) => setTotals(t))
    fetchLeaderboard().then(({ rows }) => setLeaderboard(rows.slice(0, 5)))
  }, [])

  const showCommunity = Boolean(supabase) && (totals !== null || trips.length > 0)

  return (
    <div>
      <PageHeader
        title="🚗 Mi Vigo"
        subtitle="Configurá tu modelo y color para personalizar la información."
      />

      {(model || color) && (
        <div className={styles.currentSelection}>
          {color && (
            <span
              className={styles.colorDot}
              style={{
                background: COLOR_HEX[color],
                border: COLOR_BORDER[color] ? `1.5px solid ${COLOR_BORDER[color]}` : undefined,
              }}
            />
          )}
          <span>
            {model && color
              ? <>Tu Vigo es <strong>{model} {color}</strong></>
              : model
              ? <>Modelo seleccionado: <strong>{model}</strong></>
              : <>Color seleccionado: <strong>{color}</strong></>
            }
          </span>
          <button className={styles.clearBtn} onClick={clear}>Limpiar</button>
        </div>
      )}

      <Card>
        <CardTitle icon="⚙️">Modelo</CardTitle>
        <div className={styles.modelGrid}>
          {MODELS.map((m) => (
            <button
              key={m}
              className={`${styles.modelCard} ${model === m ? styles.selected : ''}`}
              onClick={() => setModel(m)}
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
            >
              <span
                className={styles.swatch}
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

      {status === 'signedIn' && (
        <>
          <SectionDivider label="Mi cuenta" />
          {profile?.banned_at && (
            <Alert type="danger">Tu cuenta está suspendida: no podés publicar contenido nuevo.</Alert>
          )}
          <ProfileCard />
          <VehicleCard />
        </>
      )}

      {showCommunity && (
        <>
          <SectionDivider label="Comunidad" />

          <Card>
            <CardTitle icon="🌐">La comunidad en números</CardTitle>
            {totals && (
              <StatGrid
                stats={[
                  { value: totals.total_trips.toLocaleString('es-UY'), label: 'viajes compartidos' },
                  { value: `${totals.total_km.toLocaleString('es-UY')} km`, label: 'recorridos' },
                  { value: totals.contributor_count.toLocaleString('es-UY'), label: 'miembros aportando' },
                ]}
              />
            )}

            {trips.length > 0 && (
              <ul className={styles.communityList}>
                {trips.map((trip) => (
                  <li key={trip.id} className={styles.communityItem}>
                    <span className={styles.communityTitle}>{trip.title}</span>
                    <span className={styles.communityMeta}>
                      {trip.origin} → {trip.destination}
                      {trip.distance_km != null && ` · ${trip.distance_km.toLocaleString('es-UY')} km`}
                      {' · por '}{names[trip.user_id] ?? 'un usuario'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.communityCta}>
              {status === 'signedIn' ? (
                <Link to="/viajes/nuevo" className={styles.communityCtaBtn}>Compartí tu próximo viaje</Link>
              ) : (
                <Link to="/login" className={styles.communityCtaBtn}>Iniciá sesión para compartir el tuyo</Link>
              )}
              <Link to="/comunidad" className={styles.communityLink}>Ver toda la comunidad →</Link>
            </div>
          </Card>

          {leaderboard.length > 0 && (
            <Card>
              <CardTitle icon="🏁">Ranking de kilómetros</CardTitle>
              <VehicleLeaderboard rows={leaderboard} compact />
            </Card>
          )}
        </>
      )}
    </div>
  )
}
