import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'

const sendOtp = vi.hoisted(() => vi.fn())

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    sendOtp,
    verifyOtp: vi.fn(),
    status: 'signedOut',
    passkeysSupported: false,
    signInWithPasskey: vi.fn(),
  }),
}))

// Stand-in for Cloudflare Turnstile: a button that hands over a token.
vi.mock('../components/TurnstileWidget', () => ({
  TURNSTILE_ENABLED: true,
  TurnstileWidget: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" data-testid="solve-captcha" onClick={() => onToken('tok-123')}>
      solve
    </button>
  ),
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
}

async function goToCodeStep() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } })
  fireEvent.click(screen.getByTestId('solve-captcha'))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  })
}

describe('LoginPage CAPTCHA gating (A3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sendOtp.mockReset()
    sendOtp.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('blocks the first send until the CAPTCHA is solved', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
    })
    expect(screen.getByText('Completá la verificación de seguridad.')).toBeTruthy()
    expect(sendOtp).not.toHaveBeenCalled()
  })

  it('sends the OTP with the token and moves to the code step', async () => {
    renderLogin()
    await goToCodeStep()
    expect(sendOtp).toHaveBeenCalledWith('ana@example.com', 'tok-123')
    expect(screen.getByLabelText('Código de verificación')).toBeTruthy()
  })

  it('keeps resend disabled during the cooldown and, after it, until a fresh token exists', async () => {
    renderLogin()
    await goToCodeStep()

    const resend = () => screen.getByRole<HTMLButtonElement>('button', { name: /Reenviar código/ })

    // Cooldown running: disabled with countdown label.
    expect(resend().disabled).toBe(true)
    expect(resend().textContent).toContain('(60s)')

    // Cooldown over, but the token was consumed by the first send: the
    // CAPTCHA gate keeps it disabled (this was the A3 bypass).
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(resend().textContent).toBe('Reenviar código')
    expect(resend().disabled).toBe(true)

    // Solving the code-step widget enables it.
    fireEvent.click(screen.getByTestId('solve-captcha'))
    expect(resend().disabled).toBe(false)
  })

  it('resends with the fresh token and restarts the cooldown', async () => {
    renderLogin()
    await goToCodeStep()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    fireEvent.click(screen.getByTestId('solve-captcha'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))
    })

    expect(sendOtp).toHaveBeenCalledTimes(2)
    expect(sendOtp).toHaveBeenLastCalledWith('ana@example.com', 'tok-123')
    // Tokens are single-use: cooldown restarted and gate closed again.
    const resend = screen.getByRole<HTMLButtonElement>('button', { name: /Reenviar código/ })
    expect(resend.disabled).toBe(true)
    expect(resend.textContent).toContain('(60s)')
  })
})
