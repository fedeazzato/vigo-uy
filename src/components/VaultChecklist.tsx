import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from './UI'
import QrScanner from './QrScanner'
import { useAuth } from '../context/AuthContext'
import { fetchVault, type VaultSnapshot } from '../lib/vault/vaultApi'
import { detectPrfSupport, PRF_UNSUPPORTED_MESSAGE, type PrfSupport } from '../lib/vault/webauthn'
import { enrolPasskey, guessDeviceLabel, saveSecret, type VaultUser } from '../lib/vault/vault'
import { canonicalRecoveryCode, recoveryErrorMessage } from '../lib/vault/recoveryCode'
import { generatePassphrase } from '../lib/vault/passphrase'
import type { VaultItemKind } from '../types'
import styles from './VaultChecklist.module.css'
import vaultStyles from '../pages/VaultPage.module.css'

// specs/vault-onboarding.md Phase B: right after "Vinculado", the three Bóveda
// steps in order (passkey -> backup passphrase -> dashcam words), each showing
// the real state read from the vault, each skippable ("Más tarde"). Nothing new
// is stored: the same vault calls as the Bóveda page, one passkey prompt per
// operation (secret-vault.md R1 "no caching"). A generated passphrase is shown
// once so it can be written down and disappears on hide/pagehide/unmount.

type Step = 'key' | 'passphrase' | 'dashcam'

const SHOW_MS = 2 * 60 * 1000

export default function VaultChecklist() {
  const { user } = useAuth()
  const [support, setSupport] = useState<PrfSupport>('unknown')
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<Step[]>([])
  const [scanning, setScanning] = useState(false)
  const [shown, setShown] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const r = await fetchVault()
    setSnapshot({ keys: r.keys, items: r.items })
    setLoadError(r.error)
  }, [])

  useEffect(() => {
    void reload()
    let cancelled = false
    void detectPrfSupport().then((s) => {
      if (!cancelled) setSupport(s)
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  // The generated passphrase is visible only briefly (like the Bóveda's reveal).
  useEffect(() => {
    if (shown === null) return
    const clear = () => setShown(null)
    const timer = setTimeout(clear, SHOW_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') clear()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', clear)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', clear)
    }
  }, [shown])

  const vaultUser = useMemo<VaultUser | null>(
    () => (user ? { id: user.id, name: user.email ?? 'WikiVigo' } : null),
    [user]
  )

  if (!vaultUser) return null
  if (!snapshot) {
    return loadError ? <Alert type="warning">{loadError}</Alert> : <p className={styles.hint}>Cargando la bóveda…</p>
  }

  const keys = snapshot.keys
  const has = (kind: VaultItemKind) => snapshot.items.some((i) => i.kind === kind)
  const done: Record<Step, boolean> = {
    key: keys.length > 0,
    passphrase: has('settings_backup_passphrase'),
    dashcam: has('dashcam_recovery'),
  }
  const unsupported = support === 'unsupported'
  const isSkipped = (s: Step) => skipped.includes(s)
  const skip = (s: Step) => setSkipped((prev) => (prev.includes(s) ? prev : [...prev, s]))
  const allDone = done.key && done.passphrase && done.dashcam
  const user_ = vaultUser

  async function enrol() {
    setError(null)
    setBusy(true)
    const r = await enrolPasskey(user_, guessDeviceLabel(), keys)
    setBusy(false)
    if (r.error) {
      setError(r.error)
      if (r.error === PRF_UNSUPPORTED_MESSAGE) setSupport('unsupported')
      return
    }
    await reload()
  }

  async function generate() {
    setError(null)
    const value = generatePassphrase()
    setBusy(true)
    const r = await saveSecret(user_, keys, 'settings_backup_passphrase', value, 'generated')
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setShown(value)
    await reload()
  }

  async function onScanned(payload: string) {
    setScanning(false)
    setError(null)
    let canonical: string
    try {
      canonical = await canonicalRecoveryCode(payload)
    } catch (e) {
      setError(recoveryErrorMessage(e))
      return
    }
    setBusy(true)
    const r = await saveSecret(user_, keys, 'dashcam_recovery', canonical, 'qr')
    setBusy(false)
    if (r.error) {
      setError(r.error)
      return
    }
    await reload()
  }

  async function copy() {
    if (!shown) return
    try {
      await navigator.clipboard.writeText(shown)
    } catch {
      setError('No se pudo copiar. Seleccioná el texto y copialo a mano.')
    }
  }

  function state(s: Step): string {
    if (done[s]) return 'Listo'
    if (isSkipped(s)) return 'Pendiente: lo encontrás en la Bóveda'
    return 'Por hacer'
  }

  return (
    <section className={styles.checklist} aria-label="Bóveda: próximos pasos">
      <h3 className={styles.title}>🔐 Guardá los secretos del auto en tu Bóveda</h3>
      <p className={styles.hint}>
        Tres pasos opcionales, cifrados de punta a punta: solo se abren con la huella, el rostro o el bloqueo de
        pantalla de tus dispositivos.
      </p>
      {unsupported && <Alert type="warning">{PRF_UNSUPPORTED_MESSAGE}</Alert>}
      {error && <Alert type="danger">{error}</Alert>}

      <ol className={styles.steps}>
        <li className={styles.step} data-done={done.key || undefined}>
          <div className={styles.head}>
            <span className={styles.name}>1. Llave de acceso</span>
            <span className={styles.state}>{state('key')}</span>
          </div>
          {!done.key && !isSkipped('key') && !unsupported && (
            <>
              <p className={styles.hint}>Activa la bóveda con la huella, el rostro o el bloqueo de pantalla de este teléfono.</p>
              <div className={vaultStyles.actions}>
                <button type="button" className={vaultStyles.primaryBtn} onClick={() => void enrol()} disabled={busy}>
                  Activar con huella o rostro
                </button>
                <button type="button" className={vaultStyles.secondaryBtn} onClick={() => skip('key')}>
                  Más tarde
                </button>
              </div>
            </>
          )}
          {done.key && keys.length === 1 && (
            <p className={styles.hint}>Más adelante agregá una segunda llave en otro dispositivo desde la Bóveda.</p>
          )}
        </li>

        <li className={styles.step} data-done={done.passphrase || undefined}>
          <div className={styles.head}>
            <span className={styles.name}>2. Clave de respaldo de ajustes</span>
            <span className={styles.state}>{state('passphrase')}</span>
          </div>
          {shown && (
            <div className={vaultStyles.revealed}>
              <code className={vaultStyles.secret} aria-label="Clave de respaldo generada">
                {shown}
              </code>
              <span className={vaultStyles.meta}>Anotala también en papel. Se oculta sola en 2 minutos.</span>
              <div className={vaultStyles.actions}>
                <button type="button" className={vaultStyles.secondaryBtn} onClick={() => void copy()}>
                  Copiar
                </button>
                <button type="button" className={vaultStyles.secondaryBtn} onClick={() => setShown(null)}>
                  Ya la anoté
                </button>
              </div>
            </div>
          )}
          {!done.passphrase && !isSkipped('passphrase') && !unsupported && (
            <>
              <p className={styles.hint}>
                La clave que pide el respaldo de ajustes del auto en la notebook. ¿Ya tenés una? Guardala desde la{' '}
                <Link to="/mi-vigo/boveda">Bóveda</Link>.
              </p>
              <div className={vaultStyles.actions}>
                <button
                  type="button"
                  className={vaultStyles.primaryBtn}
                  onClick={() => void generate()}
                  disabled={busy || !done.key}
                >
                  Generar una clave fuerte
                </button>
                <button type="button" className={vaultStyles.secondaryBtn} onClick={() => skip('passphrase')}>
                  Más tarde
                </button>
              </div>
              {!done.key && <p className={styles.hint}>Primero activá la llave de acceso (paso 1).</p>}
            </>
          )}
        </li>

        <li className={styles.step} data-done={done.dashcam || undefined}>
          <div className={styles.head}>
            <span className={styles.name}>3. Frase de recuperación de la dashcam</span>
            <span className={styles.state}>{state('dashcam')}</span>
          </div>
          {!done.dashcam && !isSkipped('dashcam') && !unsupported && (
            <>
              <p className={styles.hint}>
                En el auto: <strong>Dashcam › Ajustes › Frase de recuperación</strong> (después del PIN) y escaneá el QR
                que muestra el auto. Si todavía no instalaste la Dashcam, dejalo para más tarde.
              </p>
              {scanning ? (
                <QrScanner onResult={(p) => void onScanned(p)} onCancel={() => setScanning(false)} />
              ) : (
                <div className={vaultStyles.actions}>
                  <button
                    type="button"
                    className={vaultStyles.primaryBtn}
                    onClick={() => {
                      setError(null)
                      setScanning(true)
                    }}
                    disabled={busy || !done.key}
                  >
                    Escanear el QR del auto
                  </button>
                  <button type="button" className={vaultStyles.secondaryBtn} onClick={() => skip('dashcam')}>
                    Todavía no tengo la Dashcam
                  </button>
                </div>
              )}
              {!done.key && <p className={styles.hint}>Primero activá la llave de acceso (paso 1).</p>}
            </>
          )}
        </li>
      </ol>

      {allDone && <Alert type="success">Todo listo: la bóveda tiene tu llave, la clave de respaldo y la frase.</Alert>}
      <Link to="/mi-vigo/boveda" className={styles.vaultLink}>
        Ir a la Bóveda
      </Link>
    </section>
  )
}
