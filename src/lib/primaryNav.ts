// Split out of Layout.tsx so a non-component export doesn't trip the
// react-refresh/only-export-components lint rule there, and so siteSearch.ts
// can index these labels without importing a component file.
import type { IconName } from '../components/Icon'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

// App-like destinations. The static reference pages live under the Guía
// group (sidebar) / the /guia page (mobile), not here.
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/comunidad', label: 'Comunidad', icon: 'community' },
  { to: '/mi-actividad', label: 'Mi actividad', icon: 'activity' },
  { to: '/mi-vigo', label: 'Mi Vigo', icon: 'car' },
]
