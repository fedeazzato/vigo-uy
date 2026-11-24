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

// App-like destinations, same order as the mobile bottom bar (Inicio, Aprender, ＋ Registrar, Comunidad, Mi Vigo; owner decision
// 2026-11-24 #6). The reference pages are listed under the Aprender group in the sidebar and on /aprender.
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/aprender', label: 'Aprender', icon: 'guide' },
  { to: '/comunidad', label: 'Comunidad', icon: 'community' },
  { to: '/mi-vigo', label: 'Mi Vigo', icon: 'car' },
]
