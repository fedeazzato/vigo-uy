import { useRef, useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Card, Alert } from '../components/UI'
import { ChEdit } from '../lib/chameleon/ChEdit'
import { useAuth } from '../context/AuthContext'
import styles from './LoginPage.module.css'

const RESEND_COOLDOWN_SECONDS = 60

type Step = 'email' | 'code'

export default function LoginPage() {
  const { sendOtp, verifyOtp, status } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const emailRef = useRef<HTMLChEditElement>(null)
  const codeRef = useRef<HTMLChEditElement>(null)

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
    const value = emailRef.current?.value?.trim() ?? ''
    if (!value) return

    setSubmitting(true)
    setError(null)
    const { error } = await sendOtp(value)
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    setEmail(value)
    setStep('code')
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    const code = codeRef.current?.value?.trim() ?? ''
    if (!code) return

    setSubmitting(true)
    setError(null)
    const { error } = await verifyOtp(email, code)
    setSubmitting(false)

    if (error) setError(error.message)
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

        {step === 'email' ? (
          <form className={styles.form} onSubmit={handleSendOtp}>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <ChEdit
              id="login-email"
              ref={emailRef}
              type="email"
              placeholder="tu@email.com"
              autoFocus
              disabled={submitting}
            />
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
              ref={codeRef}
              type="text"
              mode="numeric"
              maxLength={10}
              placeholder="Código"
              autoFocus
              disabled={submitting}
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
