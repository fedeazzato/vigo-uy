// Bóveda inbox crypto (specs/vault-onboarding.md Phase C): ECIES on WebCrypto.
// The car (accounts_proxy core InboxCrypto.java) encrypts the dashcam words
// to the user's inbox public key; only the browser, holding the private key
// wrapped by the vault data key, can decrypt.
//
//   shared = ECDH-P256(ephemeral private, recipient public)        32 bytes
//   aesKey = HKDF-SHA-256(ikm = shared, salt = utf8(key_id),
//            info = "vigo-vault/inbox/v1" 0x00 user_id 0x00 kind)   32 bytes
//   ct     = AES-256-GCM(aesKey, iv 12 bytes, utf8(words),
//            aad = "vigo-vault/inbox-aad/v1" 0x00 user_id 0x00 kind 0x00 key_id)
//
// Wire: epk = SPKI base64 of the ephemeral public key, iv base64, ciphertext
// (ct || 16-byte tag) base64. user_id and key_id are lower-case UUIDs.

import { base64ToBytes, bytesToBase64, concatBytes, randomBytes, utf8, type Bytes } from './encoding'

export const INBOX_KINDS = ['dashcam_recovery'] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

export interface InboxCiphertext {
  epk: string
  iv: string
  ciphertext: string
}

const EC = { name: 'ECDH', namedCurve: 'P-256' } as const
const SEP = new Uint8Array([0])

function label(...parts: string[]): Bytes {
  const chunks: Uint8Array[] = []
  parts.forEach((p, i) => {
    if (i > 0) chunks.push(SEP)
    chunks.push(utf8(p))
  })
  return concatBytes(...chunks)
}

export function inboxInfo(userId: string, kind: InboxKind): Bytes {
  return label('vigo-vault/inbox/v1', userId.toLowerCase(), kind)
}

export function inboxAad(userId: string, kind: InboxKind, keyId: string): Bytes {
  return label('vigo-vault/inbox-aad/v1', userId.toLowerCase(), kind, keyId.toLowerCase())
}

/** A new inbox key pair: SPKI (public, published) and PKCS#8 (private, kept in the vault), both base64. */
export async function generateInboxKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(EC, true, ['deriveBits'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  return { publicKey: bytesToBase64(spki), privateKey: bytesToBase64(pkcs8) }
}

async function aesKey(shared: ArrayBuffer, userId: string, kind: InboxKind, keyId: string, usage: KeyUsage): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8(keyId.toLowerCase()), info: inboxInfo(userId, kind) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

/**
 * Encrypts like the car does. Used by the tests (and as the reference for the
 * Java implementation); `ephemeral` and `iv` are only fixed in tests.
 */
export async function encryptForInbox(
  recipientSpki: string,
  userId: string,
  kind: InboxKind,
  keyId: string,
  plaintext: string,
  fixed?: { ephemeralPkcs8: string; ephemeralSpki: string; iv: Bytes }
): Promise<InboxCiphertext> {
  const recipient = await crypto.subtle.importKey('spki', base64ToBytes(recipientSpki), EC, false, [])
  let ephPrivate: CryptoKey
  let epk: string
  if (fixed) {
    ephPrivate = await crypto.subtle.importKey('pkcs8', base64ToBytes(fixed.ephemeralPkcs8), EC, false, ['deriveBits'])
    epk = fixed.ephemeralSpki
  } else {
    const pair = await crypto.subtle.generateKey(EC, true, ['deriveBits'])
    ephPrivate = pair.privateKey
    epk = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)))
  }
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: recipient }, ephPrivate, 256)
  const key = await aesKey(shared, userId, kind, keyId, 'encrypt')
  const iv = fixed?.iv ?? randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: inboxAad(userId, kind, keyId) }, key, utf8(plaintext))
  return { epk, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ct)) }
}

/** Decrypts an inbox row with the private key (PKCS#8 base64). Throws on any tampering. */
export async function decryptInbox(
  privatePkcs8: string,
  userId: string,
  kind: InboxKind,
  keyId: string,
  row: InboxCiphertext
): Promise<string> {
  const priv = await crypto.subtle.importKey('pkcs8', base64ToBytes(privatePkcs8), EC, false, ['deriveBits'])
  const epk = await crypto.subtle.importKey('spki', base64ToBytes(row.epk), EC, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: epk }, priv, 256)
  const key = await aesKey(shared, userId, kind, keyId, 'decrypt')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(row.iv), additionalData: inboxAad(userId, kind, keyId) },
    key,
    base64ToBytes(row.ciphertext)
  )
  return new TextDecoder('utf-8', { fatal: true }).decode(pt)
}

/** The vault item value that holds the private key: "<key_id> <pkcs8 base64>". */
export function packInboxPrivate(keyId: string, pkcs8: string): string {
  return `${keyId.toLowerCase()} ${pkcs8}`
}

export function unpackInboxPrivate(value: string): { keyId: string; pkcs8: string } | null {
  const m = /^([0-9a-f-]{36}) ([A-Za-z0-9+/]+={0,2})$/.exec(value)
  return m ? { keyId: m[1], pkcs8: m[2] } : null
}
