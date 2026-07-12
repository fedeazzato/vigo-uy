import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProfilePrefsSync from './components/ProfilePrefsSync'
import RequireAuth from './components/RequireAuth'
import RequireModerator from './components/RequireModerator'
import HomePage from './pages/HomePage'
import GuidePage from './pages/GuidePage'
import ChargingPage from './pages/ChargingPage'
import RoutesPage from './pages/RoutesPage'
import CostsPage from './pages/CostsPage'
import AccessoriesPage from './pages/AccessoriesPage'
import TechPage from './pages/TechPage'
import FaqPage from './pages/FaqPage'
import MyVigoPage from './pages/MyVigoPage'
import FichaTecnicaPage from './pages/FichaTecnicaPage'
import MantenimientoPage from './pages/MantenimientoPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NewServiceEntryPage from './pages/NewServiceEntryPage'
import NewTripLogPage from './pages/NewTripLogPage'
import PartsPage from './pages/PartsPage'
import NewPartPurchasePage from './pages/NewPartPurchasePage'
import CommunityFeedPage from './pages/CommunityFeedPage'
import ModerationPage from './pages/ModerationPage'

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
