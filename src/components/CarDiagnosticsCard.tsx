import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Card, CardTitle } from './UI'
import { fetchDiagnostics } from '../lib/carDiagnostics'
import styles from './CarDraftsCard.module.css'

// Mi Vigo entry to "Diagnósticos del auto" (specs/car-diagnostics.md R3): shown only when the table exists (migration 0051) and the
// caller can read at least one diagnostic (the vehicle's members; moderators see every vehicle's).
// `collapsible`: when given, the card sits inside a closed <details> with that summary text, and nothing at all (not even the empty
// section) is rendered while there are no diagnostics (owner 2026-11-24: "Más detalles" showed up empty).
export default function CarDiagnosticsCard({ collapsible, className }: { collapsible?: string; className?: string } = {}) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchDiagnostics().then((d) => {
      if (!cancelled) setCount(d?.length ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (count === 0) return null
  const card = (
    <Card>
      <CardTitle icon="🩺">Diagnósticos del auto</CardTitle>
      <p className={styles.text}>
        {count === 1 ? 'Hay un diagnóstico enviado' : `Hay ${count} diagnósticos enviados`} desde Mi Vigo en
        el auto, con los registros de las apps para analizar un problema.
      </p>
      <Link to="/mi-vigo/diagnosticos" className={styles.link}>
        Ver diagnósticos
      </Link>
    </Card>
  )
  if (!collapsible) return card
  return (
    <details className={className}>
      <summary>{collapsible}</summary>
      {card}
    </details>
  )
}
