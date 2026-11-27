import { useRef, useState } from 'react'
import {
  RECOVERY_WORD_COUNT,
  RecoveryCodeError,
  canonicalRecoveryCode,
  recoveryErrorMessage,
  splitRecoveryWords,
} from '../lib/vault/recoveryCode'
import { SECRET_INPUT_PROPS } from '../lib/vault/secretInput'
import styles from '../pages/VaultPage.module.css'
import formStyles from '../styles/formControls.module.css'

interface RecoveryWordsFormProps {
  busy: boolean
  /** Receives the field's text once it passes the check. The form stays open: the caller closes it. */
  onSave: (text: string) => void
  onCancel: () => void
}

// The field for the dashcam's 24 recovery words (specs/secret-vault.md R6),
// shared by the Bóveda and the post-pairing checklist. Checked while typing;
// the draft lives only here, so closing the form drops it.
export default function RecoveryWordsForm({ busy, onSave, onCancel }: RecoveryWordsFormProps) {
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const validation = useRef(0)

  function onChange(text: string) {
    setDraft(text)
    const id = ++validation.current
    if (!text.trim()) {
      setStatus(null)
      return
    }
    canonicalRecoveryCode(text).then(
      () => {
        if (validation.current === id) setStatus({ ok: true, text: 'Las 24 palabras pasan el control.' })
      },
      (error: unknown) => {
        if (validation.current !== id) return
        const count = splitRecoveryWords(text).length
        const typing =
          error instanceof RecoveryCodeError &&
          error.kind === 'wrong_word_count' &&
          count < RECOVERY_WORD_COUNT
        setStatus({
          ok: false,
          text: typing ? `${count} de ${RECOVERY_WORD_COUNT} palabras.` : recoveryErrorMessage(error),
        })
      }
    )
  }

  return (
    <div className={formStyles.field}>
      <label className={formStyles.label} htmlFor="vault-recovery-words">
        Las 24 palabras
      </label>
      <textarea
        id="vault-recovery-words"
        className={`${formStyles.input} ${formStyles.textarea} ${styles.mono}`}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="1 palabra 2 palabra 3 palabra…"
        aria-describedby="vault-recovery-status"
        {...SECRET_INPUT_PROPS}
      />
      <span
        id="vault-recovery-status"
        className={status && !status.ok ? formStyles.hintWarning : formStyles.hint}
      >
        {status?.text ?? 'Escribilas en el orden de los números, separadas por espacios o una por línea.'}
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => onSave(draft)}
          disabled={busy || !status?.ok}
        >
          Guardar en la bóveda
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
