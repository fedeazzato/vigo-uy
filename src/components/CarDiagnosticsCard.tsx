import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle } from './UI'
import { fetchDiagnostics } from '../lib/carDiagnostics'
import styles from './CarDraftsCard.module.css'

// Mi Vigo entry to "Diagnósticos del auto" (specs/car-diagnostics.md R3): shown only when the table exists (migration 0051) and the
// caller can read at least one diagnostic (the vehicle's members; moderators see every vehicle's).
export default function CarDiagnosticsCard() {
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
  return (
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
}
