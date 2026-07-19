import { Link } from 'react-router-dom'
import styles from './GuideLinks.module.css'

export interface GuideLinkItem {
  to: string
  label: string
  icon: string
  description: string
}

// Single source of truth for the static "guide" pages: rendered as the
// Guía rápida grid on Inicio, the /guia page, and the sidebar's Guía group.
export const GUIDE_LINKS: GuideLinkItem[] = [
  { to: '/ficha-tecnica', label: 'Ficha técnica', icon: '📋', description: 'Especificaciones completas del E2 y E2+.' },
  { to: '/carga', label: 'Carga', icon: '⚡', description: 'Cargadores, redes públicas y consejos.' },
  { to: '/rutas', label: 'Rutas', icon: '🗺️', description: 'Viajes reales y autonomía en ruta.' },
  { to: '/costos', label: 'Costos', icon: '💰', description: 'Costo por km, patente y seguro.' },
  { to: '/mantenimiento', label: 'Mantenimiento', icon: '🛠️', description: 'Services, precios y talleres.' },
  { to: '/repuestos', label: 'Repuestos', icon: '🔩', description: 'Dónde conseguir repuestos y consumibles.' },
  { to: '/accesorios', label: 'Accesorios', icon: '🔧', description: 'Accesorios recomendados por el grupo.' },
  { to: '/tecnologia', label: 'Tecnología', icon: '📱', description: 'App, pantalla y trucos de software.' },
  { to: '/faq', label: 'FAQ', icon: '💬', description: 'Preguntas frecuentes del grupo.' },
]

interface GuideLinksProps {
  links?: GuideLinkItem[]
}

export function GuideLinks({ links = GUIDE_LINKS }: GuideLinksProps) {
  return (
    <div className={styles.grid}>
      {links.map(({ to, label, icon, description }) => (
        <Link key={to} to={to} className={styles.item}>
          <span className={styles.icon} aria-hidden="true">{icon}</span>
          <span className={styles.text}>
            <span className={styles.linkLabel}>{label}</span>
            <span className={styles.description}>{description}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
