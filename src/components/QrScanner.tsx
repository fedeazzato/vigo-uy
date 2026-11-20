import { useEffect, useRef, useState } from 'react'
import { cameraErrorMessage, createFrameDecoder } from '../lib/vault/qrDecode'
import { isVaultPayload } from '../lib/vault/recoveryCode'
import styles from './QrScanner.module.css'

// Camera QR scanner for the Bóveda (specs/secret-vault.md R6). Frames are
// decoded in the page (BarcodeDetector or jsQR) and never leave the device;
// the camera stops on a result, on cancel, on error and on unmount. Only a
// `vigovault:` payload is handed to the parent (the text is never rendered).

const SCAN_INTERVAL_MS = 250

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

interface QrScannerProps {
  onResult: (payload: string) => void
  onCancel: () => void
}

export default function QrScanner({ onResult, onCancel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  const [error, setError] = useState<string | null>(null)
  const [otherCode, setOtherCode] = useState(false)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    const video = videoRef.current
    let stream: MediaStream | null = null
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no puede usar la cámara acá. Pegá las palabras.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch (e) {
        if (!stopped) setError(cameraErrorMessage(e))
        return
      }
      if (stopped || !video) {
        stopStream(stream)
        return
      }
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // autoplay may refuse until the stream has a frame; decoding still works
      }
      const decode = await createFrameDecoder()
      const tick = async () => {
        if (stopped) return
        try {
          const text = await decode(video)
          if (stopped) return
          if (text && isVaultPayload(text)) {
            stopped = true
            stopStream(stream)
            video.srcObject = null
            onResultRef.current(text)
            return
          }
          if (text) setOtherCode(true)
        } catch {
          // a frame that cannot be read; keep scanning
        }
        timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS)
      }
      void tick()
    }

    void start()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stopStream(stream)
      if (video) video.srcObject = null
    }
  }, [])

  return (
    <div className={styles.scanner}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <>
          <video ref={videoRef} className={styles.video} muted playsInline aria-label="Vista de la cámara" />
          <p className={styles.hint}>
            {otherCode
              ? 'Ese QR no es el de la frase. En el auto abrí Dashcam › Ajustes › Frase de recuperación.'
              : 'Apuntá la cámara al QR que muestra el auto (Dashcam › Ajustes › Frase de recuperación).'}
          </p>
        </>
      )}
      <button type="button" className={styles.cancelBtn} onClick={onCancel}>
        {error ? 'Volver' : 'Cancelar'}
      </button>
    </div>
  )
}
