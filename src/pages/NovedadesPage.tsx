import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Alert, Skeleton } from '../components/UI'
import { appName, fetchReleaseNotes, type ReleaseNote } from '../lib/carReleaseNotes'
import formStyles from '../styles/formControls.module.css'

// D1 "Novedades" (specs/car-updates.md): what each stable release of the community apps brings. The car shows the same release as
// "Actualización disponible" in Mi Vigo > Ajustes > Actualizaciones. Before migration 0072 the list cannot be read and the page says so.

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', { dateStyle: 'long' })
}

export default function NovedadesPage() {
  const [notes, setNotes] = useState<ReleaseNote[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetchReleaseNotes().then((n) => {
      if (!cancelled) setNotes(n)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <PageHeader
        title="🆕 Novedades de las mejoras"
        subtitle="Lo nuevo en las apps de la comunidad. Tu auto se actualiza solo cuando tiene Wi-Fi."
      />
      {notes === undefined && <Skeleton lines={4} />}
      {(notes === null || notes?.length === 0) && (
        <Alert type="info">
          Todavía no hay novedades. Cuando salga una versión nueva de las mejoras, la vas a ver acá.
        </Alert>
      )}
      {notes?.map((r) => (
        <Card key={r.serial}>
          <CardTitle icon="📦">{`Versión ${r.serial} · ${when(r.published_at)}`}</CardTitle>
          {r.note && <p>{r.note}</p>}
          {r.apps.length > 0 && (
            <ul>
              {r.apps.map((a) => (
                <li key={a.package}>
                  {appName(a.package)} {a.version}
                </li>
              ))}
            </ul>
          )}
          {r.notices.length > 0 && (
            <p className={formStyles.hint}>
              Actualización de Google disponible:{' '}
              {r.notices.map((n) => `${appName(n.package)} (${n.label})`).join(', ')}. Se instala con el cable
              desde <Link to="/mi-vigo/preparar">Preparar mi Vigo</Link>.
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}
