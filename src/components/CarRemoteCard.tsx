import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle, Alert } from './UI'
import {
  cancelCarOrder,
  clampLimit,
  connectionLabel,
  createCarOrder,
  fetchCarRemote,
  isOnline,
  LIMIT_MAX,
  LIMIT_MIN,
  LIMIT_STEP,
  orderKindLabel,
  orderMeta,
  orderPhase,
  orderStateView,
  POLL_MS,
  type CarOrderKind,
  type CarRemoteData,
} from '../lib/carRemote'
import styles from './CarRemoteCard.module.css'

// "Control remoto" (specs/car-remote-e3.md R6): orders for the linked car (windows, ventilate, charge limit, stop charging),
// whether the car is online, and the last orders with their result. The car's status (battery, range, cable, time to full,
// limit) is shown only by "Estado del auto"; this card reads it just to offer "Detener la carga" and to start the limit
// stepper at the car's limit (owner at the car 2026-11-22: no repeated status). Mounted only with
// VITE_CAR_REMOTE=1 (after migration 0052); hidden when the fetch fails or the vehicle has no linked car. Polls every 3 s
// while the page is visible (no Realtime) and stops when it is hidden.
const CONFIRM: Partial<Record<CarOrderKind, string>> = {
  windows_open_all: '¿Abrir las 4 ventanas?',
  ventilate: '¿Abrir las 4 ventanas para ventilar el auto?',
}

export default function CarRemoteCard() {
  const [data, setData] = useState<CarRemoteData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(async () => {
    const result = await fetchCarRemote()
    setData(result)
    setNow(new Date())
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const start = () => {
      stop()
      void load()
      timer = setInterval(() => void load(), POLL_MS)
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())
    if (document.visibilityState === 'visible') start()
    else void load()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  if (!data || !data.hasCar) return null

  const status = data.status
  const charging = status?.charging === true
  const shownLimit = limit ?? clampLimit(status?.limit_pct ?? 80)

  async function send(kind: CarOrderKind, pct?: number) {
    const question = CONFIRM[kind]
    if (question && !confirm(question)) return
    setBusy(kind)
    setError(null)
    const result = await createCarOrder(kind, pct)
    setBusy(null)
    if (result.error) setError(result.error)
    void load()
  }

  async function cancel(id: string) {
    setBusy(id)
    setError(null)
    const result = await cancelCarOrder(id)
    setBusy(null)
    if (result.error) setError(result.error)
    void load()
  }

  const online = isOnline(data.lastSeenAt, now)

  return (
    <Card>
      <CardTitle icon="📡">Control remoto</CardTitle>
      <p className={styles.connection}>
        <span className={`${styles.dot} ${online ? styles.dotOn : ''}`} aria-hidden="true" />
        {connectionLabel(data.lastSeenAt, now)}
      </p>
      <p className={styles.note}>
        El auto solo recibe órdenes mientras está encendido y con internet; si no la recibe en 2 minutos, se
        cancela.
      </p>

      {error && <Alert type="danger">{error}</Alert>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={busy !== null}
          onClick={() => void send('ventilate')}
        >
          Ventilar
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={busy !== null}
          onClick={() => void send('windows_open_all')}
        >
          Abrir todas las ventanas
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={busy !== null}
          onClick={() => void send('windows_close_all')}
        >
          Cerrar todas las ventanas
        </button>
        {charging && (
          <button
            type="button"
            className={styles.actionDanger}
            disabled={busy !== null}
            onClick={() => void send('charge_stop')}
          >
            Detener la carga
          </button>
        )}
      </div>

      <div className={styles.limitRow}>
        <span className={styles.limitLabel}>Límite de carga</span>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepBtn}
            aria-label="Bajar el límite"
            disabled={shownLimit <= LIMIT_MIN}
            onClick={() => setLimit(clampLimit(shownLimit - LIMIT_STEP))}
          >
            −
          </button>
          <span className={styles.limitValue} aria-live="polite">
            {shownLimit} %
          </span>
          <button
            type="button"
            className={styles.stepBtn}
            aria-label="Subir el límite"
            disabled={shownLimit >= LIMIT_MAX}
            onClick={() => setLimit(clampLimit(shownLimit + LIMIT_STEP))}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className={styles.apply}
          disabled={busy !== null}
          onClick={() => void send('charge_limit', shownLimit)}
        >
          Aplicar
        </button>
      </div>

      {data.orders.length > 0 && (
        <>
          <h3 className={styles.listTitle}>Últimas órdenes</h3>
          <ul className={styles.list}>
            {data.orders.map((o) => {
              const view = orderStateView(o, now)
              return (
                <li key={o.id} className={styles.row}>
                  <span className={styles.icon} aria-hidden="true">
                    {view.icon}
                  </span>
                  <span className={styles.info}>
                    <span className={styles.kind}>{orderKindLabel(o)}</span>
                    <span className={styles.meta}>
                      {view.label}
                      {view.detail && `: ${view.detail}`}
                    </span>
                    {o.result_text && <span className={styles.meta}>{o.result_text}</span>}
                    <span className={styles.meta}>{orderMeta(o, data.names, now)}</span>
                  </span>
                  {orderPhase(o, now) === 'queued' && (
                    <button
                      type="button"
                      className={styles.cancel}
                      disabled={busy !== null}
                      onClick={() => void cancel(o.id)}
                    >
                      Cancelar
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}
