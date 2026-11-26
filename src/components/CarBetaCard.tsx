import { useEffect, useState } from 'react'
import { Alert, Card, CardTitle } from './UI'
import {
  BETA_EXPLAINER,
  betaCardMode,
  fetchCarBeta,
  leaveCarBeta,
  requestCarBeta,
  type CarBetaState,
} from '../lib/carBeta'
import { fetchCarLastSeen } from '../lib/carRemote'
import styles from './CarBetaCard.module.css'

// "Probar versiones beta" (specs/car-updates.md "Pedir beta", migration 0084). Rendered only for the vehicle's creator and
// members with control (my_car_beta answers allowed:false to everybody else: the database decides, this only hides) and only
// when a screen is connected (beta is about the car's updater). Asking sends a request the release maintainer approves in
// Moderación; leaving (or cancelling a pending request) is immediate.
export default function CarBetaCard() {
  const [state, setState] = useState<CarBetaState | null>(null)
  const [linked, setLinked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchCarBeta(), fetchCarLastSeen()]).then(([s, l]) => {
      if (cancelled) return
      setState(s)
      setLinked(l !== null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!state || !state.allowed || !linked) return null

  async function act(p: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    const err = await p()
    if (err) setError(err)
    const next = await fetchCarBeta()
    if (next) setState(next)
    setBusy(false)
  }

  const mode = betaCardMode(state)
  const ask = (
    <button
      type="button"
      className={styles.primaryBtn}
      disabled={busy}
      onClick={() => void act(requestCarBeta)}
    >
      Quiero probar las versiones beta
    </button>
  )

  return (
    <Card>
      <CardTitle icon="🧪">Probar versiones beta</CardTitle>
      <p className={styles.text}>{BETA_EXPLAINER}</p>
      {error && <Alert type="danger">{error}</Alert>}
      {mode === 'beta' && (
        <>
          <p className={styles.state}>Tu auto está en beta.</p>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={busy}
            onClick={() => void act(leaveCarBeta)}
          >
            Salir de beta
          </button>
        </>
      )}
      {mode === 'pending' && (
        <>
          <p className={styles.state}>Pedido enviado. Te avisamos cuando lo revisemos.</p>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={busy}
            onClick={() => void act(leaveCarBeta)}
          >
            Cancelar pedido
          </button>
        </>
      )}
      {mode === 'rejected' && (
        <>
          <p className={styles.state}>Tu último pedido no fue aprobado esta vez. Podés volver a pedirlo.</p>
          {ask}
        </>
      )}
      {mode === 'none' && ask}
    </Card>
  )
}
