import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader, Card, CardTitle, StatGrid, SectionDivider } from '../components/UI'
import { GuideLinks, GUIDE_LINKS } from '../components/GuideLinks'
import VehicleLeaderboard from '../components/VehicleLeaderboard'
import { useAuth } from '../context/AuthContext'
import { useRegisterSheet } from '../context/RegisterSheetContext'
import { supabase } from '../lib/supabaseClient'
import { fetchCommunityTotals, fetchLeaderboard } from '../lib/communityData'
import type { CommunityTotals, VehicleLeaderboardEntry } from '../types'
import styles from './HomePage.module.css'
import listStyles from '../styles/listPatterns.module.css'

// Just the most-consulted pages; the full index lives on /aprender. Keeping this
// short is what makes Inicio and Aprender different pages.
const QUICK_GUIDE_ROUTES = ['/carga', '/rutas', '/costos', '/faq']
const QUICK_GUIDE = GUIDE_LINKS.filter(({ to }) => QUICK_GUIDE_ROUTES.includes(to))

// Homepage teaser: just the top vehicles, same length as the "last 3 trips"
// list it replaced. The full ranking (with trip counts) lives on /comunidad.
const TOP_VEHICLES = 3

export default function HomePage() {
  const { status } = useAuth()
  const { openRegisterSheet } = useRegisterSheet()
  const [totals, setTotals] = useState<CommunityTotals | null>(null)
  const [leaderboard, setLeaderboard] = useState<VehicleLeaderboardEntry[]>([])

  useEffect(() => {
    if (!supabase) return
    void fetchCommunityTotals().then(({ totals: t }) => setTotals(t))
    void fetchLeaderboard().then(({ rows }) => setLeaderboard(rows.slice(0, TOP_VEHICLES)))
  }, [])

  return (
    <div>
      <PageHeader
        title="⚡ Wiki Vigo Uruguay"
        subtitle="Todo para disfrutar tu Vigo: dónde cargar, cuánto gastás y qué dice la comunidad Amantes de la Vigo Uruguay."
      />

      {totals && (
        <Card>
          <CardTitle icon="🌐">La comunidad en números</CardTitle>
          <StatGrid
            stats={[
              { value: totals.total_trips.toLocaleString('es-UY'), label: 'viajes compartidos' },
              { value: `${totals.total_km.toLocaleString('es-UY')} km`, label: 'recorridos' },
              { value: totals.contributor_count.toLocaleString('es-UY'), label: 'miembros aportando' },
            ]}
          />
        </Card>
      )}

      {supabase && (
        <Card>
          <CardTitle icon="🏁">Ranking de kilómetros</CardTitle>
          <VehicleLeaderboard rows={leaderboard} compact />
          <div className={styles.communityCta}>
            {status === 'signedIn' ? (
              <button
                type="button"
                className={`${listStyles.ctaBtn} ${styles.communityCtaBtn}`}
                onClick={openRegisterSheet}
              >
                Compartí tu viaje
              </button>
            ) : (
              <Link
                to="/login"
                state={{ from: '/viajes/nuevo' }}
                className={`${listStyles.ctaBtn} ${styles.communityCtaBtn}`}
              >
                Iniciá sesión para compartir
              </Link>
            )}
            <Link to="/comunidad" className={styles.communityLink}>
              Ver toda la comunidad →
            </Link>
          </div>
        </Card>
      )}

      <SectionDivider label="Para aprender" />
      <GuideLinks links={QUICK_GUIDE} />
      <div className={styles.guideMore}>
        <Link to="/aprender" className={styles.communityLink}>
          Ver todo en Aprender →
        </Link>
      </div>
    </div>
  )
}
