// The vault's crypto envelope (specs/secret-vault.md R1), WebCrypto only.
//
//   passkey PRF output ──HKDF-SHA-256──▶ KEK (one per passkey, AES-256-GCM, wrap/unwrap only)
//   KEK ──AES-GCM wrap (AAD: user, credential)──▶ wrapped DK (stored in vault_keys)
//   DK (one per user, AES-256-GCM) ──encrypt (AAD: user, kind, version)──▶ item (stored in vault_items)
//
// Nothing here talks to the network or to WebAuthn; callers pass the PRF
// output in and get base64 strings out. Plaintext never leaves this module
// except as the return value of decryptItem.
import { base64ToBytes, bytesToBase64, concatBytes, randomBytes, utf8, type Bytes } from './encoding'
import type { VaultItemKind } from '../../types'

export type { VaultItemKind }

export const VAULT_FORMAT_VERSION = 1
export const ITEM_PLAINTEXT_BYTES = 512
export const PRF_SALT_BYTES = 32
const IV_BYTES = 12
const DK_BYTES = 32
const TAG_BYTES = 16
export const WRAPPED_DK_BYTES = IV_BYTES + DK_BYTES + TAG_BYTES

// 'qr' and 'paste' are no longer written (the QR scan was removed, 2026-11-27)
// but stay readable: items saved with them must keep opening.
export type VaultSource = 'qr' | 'paste' | 'generated' | 'typed' | 'car'

/** What is inside an item's ciphertext (never stored or sent in the clear). */
export interface VaultPlaintext {
  v: 1
  value: string
  source: VaultSource
  savedAt: string
}

export type VaultCryptoErrorCode = 'unwrap_failed' | 'decrypt_failed' | 'too_large' | 'bad_format'

export class VaultCryptoError extends Error {
  readonly code: VaultCryptoErrorCode
  constructor(code: VaultCryptoErrorCode) {
    super(`vault crypto: ${code}`)
    this.name = 'VaultCryptoError'
    this.code = code
  }
}

const SEP = new Uint8Array([0])

function label(...parts: string[]): Bytes {
  const chunks: Uint8Array[] = []
  parts.forEach((p, i) => {
    if (i > 0) chunks.push(SEP)
    chunks.push(utf8(p))
  })
  return concatBytes(...chunks)
}

export function kekInfo(userId: string, credentialId: string): Bytes {
  return label('vigo-vault/kek/v1', userId, credentialId)
}

export function wrapAad(userId: string, credentialId: string): Bytes {
  return label('vigo-vault/dk/v1', userId, credentialId)
}

export function itemAad(userId: string, kind: VaultItemKind, version: number): Bytes {
  return label('vigo-vault/item/v1', userId, kind, String(version))
}

export function randomPrfSalt(): Bytes {
  return randomBytes(PRF_SALT_BYTES)
}

/**
 * A fresh data key. Extractable only so it can be wrapped for the first
 * passkey; callers drop it right after.
 */
export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/** KEK = HKDF-SHA-256(PRF output, salt empty, info bound to user and credential). */
export async function deriveKek(
  prfOutput: BufferSource,
  userId: string,
  credentialId: string
): Promise<CryptoKey> {
  // A PRF output is an HMAC-SHA-256 value; HKDF would happily accept an
  // empty or short input and derive a predictable key, so refuse it here too.
  if (prfOutput.byteLength !== 32) throw new VaultCryptoError('bad_format')
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: kekInfo(userId, credentialId) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

/** base64(IV ‖ AES-GCM(DK) ‖ tag), 60 bytes. */
export async function wrapDataKey(
  dataKey: CryptoKey,
  kek: CryptoKey,
  userId: string,
  credentialId: string
): Promise<string> {
  const iv = randomBytes(IV_BYTES)
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, kek, {
    name: 'AES-GCM',
    iv,
    additionalData: wrapAad(userId, credentialId),
  })
  return bytesToBase64(concatBytes(iv, new Uint8Array(wrapped)))
}

/**
 * Unwraps the data key. Non-extractable unless `extractable` (only the
 * add-a-passkey flow needs to re-wrap it). Any failure (wrong passkey,
 * tampered wrap, other user or credential) is `unwrap_failed`.
 */
export async function unwrapDataKey(
  wrappedB64: string,
  kek: CryptoKey,
  userId: string,
  credentialId: string,
  extractable = false
): Promise<CryptoKey> {
  let blob: Bytes
  try {
    blob = base64ToBytes(wrappedB64)
  } catch {
    throw new VaultCryptoError('bad_format')
  }
  if (blob.length !== WRAPPED_DK_BYTES) throw new VaultCryptoError('bad_format')
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      blob.slice(IV_BYTES),
      kek,
      { name: 'AES-GCM', iv: blob.slice(0, IV_BYTES), additionalData: wrapAad(userId, credentialId) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt']
    )
  } catch {
    throw new VaultCryptoError('unwrap_failed')
  }
}

/** JSON padded with spaces to exactly ITEM_PLAINTEXT_BYTES (hides the value's length). */
export function encodePlaintext(plaintext: VaultPlaintext): Bytes {
  const json = utf8(JSON.stringify(plaintext))
  if (json.length > ITEM_PLAINTEXT_BYTES) throw new VaultCryptoError('too_large')
  const out = new Uint8Array(ITEM_PLAINTEXT_BYTES).fill(0x20)
  out.set(json)
  return out
}

function decodePlaintext(bytes: Uint8Array): VaultPlaintext {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new VaultCryptoError('bad_format')
  }
  const p = parsed as Partial<VaultPlaintext> | null
  if (
    !p ||
    p.v !== 1 ||
    typeof p.value !== 'string' ||
    typeof p.savedAt !== 'string' ||
    !['qr', 'paste', 'generated', 'typed', 'car'].includes(p.source as string)
  ) {
    throw new VaultCryptoError('bad_format')
  }
  return { v: 1, value: p.value, source: p.source as VaultSource, savedAt: p.savedAt }
}

export interface EncryptedItem {
  version: number
  iv: string
  ciphertext: string
}

export async function encryptItem(
  dataKey: CryptoKey,
  userId: string,
  kind: VaultItemKind,
  plaintext: VaultPlaintext
): Promise<EncryptedItem> {
  const data = encodePlaintext(plaintext)
  const iv = randomBytes(IV_BYTES)
  try {
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: itemAad(userId, kind, VAULT_FORMAT_VERSION) },
      dataKey,
      data
    )
    return {
      version: VAULT_FORMAT_VERSION,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ct)),
    }
  } finally {
    data.fill(0)
  }
}

export async function decryptItem(
  dataKey: CryptoKey,
  userId: string,
  kind: VaultItemKind,
  item: EncryptedItem
): Promise<VaultPlaintext> {
  if (item.version !== VAULT_FORMAT_VERSION) throw new VaultCryptoError('bad_format')
  let iv: Bytes
  let ct: Bytes
  try {
    iv = base64ToBytes(item.iv)
    ct = base64ToBytes(item.ciphertext)
  } catch {
    throw new VaultCryptoError('bad_format')
  }
  if (iv.length !== IV_BYTES || ct.length <= TAG_BYTES) throw new VaultCryptoError('bad_format')
  let plain: Uint8Array
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: itemAad(userId, kind, item.version) },
        dataKey,
        ct
      )
    )
  } catch {
    throw new VaultCryptoError('decrypt_failed')
  }
  try {
    return decodePlaintext(plain)
  } finally {
    plain.fill(0)
  }
}
