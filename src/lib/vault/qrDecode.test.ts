import { describe, it, expect, vi, afterEach } from 'vitest'
import { SAMPLE_PAYLOAD } from './testVectors'

const jsqr = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('jsqr', () => ({ default: jsqr.fn }))

import { cameraErrorMessage, createFrameDecoder } from './qrDecode'

function fakeVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { value: 1280 })
  Object.defineProperty(video, 'videoHeight', { value: 720 })
  return video
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  jsqr.fn.mockReset()
})

describe('createFrameDecoder', () => {
  it('uses BarcodeDetector (qr_code) when the browser has it', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: SAMPLE_PAYLOAD }])
    const ctor = vi.fn()
    class FakeBarcodeDetector {
      static getSupportedFormats = () => Promise.resolve(['ean_13', 'qr_code'])
      constructor(options: unknown) {
        ctor(options)
      }
      detect = detect
    }
    vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector)
    const decode = await createFrameDecoder()
    expect(await decode(fakeVideo())).toBe(SAMPLE_PAYLOAD)
    expect(ctor).toHaveBeenCalledWith({ formats: ['qr_code'] })
    expect(jsqr.fn).not.toHaveBeenCalled()
  })

  it('falls back to jsQR (downscaled frame) without BarcodeDetector, or without its qr_code format', async () => {
    class NoQrDetector {
      static getSupportedFormats = () => Promise.resolve(['ean_13'])
    }
    vi.stubGlobal('BarcodeDetector', NoQrDetector)
    const image = { data: new Uint8ClampedArray(16).fill(9), width: 800, height: 450 }
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => image) }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    )
    jsqr.fn.mockReturnValue({ data: SAMPLE_PAYLOAD })
    const decode = await createFrameDecoder()
    expect(await decode(fakeVideo())).toBe(SAMPLE_PAYLOAD)
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 450)
    expect(jsqr.fn).toHaveBeenCalledWith(image.data, 800, 450, { inversionAttempts: 'attemptBoth' })
    // the frame buffer is wiped after decoding
    expect(Array.from(image.data).every((b) => b === 0)).toBe(true)
  })

  it('returns null when jsQR finds nothing', async () => {
    vi.stubGlobal('BarcodeDetector', undefined)
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    )
    jsqr.fn.mockReturnValue(null)
    const decode = await createFrameDecoder()
    expect(await decode(fakeVideo())).toBeNull()
  })
})

describe('cameraErrorMessage', () => {
  it('maps getUserMedia errors to Spanish', () => {
    expect(cameraErrorMessage(new DOMException('x', 'NotAllowedError'))).toMatch(/permití el acceso/)
    expect(cameraErrorMessage(new DOMException('x', 'NotFoundError'))).toMatch(/No encontramos una cámara/)
    expect(cameraErrorMessage(new DOMException('x', 'NotReadableError'))).toMatch(/Otra app/)
    expect(cameraErrorMessage(new Error('x'))).toMatch(/No se pudo abrir la cámara/)
  })
})
