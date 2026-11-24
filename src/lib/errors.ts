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
  // Family roles (0070)
  'Tu permiso en este vehículo es solo ver',
  'Quien creó el vehículo siempre tiene control',
  'Rol no válido',
  // Family invites (0082)
  'Creaste muchos códigos',
  'Ya hay 5 códigos',
  // Car link (0045)
  'Demasiados intentos',
  'Tu vehículo ya tiene',
  'Ese dispositivo no está vinculado',
  // Bóveda (0046); its daily limit starts with 'Límite diario' too
  'Ya tenés 10 llaves',
]

// Older server messages that still use retired words ("vincular", owner decision 2026-11-24 #3). Rewritten here so no
// migration is needed just for wording.
const SERVER_WORDING: Record<string, string> = {
  'Ese dispositivo no está vinculado a tu vehículo.': 'Esa pantalla no está conectada a tu vehículo.',
}

export function toFriendlyError(error: unknown): string {
  const err = (typeof error === 'object' && error !== null ? error : {}) as {
    message?: unknown
    code?: unknown
    status?: unknown
  }
  const message = typeof err.message === 'string' ? err.message : typeof error === 'string' ? error : ''
  const code = typeof err.code === 'string' ? err.code : ''
  const status = typeof err.status === 'number' ? err.status : null

  // Our own `raise exception` messages are already user-facing Spanish.
  if (message && (code === 'P0001' || KNOWN_TRIGGER_MESSAGES.some((m) => message.startsWith(m)))) {
    return SERVER_WORDING[message] ?? message
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
    return 'No tenés permiso para hacer eso. Si te parece un error, cerrá sesión y volvé a entrar.'
  }
  if (code === '23514') {
    return 'Hay un dato que no cierra. Revisá el formulario y probá de nuevo.'
  }

  // Keep the original error debuggable from the console.
  console.error('Unmapped error:', error)
  return 'Algo falló de nuestro lado. Revisá tu conexión y probá de nuevo.'
}
