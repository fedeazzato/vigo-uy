import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ChargingPage from './pages/ChargingPage'
import RoutesPage from './pages/RoutesPage'
import CostsPage from './pages/CostsPage'
import AccessoriesPage from './pages/AccessoriesPage'
import TechPage from './pages/TechPage'
import FaqPage from './pages/FaqPage'
import MyVigoPage from './pages/MyVigoPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/mi-vigo" replace />} />
        <Route path="mi-vigo" element={<MyVigoPage />} />
        <Route path="carga" element={<ChargingPage />} />
        <Route path="rutas" element={<RoutesPage />} />
        <Route path="costos" element={<CostsPage />} />
        <Route path="accesorios" element={<AccessoriesPage />} />
        <Route path="tecnologia" element={<TechPage />} />
        <Route path="faq" element={<FaqPage />} />
      </Route>
    </Routes>
  )
}
