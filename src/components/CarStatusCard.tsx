import { useEffect, useState } from 'react'
import { Card, CardTitle, StatGrid } from './UI'
import { describeCarStatus, fetchCarStatus } from '../lib/carStatus'
import type { CarStatus } from '../types'
import styles from './CarStatusCard.module.css'

// "Estado del auto" (specs/car-status-e1.md R4): the last snapshot the linked car sent when a trip or a charge ended while
// it was online. Shown only when a row exists for the member's vehicle (RLS); hidden otherwise, including before migration
// 0048 is applied. Never live, never a location.
export default function CarStatusCard() {
  const [status, setStatus] = useState<CarStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchCarStatus().then((s) => {
      if (!cancelled) setStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!status) return null
  const v = describeCarStatus(status)
  const stats = [
    v.battery && { value: v.battery, label: 'Batería' },
    v.range && { value: v.range, label: 'Autonomía' },
    v.plug && { value: v.plug, label: 'Cable' },
  ].filter((x): x is { value: string; label: string } => Boolean(x))

  return (
    <Card>
      <CardTitle icon="🔋">Estado del auto</CardTitle>
      {stats.length > 0 && <StatGrid stats={stats} />}
      <p className={styles.when}>Último dato {v.when}</p>
      <p className={styles.note}>Último dato que el auto envió con conexión; no es en vivo.</p>
    </Card>
  )
}
