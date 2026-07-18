import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return null
  // Remember where the user was headed so the login page can explain the
  // redirect and send them back there afterwards.
  if (status !== 'signedIn') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
