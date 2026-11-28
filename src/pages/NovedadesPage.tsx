import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader, Card, CardTitle, Alert, Badge, Skeleton } from '../components/UI'
import {
  appName,
  fetchGithubNotes,
  fetchReleaseNotes,
  releaseTag,
  type ReleaseNote,
} from '../lib/carReleaseNotes'
import ReleaseBody from '../components/ReleaseBody'
import { useAuth } from '../context/AuthContext'
import FirmwareCard from '../components/FirmwareCard'
import formStyles from '../styles/formControls.module.css'

// D1 "Novedades" (specs/car-updates.md): what each release of the community apps brings (stable ones; beta ones too for beta testers
// and moderators, marked). The text is the one on the GitHub release; without it, the note and the app versions. The car shows the
// same release as "Actualización disponible" in Mi Vigo > Ajustes > Actualizaciones.

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', { dateStyle: 'long' })
}

export default function NovedadesPage() {
  const [notes, setNotes] = useState<ReleaseNote[] | null | undefined>(undefined)
  const [bodies, setBodies] = useState<Record<string, string>>({})
  // what the list holds depends on who asks: read it again after signing in or out
  const userId = useAuth().user?.id

  useEffect(() => {
    let cancelled = false
    void fetchReleaseNotes().then((n) => {
      if (!cancelled) setNotes(n)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  // GitHub is asked only when there is something to describe
  const any = !!notes?.length
  useEffect(() => {
    if (!any) return
    let cancelled = false
    void fetchGithubNotes().then((b) => {
      if (!cancelled) setBodies(b)
    })
    return () => {
      cancelled = true
    }
  }, [any])

  return (
    <div>
      <PageHeader
        title="🆕 Novedades de las mejoras"
        subtitle="Lo nuevo en las apps de la comunidad. Tu auto se actualiza solo cuando tiene Wi-Fi."
      />
      {/* Head-unit software versions seen in the community (moved from Mi Vigo, owner decision 2026-11-24 #7). */}
      <FirmwareCard />
      {notes === undefined && <Skeleton lines={4} />}
      {(notes === null || notes?.length === 0) && (
        <Alert type="info">
          Todavía no hay novedades. Cuando salga una versión nueva de las mejoras, la vas a ver acá.
        </Alert>
      )}
      {notes?.map((r) => {
        const body = bodies[releaseTag(r.serial)]
        return (
          <Card key={r.serial}>
            <CardTitle icon="📦">{`Versión ${r.serial} · ${when(r.published_at)}`}</CardTitle>
            {r.channel === 'beta' && <Badge color="amber">Beta</Badge>}
            {body ? (
              <ReleaseBody text={body} />
            ) : (
              <>
                {r.note && <p>{r.note}</p>}
                {r.apps.length > 0 && (
                  <ul>
                    {r.apps.map((x) => (
                      <li key={x.package}>
                        {appName(x.package)} {x.version}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {r.notices.length > 0 && (
              <p className={formStyles.hint}>
                Actualización de Google disponible:{' '}
                {r.notices.map((n) => `${appName(n.package)} (${n.label})`).join(', ')}. Se instala con el
                cable desde <Link to="/mi-vigo/preparar">Preparar mi Vigo</Link>.
              </p>
            )}
          </Card>
        )
      })}
    </div>
  )
}
