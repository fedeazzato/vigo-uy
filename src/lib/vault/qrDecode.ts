// QR decoding of camera frames for the vault's scanner. BarcodeDetector where
// the browser has it (Chrome on Android); otherwise jsQR (Apache-2.0, pinned
// 1.4.0, bundled via npm), loaded with a dynamic import only when needed so
// it never ships in the main chunk. Frames stay in the page: nothing is sent.

export type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function barcodeDetectorCtor(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
}

async function nativeDecoder(): Promise<FrameDecoder | null> {
  const Ctor = barcodeDetectorCtor()
  if (!Ctor) return null
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code']
    if (!formats.includes('qr_code')) return null
    const detector = new Ctor({ formats: ['qr_code'] })
    return async (video) => {
      const codes = await detector.detect(video)
      return codes.length > 0 ? codes[0].rawValue : null
    }
  } catch {
    return null
  }
}

async function jsQrDecoder(): Promise<FrameDecoder> {
  const { default: jsQR } = await import('jsqr')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return (video) => {
    const width = video.videoWidth
    const height = video.videoHeight
    if (!context || width === 0 || height === 0) return Promise.resolve(null)
    // Downscale big frames: QR codes on the car screen are large, and jsQR's
    // cost grows with the pixel count.
    const scale = Math.min(1, 800 / Math.max(width, height))
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
    image.data.fill(0)
    return Promise.resolve(code ? code.data : null)
  }
}

/** Spanish message for a getUserMedia failure. */
export function cameraErrorMessage(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'No se pudo usar la cámara: permití el acceso a la cámara para este sitio, o pegá las palabras.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No encontramos una cámara en este dispositivo. Pegá las palabras.'
  if (name === 'NotReadableError') return 'Otra app está usando la cámara. Cerrala e intentá de nuevo.'
  return 'No se pudo abrir la cámara. Pegá las palabras.'
}

export async function createFrameDecoder(): Promise<FrameDecoder> {
  return (await nativeDecoder()) ?? (await jsQrDecoder())
}
