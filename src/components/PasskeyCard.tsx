import { useState } from 'react'
import { Card, CardTitle } from './UI'
import { useAuth } from '../context/AuthContext'
import styles from './accountCards.module.css'

// "Acceso rápido" (passkey), moved from Mis registros to Mi Vigo › Tu cuenta (owner decision 2026-11-24, proposal 10). Once the
// user registers a passkey (or says "Ahora no"), it stops showing on every visit; the key is the one the old prompt used.
const PASSKEY_PROMPT_KEY = 'vigo-passkey-prompt-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(PASSKEY_PROMPT_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(PASSKEY_PROMPT_KEY, '1')
  } catch {
    // private mode: the prompt just shows again next time
  }
}

export default function PasskeyCard() {
  const { passkeysSupported, registerPasskey } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!passkeysSupported || (dismissed && !message)) return null

  async function register() {
    setRegistering(true)
    setMessage(null)
    const { error } = await registerPasskey()
    setRegistering(false)
    setMessage(
      error
        ? 'No pudimos crear la llave de acceso. Probá de nuevo; mientras tanto, entrás con el código por email.'
        : 'Llave de acceso registrada. La próxima vez podés entrar sin código.'
    )
    if (!error) writeDismissed()
  }

  function dismiss() {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <Card>
      <CardTitle icon="🔑">Acceso rápido</CardTitle>
      <p className={styles.blockText} role={message ? 'status' : undefined}>
        {message ?? 'Entrá sin esperar el código por email: usá la huella, la cara o el PIN de este dispositivo.'}
      </p>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryBtn} onClick={() => void register()} disabled={registering}>
          {registering ? 'Registrando…' : 'Entrar con tu huella o tu cara'}
        </button>
        {!message && (
          <button type="button" className={styles.removeLink} onClick={dismiss}>
            Ahora no
          </button>
        )}
      </div>
    </Card>
  )
}
