import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequireModerator() {
  const { status, profile } = useAuth()

  if (status === 'loading') return null
  if (status !== 'signedIn') return <Navigate to="/login" replace />
  if (!profile) return null
  if (!profile.is_moderator) return <Navigate to="/mi-actividad" replace />

  return <Outlet />
}
