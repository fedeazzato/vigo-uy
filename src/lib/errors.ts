// Maps raw Supabase/network errors to friendly Latin American Spanish
// messages. Two rules:
//  1. Errors raised by our own triggers/RPCs (`raise exception` in the
//     migrations, PostgREST code P0001) already carry deliberate Spanish
//     user-facing text — pass those through untouched.
//  2. Everything else (English auth/network/PostgREST strings) gets mapped
//     to a known Spanish message, falling back to a generic one.

// Spanish messages raised on purpose by the migrations' triggers/RPCs, in
// case a caller hands us a plain Error where the P0001 code got lost.
const KNOWN_TRIGGER_MESSAGES = [
  'Tu cuenta está suspendida',
  'Límite diario',
  'Código no válido',
  'No autorizado',
  'Para salir del vehículo',
  'Solo quien creó el vehículo',
  'Ese usuario no es integrante',
]

export function toFriendlyError(error: unknown): string {
  const err = (typeof error === 'object' && error !== null ? error : {}) as {
    message?: unknown
    code?: unknown
    status?: unknown
  }
  const message =
    typeof err.message === 'string' ? err.message : typeof error === 'string' ? error : ''
  const code = typeof err.code === 'string' ? err.code : ''
  const status = typeof err.status === 'number' ? err.status : null

  // Our own `raise exception` messages are already user-facing Spanish.
  if (message && (code === 'P0001' || KNOWN_TRIGGER_MESSAGES.some((m) => message.startsWith(m)))) {
    return message
  }

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Sin conexión. Revisá tu internet e intentá de nuevo.'
  }
  if (code === 'over_email_send_rate_limit' || status === 429 || /rate limit/i.test(message)) {
    return 'Demasiados intentos. Esperá un momento e intentá de nuevo.'
  }
  if (code === 'otp_expired' || /token has expired|otp.*expired/i.test(message)) {
    return 'El código no es válido o venció. Pedí uno nuevo.'
  }
  if (/captcha/i.test(message) || /captcha/i.test(code)) {
    return 'Falló la verificación de seguridad. Recargá la página e intentá de nuevo.'
  }
  if (code === '42501' || /row-level security/i.test(message)) {
    return 'No tenés permiso para hacer eso.'
  }
  if (code === '23514') {
    return 'Alguno de los datos ingresados no es válido.'
  }

  // Keep the original error debuggable from the console.
  console.error('Unmapped error:', error)
  return 'Ocurrió un error inesperado. Intentá de nuevo.'
}
