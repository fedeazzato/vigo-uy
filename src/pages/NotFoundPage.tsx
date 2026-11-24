import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/UI'

// Catch-all route: an old or mistyped link lands here instead of a blank page.
export default function NotFoundPage() {
  return (
    <div>
      <PageHeader
        title="🧭 No encontramos esa página"
        subtitle="Puede que el enlace sea viejo o tenga un error."
      />
      <Card>
        <p>
          Volvé al <Link to="/">inicio</Link> o buscá lo que necesitás en la <Link to="/aprender">Aprender</Link>.
        </p>
      </Card>
    </div>
  )
}
