import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProfilePrefsSync from './components/ProfilePrefsSync'
import RequireAuth from './components/RequireAuth'
import RequireModerator from './components/RequireModerator'
// Eager: the index route, so `/` never shows a loading flash on first paint.
import HomePage from './pages/HomePage'
// Lazy: every other page becomes its own chunk, fetched on navigation
// instead of shipped upfront. Loading state is a single Suspense boundary
// around Layout's Outlet (see Layout.tsx) — see specs/route-code-splitting.md.
const GuidePage = lazy(() => import('./pages/GuidePage'))
const ChargingPage = lazy(() => import('./pages/ChargingPage'))
const RoutesPage = lazy(() => import('./pages/RoutesPage'))
const CostsPage = lazy(() => import('./pages/CostsPage'))
const AccessoriesPage = lazy(() => import('./pages/AccessoriesPage'))
const TechPage = lazy(() => import('./pages/TechPage'))
const FaqPage = lazy(() => import('./pages/FaqPage'))
const MyVigoPage = lazy(() => import('./pages/MyVigoPage'))
const FichaTecnicaPage = lazy(() => import('./pages/FichaTecnicaPage'))
const MantenimientoPage = lazy(() => import('./pages/MantenimientoPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const NewServiceEntryPage = lazy(() => import('./pages/NewServiceEntryPage'))
const NewTripLogPage = lazy(() => import('./pages/NewTripLogPage'))
const PartsPage = lazy(() => import('./pages/PartsPage'))
const NewPartPurchasePage = lazy(() => import('./pages/NewPartPurchasePage'))
const CommunityFeedPage = lazy(() => import('./pages/CommunityFeedPage'))
const ModerationPage = lazy(() => import('./pages/ModerationPage'))

export default function App() {
  return (
    <>
      <ProfilePrefsSync />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="guia" element={<GuidePage />} />
          <Route path="mi-vigo" element={<MyVigoPage />} />
          <Route path="ficha-tecnica" element={<FichaTecnicaPage />} />
          <Route path="carga" element={<ChargingPage />} />
          <Route path="rutas" element={<RoutesPage />} />
          <Route path="costos" element={<CostsPage />} />
          <Route path="mantenimiento" element={<MantenimientoPage />} />
          <Route path="repuestos" element={<PartsPage />} />
          <Route path="accesorios" element={<AccessoriesPage />} />
          <Route path="tecnologia" element={<TechPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="login" element={<LoginPage />} />
          {/* Publicly readable since Phase 6 (anon RLS policies); submitting still requires auth. */}
          <Route path="comunidad" element={<CommunityFeedPage />} />
          {/* Account settings live on Mi Vigo now; keep old links working. */}
          <Route path="perfil" element={<Navigate to="/mi-vigo" replace />} />
          <Route element={<RequireAuth />}>
            <Route path="mi-actividad" element={<DashboardPage />} />
            <Route path="costos/nuevo" element={<NewServiceEntryPage />} />
            <Route path="costos/:id/editar" element={<NewServiceEntryPage />} />
            <Route path="viajes/nuevo" element={<NewTripLogPage />} />
            <Route path="viajes/:id/editar" element={<NewTripLogPage />} />
            <Route path="repuestos/nuevo" element={<NewPartPurchasePage />} />
            <Route path="repuestos/:id/editar" element={<NewPartPurchasePage />} />
          </Route>
          <Route element={<RequireModerator />}>
            <Route path="moderacion" element={<ModerationPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  )
}
