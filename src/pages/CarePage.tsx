import { Outlet } from 'react-router'
import { PageHeader, PageTabs } from '../components/UI'

// "Cuidar tu Vigo" (owner decision 2026-11-24 #5): Mantenimiento, Repuestos and Accesorios as three tabs of one page. Each tab is
// its own route (/cuidar/mantenimiento …) so old links redirect straight to the right tab.
const CARE_TABS = [
  { to: '/cuidar/mantenimiento', label: 'Mantenimiento' },
  { to: '/cuidar/repuestos', label: 'Repuestos' },
  { to: '/cuidar/accesorios', label: 'Accesorios' },
]

export default function CarePage() {
  return (
    <div>
      <PageHeader title="🧰 Cuidar tu Vigo" subtitle="Services, repuestos y accesorios, con datos de otros dueños." />
      <PageTabs label="Secciones de Cuidar tu Vigo" tabs={CARE_TABS} />
      <Outlet />
    </div>
  )
}
