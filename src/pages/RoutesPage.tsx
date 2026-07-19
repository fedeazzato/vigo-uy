import { Link } from 'react-router-dom'
import rawData from '../data/routes.json'
import { PageHeader, Card, CardTitle, TipList, Badge, Alert, SectionDivider } from '../components/UI'
import TripCard, { RouteMap } from '../components/TripCard'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { preferCommunity, useCommunityContent, verifiedFirst } from '../lib/communityData'
import styles from '../components/TripCard.module.css'
import type { RoutesData } from '../types'

const data = rawData as RoutesData

const DIFFICULTY_COLOR: Record<string, string> = {
  'Muy fácil': 'green',
  Fácil: 'green',
  Media: 'amber',
  Avanzada: 'red',
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
            <span className={styles.routeDistance}>
              <span aria-hidden="true">📍</span> {route.distance}
            </span>
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
            <p key={i} className={styles.routeTip}>
              <span aria-hidden="true">💡</span> {tip}
            </p>
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
          <TripCard key={trip.id} trip={trip} authorName={names[trip.user_id] ?? 'un usuario'} />
        ))}
      </div>
    </>
  )

  return (
    <div>
      <PageHeader title="🗺️ Rutas" subtitle="Guía de viajes con paradas de carga verificadas por el grupo." />

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
          Las rutas marcadas como oficiales son verificadas por el grupo.{' '}
          <Link to="/comunidad">Mirá la comunidad</Link> para ver todos los viajes compartidos por otros
          usuarios, con sus paradas de carga.
        </p>
      </Card>
    </div>
  )
}
