import { useEffect, useState } from 'react'
import { Card, CardTitle, Alert } from './UI'
import {
  confirmChargeDraft,
  describeChargeDraft,
  discardChargeDraft,
  fetchPendingChargeDrafts,
  type CarChargeDraftRow,
  type CheckinStatus,
} from '../lib/carChargeDrafts'
import formStyles from '../styles/formControls.module.css'
import styles from '../pages/CarDraftsPage.module.css'

// "Borradores del auto" › check-ins de carga (specs/car-charge-checkins.md R4): one card per charge the car noticed at a
// WikiVigo station. Nothing is public until "Publicar check-in"; the member may correct the result or add a note.
export default function CarChargeDrafts({ onCount }: { onCount?: (n: number) => void }) {
  const [drafts, setDrafts] = useState<CarChargeDraftRow[]>([])
  const [choice, setChoice] = useState<Record<string, CheckinStatus>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPendingChargeDrafts().then((d) => {
      if (cancelled) return
      setDrafts(d ?? [])
      onCount?.(d?.length ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [onCount])

  function remove(id: string) {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id)
      onCount?.(next.length)
      return next
    })
  }

  async function publish(d: CarChargeDraftRow) {
    setBusy(d.id)
    setError(null)
    const err = await confirmChargeDraft(d.id, choice[d.id] ?? (d.result as CheckinStatus), notes[d.id] ?? '')
    setBusy(null)
    if (err) return setError(err)
    setDone(d.charging_stations?.name ?? 'la estación')
    remove(d.id)
  }

  async function discard(d: CarChargeDraftRow) {
    setBusy(d.id)
    setError(null)
    const ok = await discardChargeDraft(d.id)
    setBusy(null)
    if (ok) remove(d.id)
    else setError('No pudimos descartar el borrador. Probá de nuevo.')
  }

  if (drafts.length === 0 && !done && !error) return null
  return (
    <>
      {error && <Alert type="danger">{error}</Alert>}
      {done && <Alert type="success">Check-in publicado en {done}. ¡Gracias!</Alert>}
      {drafts.map((d) => {
        const { title, detail } = describeChargeDraft(d)
        const value = choice[d.id] ?? (d.result as CheckinStatus)
        return (
          <Card key={d.id}>
            <CardTitle icon="🔌">{title}</CardTitle>
            <p className={styles.empty}>{detail}</p>
            <div className={formStyles.row}>
              <div className={formStyles.field}>
                <label className={formStyles.label} htmlFor={`ck-${d.id}`}>
                  Resultado
                </label>
                <select
                  id={`ck-${d.id}`}
                  className={formStyles.input}
                  value={value}
                  onChange={(e) => setChoice((c) => ({ ...c, [d.id]: e.target.value as CheckinStatus }))}
                >
                  <option value="funciono">Funcionó</option>
                  <option value="fallo">Falló</option>
                  <option value="ocupado">Ocupado</option>
                </select>
              </div>
              <div className={formStyles.field}>
                <label className={formStyles.label} htmlFor={`note-${d.id}`}>
                  Nota (opcional)
                </label>
                <input
                  id={`note-${d.id}`}
                  className={formStyles.input}
                  maxLength={500}
                  value={notes[d.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                />
              </div>
            </div>
            <p className={formStyles.hint}>
              Se publica con tu nombre como cualquier check-in. Si no lo publicás, nadie lo ve.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={formStyles.submitBtnCompact}
                disabled={busy !== null}
                onClick={() => void publish(d)}
              >
                Publicar check-in
              </button>
              <button
                type="button"
                className={formStyles.backBtn}
                disabled={busy !== null}
                onClick={() => void discard(d)}
              >
                Descartar
              </button>
            </div>
          </Card>
        )
      })}
    </>
  )
}
