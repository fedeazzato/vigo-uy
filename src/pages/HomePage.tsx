import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, StatGrid, SectionDivider } from '../components/UI'
import { GuideLinks, GUIDE_LINKS } from '../components/GuideLinks'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchCommunityTotals, useCommunityContent } from '../lib/communityData'
import type { CommunityTotals } from '../types'
import styles from './HomePage.module.css'

// Just the most-consulted pages; the full index lives on /guia. Keeping this
// short is what makes Inicio and Guía different pages.
const QUICK_GUIDE_ROUTES = ['/carga', '/rutas', '/costos', '/faq']
const QUICK_GUIDE = GUIDE_LINKS.filter(({ to }) => QUICK_GUIDE_ROUTES.includes(to))

export default function HomePage() {
  const { status } = useAuth()
  const { trips, names } = useCommunityContent({ entries: false, limit: 3 })
  const [totals, setTotals] = useState<CommunityTotals | null>(null)

  useEffect(() => {
    if (!supabase) return
    fetchCommunityTotals().then(({ totals: t }) => setTotals(t))
  }, [])

  return (
    <div>
      <PageHeader
        title="⚡ Wiki Vigo Uruguay"
        subtitle="Guía colaborativa de la comunidad Amantes de la Vigo Uruguay."
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
          <CardTitle icon="🗺️">Últimos viajes</CardTitle>
          {trips.length > 0 ? (
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
          ) : (
            <p className={styles.emptyNote}>Todavía no hay viajes compartidos por la comunidad.</p>
          )}
          <div className={styles.communityCta}>
            {status === 'signedIn' ? (
              <Link to="/viajes/nuevo" className={styles.communityCtaBtn}>Registrá tu viaje</Link>
            ) : (
              <Link to="/login" className={styles.communityCtaBtn}>Iniciá sesión para compartir</Link>
            )}
            <Link to="/comunidad" className={styles.communityLink}>Ver toda la comunidad →</Link>
          </div>
        </Card>
      )}

      <SectionDivider label="Guía rápida" />
      <GuideLinks links={QUICK_GUIDE} />
      <div className={styles.guideMore}>
        <Link to="/guia" className={styles.communityLink}>Ver toda la guía →</Link>
      </div>
    </div>
  )
}
