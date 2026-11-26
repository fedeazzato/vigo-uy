import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Card, CardTitle } from './UI'
import {
  cancelCarGuest,
  fetchCarGuest,
  GUEST_CONFIRM_OFF,
  GUEST_CONFIRM_ON,
  GUEST_EXPLAINER,
  GUEST_FOOTER,
  GUEST_POLL_IDLE_MS,
  GUEST_POLL_PENDING_MS,
  GUEST_UNSUPPORTED_TEXT,
  guestView,
  setCarGuest,
  type CarGuestState,
} from '../lib/carGuest'
import { confirmDialog } from '../lib/confirmDialog'
import styles from './CarGuestCard.module.css'

// "Modo invitado" (specs/guest-mode.md R4, migration 0085), right below "Tu auto ahora". Rendered only for the vehicle's
// creator and members with control (get_car_guest_mode answers allowed:false to everybody else: the database decides, this only
// hides), only with a linked screen, and only once that screen has reported guest mode support at least once (before the car
// side is installed, or before 0085 is applied, the card simply does not exist). The page re-reads every 3 s while a request
// waits for the car and every 30 s otherwise, only while visible.
export default function CarGuestCard() {
  const [state, setState] = useState<CarGuestState | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  const load = useCallback(async () => {
    const s = await fetchCarGuest()
    setState(s)
    setNow(new Date())
    pendingRef.current = Boolean(s && s.allowed && s.request?.state === 'pending')
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let chain = 0 // a visibility change starts a new chain; a load still in flight from the old one does not reschedule
    const stop = () => {
      chain++
      if (timer) clearTimeout(timer)
      timer = null
    }
    const tick = () => {
      const mine = chain
      void load().then(() => {
        if (cancelled || mine !== chain || document.visibilityState !== 'visible') return
        timer = setTimeout(tick, pendingRef.current ? GUEST_POLL_PENDING_MS : GUEST_POLL_IDLE_MS)
      })
    }
    const onVisibility = () => {
      stop()
      if (document.visibilityState === 'visible') tick()
    }
    tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  if (!state || !state.allowed || !state.linked || !state.car) return null

  if (state.car.state === 'unsupported') {
    return (
      <Card>
        <CardTitle icon="🕶️">Modo invitado</CardTitle>
        <p className={styles.text}>{GUEST_UNSUPPORTED_TEXT}</p>
      </Card>
    )
  }

  const view = guestView({ lastSeenAt: state.lastSeenAt, car: state.car, request: state.request }, now)

  async function act(run: () => Promise<string | null>, question?: string) {
    if (question && !(await confirmDialog(question))) return
    setBusy(true)
    setError(null)
    const err = await run()
    if (err) setError(err)
    await load()
    setBusy(false)
  }

  return (
    <Card>
      <CardTitle icon="🕶️">Modo invitado</CardTitle>
      <p className={styles.text}>{GUEST_EXPLAINER}</p>
      <p className={styles.state} aria-live="polite">
        {view.title}
      </p>
      <p className={styles.detail}>{view.detail}</p>
      {view.note && (
        <p className={styles.note} role="status">
          {view.note}
        </p>
      )}
      {error && <Alert type="danger">{error}</Alert>}
      <div className={styles.actions}>
        {view.action && (
          <button
            type="button"
            className={view.action.on ? styles.primaryBtn : styles.secondaryBtn}
            disabled={busy}
            onClick={() => {
              const on = view.action!.on
              void act(() => setCarGuest(on), on ? GUEST_CONFIRM_ON : GUEST_CONFIRM_OFF)
            }}
          >
            {view.action.label}
          </button>
        )}
        {view.canCancel && (
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={busy}
            onClick={() => void act(cancelCarGuest)}
          >
            Cancelar pedido
          </button>
        )}
      </div>
      <p className={styles.footer}>{GUEST_FOOTER}</p>
    </Card>
  )
}
