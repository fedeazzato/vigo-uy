// specs/vault-onboarding.md Phase C: inbox ECIES. The fixed vector is shared with the car (Java).
import { describe, it, expect } from 'vitest'
import { base64ToBytes, bytesToBase64 } from './encoding'
import {
  decryptInbox,
  encryptForInbox,
  generateInboxKeyPair,
  inboxAad,
  inboxInfo,
  packInboxPrivate,
  unpackInboxPrivate,
} from './inbox'
import { INBOX_VECTOR as V } from './inboxVectors'

const P256_SPKI = /^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{85}[AQgw]==$/

describe('inbox ECIES', () => {
  it('reproduces the fixed vector byte for byte (the Java side pins the same values)', async () => {
    const out = await encryptForInbox(V.recipientSpki, V.userId, V.kind, V.keyId, V.words, {
      ephemeralPkcs8: V.ephemeralPkcs8,
      ephemeralSpki: V.ephemeralSpki,
      iv: base64ToBytes(V.iv),
    })
    expect(out).toEqual({ epk: V.ephemeralSpki, iv: V.iv, ciphertext: V.ciphertext })
    expect(await decryptInbox(V.recipientPkcs8, V.userId, V.kind, V.keyId, out)).toBe(V.words)
  })

  it('round-trips with a fresh key pair and fresh ephemeral keys', async () => {
    const pair = await generateInboxKeyPair()
    expect(pair.publicKey).toMatch(P256_SPKI)
    const a = await encryptForInbox(pair.publicKey, V.userId, 'dashcam_recovery', V.keyId, 'hola mundo')
    const b = await encryptForInbox(pair.publicKey, V.userId, 'dashcam_recovery', V.keyId, 'hola mundo')
    expect(a.epk).toMatch(P256_SPKI)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(await decryptInbox(pair.privateKey, V.userId, 'dashcam_recovery', V.keyId, a)).toBe('hola mundo')
  })

  it('fails for another user, another key_id, a tampered byte or another private key', async () => {
    const row = { epk: V.ephemeralSpki, iv: V.iv, ciphertext: V.ciphertext }
    await expect(decryptInbox(V.recipientPkcs8, '00000000-0000-4000-8000-000000000000', V.kind, V.keyId, row)).rejects.toThrow()
    await expect(decryptInbox(V.recipientPkcs8, V.userId, V.kind, '00000000-0000-4000-8000-000000000000', row)).rejects.toThrow()
    const bytes = base64ToBytes(V.ciphertext)
    bytes[0] ^= 1
    const tampered = { ...row, ciphertext: bytesToBase64(bytes) }
    await expect(decryptInbox(V.recipientPkcs8, V.userId, V.kind, V.keyId, tampered)).rejects.toThrow()
    const other = await generateInboxKeyPair()
    await expect(decryptInbox(other.privateKey, V.userId, V.kind, V.keyId, row)).rejects.toThrow()
  })

  it('labels are lower-cased and 0x00-separated', () => {
    expect(new TextDecoder().decode(inboxInfo('ABC', 'dashcam_recovery'))).toBe('vigo-vault/inbox/v1\0abc\0dashcam_recovery')
    expect(new TextDecoder().decode(inboxAad('ABC', 'dashcam_recovery', 'K'))).toBe(
      'vigo-vault/inbox-aad/v1\0abc\0dashcam_recovery\0k'
    )
  })

  it('packs the private key with its key_id and refuses anything else', () => {
    const packed = packInboxPrivate(V.keyId.toUpperCase(), V.recipientPkcs8)
    expect(unpackInboxPrivate(packed)).toEqual({ keyId: V.keyId, pkcs8: V.recipientPkcs8 })
    expect(unpackInboxPrivate('nope')).toBeNull()
    expect(packed.length).toBeLessThan(260) // fits the 512-byte padded vault plaintext
  })
})
