import { Navigate, useLocation } from 'react-router-dom'

// A renamed route that forwards location.state too (the forms' "saved" toast) and the query string.
export default function RedirectKeepState({ to }: { to: string }) {
  const location = useLocation()
  return <Navigate to={{ pathname: to, search: location.search }} state={location.state as unknown} replace />
}
