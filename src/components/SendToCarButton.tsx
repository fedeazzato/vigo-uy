// B2 "Enviar al auto" (specs/car-navigate-b2.md R5): one button next to a station, a place or a trip stop. Shown only to a
// signed-in member whose vehicle has a linked car, and only in builds with VITE_CAR_REMOTE=1 (the E3 flag). A click opens a
// short confirmation with the delivery and driving notices (and a warning when the car reported its remote switch off);
// sending queues a `navigate` order that the car turns into Waze navigation.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CAR_REMOTE_ENABLED } from '../lib/carRemoteFlag'
import {
  DELIVERY_NOTICE,
  DRIVING_NOTICE,
  REMOTE_OFF_NOTICE,
  cleanLabel,
  fetchCarLink,
  sendDestination,
  validDestination,
  type CarLink,
} from '../lib/carNavigate'
import type { CarDestination } from '../lib/carRemote'
import { Alert } from './UI'
import styles from './SendToCarButton.module.css'

interface SendToCarButtonProps {
  destination: CarDestination
  /** Overrides the build flag (tests, or a page that already checked it). */
  enabled?: boolean
}

type Phase = 'idle' | 'confirm' | 'sending' | 'sent'

export default function SendToCarButton({ destination, enabled = CAR_REMOTE_ENABLED }: SendToCarButtonProps) {
  // Off builds render nothing and touch no context (maps are also rendered outside the auth provider in tests).
  if (!enabled) return null
  return <SendToCar destination={destination} />
}

function SendToCar({ destination }: { destination: CarDestination }) {
  const { status } = useAuth()
  const [link, setLink] = useState<CarLink | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const active = status === 'signedIn' && validDestination(destination)

  useEffect(() => {
    if (!active) return
    let alive = true
    void fetchCarLink().then((l) => {
      if (alive) setLink(l)
    })
    return () => {
      alive = false
    }
  }, [active])

  if (!active || !link?.hasCar) return null

  const label = cleanLabel(destination.label)
  const send = async () => {
    setPhase('sending')
    setError(null)
    const r = await sendDestination(destination)
    if (r.error) {
      setError(r.error)
      setPhase('confirm')
    } else {
      setPhase('sent')
    }
  }

  return (
    <div className={styles.wrap}>
      {phase === 'idle' && (
        <button type="button" className={styles.button} onClick={() => setPhase('confirm')}>
          🚗 Enviar al auto
        </button>
      )}
      {(phase === 'confirm' || phase === 'sending') && (
        <div className={styles.panel}>
          <p className={styles.dest}>Navegar a {label}</p>
          {link.remoteOn === false && <Alert type="warning">{REMOTE_OFF_NOTICE}</Alert>}
          <p className={styles.note}>{DELIVERY_NOTICE}</p>
          <p className={styles.note}>{DRIVING_NOTICE}</p>
          {error && <Alert type="danger">{error}</Alert>}
          <div className={styles.row}>
            <button type="button" className={styles.send} disabled={phase === 'sending'} onClick={send}>
              {phase === 'sending' ? 'Enviando…' : link.remoteOn === false ? 'Enviar igual' : 'Enviar'}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={phase === 'sending'}
              onClick={() => {
                setError(null)
                setPhase('idle')
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {phase === 'sent' && (
        <div className={styles.panel} role="status">
          <p className={styles.note}>
            Destino enviado. Seguí si el auto lo recibió en{' '}
            <Link to="/mi-vigo">Mi Vigo › Control remoto</Link>.
          </p>
        </div>
      )}
    </div>
  )
}
