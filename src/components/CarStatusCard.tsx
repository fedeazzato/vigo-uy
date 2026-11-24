import { useEffect, useState } from 'react'
import { Card, CardTitle, StatGrid } from './UI'
import { describeCarStatus, fetchCarStatus, STATUS_POLL_MS } from '../lib/carStatus'
import { connectionLabel, fetchCarLastSeen, isOnline } from '../lib/carRemote'
import type { CarStatus } from '../types'
import CarUpdateInfo from './CarUpdateInfo'
import { useCarUpdateInfo } from '../lib/useCarUpdateInfo'
import styles from './CarStatusCard.module.css'

// "Tu auto ahora" (specs/car-status-e1.md R4; owner decision 2026-11-24 #2: one card for status + online/offline + last update):
// the only place the site shows the linked car's status (owner at the car
// 2026-11-22: "Control remoto" no longer repeats it). The newest snapshot the car sent (trip end, charge end, or a live row
// while it is on); for a fresh live row also the time to full (while charging) and the charge limit. Shown only when a row
// exists for the member's vehicle (RLS); hidden otherwise, including before migration 0048 is applied. Re-read every
// STATUS_POLL_MS while the page is visible so a live row stays current. Never a location. Below it, the car updater's
// status and the Google software notices (specs/car-updates.md R8, owner O6; hidden before migration 0059).
export default function CarStatusCard() {
  const [status, setStatus] = useState<CarStatus | null>(null)
  // null = no linked car (or not loaded yet). Control remoto keeps only its buttons.
  const [link, setLink] = useState<{ lastSeenAt: string | null } | null>(null)
  const [now, setNow] = useState(() => new Date())
  const updateInfo = useCarUpdateInfo()

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const load = () =>
      void Promise.all([fetchCarStatus(), fetchCarLastSeen()]).then(([s, l]) => {
        if (cancelled) return
        setStatus(s)
        setLink(l)
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

  const online = link ? isOnline(link.lastSeenAt, now) : false
  const connection = link && (
    <p className={styles.connection}>
      <span className={`${styles.dot} ${online ? styles.dotOn : ''}`} aria-hidden="true" />
      {connectionLabel(link.lastSeenAt, now)}
    </p>
  )

  if (!status && !updateInfo.update && !link) return null
  if (!status)
    return (
      <Card>
        <CardTitle icon="🔋">Tu auto ahora</CardTitle>
        {connection}
        <CarUpdateInfo {...updateInfo} />
      </Card>
    )
  const v = describeCarStatus(status, now)
  const stats = [
    v.battery && { value: v.battery, label: 'Batería' },
    v.range && { value: v.range, label: 'Autonomía' },
    v.plug && { value: v.plug, label: 'Cable' },
  ].filter((x): x is { value: string; label: string } => Boolean(x))

  return (
    <Card>
      <CardTitle icon="🔋">Tu auto ahora</CardTitle>
      {connection}
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
      <CarUpdateInfo {...updateInfo} />
    </Card>
  )
}
