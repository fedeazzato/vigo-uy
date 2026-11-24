import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import styles from './ConfirmDialog.module.css'

export interface ConfirmDialogProps {
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  onClose: (confirmed: boolean) => void
}

// Accessible confirm dialog: role="alertdialog", aria-modal, focus starts on the safe button (Cancelar) and is trapped between
// the two buttons, Esc or a tap outside cancels, and focus goes back to where it was. Opened through lib/confirmDialog.tsx.
export default function ConfirmDialog({ message, confirmLabel, cancelLabel, danger, onClose }: ConfirmDialogProps) {
  const id = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose(false)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
      next?.focus()
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-describedby={`${id}-msg`}
        aria-label="Confirmar"
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <p id={`${id}-msg`} className={styles.message}>
          {message}
        </p>
        <div className={styles.buttons}>
          <button ref={cancelRef} type="button" className={styles.cancel} onClick={() => onClose(false)}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? styles.danger : styles.confirm}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
