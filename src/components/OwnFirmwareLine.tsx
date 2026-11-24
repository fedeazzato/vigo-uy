// Mi Vigo keeps one line about the car's head-unit software (owner decision 2026-11-24 #7); the community table of versions
// (FirmwareCard) lives on Novedades. Hidden until the car reported its version (or before migration 0056).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOwnFirmware } from '../lib/carFirmware'
import styles from './accountCards.module.css'

export default function OwnFirmwareLine() {
  const [mine, setMine] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void fetchOwnFirmware().then((v) => {
      if (alive) setMine(v)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!mine) return null
  return (
    <p className={styles.blockText}>
      🧩 Tu pantalla: versión <code>{mine}</code> — <Link to="/novedades">¿hay una más nueva?</Link>
    </p>
  )
}
