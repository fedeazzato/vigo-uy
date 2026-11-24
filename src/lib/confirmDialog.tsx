// confirmDialog(): drop-in, promise-based replacement for window.confirm() (owner decision 2026-11-24, proposal 9). Renders
// ConfirmDialog into its own root on document.body, so it needs no provider and works from any handler:
//   if (!(await confirmDialog('¿Borrar este viaje? No se puede deshacer.'))) return
// The confirm button says what it does: the question's verb ("¿Borrar …?" → "Borrar"), or "Continuar" otherwise.
import { createRoot } from 'react-dom/client'
import ConfirmDialog from '../components/ConfirmDialog'

export interface ConfirmOptions {
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const DANGER_VERBS = ['Borrar', 'Eliminar', 'Quitar', 'Desconectar', 'Descartar', 'Suspender', 'Bloquear', 'Dejar']

/** The first "¿Verbo …?" in the text gives the label ("¿Borrar este service?" → "Borrar"); otherwise "Continuar". */
export function confirmLabelFor(message: string): string {
  const m = /¿\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(message)
  if (!m) return 'Continuar'
  const word = m[1]
  // Only verbs (infinitive, possibly with an enclitic: "Borrarlo", "Abrir"); "¿Seguro …?" etc. fall back.
  if (!/(ar|er|ir)(lo|la|los|las)?$/i.test(word)) return 'Continuar'
  const verb = word.replace(/(lo|la|los|las)$/i, '')
  return verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase()
}

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const confirmLabel = options.confirmLabel ?? confirmLabelFor(message)
  const danger = options.danger ?? DANGER_VERBS.includes(confirmLabel)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  return new Promise((resolve) => {
    const close = (ok: boolean) => {
      root.unmount()
      host.remove()
      resolve(ok)
    }
    root.render(
      <ConfirmDialog
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={options.cancelLabel ?? 'Cancelar'}
        danger={danger}
        onClose={close}
      />
    )
  })
}
