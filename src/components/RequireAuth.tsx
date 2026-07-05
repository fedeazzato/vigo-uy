import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequireAuth() {
  const { status } = useAuth()

  if (status === 'loading') return null
  if (status !== 'signedIn') return <Navigate to="/login" replace />

  return <Outlet />
}
