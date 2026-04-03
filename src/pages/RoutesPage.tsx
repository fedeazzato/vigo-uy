import rawData from '../data/routes.json'
import { PageHeader, Card, CardTitle, TipList, Badge, SectionDivider } from '../components/UI'
import styles from './Pages.module.css'
import type { RoutesData, Stop, StopType } from '../types'

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
              {stop.type !== 'origin' && stop.type !== 'destination' && (
                <Badge color={stop.type === 'charge' ? 'amber' : 'red'}>
                  {s.label}
                </Badge>
              )}
              {stop.note && <p className={styles.routeStopNote}>{stop.note}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function RoutesPage() {
  return (
    <div>
      <PageHeader
        title="🗺️ Rutas"
        subtitle="Guía de viajes con paradas de carga verificadas por el grupo."
      />

      {data.routes.map((route) => (
        <Card key={route.id} className={styles.routeCard}>
          <div className={styles.routeCardHeader}>
            <div>
              <div className={styles.routeTitle}>{route.title}</div>
              <div className={styles.routeMeta}>
                <span className={styles.routeDistance}>📍 {route.distance}</span>
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
      ))}

      <SectionDivider label="Consejos generales en ruta" />

      <Card>
        <CardTitle icon="🧠">Tips para optimizar la autonomía</CardTitle>
        <TipList items={data.generalTips} />
      </Card>
    </div>
  )
}
