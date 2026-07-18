import { useState, useEffect, FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { TurnstileWidget, TURNSTILE_ENABLED } from '../components/TurnstileWidget'
import { useAuth } from '../context/AuthContext'
import { toFriendlyError } from '../lib/errors'
import styles from './LoginPage.module.css'
import formStyles from '../styles/formControls.module.css'

const RESEND_COOLDOWN_SECONDS = 60

type Step = 'email' | 'code'

export default function LoginPage() {
  const { sendOtp, verifyOtp, status, passkeysSupported, signInWithPasskey } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Where RequireAuth bounced the user from, if anywhere; go back there
  // after signing in instead of always landing on Mi actividad.
  const from = (location.state as { from?: string } | null)?.from

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [passkeyPending, setPasskeyPending] = useState(false)

  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)

  useEffect(() => {
    if (status === 'signedIn') navigate(from ?? '/mi-actividad', { replace: true })
  }, [status, navigate, from])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault()
    const value = emailInput.trim()
    if (!value) return
    if (TURNSTILE_ENABLED && !captchaToken) {
      setError('Completá la verificación de seguridad.')
      return
    }

    setSubmitting(true)
    setError(null)
    const { error } = await sendOtp(value, captchaToken)
    setSubmitting(false)
    setCaptchaToken(null)
    setTurnstileKey((k) => k + 1)

    if (error) {
      setError(toFriendlyError(error))
      return
    }
    setEmail(value)
    setCodeInput('')
    setStep('code')
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    const code = codeInput.trim()
    if (!code) return

    setSubmitting(true)
    setError(null)
    const { error } = await verifyOtp(email, code)
    setSubmitting(false)

    if (error) setError(toFriendlyError(error))
  }

  async function handlePasskeySignIn() {
    setPasskeyPending(true)
    setError(null)
    const { error } = await signInWithPasskey()
    setPasskeyPending(false)
    // On success, the auth state listener flips `status` to 'signedIn' and
    // the redirect effect above takes over — nothing else to do here.
    if (error) setError('No se pudo iniciar sesión con la llave de acceso. Probá con el código por email.')
  }

  async function handleResend() {
    if (cooldown > 0) return
    // Resend goes through the same CAPTCHA gate as the first send — otherwise
    // it would be a Turnstile bypass (or always fail if Supabase enforces
    // CAPTCHA server-side).
    if (TURNSTILE_ENABLED && !captchaToken) return
    setSubmitting(true)
    setError(null)
    const { error } = await sendOtp(email, captchaToken)
    setSubmitting(false)
    // Turnstile tokens are single-use: clear it and remount the widget so the
    // next resend needs a fresh one.
    setCaptchaToken(null)
    setTurnstileKey((k) => k + 1)
    if (error) setError(toFriendlyError(error))
    else setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div>
      <PageHeader
        title="🔑 Iniciar sesión"
        subtitle="Sin contraseña: te enviamos un código por email."
      />

      <Card>
        {from && status !== 'signedIn' && (
          <Alert type="info">Para esa sección necesitás iniciar sesión. Es rápido: solo tu email.</Alert>
        )}
        {error && <Alert type="danger">{error}</Alert>}

        {step === 'email' && passkeysSupported && (
          <>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handlePasskeySignIn}
              disabled={passkeyPending}
            >
              {passkeyPending ? 'Verificando…' : '🔑 Iniciar sesión con llave de acceso'}
            </button>
            <p className={styles.divider}>o con tu email</p>
          </>
        )}

        {step === 'email' ? (
          <form className={styles.form} onSubmit={handleSendOtp}>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              className={formStyles.input}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="tu@email.com"
              autoFocus
              disabled={submitting}
            />
            {TURNSTILE_ENABLED && <TurnstileWidget key={turnstileKey} onToken={setCaptchaToken} />}
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleVerifyOtp}>
            <p className={styles.hint}>
              Enviamos un código de 8 dígitos a <strong>{email}</strong>. Si no llega en un
              minuto, revisá la carpeta de spam.
            </p>
            <label className={styles.label} htmlFor="login-code">Código de verificación</label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              className={`${formStyles.input} ${styles.codeInput}`}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="12345678"
              autoFocus
              disabled={submitting}
            />
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Verificando…' : 'Verificar'}
            </button>
            {TURNSTILE_ENABLED && <TurnstileWidget key={turnstileKey} onToken={setCaptchaToken} />}
            {/* Explain the disabled resend button instead of leaving it mute. */}
            {TURNSTILE_ENABLED && !captchaToken && cooldown === 0 && (
              <p className={styles.hint}>
                Para reenviar el código, primero completá la verificación de seguridad de arriba.
              </p>
            )}
            <div className={styles.secondaryActions}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={handleResend}
                disabled={submitting || cooldown > 0 || (TURNSTILE_ENABLED && !captchaToken)}
              >
                {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => { setStep('email'); setError(null) }}
                disabled={submitting}
              >
                Cambiar email
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
