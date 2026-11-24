import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import styles from './GuideLinks.module.css'

export interface GuideLinkItem {
  to: string
  label: string
  icon: IconName
  description: string
}

// Single source of truth for the static "guide" pages: rendered as the
// Guía rápida grid on Inicio, the /guia page, and the sidebar's Guía group.
export const GUIDE_LINKS: GuideLinkItem[] = [
  {
    to: '/ficha-tecnica',
    label: 'Ficha técnica',
    icon: 'spec',
    description: 'Medidas, batería y equipamiento del E2 y E2+.',
  },
  {
    to: '/carga',
    label: 'Carga',
    icon: 'charge',
    description: 'Dónde y cómo cargar, en casa y en la calle.',
  },
  { to: '/rutas', label: 'Rutas', icon: 'route', description: 'Viajes reales y dónde cargar en el camino.' },
  { to: '/costos', label: 'Costos', icon: 'costs', description: 'Cuánto gastás por km, patente y seguro.' },
  {
    to: '/mantenimiento',
    label: 'Mantenimiento',
    icon: 'maintenance',
    description: 'Services, precios y talleres.',
  },
  {
    to: '/repuestos',
    label: 'Repuestos',
    icon: 'parts',
    description: 'Dónde conseguir repuestos y consumibles.',
  },
  {
    to: '/accesorios',
    label: 'Accesorios',
    icon: 'accessories',
    description: 'Lo que otros dueños le sumaron a su Vigo.',
  },
  {
    to: '/tecnologia',
    label: 'Tecnología',
    icon: 'tech',
    description: 'La app, la pantalla y algunos trucos.',
  },
  {
    to: '/faq',
    label: 'Preguntas frecuentes',
    icon: 'faq',
    description: 'Las dudas más comunes, respondidas por dueños.',
  },
]

interface GuideLinksProps {
  links?: GuideLinkItem[]
}

export function GuideLinks({ links = GUIDE_LINKS }: GuideLinksProps) {
  return (
    <div className={styles.grid}>
      {links.map(({ to, label, icon, description }) => (
        <Link key={to} to={to} className={styles.item}>
          <Icon name={icon} size={22} className={styles.icon} />
          <span className={styles.text}>
            <span className={styles.linkLabel}>{label}</span>
            <span className={styles.description}>{description}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
