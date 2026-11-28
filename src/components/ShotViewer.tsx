// A screenshot shown as a thumbnail that opens large over the page (never in another tab). A tap on the large picture
// switches between fitting the screen and full size (pan by scrolling): the car screen is 1920 wide, small text on a phone.
import { useCallback, useState } from 'react'
import { useEscapeToClose } from '../lib/useEscapeToClose'
import { Icon } from './Icon'
import styles from './ShotViewer.module.css'

interface ShotViewerProps {
  src: string
  alt: string
  width: number
  height: number
}

export default function ShotViewer({ src, alt, width, height }: ShotViewerProps) {
  const [open, setOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    setZoomed(false)
  }, [])
  useEscapeToClose(open, close)

  return (
    <>
      <button type="button" className={styles.thumb} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <img className={styles.shot} src={src} alt={alt} width={width} height={height} loading="lazy" />
      </button>
      {open && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={alt}>
          <button type="button" className={styles.close} onClick={close} aria-label="Cerrar imagen" autoFocus>
            <Icon name="close" size={24} />
          </button>
          {/* a tap outside the picture closes */}
          <div className={styles.scroll} onClick={(e) => e.target === e.currentTarget && close()}>
            <button
              type="button"
              className={zoomed ? `${styles.big} ${styles.zoomed}` : styles.big}
              onClick={() => setZoomed((z) => !z)}
              aria-label={zoomed ? 'Achicar' : 'Agrandar'}
              aria-pressed={zoomed}
            >
              <img src={src} alt="" width={width} height={height} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
