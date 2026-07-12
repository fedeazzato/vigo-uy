import { useEffect, useState } from 'react'
import styles from './OfflineBanner.module.css'

// Slim fixed banner shown while the browser is offline. The PWA shell and
// curated JSON keep working offline; this explains why community sections
// don't load.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null
  return (
    <div className={styles.banner} role="status">
      📡 Sin conexión — mostrando solo la guía
    </div>
  )
}
