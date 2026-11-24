import { Outlet } from 'react-router-dom'
import { PageHeader, PageTabs } from '../components/UI'

// Mi Vigo with two tabs (owner decision 2026-11-24 #1): "Mi auto" (the car, account and upgrades) and "Mis registros" (the old
// "Mi actividad": trips, services, parts, insurance). /mi-actividad redirects to /mi-vigo/registros.
const TABS = [
  { to: '/mi-vigo', label: 'Mi auto', end: true },
  { to: '/mi-vigo/registros', label: 'Mis registros' },
]

export default function MyVigoLayout() {
  return (
    <div>
      <PageHeader title="🚗 Mi Vigo" subtitle="Tu auto, tu cuenta y lo que registraste, todo en un lugar." />
      <PageTabs label="Secciones de Mi Vigo" tabs={TABS} />
      <Outlet />
    </div>
  )
}
