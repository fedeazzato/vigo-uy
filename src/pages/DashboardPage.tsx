import { PageHeader, Card } from '../components/UI'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div>
      <PageHeader
        title="📋 Mi actividad"
        subtitle="Tus costos y viajes registrados van a aparecer acá."
      />
      <Card>
        <p>Sesión iniciada como <strong>{user?.email}</strong>.</p>
      </Card>
    </div>
  )
}
