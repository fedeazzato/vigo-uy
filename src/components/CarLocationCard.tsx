import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Card, CardTitle } from './UI'
import {
  describeCarLocation,
  directionsUrl,
  fetchCarLocation,
  formatSpotTime,
  LOCATION_EMPTY_TEXT,
  LOCATION_POLL_MS,
  LOCATION_WAITING_TEXT,
  privacyNote,
  type CarLocationState,
} from '../lib/carLocation'
import { formatRelativeTime } from '../lib/format'
import { fetchCarLastSeen } from '../lib/carRemote'
import styles from './CarLocationCard.module.css'

const CarLocationMap = lazy(() => import('./CarLocationMap'))

// "Dónde está tu auto" (specs/car-location.md R5), right below "Tu auto ahora". Rendered only for the vehicle's creator and
// members with control (get_car_location answers allowed:false to everybody else: the database decides, this only hides) and
// only when a screen is linked. The owner turns it on in the car (Mi Vigo › Ajustes), never here. Re-read every
// LOCATION_POLL_MS while the page is visible. Gated by VITE_CAR_LOCATION at the call site (MyVigoPage).
export default function CarLocationCard() {
  const [state, setState] = useState<CarLocationState | null>(null)
  const [linked, setLinked] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const mapBox = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const load = () =>
      void Promise.all([fetchCarLocation(), fetchCarLastSeen()]).then(([s, l]) => {
        if (cancelled) return
        setState(s)
        setLinked(l !== null)
        setNow(new Date())
      })
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const start = () => {
      stop()
      load()
      timer = setInterval(load, LOCATION_POLL_MS)
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())
    if (document.visibilityState === 'visible') start()
    else load()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (!state || !state.allowed || !linked) return null

  const title = <CardTitle icon="📍">Dónde está tu auto</CardTitle>
  if (!state.mode)
    return (
      <Card>
        {title}
        <p className={styles.text}>{LOCATION_EMPTY_TEXT}</p>
      </Card>
    )

  const last = state.last
  const v = last && describeCarLocation(last, now)
  return (
    <Card>
      {title}
      {!last && <p className={styles.text}>{LOCATION_WAITING_TEXT}</p>}
      {last && v && (
        <>
          <p className={styles.state}>
            {v.state} · {v.when}
            {v.accuracy && <span className={styles.muted}> · {v.accuracy}</span>}
          </p>
          <div ref={mapBox}>
            <Suspense fallback={<div className={styles.mapLoading}>Cargando el mapa…</div>}>
              <CarLocationMap last={last} spots={state.spots} selected={selected} onSelect={setSelected} />
            </Suspense>
          </div>
          <p className={styles.actions}>
            <a href={directionsUrl(last)} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Cómo llegar
            </a>
          </p>
          <p className={styles.note}>Último dato que el auto envió con conexión; no es en vivo.</p>
        </>
      )}
      {state.mode === 'spots' && (
        // collapsed until asked for (owner 2026-11-27); a row shows that parking on the map
        <details className={styles.spots}>
          <summary className={styles.spotsTitle}>
            Estacionamientos de los últimos 7 días{state.spots.length > 0 && ` (${state.spots.length})`}
          </summary>
          {state.spots.length === 0 ? (
            <p className={styles.muted}>Todavía ninguno.</p>
          ) : (
            <ul className={styles.spotList}>
              {state.spots.map((s) => (
                <li key={s.observedAt}>
                  <button
                    type="button"
                    className={styles.spotButton}
                    aria-pressed={selected === s.observedAt}
                    onClick={() => {
                      setSelected(s.observedAt)
                      mapBox.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
                    }}
                  >
                    {formatSpotTime(s.observedAt)}{' '}
                    <span className={styles.muted}>· {formatRelativeTime(new Date(s.observedAt), now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      <p className={styles.note}>{privacyNote(state.mode)}</p>
    </Card>
  )
}
