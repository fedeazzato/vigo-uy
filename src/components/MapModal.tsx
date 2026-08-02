// Shared backdrop/panel/header chrome for full-map modals (TripMap,
// StationsMap): both need the same dialog scaffolding around different map
// content, so only the body is left to the caller.
import { ReactNode } from 'react'
import { useEscapeToClose } from '../lib/useEscapeToClose'
import styles from './MapModal.module.css'

interface MapModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  ariaLabel: string
  children: ReactNode
}

export default function MapModal({ open, onClose, title, ariaLabel, children }: MapModalProps) {
  useEscapeToClose(open, onClose)

  if (!open) return null

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-label={ariaLabel}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>{title}</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Cerrar mapa">
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
