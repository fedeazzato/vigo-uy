import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { ChEdit } from '../lib/chameleon/ChEdit'
import { TurnstileWidget, TURNSTILE_ENABLED } from '../components/TurnstileWidget'
import { useAuth } from '../context/AuthContext'
import styles from './LoginPage.module.css'
import formStyles from '../styles/formControls.module.css'

const RESEND_COOLDOWN_SECONDS = 60

type Step = 'email' | 'code'

export default function LoginPage() {
  const { sendOtp, verifyOtp, status, passkeysSupported, signInWithPasskey } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [passkeyPending, setPasskeyPending] = useState(false)

  // ch-edit must be used as a controlled component: it resets its displayed
  // value to its own `value` prop whenever the native input fails HTML5
  // validity (e.g. any incomplete type="email" text) — left uncontrolled,
  // that prop stays `undefined` forever and every such reset shows the
  // literal string "undefined" instead of what was typed.
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)

  useEffect(() => {
    if (status === 'signedIn') navigate('/mi-actividad', { replace: true })
  }, [status, navigate])

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
      setError(error.message)
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

    if (error) setError(error.message)
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
    setSubmitting(true)
    setError(null)
    const { error } = await sendOtp(email)
    setSubmitting(false)
    if (error) setError(error.message)
    else setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div>
      <PageHeader
        title="🔑 Iniciar sesión"
        subtitle="Sin contraseña: te enviamos un código por email."
      />

      <Card>
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
            <ChEdit
              id="login-email"
              className={formStyles.chInput}
              value={emailInput}
              onInput={(e: any) => setEmailInput(e.target.value ?? '')}
              type="text"
              mode="email"
              placeholder="tu@email.com"
              autoFocus
              {...(submitting ? { disabled: true } : {})}
            />
            {TURNSTILE_ENABLED && <TurnstileWidget key={turnstileKey} onToken={setCaptchaToken} />}
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleVerifyOtp}>
            <p className={styles.hint}>Enviamos un código a <strong>{email}</strong></p>
            <label className={styles.label} htmlFor="login-code">Código de verificación</label>
            <ChEdit
              id="login-code"
              className={formStyles.chInput}
              value={codeInput}
              onInput={(e: any) => setCodeInput(e.target.value ?? '')}
              type="text"
              mode="numeric"
              maxLength={10}
              placeholder="Código"
              autoFocus
              {...(submitting ? { disabled: true } : {})}
            />
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Verificando…' : 'Verificar'}
            </button>
            <div className={styles.secondaryActions}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={handleResend}
                disabled={submitting || cooldown > 0}
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
