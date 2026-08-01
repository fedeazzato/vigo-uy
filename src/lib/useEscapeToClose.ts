import { useEffect } from 'react'

// Closes a modal/overlay on Escape while it's open. Shared by SiteSearch and
// TripMap so both dialogs behave identically.
export function useEscapeToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
}
