// WebAuthn for the vault (specs/secret-vault.md R2): passkeys are used only as
// a key-derivation device through the PRF extension, never as a login. Every
// ceremony is client-side: the challenge is random and the server never
// verifies an attestation or assertion (it only stores ciphertext; possession
// of the data key requires the authenticator's PRF output).
import { base64UrlToBytes, bytesToBase64Url, randomBytes, uuidToBytes, type Bytes } from './encoding'

export type PrfSupport = 'supported' | 'unsupported' | 'unknown'

export type VaultAuthErrorCode =
  | 'prf_unsupported'
  | 'webauthn_unavailable'
  | 'cancelled'
  | 'already_registered'
  | 'insecure_context'
  | 'no_prf_result'
  | 'no_user_verification'
  | 'unknown_credential'
  | 'failed'

export class VaultAuthError extends Error {
  readonly code: VaultAuthErrorCode
  constructor(code: VaultAuthErrorCode) {
    super(`vault webauthn: ${code}`)
    this.name = 'VaultAuthError'
    this.code = code
  }
}

export const PRF_UNSUPPORTED_MESSAGE =
  'Este navegador o dispositivo no puede usar llaves de acceso con cifrado (extensión PRF), así que no puede abrir la bóveda. ' +
  'Funciona con Chrome en Android, con Safari en iPhone o iPad (iOS 18 o posterior) y con una llave de seguridad FIDO2 en ' +
  'Chrome, Edge o Firefox de escritorio. No hay alternativa con contraseña.'

const MESSAGES: Record<VaultAuthErrorCode, string> = {
  prf_unsupported: PRF_UNSUPPORTED_MESSAGE,
  webauthn_unavailable: 'Este navegador no puede crear ni usar llaves de acceso.',
  cancelled: 'Se canceló la confirmación con la llave de acceso (o pasó el tiempo). Probá de nuevo.',
  already_registered:
    'Este dispositivo ya tiene una llave de la bóveda. Para agregar otra, usá otro teléfono, una tablet o una llave de seguridad.',
  insecure_context: 'La bóveda solo funciona en el sitio oficial de WikiVigo (https).',
  no_prf_result:
    'El dispositivo confirmó tu identidad pero no devolvió la clave de cifrado (PRF). Probá con otro navegador o dispositivo.',
  no_user_verification:
    'El dispositivo no confirmó tu identidad con huella, rostro o bloqueo de pantalla. Activá un bloqueo de pantalla y probá de nuevo.',
  unknown_credential: 'Esa llave de acceso no es una de las de tu bóveda.',
  failed: 'No se pudo completar la confirmación con la llave de acceso. Intentá de nuevo.',
}

export function vaultAuthErrorMessage(code: VaultAuthErrorCode): string {
  return MESSAGES[code]
}

// The PRF extension shapes (kept local so the code does not depend on the
// DOM lib version's coverage of the extension).
interface PrfValues {
  first: BufferSource
}
interface PrfInputs {
  eval?: PrfValues
  evalByCredential?: Record<string, PrfValues>
}
interface PrfOutputs {
  enabled?: boolean
  results?: { first?: BufferSource }
}
type CapabilityAware = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<Record<string, boolean | undefined>>
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>
}

/** The page's host: fedeazzato.github.io in production, localhost in dev. */
export function vaultRpId(): string {
  return window.location.hostname
}

function pkc(): CapabilityAware | undefined {
  return typeof window === 'undefined' ? undefined : window.PublicKeyCredential
}

/**
 * 'unsupported' when WebAuthn is missing or the browser says it has no PRF;
 * 'supported' when it says it has; 'unknown' otherwise (the enrolment itself
 * then checks `prf.enabled`).
 */
export async function detectPrfSupport(): Promise<PrfSupport> {
  if (typeof window === 'undefined' || window.isSecureContext === false) return 'unsupported'
  const PKC = pkc()
  if (!PKC || !navigator.credentials) return 'unsupported'
  if (typeof PKC.getClientCapabilities === 'function') {
    try {
      const caps = await PKC.getClientCapabilities()
      if (caps['extension:prf'] === false) return 'unsupported'
      if (caps['extension:prf'] === true) return 'supported'
    } catch {
      // fall through: decide at enrolment
    }
  }
  return 'unknown'
}

function ensureWebAuthn(): void {
  if (!pkc() || !navigator.credentials) throw new VaultAuthError('webauthn_unavailable')
}

function mapCeremonyError(error: unknown, op: 'create' | 'get'): VaultAuthError {
  if (error instanceof VaultAuthError) return error
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  if (name === 'NotAllowedError' || name === 'AbortError') return new VaultAuthError('cancelled')
  if (name === 'InvalidStateError' && op === 'create') return new VaultAuthError('already_registered')
  if (name === 'SecurityError') return new VaultAuthError('insecure_context')
  if (name === 'NotSupportedError') return new VaultAuthError('webauthn_unavailable')
  return new VaultAuthError('failed')
}

function prfOutputs(credential: PublicKeyCredential): PrfOutputs | undefined {
  return (credential.getClientExtensionResults() as { prf?: PrfOutputs }).prf
}

/** PRF outputs are HMAC-SHA-256 values: exactly 32 bytes. */
export const PRF_OUTPUT_BYTES = 32

/**
 * A private copy of the PRF output (the caller derives the KEK and drops it).
 * `ArrayBuffer.isView` rather than `instanceof ArrayBuffer`, which fails for
 * buffers from another realm. Anything but 32 bytes is refused: an empty or
 * short value would still feed HKDF and give a predictable KEK.
 */
function copyPrfOutput(source: BufferSource): ArrayBuffer {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source)
  if (view.byteLength !== PRF_OUTPUT_BYTES) throw new VaultAuthError('no_prf_result')
  return view.slice().buffer
}

/** Tells the authenticator to forget a credential, where the browser supports it. Best effort. */
export async function signalUnknownVaultCredential(credentialId: string): Promise<void> {
  try {
    await pkc()?.signalUnknownCredential?.({ rpId: vaultRpId(), credentialId })
  } catch {
    // best effort only
  }
}

export interface PrfResult {
  credentialId: string
  prfOutput: ArrayBuffer
}

export interface PrfTarget {
  credentialId: string
  prfSalt: Bytes
}

export interface CreateVaultCredentialOptions {
  userId: string
  userName: string
  prfSalt: Bytes
  excludeCredentialIds: string[]
}

/**
 * Registers a vault passkey with PRF and returns its PRF output on `prfSalt`.
 * Throws VaultAuthError('prf_unsupported') when the authenticator cannot do
 * PRF (the new credential is then signalled as unknown and never stored).
 */
export async function createVaultCredential(options: CreateVaultCredentialOptions): Promise<PrfResult> {
  ensureWebAuthn()
  let credential: PublicKeyCredential | null
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { id: vaultRpId(), name: 'WikiVigo' },
        user: {
          id: uuidToBytes(options.userId),
          name: options.userName,
          displayName: `${options.userName} (Bóveda WikiVigo)`,
        },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -8 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: 'preferred',
          requireResidentKey: false,
          userVerification: 'required',
        },
        attestation: 'none',
        timeout: 120_000,
        excludeCredentials: options.excludeCredentialIds.map((id) => ({
          type: 'public-key' as const,
          id: base64UrlToBytes(id),
        })),
        extensions: { prf: { eval: { first: options.prfSalt } } },
      },
    })) as PublicKeyCredential | null
  } catch (error) {
    throw mapCeremonyError(error, 'create')
  }
  if (!credential) throw new VaultAuthError('failed')
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId))
  const prf = prfOutputs(credential)
  const first = prf?.results?.first
  if (prf?.enabled !== true && !first) {
    await signalUnknownVaultCredential(credentialId)
    throw new VaultAuthError('prf_unsupported')
  }
  if (first) return { credentialId, prfOutput: copyPrfOutput(first) }
  // Many authenticators only evaluate the PRF on an assertion.
  return evaluatePrf([{ credentialId, prfSalt: options.prfSalt }])
}

/** The UV bit of an assertion's authenticator data (flags byte, bit 2). */
function userVerified(credential: PublicKeyCredential): boolean {
  const data = (credential.response as AuthenticatorAssertionResponse).authenticatorData
  if (!data) return false
  const bytes = new Uint8Array(data)
  return bytes.length > 32 && (bytes[32] & 0x04) !== 0
}

/**
 * Asks one of `targets` (the user's enrolled passkeys) for its PRF output on
 * its own salt, with user verification. Returns which credential answered.
 */
export async function evaluatePrf(targets: PrfTarget[]): Promise<PrfResult> {
  ensureWebAuthn()
  if (targets.length === 0) throw new VaultAuthError('unknown_credential')
  const prf: PrfInputs =
    targets.length === 1
      ? { eval: { first: targets[0].prfSalt } }
      : { evalByCredential: Object.fromEntries(targets.map((t) => [t.credentialId, { first: t.prfSalt }])) }
  let credential: PublicKeyCredential | null
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: vaultRpId(),
        allowCredentials: targets.map((t) => ({
          type: 'public-key' as const,
          id: base64UrlToBytes(t.credentialId),
        })),
        userVerification: 'required',
        timeout: 120_000,
        extensions: { prf },
      },
    })) as PublicKeyCredential | null
  } catch (error) {
    throw mapCeremonyError(error, 'get')
  }
  if (!credential) throw new VaultAuthError('failed')
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId))
  if (!targets.some((t) => t.credentialId === credentialId)) throw new VaultAuthError('unknown_credential')
  if (!userVerified(credential)) throw new VaultAuthError('no_user_verification')
  const first = prfOutputs(credential)?.results?.first
  if (!first) throw new VaultAuthError('no_prf_result')
  return { credentialId, prfOutput: copyPrfOutput(first) }
}
