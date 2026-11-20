// Vault flows (specs/secret-vault.md): enrol a passkey, save, reveal, remove.
// Each flow that needs the data key runs its own passkey assertion; the key
// is never cached. Results use the repo's `{ error: string | null }` shape
// with Spanish messages.
import {
  VaultCryptoError,
  decryptItem,
  deriveKek,
  encryptItem,
  generateDataKey,
  randomPrfSalt,
  unwrapDataKey,
  wrapDataKey,
  type VaultPlaintext,
  type VaultSource,
} from './envelope'
import {
  VaultAuthError,
  createVaultCredential,
  evaluatePrf,
  signalUnknownVaultCredential,
  vaultAuthErrorMessage,
} from './webauthn'
import { deleteVaultItem, deleteVaultKey, insertVaultKey, saveVaultItem } from './vaultApi'
import { base64ToBytes, bytesToBase64 } from './encoding'
import type { VaultItemKind, VaultItemRow, VaultKeyRow } from '../../types'

export const MAX_LABEL_LENGTH = 40

export interface VaultUser {
  /** Supabase user id (the WebAuthn user handle and part of every AAD). */
  id: string
  /** Shown only in the owner's passkey manager (the account e-mail). */
  name: string
}

export function vaultErrorMessage(error: unknown): string {
  if (error instanceof VaultAuthError) return vaultAuthErrorMessage(error.code)
  if (error instanceof VaultCryptoError) {
    switch (error.code) {
      case 'unwrap_failed':
        return 'Esa llave no pudo abrir la bóveda. Probá con otra de tus llaves.'
      case 'decrypt_failed':
        return 'Lo guardado no se pudo descifrar: está dañado o fue modificado. Volvé a guardarlo.'
      case 'too_large':
        return 'Es demasiado largo para guardarlo en la bóveda.'
      case 'bad_format':
        return 'Lo guardado tiene un formato que esta versión de WikiVigo no entiende. Actualizá la página.'
    }
  }
  return 'Ocurrió un error inesperado. Intentá de nuevo.'
}

/** A default name for the passkey list, from the platform only. */
export function guessDeviceLabel(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): string {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return 'Teléfono Android'
  if (/CrOS/.test(userAgent)) return 'Chromebook'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows'
  if (/Linux/.test(userAgent)) return 'Linux'
  return 'Este dispositivo'
}

export function cleanLabel(label: string): string {
  const cleaned = label
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_LABEL_LENGTH)
    .trim()
  return cleaned || guessDeviceLabel()
}

/** One passkey assertion → the data key (non-extractable unless re-wrapping). */
async function unlockDataKey(user: VaultUser, keys: VaultKeyRow[], extractable: boolean): Promise<CryptoKey> {
  const { credentialId, prfOutput } = await evaluatePrf(
    keys.map((k) => ({ credentialId: k.credential_id, prfSalt: base64ToBytes(k.prf_salt) }))
  )
  const row = keys.find((k) => k.credential_id === credentialId)
  if (!row) throw new VaultAuthError('unknown_credential')
  try {
    const kek = await deriveKek(prfOutput, user.id, credentialId)
    return await unwrapDataKey(row.wrapped_dk, kek, user.id, credentialId, extractable)
  } finally {
    new Uint8Array(prfOutput).fill(0)
  }
}

/**
 * Enrols a passkey. With no passkey yet, a new data key is created; otherwise
 * an existing passkey unlocks the data key first (so a failed unlock creates
 * nothing), then the new passkey wraps the same key.
 */
export async function enrolPasskey(
  user: VaultUser,
  label: string,
  keys: VaultKeyRow[]
): Promise<{ error: string | null }> {
  let createdId: string | null = null
  try {
    const dataKey = keys.length === 0 ? await generateDataKey() : await unlockDataKey(user, keys, true)
    const salt = randomPrfSalt()
    const { credentialId, prfOutput } = await createVaultCredential({
      userId: user.id,
      userName: user.name,
      prfSalt: salt,
      excludeCredentialIds: keys.map((k) => k.credential_id),
    })
    createdId = credentialId
    let wrapped: string
    try {
      const kek = await deriveKek(prfOutput, user.id, credentialId)
      wrapped = await wrapDataKey(dataKey, kek, user.id, credentialId)
      // Prove the new wrap opens before storing it.
      await unwrapDataKey(wrapped, kek, user.id, credentialId)
    } finally {
      new Uint8Array(prfOutput).fill(0)
    }
    const result = await insertVaultKey({
      credential_id: credentialId,
      prf_salt: bytesToBase64(salt),
      wrapped_dk: wrapped,
      label: cleanLabel(label),
    })
    if (result.error) {
      await signalUnknownVaultCredential(credentialId)
      return result
    }
    return { error: null }
  } catch (error) {
    if (createdId) await signalUnknownVaultCredential(createdId)
    return { error: vaultErrorMessage(error) }
  }
}

export async function saveSecret(
  user: VaultUser,
  keys: VaultKeyRow[],
  kind: VaultItemKind,
  value: string,
  source: VaultSource,
  now: Date = new Date()
): Promise<{ error: string | null }> {
  if (keys.length === 0) return { error: 'Primero activá la bóveda con una llave de acceso.' }
  try {
    const dataKey = await unlockDataKey(user, keys, false)
    const encrypted = await encryptItem(dataKey, user.id, kind, {
      v: 1,
      value,
      source,
      savedAt: now.toISOString(),
    })
    return await saveVaultItem({ kind, ...encrypted })
  } catch (error) {
    return { error: vaultErrorMessage(error) }
  }
}

export async function revealSecret(
  user: VaultUser,
  keys: VaultKeyRow[],
  item: VaultItemRow
): Promise<{ plaintext: VaultPlaintext | null; error: string | null }> {
  if (keys.length === 0) return { plaintext: null, error: 'No hay ninguna llave que pueda abrir la bóveda.' }
  try {
    const dataKey = await unlockDataKey(user, keys, false)
    const plaintext = await decryptItem(dataKey, user.id, item.kind, item)
    return { plaintext, error: null }
  } catch (error) {
    return { plaintext: null, error: vaultErrorMessage(error) }
  }
}

/**
 * Removes a passkey (its wrap). Removing the LAST one also deletes the items:
 * without any wrap nobody can open them again.
 */
export async function removePasskey(
  key: VaultKeyRow,
  keys: VaultKeyRow[],
  items: VaultItemRow[]
): Promise<{ error: string | null }> {
  const isLast = keys.length === 1 && keys[0].credential_id === key.credential_id
  if (isLast) {
    const wiped = await deleteStoredItems(items)
    if (wiped.error) return wiped
  }
  const result = await deleteVaultKey(key.credential_id)
  if (!result.error) await signalUnknownVaultCredential(key.credential_id)
  return result
}

export async function deleteStoredItems(items: VaultItemRow[]): Promise<{ error: string | null }> {
  for (const item of items) {
    const result = await deleteVaultItem(item.kind)
    if (result.error) return result
  }
  return { error: null }
}
