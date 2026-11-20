// @vitest-environment node
// Real WebCrypto (Node). Simulated passkeys: a "PRF output" is just 32 random
// bytes per credential, which is all the envelope ever sees.
import { describe, it, expect } from 'vitest'
import {
  ITEM_PLAINTEXT_BYTES,
  VaultCryptoError,
  WRAPPED_DK_BYTES,
  decryptItem,
  deriveKek,
  encodePlaintext,
  encryptItem,
  generateDataKey,
  randomPrfSalt,
  unwrapDataKey,
  wrapDataKey,
  type VaultPlaintext,
} from './envelope'
import { base64ToBytes, bytesToBase64, bytesToBase64Url, randomBytes } from './encoding'

const USER = '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f'
const OTHER_USER = '11111111-2222-4333-8444-555555555555'

function passkey() {
  return { credentialId: bytesToBase64Url(randomBytes(32)), prf: randomBytes(32) }
}

function plaintext(value: string): VaultPlaintext {
  return { v: 1, value, source: 'generated', savedAt: '2026-11-20T15:00:00.000Z' }
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(VaultCryptoError)
  await expect(promise).rejects.toMatchObject({ code })
}

async function exportRaw(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

/** Enrols `count` simulated passkeys on one data key, like enrolPasskey does. */
async function enrolled(count: number) {
  const dk = await generateDataKey()
  const keys = []
  for (let i = 0; i < count; i++) {
    const pk = passkey()
    const kek = await deriveKek(pk.prf, USER, pk.credentialId)
    keys.push({ ...pk, wrapped: await wrapDataKey(dk, kek, USER, pk.credentialId) })
  }
  return { dk, keys }
}

describe('data key wrapping with several passkeys', () => {
  it('every enrolled passkey unwraps the same data key', async () => {
    const { dk, keys } = await enrolled(3)
    const original = await exportRaw(dk)
    for (const k of keys) {
      const kek = await deriveKek(k.prf, USER, k.credentialId)
      const unwrapped = await unwrapDataKey(k.wrapped, kek, USER, k.credentialId, true)
      expect(await exportRaw(unwrapped)).toBe(original)
    }
    expect(base64ToBytes(keys[0].wrapped)).toHaveLength(WRAPPED_DK_BYTES)
    expect(new Set(keys.map((k) => k.wrapped)).size).toBe(3)
  })

  it('an item written through one passkey is read through another; removing one leaves the rest working', async () => {
    const { dk, keys } = await enrolled(2)
    const item = await encryptItem(dk, USER, 'settings_backup_passphrase', plaintext('rivup-tebap-zidob'))
    const [, second] = keys // "removing" the first = dropping its wrap
    const kek = await deriveKek(second.prf, USER, second.credentialId)
    const viaSecond = await unwrapDataKey(second.wrapped, kek, USER, second.credentialId)
    expect((await decryptItem(viaSecond, USER, 'settings_backup_passphrase', item)).value).toBe(
      'rivup-tebap-zidob'
    )
  })

  it('a second passkey can be added from an unwrapped (extractable) key', async () => {
    const { keys } = await enrolled(1)
    const first = keys[0]
    const dk = await unwrapDataKey(
      first.wrapped,
      await deriveKek(first.prf, USER, first.credentialId),
      USER,
      first.credentialId,
      true
    )
    const added = passkey()
    const addedKek = await deriveKek(added.prf, USER, added.credentialId)
    const wrapped = await wrapDataKey(dk, addedKek, USER, added.credentialId)
    const again = await unwrapDataKey(wrapped, addedKek, USER, added.credentialId, true)
    expect(await exportRaw(again)).toBe(await exportRaw(dk))
  })

  it('the unwrapped key is non-extractable by default', async () => {
    const { keys } = await enrolled(1)
    const k = keys[0]
    const dk = await unwrapDataKey(
      k.wrapped,
      await deriveKek(k.prf, USER, k.credentialId),
      USER,
      k.credentialId
    )
    expect(dk.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', dk)).rejects.toBeTruthy()
  })

  it('a wrong PRF output fails', async () => {
    const { keys } = await enrolled(2)
    const kek = await deriveKek(keys[1].prf, USER, keys[0].credentialId)
    await rejectsWith(unwrapDataKey(keys[0].wrapped, kek, USER, keys[0].credentialId), 'unwrap_failed')
  })

  it('a tampered wrap, IV or tag fails', async () => {
    const { keys } = await enrolled(1)
    const k = keys[0]
    const kek = await deriveKek(k.prf, USER, k.credentialId)
    for (const index of [0, 11, 12, 30, 59]) {
      const bytes = base64ToBytes(k.wrapped)
      bytes[index] ^= 0x01
      await rejectsWith(unwrapDataKey(bytesToBase64(bytes), kek, USER, k.credentialId), 'unwrap_failed')
    }
    await rejectsWith(unwrapDataKey(bytesToBase64(randomBytes(59)), kek, USER, k.credentialId), 'bad_format')
    await rejectsWith(unwrapDataKey('not base64!', kek, USER, k.credentialId), 'bad_format')
  })

  it('wrap AAD mismatch (other user, other credential) fails', async () => {
    const { keys } = await enrolled(2)
    const k = keys[0]
    const kek = await deriveKek(k.prf, USER, k.credentialId)
    await rejectsWith(unwrapDataKey(k.wrapped, kek, OTHER_USER, k.credentialId), 'unwrap_failed')
    await rejectsWith(unwrapDataKey(k.wrapped, kek, USER, keys[1].credentialId), 'unwrap_failed')
    // the KEK itself is bound to user and credential too (HKDF info)
    const otherKek = await deriveKek(k.prf, OTHER_USER, k.credentialId)
    await rejectsWith(unwrapDataKey(k.wrapped, otherKek, USER, k.credentialId), 'unwrap_failed')
  })

  it('refuses a PRF output that is not 32 bytes', async () => {
    await rejectsWith(deriveKek(new Uint8Array(0), USER, 'x'), 'bad_format')
    await rejectsWith(deriveKek(randomBytes(31), USER, 'x'), 'bad_format')
  })

  it('PRF salts are 32 random bytes', () => {
    const a = randomPrfSalt()
    expect(a).toHaveLength(32)
    expect(bytesToBase64(a)).not.toBe(bytesToBase64(randomPrfSalt()))
  })
})

describe('items', () => {
  it('round trip keeps value, source and savedAt', async () => {
    const dk = await generateDataKey()
    const p: VaultPlaintext = {
      v: 1,
      value: 'babad baded',
      source: 'qr',
      savedAt: '2026-11-20T10:00:00.000Z',
    }
    const item = await encryptItem(dk, USER, 'dashcam_recovery', p)
    expect(item.version).toBe(1)
    expect(await decryptItem(dk, USER, 'dashcam_recovery', item)).toEqual(p)
  })

  it('every ciphertext has the same length (padding) and a fresh IV', async () => {
    const dk = await generateDataKey()
    const short = await encryptItem(dk, USER, 'settings_backup_passphrase', plaintext('12345678'))
    const long = await encryptItem(dk, USER, 'settings_backup_passphrase', plaintext('x'.repeat(200)))
    const again = await encryptItem(dk, USER, 'settings_backup_passphrase', plaintext('12345678'))
    expect(base64ToBytes(short.ciphertext)).toHaveLength(ITEM_PLAINTEXT_BYTES + 16)
    expect(long.ciphertext.length).toBe(short.ciphertext.length)
    expect(base64ToBytes(short.iv)).toHaveLength(12)
    expect(again.iv).not.toBe(short.iv)
    expect(again.ciphertext).not.toBe(short.ciphertext)
  })

  it('the ciphertext does not contain the plaintext', async () => {
    const dk = await generateDataKey()
    const item = await encryptItem(
      dk,
      USER,
      'settings_backup_passphrase',
      plaintext('rivup-tebap-zidob-batug')
    )
    expect(atob(item.ciphertext)).not.toContain('rivup')
    expect(JSON.stringify(item)).not.toContain('rivup')
  })

  it('a tampered ciphertext or IV fails', async () => {
    const dk = await generateDataKey()
    const item = await encryptItem(dk, USER, 'dashcam_recovery', plaintext('a'))
    for (const index of [0, 100, 511, 527]) {
      const ct = base64ToBytes(item.ciphertext)
      ct[index] ^= 0x80
      await rejectsWith(
        decryptItem(dk, USER, 'dashcam_recovery', { ...item, ciphertext: bytesToBase64(ct) }),
        'decrypt_failed'
      )
    }
    const iv = base64ToBytes(item.iv)
    iv[0] ^= 1
    await rejectsWith(
      decryptItem(dk, USER, 'dashcam_recovery', { ...item, iv: bytesToBase64(iv) }),
      'decrypt_failed'
    )
  })

  it('AAD mismatch (user, kind, version) fails', async () => {
    const dk = await generateDataKey()
    const item = await encryptItem(dk, USER, 'dashcam_recovery', plaintext('a'))
    await rejectsWith(decryptItem(dk, OTHER_USER, 'dashcam_recovery', item), 'decrypt_failed')
    await rejectsWith(decryptItem(dk, USER, 'settings_backup_passphrase', item), 'decrypt_failed')
    await rejectsWith(decryptItem(dk, USER, 'dashcam_recovery', { ...item, version: 2 }), 'bad_format')
  })

  it('another data key fails', async () => {
    const item = await encryptItem(await generateDataKey(), USER, 'dashcam_recovery', plaintext('a'))
    await rejectsWith(decryptItem(await generateDataKey(), USER, 'dashcam_recovery', item), 'decrypt_failed')
  })

  it('refuses values that do not fit the padded block', () => {
    expect(() => encodePlaintext(plaintext('x'.repeat(600)))).toThrow(VaultCryptoError)
    expect(encodePlaintext(plaintext('x'.repeat(400)))).toHaveLength(ITEM_PLAINTEXT_BYTES)
  })

  it('malformed stored values are bad_format, not a crash', async () => {
    const dk = await generateDataKey()
    await rejectsWith(
      decryptItem(dk, USER, 'dashcam_recovery', { version: 1, iv: '***', ciphertext: 'AAAA' }),
      'bad_format'
    )
    await rejectsWith(
      decryptItem(dk, USER, 'dashcam_recovery', {
        version: 1,
        iv: bytesToBase64(randomBytes(12)),
        ciphertext: 'AAAA',
      }),
      'bad_format'
    )
  })
})
