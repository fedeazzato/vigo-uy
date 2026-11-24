import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle } from './UI'
import { fetchPendingDrafts } from '../lib/carTripDrafts'
import { fetchPendingChargeDrafts } from '../lib/carChargeDrafts'
import styles from './CarDraftsCard.module.css'

// Mi Vigo entry to "Borradores del auto" (specs/car-trip-drafts.md R3): shown only when the table exists (migration 0050)
// and the member's vehicle has at least one pending draft.
export default function CarDraftsCard() {
  const [count, setCount] = useState(0)
  const [charges, setCharges] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchPendingDrafts().then((d) => {
      if (!cancelled) setCount(d?.length ?? 0)
    })
    void fetchPendingChargeDrafts().then((d) => {
      if (!cancelled) setCharges(d?.length ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (count === 0 && charges === 0) return null
  return (
    <Card>
      <CardTitle icon="🚗">Borradores del auto</CardTitle>
      <p className={styles.text}>
        {count > 0 &&
          (count === 1
            ? 'Un viaje compartido desde el auto espera tu revisión. '
            : `${count} viajes compartidos desde el auto esperan tu revisión. `)}
        {charges > 0 &&
          (charges === 1
            ? 'Una carga registrada en el auto espera tu confirmación. '
            : `${charges} cargas registradas en el auto esperan tu confirmación. `)}
        Nada se publica hasta que lo confirmes.
      </p>
      <Link to="/mi-vigo/borradores" className={styles.link}>
        Revisar borradores
      </Link>
    </Card>
  )
}
