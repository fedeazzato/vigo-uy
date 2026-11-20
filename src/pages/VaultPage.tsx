import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardTitle, Alert } from '../components/UI'
import QrScanner from '../components/QrScanner'
import RecoveryWordsGrid from '../components/RecoveryWordsGrid'
import { useAuth } from '../context/AuthContext'
import { deleteVaultItem, fetchVault, type VaultSnapshot } from '../lib/vault/vaultApi'
import { detectPrfSupport, PRF_UNSUPPORTED_MESSAGE, type PrfSupport } from '../lib/vault/webauthn'
import {
  MAX_LABEL_LENGTH,
  deleteStoredItems,
  enrolPasskey,
  guessDeviceLabel,
  removePasskey,
  revealSecret,
  saveSecret,
  type VaultUser,
} from '../lib/vault/vault'
import {
  RECOVERY_WORD_COUNT,
  RecoveryCodeError,
  canonicalRecoveryCode,
  recoveryErrorMessage,
  splitRecoveryWords,
} from '../lib/vault/recoveryCode'
import { generatePassphrase, passphraseError } from '../lib/vault/passphrase'
import type { VaultPlaintext } from '../lib/vault/envelope'
import { formatTimestampDate } from '../lib/carLink'
import type { VaultItemKind, VaultItemRow, VaultKeyRow } from '../types'
import styles from './VaultPage.module.css'
import formStyles from '../styles/formControls.module.css'

// "Bóveda" (specs/secret-vault.md R6): the dashcam's 24 recovery words and
// the settings-backup passphrase, end-to-end encrypted with a key that only
// the owner's passkeys (WebAuthn PRF) can unwrap. Plaintext lives only in
// this page's state, only while needed: revealed values disappear after two
// minutes, when the page is hidden and on unmount; inputs are emptied after
// saving. Nothing here logs or sends a plaintext value.

const REVEAL_MS = 2 * 60 * 1000

// No spell check (Chrome's enhanced spell check sends text to Google), no
// autofill, no autocorrect, no password-manager prompts.
const SECRET_INPUT_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
} as const

const COPY_WARNING =
  'Copiado. Lo copiado queda en el portapapeles: otras apps pueden leerlo. Pegalo donde lo necesites y después copiá otra cosa.'

interface Shared {
  user: VaultUser
  keys: VaultKeyRow[]
  items: VaultItemRow[]
  /** False when the browser cannot do PRF: nothing that needs a passkey is offered. */
  prfUsable: boolean
  busy: boolean
  setBusy: (busy: boolean) => void
  reload: () => Promise<void>
  markUnsupported: () => void
}

/** A revealed secret that clears itself after REVEAL_MS and when the page is hidden. */
function useRevealed() {
  const [value, setValue] = useState<VaultPlaintext | null>(null)
  const clear = useCallback(() => setValue(null), [])
  useEffect(() => {
    if (value === null) return
    const timer = setTimeout(clear, REVEAL_MS)
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
  }, [value, clear])
  return [value, setValue, clear] as const
}

function useFeedback() {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const reset = useCallback(() => {
    setError(null)
    setMessage(null)
  }, [])
  return { error, message, setError, setMessage, reset }
}

function Feedback({ error, message }: { error: string | null; message: string | null }) {
  return (
    <>
      {error && <Alert type="danger">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
    </>
  )
}

async function copySecret(value: string): Promise<string | null> {
  try {
    await navigator.clipboard.writeText(value)
    return null
  } catch {
    return 'No se pudo copiar. Seleccioná el texto y copialo a mano.'
  }
}

function itemOf(items: VaultItemRow[], kind: VaultItemKind): VaultItemRow | undefined {
  return items.find((i) => i.kind === kind)
}

// ── Llaves de acceso ─────────────────────────────────────────────────────────

function KeysCard({ shared }: { shared: Shared }) {
  const { keys, items } = shared
  const [label, setLabel] = useState(() => guessDeviceLabel())
  const fb = useFeedback()
  const orphan = keys.length === 0 && items.length > 0

  async function enrol() {
    fb.reset()
    shared.setBusy(true)
    const result = await enrolPasskey(shared.user, label, keys)
    shared.setBusy(false)
    if (result.error) {
      fb.setError(result.error)
      if (result.error === PRF_UNSUPPORTED_MESSAGE) shared.markUnsupported()
      return
    }
    fb.setMessage(
      keys.length === 0
        ? '¡Listo! La bóveda quedó activada con esta llave.'
        : 'Llave agregada: desde ahora también abre la bóveda.'
    )
    await shared.reload()
  }

  async function remove(key: VaultKeyRow) {
    const last = keys.length === 1
    const question = last
      ? `¿Quitar «${key.label}», tu única llave? Sin llaves nadie puede abrir la bóveda, así que también se borra lo guardado (la frase de la dashcam y la clave de respaldo). La frase sigue en el auto y en tu papel.`
      : `¿Quitar «${key.label}»? Ese dispositivo ya no va a poder abrir la bóveda; tus otras llaves siguen funcionando.`
    if (!confirm(question)) return
    fb.reset()
    shared.setBusy(true)
    const result = await removePasskey(key, keys, items)
    shared.setBusy(false)
    if (result.error) {
      fb.setError(result.error)
      return
    }
    fb.setMessage(`«${key.label}» se quitó de la bóveda.`)
    await shared.reload()
  }

  async function wipe() {
    if (!confirm('¿Borrar lo guardado? Sin una llave no se puede abrir y no hay forma de recuperarlo.'))
      return
    fb.reset()
    shared.setBusy(true)
    const result = await deleteStoredItems(items)
    shared.setBusy(false)
    if (result.error) {
      fb.setError(result.error)
      return
    }
    fb.setMessage('Se borró lo guardado. Ya podés activar la bóveda de nuevo.')
    await shared.reload()
  }

  return (
    <Card>
      <CardTitle icon="🔑">Llaves de acceso</CardTitle>
      <Feedback error={fb.error} message={fb.message} />

      {orphan ? (
        <>
          <Alert type="danger">
            Hay datos guardados en la bóveda pero ninguna llave que los abra (se quitaron todas). No se pueden
            recuperar: borralos para empezar de nuevo. La frase de la dashcam sigue en el auto y en tu papel.
          </Alert>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={() => void wipe()}
            disabled={shared.busy}
          >
            Borrar lo guardado
          </button>
        </>
      ) : keys.length === 0 ? (
        <p className={styles.text}>
          La bóveda se abre con una <strong>llave de acceso</strong> (passkey) de tu teléfono: tu huella, tu
          rostro o el bloqueo de pantalla. No hay contraseña que recordar.
        </p>
      ) : (
        <ul className={styles.keyList} aria-label="Llaves de la bóveda">
          {keys.map((k) => (
            <li key={k.credential_id} className={styles.keyRow}>
              <span className={styles.keyInfo}>
                <span className={styles.keyName}>{k.label}</span>
                <span className={styles.meta}>Agregada el {formatTimestampDate(k.created_at)}</span>
              </span>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => void remove(k)}
                disabled={shared.busy}
                aria-label={`Quitar ${k.label}`}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {keys.length === 1 && (
        <Alert type="info">
          Tenés una sola llave. Agregá otra en otro dispositivo (otro teléfono, una tablet o una llave de
          seguridad): si perdés este, es la única forma de volver a abrir la bóveda.
        </Alert>
      )}

      {!orphan && shared.prfUsable && (
        <div className={styles.enrol}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="vault-key-label">
              Nombre de este dispositivo
            </label>
            <input
              id="vault-key-label"
              type="text"
              className={formStyles.input}
              value={label}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
            />
            <span className={formStyles.hint}>
              Así lo vas a ver en esta lista. No pongas datos personales.
            </span>
          </div>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void enrol()}
            disabled={shared.busy}
          >
            {keys.length === 0 ? 'Activar con huella o rostro' : 'Agregar otro dispositivo'}
          </button>
          {keys.length > 0 && (
            <p className={formStyles.hint}>
              Para sumar otro teléfono, abrí WikiVigo en ese teléfono con tu cuenta y tocá «Agregar otro
              dispositivo»: primero confirmás con una llave que ya funciona (si está en otro teléfono, el
              navegador muestra un QR para usarla) y después se crea la nueva.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Frase de recuperación de la dashcam ─────────────────────────────────────

function DashcamCard({ shared }: { shared: Shared }) {
  const item = itemOf(shared.items, 'dashcam_recovery')
  const [mode, setMode] = useState<'scan' | 'paste' | null>(null)
  const [draft, setDraft] = useState('')
  const [draftStatus, setDraftStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [revealed, setRevealed, hide] = useRevealed()
  const fb = useFeedback()
  const validation = useRef(0)
  const canUse = shared.prfUsable && shared.keys.length > 0

  function onDraftChange(text: string) {
    setDraft(text)
    const id = ++validation.current
    if (!text.trim()) {
      setDraftStatus(null)
      return
    }
    canonicalRecoveryCode(text).then(
      () => {
        if (validation.current === id) setDraftStatus({ ok: true, text: 'Las 24 palabras pasan el control.' })
      },
      (error: unknown) => {
        if (validation.current !== id) return
        const count = splitRecoveryWords(text).length
        const typing =
          error instanceof RecoveryCodeError &&
          error.kind === 'wrong_word_count' &&
          count < RECOVERY_WORD_COUNT
        setDraftStatus({
          ok: false,
          text: typing ? `${count} de ${RECOVERY_WORD_COUNT} palabras.` : recoveryErrorMessage(error),
        })
      }
    )
  }

  function closeDraft() {
    validation.current++
    setDraft('')
    setDraftStatus(null)
    setMode(null)
  }

  async function store(input: string, source: 'qr' | 'paste'): Promise<boolean> {
    let canonical: string
    try {
      canonical = await canonicalRecoveryCode(input)
    } catch (error) {
      fb.setError(recoveryErrorMessage(error))
      return false
    }
    if (item && !confirm('Ya hay una frase guardada. ¿Reemplazarla por esta?')) return false
    shared.setBusy(true)
    const result = await saveSecret(shared.user, shared.keys, 'dashcam_recovery', canonical, source)
    shared.setBusy(false)
    if (result.error) {
      fb.setError(result.error)
      return false
    }
    hide()
    fb.setMessage('Frase guardada cifrada en la bóveda.')
    await shared.reload()
    return true
  }

  async function onScanned(payload: string) {
    setMode(null)
    fb.reset()
    await store(payload, 'qr')
  }

  async function onSavePasted() {
    fb.reset()
    if (await store(draft, 'paste')) closeDraft()
  }

  async function reveal() {
    if (!item) return
    fb.reset()
    shared.setBusy(true)
    const result = await revealSecret(shared.user, shared.keys, item)
    shared.setBusy(false)
    if (result.error) fb.setError(result.error)
    else setRevealed(result.plaintext)
  }

  async function copy() {
    if (!revealed) return
    const error = await copySecret(revealed.value)
    if (error) fb.setError(error)
    else fb.setMessage(COPY_WARNING)
  }

  async function remove() {
    if (!confirm('¿Borrar la frase de la bóveda? Sigue en el auto (Ajustes, con el PIN) y en tu papel.'))
      return
    fb.reset()
    hide()
    shared.setBusy(true)
    const result = await deleteVaultItem('dashcam_recovery')
    shared.setBusy(false)
    if (result.error) fb.setError(result.error)
    else {
      fb.setMessage('La frase se borró de la bóveda.')
      await shared.reload()
    }
  }

  return (
    <Card>
      <CardTitle icon="📹">Frase de recuperación de la dashcam</CardTitle>
      <p className={styles.text}>
        Las 24 palabras que abren las grabaciones de la dashcam después de un reinicio de fábrica. El auto las
        muestra con un QR en el primer arranque y en <strong>Ajustes › Frase de recuperación</strong> (después
        del PIN).
      </p>
      <p className={styles.status}>
        {item
          ? `Guardada · última actualización el ${formatTimestampDate(item.updated_at)}`
          : 'Todavía no guardaste la frase.'}
      </p>
      <Feedback error={fb.error} message={fb.message} />

      {revealed && (
        <div className={styles.revealed}>
          <RecoveryWordsGrid words={revealed.value.split(' ')} />
          <span className={styles.meta}>
            Guardada el {formatTimestampDate(revealed.savedAt)}. Se oculta sola en 2 minutos.
          </span>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => void copy()}>
              Copiar
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={hide}>
              Ocultar
            </button>
          </div>
          <span className={formStyles.hint}>
            Copiar pone la frase en el portapapeles, donde otras apps pueden leerla.
          </span>
        </div>
      )}

      {mode === 'scan' && (
        <QrScanner onResult={(payload) => void onScanned(payload)} onCancel={() => setMode(null)} />
      )}

      {mode === 'paste' && (
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="vault-recovery-words">
            Las 24 palabras
          </label>
          <textarea
            id="vault-recovery-words"
            className={`${formStyles.input} ${formStyles.textarea} ${styles.mono}`}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={4}
            placeholder="1 palabra 2 palabra 3 palabra…"
            aria-describedby="vault-recovery-status"
            {...SECRET_INPUT_PROPS}
          />
          <span
            id="vault-recovery-status"
            className={draftStatus && !draftStatus.ok ? formStyles.hintWarning : formStyles.hint}
          >
            {draftStatus?.text ??
              'En orden, separadas por espacios o una por línea. También sirve el texto del QR.'}
          </span>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void onSavePasted()}
              disabled={shared.busy || !draftStatus?.ok}
            >
              Guardar en la bóveda
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={closeDraft}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              fb.reset()
              setMode('scan')
            }}
            disabled={!canUse || shared.busy}
          >
            Escanear el QR del auto
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              fb.reset()
              setMode('paste')
            }}
            disabled={!canUse || shared.busy}
          >
            Pegar las palabras
          </button>
          {item && !revealed && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void reveal()}
              disabled={!canUse || shared.busy}
            >
              Ver
            </button>
          )}
          {item && (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => void remove()}
              disabled={shared.busy}
            >
              Borrar
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Clave de respaldo de ajustes ─────────────────────────────────────────────

function PassphraseCard({ shared }: { shared: Shared }) {
  const item = itemOf(shared.items, 'settings_backup_passphrase')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed, hide] = useRevealed()
  const fb = useFeedback()
  const canUse = shared.prfUsable && shared.keys.length > 0

  async function store(value: string, source: 'generated' | 'typed'): Promise<boolean> {
    shared.setBusy(true)
    const result = await saveSecret(shared.user, shared.keys, 'settings_backup_passphrase', value, source)
    shared.setBusy(false)
    if (result.error) {
      fb.setError(result.error)
      return false
    }
    await shared.reload()
    return true
  }

  async function generate() {
    if (
      item &&
      !confirm(
        'Ya tenés una clave guardada. Si generás otra, la anterior se reemplaza y los respaldos cifrados con ella solo se abren con la anterior. ¿Generar una nueva?'
      )
    )
      return
    fb.reset()
    hide()
    const value = generatePassphrase()
    if (await store(value, 'generated')) {
      // Shown once right away so it can be copied or written on paper.
      setRevealed({ v: 1, value, source: 'generated', savedAt: new Date().toISOString() })
      fb.setMessage('Clave generada y guardada cifrada. Anotala también en papel.')
    }
  }

  async function saveExisting() {
    fb.reset()
    const problem = passphraseError(draft)
    if (problem) {
      fb.setError(problem)
      return
    }
    if (item && !confirm('Ya tenés una clave guardada. ¿Reemplazarla por esta?')) return
    if (await store(draft, 'typed')) {
      setDraft('')
      setEditing(false)
      fb.setMessage('Clave guardada cifrada en la bóveda.')
    }
  }

  async function reveal() {
    if (!item) return
    fb.reset()
    shared.setBusy(true)
    const result = await revealSecret(shared.user, shared.keys, item)
    shared.setBusy(false)
    if (result.error) fb.setError(result.error)
    else setRevealed(result.plaintext)
  }

  async function copy() {
    if (!revealed) return
    const error = await copySecret(revealed.value)
    if (error) fb.setError(error)
    else fb.setMessage(COPY_WARNING)
  }

  async function remove() {
    if (
      !confirm(
        '¿Borrar la clave de la bóveda? Si no la tenés anotada, los respaldos cifrados con ella no se van a poder abrir.'
      )
    )
      return
    fb.reset()
    hide()
    shared.setBusy(true)
    const result = await deleteVaultItem('settings_backup_passphrase')
    shared.setBusy(false)
    if (result.error) fb.setError(result.error)
    else {
      fb.setMessage('La clave se borró de la bóveda.')
      await shared.reload()
    }
  }

  return (
    <Card>
      <CardTitle icon="💾">Clave de respaldo de ajustes</CardTitle>
      <p className={styles.text}>
        La clave que pide <code>backup_car.ps1</code> en la notebook para cifrar la parte secreta del respaldo
        de ajustes del auto (y para abrirla con <code>-Diff</code> o <code>-Restore</code>). Anotala también
        en papel: sin ella esos respaldos no se abren.
      </p>
      <p className={styles.status}>
        {item
          ? `Guardada · última actualización el ${formatTimestampDate(item.updated_at)}`
          : 'Todavía no guardaste una clave.'}
      </p>
      <Feedback error={fb.error} message={fb.message} />

      {revealed && (
        <div className={styles.revealed}>
          <code className={styles.secret} aria-label="Clave de respaldo">
            {revealed.value}
          </code>
          <span className={styles.meta}>
            Guardada el {formatTimestampDate(revealed.savedAt)}. Se oculta sola en 2 minutos.
          </span>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => void copy()}>
              Copiar
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={hide}>
              Ocultar
            </button>
          </div>
          <span className={formStyles.hint}>
            Copiar pone la clave en el portapapeles, donde otras apps pueden leerla.
          </span>
        </div>
      )}

      {editing ? (
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="vault-passphrase">
            Tu clave actual
          </label>
          <input
            id="vault-passphrase"
            type="text"
            className={`${formStyles.input} ${styles.mono}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={400}
            {...SECRET_INPUT_PROPS}
          />
          <span className={formStyles.hint}>
            La misma que escribís en backup_car.ps1 (al menos 8 caracteres).
          </span>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void saveExisting()}
              disabled={shared.busy || draft.length === 0}
            >
              Guardar en la bóveda
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                setDraft('')
                setEditing(false)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void generate()}
            disabled={!canUse || shared.busy}
          >
            Generar una clave fuerte
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              fb.reset()
              setEditing(true)
            }}
            disabled={!canUse || shared.busy}
          >
            Guardar una que ya tengo
          </button>
          {item && !revealed && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void reveal()}
              disabled={!canUse || shared.busy}
            >
              Ver
            </button>
          )}
          {item && (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => void remove()}
              disabled={shared.busy}
            >
              Borrar
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const { user } = useAuth()
  const [support, setSupport] = useState<PrfSupport>('unknown')
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const result = await fetchVault()
    setSnapshot({ keys: result.keys, items: result.items })
    setLoadError(result.error)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    let cancelled = false
    void detectPrfSupport().then((s) => {
      if (!cancelled) setSupport(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const vaultUser = useMemo<VaultUser | null>(
    () => (user ? { id: user.id, name: user.email ?? 'WikiVigo' } : null),
    [user]
  )
  const markUnsupported = useCallback(() => setSupport('unsupported'), [])

  const shared: Shared | null =
    vaultUser && snapshot
      ? {
          user: vaultUser,
          keys: snapshot.keys,
          items: snapshot.items,
          prfUsable: support !== 'unsupported',
          busy,
          setBusy,
          reload,
          markUnsupported,
        }
      : null

  return (
    <div>
      <PageHeader
        title="🔐 Bóveda"
        subtitle="Secretos del auto cifrados de punta a punta: solo se abren con la huella, el rostro o el bloqueo de pantalla de tus dispositivos. WikiVigo guarda únicamente datos cifrados."
      />

      {support === 'unsupported' && <Alert type="warning">{PRF_UNSUPPORTED_MESSAGE}</Alert>}
      {loadError && <Alert type="danger">{loadError}</Alert>}

      {!shared ? (
        !loadError && <p className={formStyles.hint}>Cargando la bóveda…</p>
      ) : (
        <>
          <KeysCard shared={shared} />
          <DashcamCard shared={shared} />
          <PassphraseCard shared={shared} />
          <p className={styles.footnote}>
            Si perdés <strong>todas</strong> tus llaves, nadie puede abrir la bóveda, tampoco WikiVigo: así
            funciona el cifrado de punta a punta. La frase de la dashcam sigue en el auto (Ajustes, con el
            PIN) y en tu papel; la clave de respaldo, solo donde la hayas anotado.{' '}
            <Link to="/mi-vigo">Volver a Mi Vigo</Link>
          </p>
        </>
      )}
    </div>
  )
}
