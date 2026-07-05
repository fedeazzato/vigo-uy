import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/mi-vigo" replace />} />
        <Route path="mi-vigo" element={<MyVigoPage />} />
        <Route path="ficha-tecnica" element={<FichaTecnicaPage />} />
        <Route path="carga" element={<ChargingPage />} />
        <Route path="rutas" element={<RoutesPage />} />
        <Route path="costos" element={<CostsPage />} />
        <Route path="mantenimiento" element={<MantenimientoPage />} />
        <Route path="accesorios" element={<AccessoriesPage />} />
        <Route path="tecnologia" element={<TechPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="mi-actividad" element={<DashboardPage />} />
          <Route path="costos/nuevo" element={<NewServiceEntryPage />} />
          <Route path="costos/:id/editar" element={<NewServiceEntryPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
