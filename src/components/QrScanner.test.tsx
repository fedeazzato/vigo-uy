import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SAMPLE_PAYLOAD } from '../lib/vault/testVectors'

const decoder = vi.hoisted(() => ({ frames: [] as (string | null)[] }))

vi.mock('../lib/vault/qrDecode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/vault/qrDecode')>()),
  createFrameDecoder: () => Promise.resolve(() => Promise.resolve(decoder.frames.shift() ?? null)),
}))

import QrScanner from './QrScanner'

let stop: ReturnType<typeof vi.fn>
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  stop = vi.fn()
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  decoder.frames = []
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
})

describe('QrScanner', () => {
  it('opens the back camera, ignores other QR codes, hands over the vault payload and stops the camera', async () => {
    decoder.frames = [null, 'https://example.com/otro-qr', SAMPLE_PAYLOAD]
    const onResult = vi.fn()
    render(<QrScanner onResult={onResult} onCancel={() => {}} />)
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(SAMPLE_PAYLOAD), { timeout: 3000 })
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' }, audio: false })
    expect(stop).toHaveBeenCalled()
    expect(onResult).toHaveBeenCalledTimes(1)
    // the payload itself is never rendered
    expect(document.body.textContent).not.toContain('rivup')
  })

  it('tells the user when a QR is not the dashcam one', async () => {
    decoder.frames = ['https://example.com']
    render(<QrScanner onResult={() => {}} onCancel={() => {}} />)
    await screen.findByText(/Ese QR no es el de la frase/)
  })

  it('shows a Spanish error when the camera is refused', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    render(<QrScanner onResult={() => {}} onCancel={() => {}} />)
    await screen.findByText(/permití el acceso a la cámara/)
    expect(screen.getByRole('button', { name: 'Volver' })).toBeTruthy()
  })

  it('without camera support says so', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    render(<QrScanner onResult={() => {}} onCancel={() => {}} />)
    await screen.findByText(/no puede usar la cámara/)
  })

  it('stops the camera when it is closed', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const view = render(<QrScanner onResult={() => {}} onCancel={() => {}} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await waitFor(() => expect(play).toHaveBeenCalled())
    view.unmount()
    expect(stop).toHaveBeenCalled()
  })
})
