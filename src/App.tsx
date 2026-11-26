import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import Layout from './components/Layout'
import ProfilePrefsSync from './components/ProfilePrefsSync'
import RequireAuth from './components/RequireAuth'
import RequireModerator from './components/RequireModerator'
import RedirectKeepState from './components/RedirectKeepState'
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
const MyVigoLayout = lazy(() => import('./pages/MyVigoLayout'))
const CarePage = lazy(() => import('./pages/CarePage'))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage'))
const NovedadesPage = lazy(() => import('./pages/NovedadesPage'))
const VehicleConfigPage = lazy(() => import('./pages/VehicleConfigPage'))
const FichaTecnicaPage = lazy(() => import('./pages/FichaTecnicaPage'))
const MantenimientoPage = lazy(() => import('./pages/MantenimientoPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const NewServiceEntryPage = lazy(() => import('./pages/NewServiceEntryPage'))
const NewInsuranceQuotePage = lazy(() => import('./pages/NewInsuranceQuotePage'))
const NewTripLogPage = lazy(() => import('./pages/NewTripLogPage'))
const PartsPage = lazy(() => import('./pages/PartsPage'))
const NewPartPurchasePage = lazy(() => import('./pages/NewPartPurchasePage'))
const CommunityFeedPage = lazy(() => import('./pages/CommunityFeedPage'))
const ModerationPage = lazy(() => import('./pages/ModerationPage'))
const LinkCarPage = lazy(() => import('./pages/LinkCarPage'))
const VaultPage = lazy(() => import('./pages/VaultPage'))
const PrepareCarPage = lazy(() => import('./pages/PrepareCarPage'))
const GoogleFilesPage = lazy(() => import('./pages/GoogleFilesPage'))
const InstallerFeaturesPage = lazy(() => import('./pages/InstallerFeaturesPage'))
const CarDraftsPage = lazy(() => import('./pages/CarDraftsPage'))
const CarDiagnosticsPage = lazy(() => import('./pages/CarDiagnosticsPage'))
const LicencesPage = lazy(() => import('./pages/LicencesPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const RoutePlannerPage = lazy(() => import('./pages/RoutePlannerPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export default function App() {
  return (
    <>
      <ProfilePrefsSync />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="aprender" element={<GuidePage />} />
          <Route path="aprender/glosario" element={<GlossaryPage />} />
          <Route path="guia" element={<Navigate to="/aprender" replace />} />
          {/* Mi Vigo tabs: Mi auto / Mis registros (owner decision 2026-11-24 #1). */}
          <Route path="mi-vigo" element={<MyVigoLayout />}>
            <Route index element={<MyVigoPage />} />
            <Route element={<RequireAuth />}>
              <Route path="registros" element={<DashboardPage />} />
            </Route>
          </Route>
          <Route path="ficha-tecnica" element={<FichaTecnicaPage />} />
          <Route path="carga" element={<ChargingPage />} />
          <Route path="rutas" element={<RoutesPage />} />
          <Route path="rutas/planificar" element={<RoutePlannerPage />} />
          <Route path="costos" element={<CostsPage />} />
          {/* Cuidar tu Vigo: one page, three tabs (owner decision 2026-11-24 #5); old routes redirect to the tabs. */}
          <Route path="cuidar" element={<CarePage />}>
            <Route index element={<Navigate to="mantenimiento" replace />} />
            <Route path="mantenimiento" element={<MantenimientoPage />} />
            <Route path="repuestos" element={<PartsPage />} />
            <Route path="accesorios" element={<AccessoriesPage />} />
          </Route>
          <Route path="mantenimiento" element={<Navigate to="/cuidar/mantenimiento" replace />} />
          <Route path="repuestos" element={<Navigate to="/cuidar/repuestos" replace />} />
          <Route path="accesorios" element={<Navigate to="/cuidar/accesorios" replace />} />
          <Route path="tecnologia" element={<TechPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="novedades" element={<NovedadesPage />} />
          <Route path="licencias" element={<LicencesPage />} />
          {/* Public on purpose: owners read it before deciding to install (specs/installer-features-page.md). */}
          <Route path="mi-vigo/preparar/que-agrega" element={<InstallerFeaturesPage />} />
          <Route path="login" element={<LoginPage />} />
          {/* Publicly readable since Phase 6 (anon RLS policies); submitting still requires auth. */}
          <Route path="comunidad" element={<CommunityFeedPage />} />
          {/* Account settings live on Mi Vigo now; keep old links working. */}
          <Route path="perfil" element={<Navigate to="/mi-vigo" replace />} />
          <Route path="mi-actividad" element={<RedirectKeepState to="/mi-vigo/registros" />} />
          <Route element={<RequireAuth />}>

            <Route path="notificaciones" element={<NotificationsPage />} />
            {/* The car's QR opens #/mi-vigo/vincular?c=CODE (specs/car-link-phase0.md). */}
            <Route path="mi-vigo/vincular" element={<LinkCarPage />} />
            {/* End-to-end encrypted secrets, passkey PRF (specs/secret-vault.md). */}
            <Route path="mi-vigo/boveda" element={<VaultPage />} />
            <Route path="mi-vigo/configuracion" element={<VehicleConfigPage />} />
            <Route path="mi-vigo/preparar" element={<PrepareCarPage />} />
            <Route path="mi-vigo/preparar/archivos-google" element={<GoogleFilesPage />} />
            {/* Trips shared from the car, as drafts (specs/car-trip-drafts.md). */}
            <Route path="mi-vigo/borradores" element={<CarDraftsPage />} />
            {/* Diagnostics sent from the car's Mi Vigo (specs/car-diagnostics.md). */}
            <Route path="mi-vigo/diagnosticos" element={<CarDiagnosticsPage />} />
            <Route path="costos/nuevo" element={<NewServiceEntryPage />} />
            <Route path="costos/:id/editar" element={<NewServiceEntryPage />} />
            <Route path="costos/seguro/nuevo" element={<NewInsuranceQuotePage />} />
            <Route path="costos/seguro/:id/editar" element={<NewInsuranceQuotePage />} />
            <Route path="viajes/nuevo" element={<NewTripLogPage />} />
            <Route path="viajes/:id/editar" element={<NewTripLogPage />} />
            <Route path="repuestos/nuevo" element={<NewPartPurchasePage />} />
            <Route path="repuestos/:id/editar" element={<NewPartPurchasePage />} />
          </Route>
          <Route element={<RequireModerator />}>
            <Route path="moderacion" element={<ModerationPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  )
}
