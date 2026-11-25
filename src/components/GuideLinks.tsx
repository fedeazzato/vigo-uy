import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import styles from './GuideLinks.module.css'

export type GuideGroup = 'viajar' | 'costos' | 'conoce'

export interface GuideLinkItem {
  to: string
  label: string
  icon: IconName
  description: string
  group?: GuideGroup
}

// The three "Aprender" sections (owner decision 2026-11-24 #6), in display order.
export const GUIDE_GROUPS: { id: GuideGroup; label: string }[] = [
  { id: 'viajar', label: 'Cargar y viajar' },
  { id: 'costos', label: 'Costos y mantenimiento' },
  { id: 'conoce', label: 'Conocé tu Vigo' },
]

// Single source of truth for the static "Aprender" pages: rendered as the
// quick grid on Inicio, the /aprender page, and the sidebar's Aprender group.
export const GUIDE_LINKS: GuideLinkItem[] = [
  {
    to: '/carga',
    label: 'Carga',
    icon: 'charge',
    description: 'Dónde y cómo cargar, en casa y en la calle.',
    group: 'viajar',
  },
  {
    to: '/rutas',
    label: 'Rutas',
    icon: 'route',
    description: 'Viajes reales y dónde cargar en el camino.',
    group: 'viajar',
  },
  {
    to: '/rutas/planificar',
    label: 'Planificá tu viaje',
    icon: 'planner',
    description: 'Decinos a dónde vas y te decimos dónde cargar.',
    group: 'viajar',
  },
  {
    to: '/costos',
    label: 'Costos',
    icon: 'costs',
    description: 'Cuánto gastás por km, patente y seguro.',
    group: 'costos',
  },
  {
    to: '/cuidar',
    label: 'Cuidar tu Vigo',
    icon: 'maintenance',
    description: 'Services, repuestos y accesorios.',
    group: 'costos',
  },
  {
    to: '/ficha-tecnica',
    label: 'Ficha técnica',
    icon: 'spec',
    description: 'Medidas, batería y equipamiento del E2 y E2+.',
    group: 'conoce',
  },
  {
    to: '/tecnologia',
    label: 'Tecnología',
    icon: 'tech',
    description: 'La app, la pantalla y algunos trucos.',
    group: 'conoce',
  },
  {
    to: '/faq',
    label: 'Preguntas frecuentes',
    icon: 'faq',
    description: 'Las dudas más comunes, respondidas por dueños.',
    group: 'conoce',
  },
  {
    to: '/aprender/glosario',
    label: 'Glosario',
    icon: 'guide',
    description: 'Qué quiere decir kWh, VIN, aforo y otras palabras raras.',
    group: 'conoce',
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
