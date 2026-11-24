import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { PageHeader, Card, CardTitle, Alert, Skeleton } from '../components/UI'
import {
  LABEL_TEXT,
  deleteSnapshot,
  diffSnapshots,
  fetchSnapshots,
  parseConfigFile,
  saveSnapshot,
  type ConfigSnapshot,
} from '../lib/vehicleConfig'
import formStyles from '../styles/formControls.module.css'
import { confirmDialog } from '../lib/confirmDialog'

// C4 "Configuración del auto" (specs/vehicle-config-fingerprint.md): private copies of the car's factory configuration, uploaded from
// the installer's file, and the difference between two of them (before / after a dealer visit). Only this account sees them.

function when(iso: string): string {
  return new Date(iso).toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' })
}

function SnapshotSelect(props: {
  label: string
  value: string
  rows: ConfigSnapshot[]
  onChange: (v: string) => void
}) {
  return (
    <label className={formStyles.field}>
      <span className={formStyles.label}>{props.label}</span>
      <select
        className={formStyles.input}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.rows.map((r) => (
          <option key={r.id} value={r.id}>
            {LABEL_TEXT[r.label]} · {when(r.taken_at)}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function VehicleConfigPage() {
  const [rows, setRows] = useState<ConfigSnapshot[] | null | undefined>(undefined)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetchSnapshots()
    setRows(r)
    if (r && r.length >= 2) {
      setA(r[1].id ?? '')
      setB(r[0].id ?? '')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setError(null)
    setMessage(null)
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const s = f.size <= 20_000 ? parseConfigFile(await f.text()) : null
    if (!s) {
      setError(
        'Ese no es el archivo correcto. Elegí «configuracion_del_auto.txt», el que guarda el instalador.'
      )
      return
    }
    const r = await saveSnapshot(s)
    if (r.error) setError(r.error)
    else setMessage(`Guardada: ${LABEL_TEXT[s.label]}, ${when(s.taken_at)}.`)
    void load()
  }

  async function remove(id: string) {
    if (!(await confirmDialog('¿Borrar esta copia de la configuración?'))) return
    const r = await deleteSnapshot(id)
    if (r.error) setError(r.error)
    void load()
  }

  const sa = rows?.find((r) => r.id === a)
  const sb = rows?.find((r) => r.id === b)
  const changes = sa && sb ? diffSnapshots(sa, sb) : null

  return (
    <div>
      <PageHeader
        title="🧬 Configuración del auto"
        subtitle="Los ajustes de fábrica de tu auto, para comparar antes y después del taller. Solo los ves vos."
      />
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="info">{message}</Alert>}
      <Card>
        <CardTitle icon="📄">Subir el archivo del instalador</CardTitle>
        <p className={formStyles.hint}>
          El instalador guarda «configuracion_del_auto.txt» en Documentos › VigoInstaller, en la carpeta de
          cada vez que lo usás (Instalar, Antes del service, Después del service).
        </p>
        <input
          type="file"
          accept=".txt,text/plain"
          aria-label="Archivo de configuración"
          onChange={(e) => void onFile(e)}
        />
      </Card>
      {rows === undefined && <Skeleton lines={3} />}
      {rows === null && <Alert type="info">Esto todavía no está disponible. Probá más tarde.</Alert>}
      {rows && rows.length > 0 && (
        <Card>
          <CardTitle icon="🗂️">Copias guardadas</CardTitle>
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                {LABEL_TEXT[r.label]} · {when(r.taken_at)}
                {r.firmware && ` · ${r.firmware}`}{' '}
                <button type="button" onClick={() => r.id && void remove(r.id)}>
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {rows && rows.length >= 2 && (
        <Card>
          <CardTitle icon="🔍">Comparar</CardTitle>
          <div className={formStyles.form}>
            <SnapshotSelect label="Antes" value={a} rows={rows} onChange={setA} />
            <SnapshotSelect label="Después" value={b} rows={rows} onChange={setB} />
          </div>
          {changes && changes.length === 0 && (
            <Alert type="info">Sin cambios: la configuración es la misma.</Alert>
          )}
          {changes && changes.length > 0 && (
            <>
              <Alert type="warning">
                La configuración cambió. Si no pediste ese cambio, mostrale esta lista al taller.
              </Alert>
              <ul>
                {changes.map((c) => (
                  <li key={c.what}>
                    {c.what}: {c.before} → {c.after}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
