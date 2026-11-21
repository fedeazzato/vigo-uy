import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Alert, Badge, Skeleton } from '../components/UI'
import {
  STATE_LABELS,
  appLabel,
  deleteDiagnostic,
  fetchDiagnostics,
  fetchReport,
  reportCode,
  reportToText,
  summarizeApps,
  type DiagReport,
} from '../lib/carDiagnostics'
import type { CarDiagnosticRow } from '../types'
import styles from './CarDiagnosticsPage.module.css'
import formStyles from '../styles/formControls.module.css'

// "Diagnósticos del auto" (specs/car-diagnostics.md R3): what Mi Vigo sent with "Enviar diagnóstico". RLS lets the vehicle's members
// and the moderators read them; logs were redacted on the car. Before migration 0051 the fetch fails and the page says there is
// nothing to read.

function when(iso: string): string {
  return new Date(iso).toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' })
}

function download(row: CarDiagnosticRow, report: DiagReport) {
  const blob = new Blob([reportToText(report, row.id)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `diagnostico-${reportCode(row.id)}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function CarDiagnosticsPage() {
  const [rows, setRows] = useState<CarDiagnosticRow[] | null | undefined>(undefined)
  const [open, setOpen] = useState<Record<string, DiagReport | null | 'loading'>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchDiagnostics().then((d) => {
      if (!cancelled) setRows(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function load(row: CarDiagnosticRow): Promise<DiagReport | null> {
    const have = open[row.id]
    if (have && have !== 'loading') return have
    setOpen((o) => ({ ...o, [row.id]: 'loading' }))
    const report = await fetchReport(row)
    setOpen((o) => ({ ...o, [row.id]: report }))
    return report
  }

  async function toggle(row: CarDiagnosticRow) {
    if (open[row.id] !== undefined && open[row.id] !== 'loading') {
      setOpen((o) => {
        const next = { ...o }
        delete next[row.id]
        return next
      })
      return
    }
    await load(row)
  }

  async function handleDownload(row: CarDiagnosticRow) {
    setError(null)
    const report = await load(row)
    if (report) download(row, report)
    else setError('No pudimos leer ese diagnóstico.')
  }

  async function handleDelete(row: CarDiagnosticRow) {
    if (confirmDelete !== row.id) {
      setConfirmDelete(row.id)
      return
    }
    setError(null)
    const ok = await deleteDiagnostic(row.id)
    setConfirmDelete(null)
    if (ok) setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id))
    else setError('No pudimos borrar el diagnóstico. Probá de nuevo.')
  }

  return (
    <div>
      <PageHeader
        title="🩺 Diagnósticos del auto"
        subtitle="Registros que el auto envió con «Enviar diagnóstico» (Mi Vigo en la pantalla del auto). Los ven los miembros del vehículo y los moderadores."
      />
      <Link to="/mi-vigo" className={styles.back}>
        ← Mi Vigo
      </Link>
      {error && <Alert type="danger">{error}</Alert>}
      {rows === undefined && <Skeleton lines={4} />}
      {rows !== undefined && (rows === null || rows.length === 0) && (
        <Card>
          <p className={styles.empty}>
            No hay diagnósticos. En el auto: Mi Vigo › Enviar diagnóstico › Enviar. Las contraseñas, claves y
            correos se borran en el auto antes de enviar; la ubicación solo va si la persona la activa.
          </p>
        </Card>
      )}
      {rows?.map((row) => {
        const apps = summarizeApps(row.apps)
        const state = open[row.id]
        const crashes = apps.reduce((n, a) => n + a.crashes, 0)
        return (
          <Card key={row.id}>
            <CardTitle icon="🩺">
              {when(row.created_at)} · código {reportCode(row.id)}
            </CardTitle>
            <div className={styles.badges}>
              {!row.complete && (
                <Badge color="gray">
                  Incompleto ({row.received} de {row.parts} partes)
                </Badge>
              )}
              {crashes > 0 && (
                <Badge color="red">
                  {crashes === 1 ? '1 cierre inesperado' : `${crashes} cierres inesperados`}
                </Badge>
              )}
            </div>
            <p className={styles.note}>{row.note ? `«${row.note}»` : 'Sin nota.'}</p>
            <ul className={styles.apps}>
              {apps.map((a) => (
                <li key={a.app}>
                  <strong>{appLabel(a.app)}</strong>
                  {a.version ? ` ${a.version}` : ''} · {STATE_LABELS[a.state] ?? a.state}
                  {a.crashes > 0 ? ` · ${a.crashes} ${a.crashes === 1 ? 'cierre' : 'cierres'}` : ''}
                </li>
              ))}
            </ul>
            {state === 'loading' && <Skeleton lines={2} />}
            {state === null && (
              <Alert type="warning">No pudimos leer este diagnóstico (¿partes faltantes?).</Alert>
            )}
            {state && state !== 'loading' && (
              <div className={styles.report}>
                <p className={styles.meta}>
                  Mi Vigo {state.mivigo} · {state.device_build} · ubicación{' '}
                  {state.location ? 'incluida' : 'no incluida'}
                </p>
                {state.apps
                  .filter((a) => a.log || a.crashes.length > 0)
                  .map((a) => (
                    <details key={a.app} className={styles.app}>
                      <summary>
                        {a.label} {a.version}
                        {a.crashes.length > 0 ? ` · ${a.crashes.length} cierres` : ''}
                        {a.truncated ? ' · recortado' : ''}
                      </summary>
                      {a.crashes.map((c, i) => (
                        <pre key={i} className={`${styles.log} ${styles.crash}`}>
                          {c}
                        </pre>
                      ))}
                      {a.log && <pre className={styles.log}>{a.log}</pre>}
                    </details>
                  ))}
              </div>
            )}
            {confirmDelete === row.id && (
              <Alert type="warning">Tocá «Borrar» otra vez para borrarlo para siempre.</Alert>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={formStyles.submitBtnCompact}
                disabled={!row.complete || state === 'loading'}
                onClick={() => void toggle(row)}
              >
                {state && state !== 'loading' ? 'Ocultar registros' : 'Ver registros'}
              </button>
              <button
                type="button"
                className={formStyles.backBtn}
                disabled={!row.complete || state === 'loading'}
                onClick={() => void handleDownload(row)}
              >
                Descargar .txt
              </button>
              <button type="button" className={formStyles.backBtn} onClick={() => void handleDelete(row)}>
                Borrar
              </button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
