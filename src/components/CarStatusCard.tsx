import { useEffect, useState } from 'react'
import { Card, CardTitle, StatGrid } from './UI'
import { describeCarStatus, fetchCarStatus, STATUS_POLL_MS } from '../lib/carStatus'
import type { CarStatus } from '../types'
import styles from './CarStatusCard.module.css'

// "Estado del auto" (specs/car-status-e1.md R4): the only place the site shows the linked car's status (owner at the car
// 2026-11-22: "Control remoto" no longer repeats it). The newest snapshot the car sent (trip end, charge end, or a live row
// while it is on); for a fresh live row also the time to full (while charging) and the charge limit. Shown only when a row
// exists for the member's vehicle (RLS); hidden otherwise, including before migration 0048 is applied. Re-read every
// STATUS_POLL_MS while the page is visible so a live row stays current. Never a location.
export default function CarStatusCard() {
  const [status, setStatus] = useState<CarStatus | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const load = () =>
      void fetchCarStatus().then((s) => {
        if (cancelled) return
        setStatus(s)
        setNow(new Date())
      })
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const start = () => {
      stop()
      load()
      timer = setInterval(load, STATUS_POLL_MS)
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

  if (!status) return null
  const v = describeCarStatus(status, now)
  const stats = [
    v.battery && { value: v.battery, label: 'Batería' },
    v.range && { value: v.range, label: 'Autonomía' },
    v.plug && { value: v.plug, label: 'Cable' },
  ].filter((x): x is { value: string; label: string } => Boolean(x))

  return (
    <Card>
      <CardTitle icon="🔋">Estado del auto</CardTitle>
      {stats.length > 0 && <StatGrid stats={stats} />}
      {(v.remain || v.limit) && (
        <div className={styles.live}>
          {v.remain && <p className={styles.liveLine}>{v.remain}</p>}
          {v.limit && <p className={styles.liveLine}>{v.limit}</p>}
        </div>
      )}
      <p className={styles.when}>Último dato {v.when}</p>
      <p className={styles.note}>
        {v.live
          ? 'El auto lo envía mientras está encendido y con internet.'
          : 'Último dato que el auto envió con conexión; no es en vivo.'}
      </p>
    </Card>
  )
}
